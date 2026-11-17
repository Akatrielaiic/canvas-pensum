// Zone engine: pure functions over JSON Canvas data (https://jsoncanvas.org). No Obsidian imports.
//
// A zone is a group. A card belongs to the innermost zone around its centre; the cards its
// arrows lead to belong there too. This file places cards in zones, moves them between zones
// and keeps zones wrapped around their contents without overlaps.
//
// Zone maps: zones joined by arrows (zone to zone) form a tree, laid out like a mind map around
// its root zone: children to the right or left, siblings stacked, evenly spaced.
//
// Shared verbatim by Canvas Pensum and Canvas Arbor: change both copies together.

export interface CanvasNode {
	id: string;
	type: string; // "file" | "text" | "link" | "group"
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	file?: string; // file nodes
	label?: string; // group nodes
	[key: string]: unknown;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	[key: string]: unknown;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	[key: string]: unknown;
}

/** Grid used when a card is placed in a zone. */
export interface Layout {
	cardWidth: number;
	cardHeight: number;
	gap: number;
	columns: number;
}

/** Size of a zone with nothing in it: room for two cards side by side. */
export const emptyZoneSize = (layout: Layout) => ({
	width: 2 * (layout.cardWidth + layout.gap) + layout.gap,
	height: layout.cardHeight + layout.gap * 2,
});

export const area = (n: CanvasNode) => n.width * n.height;

export function centreInside(node: CanvasNode, group: CanvasNode): boolean {
	const cx = node.x + node.width / 2;
	const cy = node.y + node.height / 2;
	return cx >= group.x && cx <= group.x + group.width && cy >= group.y && cy <= group.y + group.height;
}

/** All groups, smallest first, so the first match for a card is its innermost zone. */
export function groupsBySize(data: CanvasData): CanvasNode[] {
	return data.nodes.filter((n) => n.type === "group").sort((a, b) => area(a) - area(b));
}

export function zoneOf(node: CanvasNode, groupsSmallestFirst: CanvasNode[]): CanvasNode | undefined {
	return groupsSmallestFirst.find((g) => g !== node && centreInside(node, g));
}

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const intersects = (a: Rect, b: Rect) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const randomId = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

export const clone = (data: CanvasData): CanvasData => {
	const copy = JSON.parse(JSON.stringify(data)) as CanvasData;
	copy.nodes ??= [];
	copy.edges ??= [];
	return copy;
};

/** Puts `node` in the first free grid slot of `group`, growing the group if needed. */
export function placeIn(data: CanvasData, node: CanvasNode, group: CanvasNode, layout: Layout): void {
	placeBlock(data, [node], group, layout);
}

/** Like placeIn, for several cards moved as one rigid block, so their arrangement is kept. */
export function placeBlock(data: CanvasData, block: CanvasNode[], group: CanvasNode, layout: Layout): void {
	const inBlock = new Set(block);
	const obstacles = data.nodes.filter((n) => n.type !== "group" && !inBlock.has(n));
	const left = Math.min(...block.map((n) => n.x));
	const top = Math.min(...block.map((n) => n.y));
	const box: Rect = {
		x: 0,
		y: 0,
		width: Math.max(...block.map((n) => n.x + n.width)) - left,
		height: Math.max(...block.map((n) => n.y + n.height)) - top,
	};
	for (let slot = 0; ; slot++) {
		box.x = group.x + layout.gap + (slot % layout.columns) * (layout.cardWidth + layout.gap);
		box.y = group.y + layout.gap + Math.floor(slot / layout.columns) * (layout.cardHeight + layout.gap);
		if (!obstacles.some((o) => intersects(o, box))) break;
	}
	for (const n of block) {
		n.x += box.x - left;
		n.y += box.y - top;
	}
	group.width = Math.max(group.width, box.x + box.width + layout.gap - group.x);
	group.height = Math.max(group.height, box.y + box.height + layout.gap - group.y);
}

/**
 * Adds an empty zone in the first free spot to the right of the anchor group (same row),
 * or below everything when there is no anchor.
 */
export function addZone(
	input: CanvasData,
	zone: { label: string; color?: string },
	layout: Layout,
	options: { newId?: () => string; anchorId?: string } = {},
): { data: CanvasData; zone: CanvasNode } {
	const data = clone(input);
	const newId = options.newId ?? randomId;
	const anchor = data.nodes.find((n) => n.id === options.anchorId && n.type === "group");
	const all = data.nodes;
	const spacing = layout.gap * 2;
	const group: CanvasNode = {
		id: newId(),
		type: "group",
		label: zone.label,
		x: anchor ? anchor.x + anchor.width + spacing : all.length ? Math.min(...all.map((n) => n.x)) : 0,
		y: anchor ? anchor.y : all.length ? Math.max(...all.map((n) => n.y + n.height)) + spacing : 0,
		...emptyZoneSize(layout),
	};
	if (zone.color) group.color = zone.color;
	// Slide right past anything in the way, keeping a margin.
	for (let blocker: CanvasNode | undefined; ; group.x = blocker.x + blocker.width + spacing) {
		const margin: Rect = { x: group.x - layout.gap, y: group.y, width: group.width + spacing, height: group.height };
		blocker = all.find((n) => intersects(n, margin));
		if (!blocker) break;
	}
	data.nodes.unshift(group);
	return { data, zone: group };
}

/**
 * Returns a function giving a card plus everything its arrows lead to (children, grandchildren…).
 * Groups are never included; `skip` prunes a card and whatever hangs below it.
 */
export function subtrees(data: CanvasData): (root: CanvasNode, skip?: (n: CanvasNode) => boolean) => CanvasNode[] {
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const children = new Map<string, string[]>();
	for (const e of data.edges) children.set(e.fromNode, [...(children.get(e.fromNode) ?? []), e.toNode]);
	return (root, skip) => {
		const seen = new Set([root.id]);
		const block = [root];
		for (const node of block) {
			for (const id of children.get(node.id) ?? []) {
				const child = byId.get(id);
				if (!child || child.type === "group" || seen.has(id) || skip?.(child)) continue;
				seen.add(id);
				block.push(child);
			}
		}
		return block;
	};
}

/**
 * Moves the given cards into a zone. Each card takes along the cards its arrows lead to
 * (children, grandchildren…), as one block that keeps its shape. Null if there is nothing to do.
 */
export function moveToZone(input: CanvasData, nodeIds: string[], zoneId: string, layout: Layout): CanvasData | null {
	const data = clone(input);
	const zone = data.nodes.find((n) => n.id === zoneId && n.type === "group");
	if (!zone) return null;
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const subtree = subtrees(data);

	const selected = [...new Set(nodeIds)]
		.map((id) => byId.get(id))
		.filter((n): n is CanvasNode => !!n && n.type !== "group")
		.sort((a, b) => a.y - b.y || a.x - b.x);
	// A selected card that hangs off another selected card travels with it, so start from the top ones.
	const below = new Set(selected.flatMap((n) => subtree(n).slice(1).map((d) => d.id)));
	const roots = [...selected.filter((n) => !below.has(n.id)), ...selected.filter((n) => below.has(n.id))];

	const taken = new Set<string>();
	let moved = false;
	for (const root of roots) {
		if (taken.has(root.id)) continue;
		const block = subtree(root, (n) => taken.has(n.id));
		for (const n of block) taken.add(n.id);
		if (block.every((n) => centreInside(n, zone))) continue;
		placeBlock(data, block, zone, layout);
		moved = true;
	}
	return moved ? data : null;
}

/** Something that moves as one piece: `solid` is what must not overlap, `nodes` is what travels. */
interface Unit {
	nodes: CanvasNode[];
	solid: CanvasNode[];
}

/**
 * Pushes overlapping units apart, only ever to the right or down, so it always settles.
 * Units nearer the top-left stay; pinned ones stay first of all.
 */
function separate(units: Unit[], pad: number, pinned: Set<string>): void {
	const keyed = units.map((unit) => {
		const x = Math.min(...unit.solid.map((n) => n.x));
		const y = Math.min(...unit.solid.map((n) => n.y));
		return { unit, x, y, pin: unit.nodes.some((n) => pinned.has(n.id)) ? 0 : 1 };
	});
	keyed.sort((a, b) => a.pin - b.pin || a.x + a.y - (b.x + b.y) || a.y - b.y || a.x - b.x);
	const settled: Unit[] = [];
	for (const { unit } of keyed) {
		for (let guard = 0; guard < 500; guard++) {
			let dx = 0;
			let dy = 0;
			for (const other of settled) {
				for (const a of other.solid) {
					for (const b of unit.solid) {
						if (!intersects(a, b)) continue;
						dx = Math.max(dx, a.x + a.width + pad - b.x);
						dy = Math.max(dy, a.y + a.height + pad - b.y);
					}
				}
			}
			if (!dx && !dy) break;
			for (const n of unit.nodes) {
				if (dx <= dy) n.x += dx;
				else n.y += dy;
			}
		}
		settled.push(unit);
	}
}

/**
 * Makes every zone hold what belongs to it without overlaps. In place.
 *
 * A card belongs to the innermost zone around its centre. Cards its arrows lead to belong there
 * too, unless they already sit in a zone of their own. Cards joined by arrows move as one piece.
 * A zone wraps its contents, growing and shrinking with them; zones that end up overlapping
 * are pushed apart with everything in them.
 *
 * `stay`: where each card was last time (card id -> zone id, as returned). A card stays in that
 * zone while its centre is still inside it, even if another zone was dropped over it.
 * Returns where each card is now.
 */
export function tidyZones(data: CanvasData, layout: Layout, pinned: string[] = [], stay?: Map<string, string>): Map<string, string> {
	const pad = layout.gap / 2;
	const pins = new Set(pinned);
	const groups = groupsBySize(data);
	const cards = data.nodes.filter((n) => n.type !== "group");
	const parent = enclosing(data, groups);
	const home = homes(data, groups, parent, stay);

	const linked = new Map<string, string[]>();
	for (const e of data.edges) {
		linked.set(e.fromNode, [...(linked.get(e.fromNode) ?? []), e.toNode]);
		linked.set(e.toNode, [...(linked.get(e.toNode) ?? []), e.fromNode]);
	}
	const contents = new Map<CanvasNode, CanvasNode[]>();
	const unitsIn = (zone: CanvasNode | undefined): Unit[] => {
		const units: Unit[] = [];
		const members = new Map(cards.filter((c) => zone && home.get(c) === zone).map((c) => [c.id, c]));
		const seen = new Set<string>();
		for (const start of members.values()) {
			if (seen.has(start.id)) continue;
			seen.add(start.id);
			const piece = [start];
			for (const node of piece) {
				for (const id of linked.get(node.id) ?? []) {
					const next = members.get(id);
					if (!next || seen.has(id)) continue;
					seen.add(id);
					piece.push(next);
				}
			}
			units.push({ nodes: piece, solid: piece });
		}
		for (const g of groups) {
			if (parent.get(g) === zone) units.push({ nodes: [g, ...(contents.get(g) ?? [])], solid: [g] });
		}
		return units;
	};

	// Smallest first: a zone inside another is settled before the one around it.
	for (const zone of groups) {
		const units = unitsIn(zone);
		separate(units, pad, pins);
		const inside = units.flatMap((u) => u.nodes);
		if (inside.length) {
			// Wrap the contents exactly, with a margin; never smaller than an empty zone, so
			// there is room to drop another card in. An empty zone keeps the size it has.
			const left = Math.min(...inside.map((m) => m.x));
			const top = Math.min(...inside.map((m) => m.y));
			const right = Math.max(...inside.map((m) => m.x + m.width));
			const bottom = Math.max(...inside.map((m) => m.y + m.height));
			const min = emptyZoneSize(layout);
			zone.x = left - layout.gap;
			zone.y = top - layout.gap;
			zone.width = Math.max(right - left + layout.gap * 2, min.width);
			zone.height = Math.max(bottom - top + layout.gap * 2, min.height);
		}
		contents.set(zone, inside);
	}
	// Zone maps take their shape, then each map moves as one piece among everything else.
	arrange(data, layout, contents);
	const mapOf = mapRoots(data);
	const top: Unit[] = [];
	const merged = new Map<string, Unit>();
	for (const unit of unitsIn(undefined)) {
		const root = unit.solid.length === 1 ? mapOf.get(unit.solid[0].id) : undefined;
		const into = root ? merged.get(root) : undefined;
		if (into) {
			into.nodes.push(...unit.nodes);
			into.solid.push(...unit.solid);
		} else {
			if (root) merged.set(root, unit);
			top.push(unit);
		}
	}
	separate(top, pad, pins);
	return new Map([...home].map(([card, zone]) => [card.id, zone.id]));
}

/**
 * Which zone each card belongs to: the zone it was in last time (`stay`) while its centre is still
 * inside it, else the innermost zone around its centre, else the zone of the card its arrows come from.
 */
function homes(data: CanvasData, groups: CanvasNode[], parent: Map<CanvasNode, CanvasNode | undefined>, stay?: Map<string, string>): Map<CanvasNode, CanvasNode> {
	const byId = new Map(groups.map((g) => [g.id, g]));
	const home = new Map<CanvasNode, CanvasNode>();
	for (const card of data.nodes) {
		if (card.type === "group") continue;
		const before = byId.get(stay?.get(card.id) ?? "");
		// The zone it was in, unless it was dropped into a zone inside that one.
		const inner = zoneOf(card, groups);
		const keep = before && centreInside(card, before) && (!inner || !within(inner, before, parent));
		const zone = keep ? before : inner;
		if (zone) home.set(card, zone);
	}
	const subtree = subtrees(data);
	const byPosition = new Set(home.keys());
	for (const card of byPosition) {
		for (const below of subtree(card, (n) => byPosition.has(n)).slice(1)) {
			if (!home.has(below)) home.set(below, home.get(card) as CanvasNode);
		}
	}
	return home;
}

/** Whether `inner` sits inside `outer`, at any depth. */
function within(inner: CanvasNode, outer: CanvasNode, parent: Map<CanvasNode, CanvasNode | undefined>): boolean {
	for (let at = parent.get(inner); at; at = parent.get(at)) if (at === outer) return true;
	return false;
}

/** Ids of the zones joined to another zone by an arrow: the zones of zone maps. */
function mapped(data: CanvasData): Set<string> {
	const groups = new Set(data.nodes.filter((n) => n.type === "group").map((n) => n.id));
	const ids = new Set<string>();
	for (const e of data.edges) {
		if (e.fromNode === e.toNode || !groups.has(e.fromNode) || !groups.has(e.toNode)) continue;
		ids.add(e.fromNode).add(e.toNode);
	}
	return ids;
}

/**
 * The zone each zone sits in (undefined at the top level). A zone of a zone map is always at the
 * top level, even when dropped over another zone, and never holds another map zone.
 */
function enclosing(data: CanvasData, groups: CanvasNode[]): Map<CanvasNode, CanvasNode | undefined> {
	const inMap = mapped(data);
	const parent = new Map<CanvasNode, CanvasNode | undefined>();
	groups.forEach((g, i) => {
		const outer = inMap.has(g.id) ? [] : groups.slice(i + 1).filter((o) => area(o) > area(g));
		parent.set(g, zoneOf(g, outer));
	});
	return parent;
}

/** Everything that travels with each zone: its cards and the zones inside it, with theirs. */
function contentsOf(home: Map<CanvasNode, CanvasNode>, groups: CanvasNode[], parent: Map<CanvasNode, CanvasNode | undefined>): Map<CanvasNode, CanvasNode[]> {
	const contents = new Map<CanvasNode, CanvasNode[]>(groups.map((g) => [g, []]));
	for (const [card, zone] of home) contents.get(zone)?.push(card);
	// Smallest first, so an inner zone is complete before it joins the one around it.
	for (const g of groups) {
		const outer = parent.get(g);
		if (outer) contents.get(outer)?.push(g, ...(contents.get(g) ?? []));
	}
	return contents;
}

// ---------- Zone maps ----------
//
// A zone map is a tree of zones joined by arrows. The arrows hold its shape: an arrow leaving its
// zone on the left puts the child on the left, and siblings come in the order of their arrows in
// the file: the root's children clockwise round it (top to bottom on the right, bottom to top on
// the left), deeper zones top to bottom on either side, as in Canvas Arbor's mind maps.
// Nothing depends on where the zones happen to be, so a zone dragged out of place goes back;
// Alt+Up / Alt+Down (moveMapZone) change the order, and for the root's children the side too.

/** One arrow of a zone map: the edge, and the parent and child zone ids. */
interface MapArrow {
	edge: CanvasEdge;
	from: string;
	to: string;
}

/**
 * The arrows that make zone maps, in file order: for each zone, the oldest arrow coming into it
 * from another zone. An arrow that would close a loop is ignored.
 */
function mapArrows(data: CanvasData): MapArrow[] {
	const groups = new Set(data.nodes.filter((n) => n.type === "group").map((n) => n.id));
	const up = new Map<string, string>();
	const arrows: MapArrow[] = [];
	const rootOf = (id: string) => {
		let at = id;
		for (let next = up.get(at); next; next = up.get(at)) at = next;
		return at;
	};
	for (const edge of data.edges) {
		const { fromNode: from, toNode: to } = edge;
		if (from === to || !groups.has(from) || !groups.has(to) || up.has(to)) continue;
		if (rootOf(from) === to) continue; // would close a loop
		up.set(to, from);
		arrows.push({ edge, from, to });
	}
	return arrows;
}

/** The parent of each zone in a zone map, by id. */
export function zoneParents(data: CanvasData): Map<string, string> {
	return new Map(mapArrows(data).map((a) => [a.to, a.from]));
}

/** Root zone of the map each mapped zone belongs to, by id. Zones outside any map are left out. */
function mapRoots(data: CanvasData): Map<string, string> {
	const up = zoneParents(data);
	const roots = new Map<string, string>();
	for (const id of up.keys()) {
		let at = id;
		for (let next = up.get(at); next; next = up.get(at)) at = next;
		roots.set(id, at);
		roots.set(at, at);
	}
	return roots;
}

/** Room between zones in a map: across (between a zone and its children) and along (between siblings). */
export const mapGaps = (layout: Layout) => ({ across: layout.gap * 4, along: layout.gap * 2 });

const centreX = (n: CanvasNode) => n.x + n.width / 2;
const centreY = (n: CanvasNode) => n.y + n.height / 2;

/** The side an arrow puts its child on: where it leaves its zone, else where the child is now. */
function sideOf(arrow: MapArrow, byId: Map<string, CanvasNode>): 1 | -1 {
	if (arrow.edge.fromSide === "left") return -1;
	if (arrow.edge.fromSide === "right") return 1;
	const from = byId.get(arrow.from);
	const to = byId.get(arrow.to);
	return from && to && centreX(to) < centreX(from) ? -1 : 1;
}

/**
 * Lays out every zone map: the root stays where it is; its children go to the side their arrows
 * leave it from, deeper zones keep their parent's side. Each level is a column, siblings stacked
 * in the order of their arrows and centred on their parent: the root's children clockwise (on the
 * left the first is at the bottom), deeper zones top to bottom. Every zone takes its contents along.
 */
function arrange(data: CanvasData, layout: Layout, contents: Map<CanvasNode, CanvasNode[]>): void {
	const arrows = mapArrows(data);
	if (!arrows.length) return;
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const kids = new Map<CanvasNode, { node: CanvasNode; side: 1 | -1 }[]>();
	const hasParent = new Set<string>();
	for (const a of arrows) {
		const c = byId.get(a.to);
		const p = byId.get(a.from);
		if (!c || !p) continue;
		hasParent.add(c.id);
		kids.set(p, [...(kids.get(p) ?? []), { node: c, side: sideOf(a, byId) }]);
	}
	const { across, along } = mapGaps(layout);
	const band = new Map<CanvasNode, number>();
	const bandOf = (n: CanvasNode): number => {
		const known = band.get(n);
		if (known !== undefined) return known;
		const list = kids.get(n) ?? [];
		const stack = list.reduce((sum, k) => sum + bandOf(k.node), 0) + along * Math.max(0, list.length - 1);
		const size = Math.max(n.height, stack);
		band.set(n, size);
		return size;
	};
	const moveTo = (n: CanvasNode, x: number, y: number) => {
		const dx = x - n.x;
		const dy = y - n.y;
		if (!dx && !dy) return;
		for (const m of [n, ...(contents.get(n) ?? [])]) {
			m.x += dx;
			m.y += dy;
		}
	};
	const place = (p: CanvasNode, list: CanvasNode[], dir: 1 | -1, round = false) => {
		if (!list.length) return;
		const total = list.reduce((sum, k) => sum + bandOf(k), 0) + along * (list.length - 1);
		let top = centreY(p) - total / 2;
		for (const k of round && dir < 0 ? [...list].reverse() : list) {
			const size = bandOf(k);
			moveTo(k, dir > 0 ? p.x + p.width + across : p.x - across - k.width, top + size / 2 - k.height / 2);
			place(k, (kids.get(k) ?? []).map((c) => c.node), dir);
			top += size + along;
		}
	};
	for (const root of [...kids.keys()].filter((n) => !hasParent.has(n.id))) {
		const list = kids.get(root) ?? [];
		place(root, list.filter((k) => k.side > 0).map((k) => k.node), 1);
		place(root, list.filter((k) => k.side < 0).map((k) => k.node), -1, true);
	}
}

/**
 * Lays out the zone maps on their own, without wrapping zones around their cards or pushing
 * anything else apart. In place. For canvases where zones don't follow their contents.
 * `stay` and the result: where each card is, as for tidyZones.
 */
export function arrangeZoneMaps(data: CanvasData, layout: Layout, stay?: Map<string, string>): Map<string, string> {
	const groups = groupsBySize(data);
	const parent = enclosing(data, groups);
	const home = homes(data, groups, parent, stay);
	arrange(data, layout, contentsOf(home, groups, parent));
	return new Map([...home].map(([card, zone]) => [card.id, zone.id]));
}

const sides = (dir: 1 | -1) => (dir > 0 ? { fromSide: "right", toSide: "left" } : { fromSide: "left", toSide: "right" });

/**
 * Adds an empty zone to a zone map, joined by an arrow: a child of `fromId` (beside it, last
 * clockwise round a root, else last), or its sibling (next to it: clockwise round a root, so above
 * on its left; below anywhere else; a sibling of a root is a child of it). A root's new child goes on the side with less in it;
 * deeper zones keep their parent's side. The map is laid out again. Null if `fromId` is not a zone.
 */
export function addMapZone(
	input: CanvasData,
	fromId: string,
	kind: "child" | "sibling",
	layout: Layout,
	options: { label?: string; color?: string; newId?: () => string } = {},
): { data: CanvasData; zone: CanvasNode } | null {
	const data = clone(input);
	const newId = options.newId ?? randomId;
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const from = byId.get(fromId);
	if (from?.type !== "group") return null;
	const arrows = mapArrows(data);
	const into = arrows.find((a) => a.to === from.id);
	const target = kind === "sibling" && into ? (byId.get(into.from) as CanvasNode) : from;
	const above = arrows.find((a) => a.to === target.id);
	const own = arrows.filter((a) => a.from === target.id);

	let dir: 1 | -1;
	let after: CanvasEdge | undefined; // the new arrow goes right after this one
	if (target !== from && into) {
		dir = above ? sideOf(above, byId) : sideOf(into, byId);
		after = into.edge;
	} else {
		if (above) dir = sideOf(above, byId);
		else {
			const weight = (side: 1 | -1) => own.filter((a) => sideOf(a, byId) === side).reduce((sum, a) => sum + (byId.get(a.to)?.height ?? 0), 0);
			dir = weight(-1) < weight(1) ? -1 : 1;
		}
		after = [...own].reverse().find((a) => (above ? true : sideOf(a, byId) === dir))?.edge;
	}
	const size = emptyZoneSize(layout);
	const { across } = mapGaps(layout);
	const zone: CanvasNode = {
		id: newId(),
		type: "group",
		label: options.label ?? "",
		x: dir > 0 ? target.x + target.width + across : target.x - across - size.width,
		y: centreY(target) - size.height / 2,
		...size,
	};
	if (options.color) zone.color = options.color;
	data.nodes.unshift(zone); // groups first, so they render behind the cards
	const edge: CanvasEdge = { id: newId(), fromNode: target.id, toNode: zone.id, ...sides(dir) };
	const at = after ? data.edges.indexOf(after) + 1 : data.edges.length;
	data.edges.splice(at, 0, edge);
	arrangeZoneMaps(data, layout);
	return { data, zone };
}

/**
 * Moves a zone one step up or down beside its siblings. A child of the root goes round it
 * clockwise: past the top or the bottom of its column it moves to the same end of the other side.
 * Changes the order and sides of the arrows, then lays the map out again. Null if nothing moves.
 */
export function moveMapZone(input: CanvasData, zoneId: string, where: "up" | "down", layout: Layout): CanvasData | null {
	const data = clone(input);
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const arrows = mapArrows(data);
	const mine = arrows.find((a) => a.to === zoneId);
	if (!mine) return null;
	const isRootChild = !arrows.some((a) => a.to === mine.from);
	const siblings = arrows.filter((a) => a.from === mine.from);
	const sideOfKid = (a: MapArrow): 1 | -1 => {
		if (isRootChild) return sideOf(a, byId);
		const above = arrows.find((x) => x.to === mine.from);
		return above ? sideOf(above, byId) : 1;
	};
	// Each side top to bottom, as on screen.
	const right = siblings.filter((a) => sideOfKid(a) > 0);
	const leftInFile = siblings.filter((a) => sideOfKid(a) < 0);
	const left = isRootChild ? [...leftInFile].reverse() : leftInFile;
	const side = sideOfKid(mine);
	const column = side > 0 ? right : left;
	const i = column.indexOf(mine);
	const j = i + (where === "up" ? -1 : 1);
	if (j >= 0 && j < column.length) {
		[column[i], column[j]] = [column[j], column[i]];
	} else {
		if (!isRootChild) return null;
		// Off the end of the column: over to the same end of the other side.
		column.splice(i, 1);
		const other = side > 0 ? left : right;
		if (where === "up") other.unshift(mine);
		else other.push(mine);
		Object.assign(mine.edge, sides(side > 0 ? -1 : 1));
	}
	// Write the arrows back where the siblings' arrows were: right top to bottom, then the left (bottom to top round a root).
	const slots = siblings.map((a) => data.edges.indexOf(a.edge)).sort((a, b) => a - b);
	[...right, ...(isRootChild ? [...left].reverse() : left)].forEach((a, k) => (data.edges[slots[k]] = a.edge));
	arrangeZoneMaps(data, layout);
	return data;
}

/**
 * Joins `rootId` with an arrow to every top-level zone in no map yet, and to the roots of other
 * maps, so they all form one map around it, each on the side it is now, top to bottom.
 * Null if there was nothing to join.
 */
export function linkZonesTo(input: CanvasData, rootId: string, options: { newId?: () => string } = {}): CanvasData | null {
	const data = clone(input);
	const newId = options.newId ?? randomId;
	const groups = groupsBySize(data);
	const parent = enclosing(data, groups);
	const root = groups.find((g) => g.id === rootId);
	if (!root || parent.get(root)) return null;
	const roots = mapRoots(data);
	const mine = roots.get(root.id) ?? root.id;
	const join = groups
		.filter((g) => g !== root && !parent.get(g))
		.filter((g) => {
			const r = roots.get(g.id);
			return r !== mine && (!r || r === g.id); // not in this map, not below another root
		})
		// Clockwise, as the map reads them: right top to bottom, then left bottom to top.
		.sort((a, b) => {
			const side = (g: CanvasNode) => (centreX(g) >= centreX(root) ? 0 : 1);
			const flip = side(a) ? -1 : 1;
			return side(a) - side(b) || flip * (centreY(a) - centreY(b)) || (a.id < b.id ? -1 : 1);
		});
	for (const g of join) {
		data.edges.push({ id: newId(), fromNode: root.id, toNode: g.id, ...sides(centreX(g) >= centreX(root) ? 1 : -1) });
	}
	return join.length ? data : null;
}
