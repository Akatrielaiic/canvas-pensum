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
 */
export function tidyZones(data: CanvasData, layout: Layout, pinned: string[] = []): void {
	const pad = layout.gap / 2;
	const pins = new Set(pinned);
	const groups = groupsBySize(data);
	const cards = data.nodes.filter((n) => n.type !== "group");
	const home = homes(data, groups);

	const parent = enclosing(groups);

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
	arrange(data, layout, contents, parent);
	const mapOf = mapRoots(data, parent);
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
}

/** Which zone each card belongs to: the innermost one around its centre, else the zone of the card its arrows come from. */
function homes(data: CanvasData, groups: CanvasNode[]): Map<CanvasNode, CanvasNode> {
	const home = new Map<CanvasNode, CanvasNode>();
	for (const card of data.nodes) {
		if (card.type === "group") continue;
		const zone = zoneOf(card, groups);
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

/** The zone each zone sits in (undefined at the top level). */
function enclosing(groups: CanvasNode[]): Map<CanvasNode, CanvasNode | undefined> {
	const parent = new Map<CanvasNode, CanvasNode | undefined>();
	groups.forEach((g, i) => parent.set(g, zoneOf(g, groups.slice(i + 1).filter((o) => area(o) > area(g)))));
	return parent;
}

/** Everything that travels with each zone: its cards and the zones inside it, with theirs. */
function contentsOf(data: CanvasData, groups: CanvasNode[], parent: Map<CanvasNode, CanvasNode | undefined>): Map<CanvasNode, CanvasNode[]> {
	const contents = new Map<CanvasNode, CanvasNode[]>(groups.map((g) => [g, []]));
	for (const [card, zone] of homes(data, groups)) contents.get(zone)?.push(card);
	// Smallest first, so an inner zone is complete before it joins the one around it.
	for (const g of groups) {
		const outer = parent.get(g);
		if (outer) contents.get(outer)?.push(g, ...(contents.get(g) ?? []));
	}
	return contents;
}

// ---------- Zone maps ----------

/**
 * The parent of each zone in a zone map, by id: the zone the oldest arrow into it comes from.
 * Only top-level zones take part; an arrow that would close a loop is ignored.
 */
export function zoneParents(data: CanvasData, parent?: Map<CanvasNode, CanvasNode | undefined>): Map<string, string> {
	const groups = groupsBySize(data);
	const outer = parent ?? enclosing(groups);
	const top = new Set(groups.filter((g) => !outer.get(g)).map((g) => g.id));
	const up = new Map<string, string>();
	const rootOf = (id: string) => {
		let at = id;
		for (let next = up.get(at); next; next = up.get(at)) at = next;
		return at;
	};
	for (const e of data.edges) {
		if (!top.has(e.fromNode) || !top.has(e.toNode) || e.fromNode === e.toNode || up.has(e.toNode)) continue;
		if (rootOf(e.fromNode) === e.toNode) continue; // would close a loop
		up.set(e.toNode, e.fromNode);
	}
	return up;
}

/** Root zone of the map each mapped zone belongs to, by id. Zones outside any map are left out. */
function mapRoots(data: CanvasData, parent?: Map<CanvasNode, CanvasNode | undefined>): Map<string, string> {
	const up = zoneParents(data, parent);
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

/**
 * Lays out every zone map: the root stays where it is, its children go to its right or left (the
 * side they are on now), each level in a column, stacked in their current top-to-bottom order and
 * centred on their parent. Every zone takes its contents along. In place.
 */
function arrange(data: CanvasData, layout: Layout, contents: Map<CanvasNode, CanvasNode[]>, parent: Map<CanvasNode, CanvasNode | undefined>): void {
	const up = zoneParents(data, parent);
	if (!up.size) return;
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const kids = new Map<CanvasNode, CanvasNode[]>();
	for (const [child, from] of up) {
		const c = byId.get(child);
		const p = byId.get(from);
		if (c && p) kids.set(p, [...(kids.get(p) ?? []), c]);
	}
	const order = (list: CanvasNode[]) => [...list].sort((a, b) => centreY(a) - centreY(b) || (a.id < b.id ? -1 : 1));
	const { across, along } = mapGaps(layout);
	const band = new Map<CanvasNode, number>();
	const bandOf = (n: CanvasNode): number => {
		const known = band.get(n);
		if (known !== undefined) return known;
		const list = kids.get(n) ?? [];
		const stack = list.reduce((sum, k) => sum + bandOf(k), 0) + along * Math.max(0, list.length - 1);
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
	const place = (p: CanvasNode, list: CanvasNode[], dir: 1 | -1) => {
		if (!list.length) return;
		const total = list.reduce((sum, k) => sum + bandOf(k), 0) + along * (list.length - 1);
		let top = centreY(p) - total / 2;
		for (const k of list) {
			const size = bandOf(k);
			moveTo(k, dir > 0 ? p.x + p.width + across : p.x - across - k.width, top + size / 2 - k.height / 2);
			place(k, order(kids.get(k) ?? []), dir);
			top += size + along;
		}
	};
	for (const root of [...kids.keys()].filter((n) => !up.has(n.id))) {
		const list = order(kids.get(root) ?? []);
		place(root, list.filter((k) => centreX(k) >= centreX(root)), 1);
		place(root, list.filter((k) => centreX(k) < centreX(root)), -1);
	}
}

/**
 * Lays out the zone maps on their own, without wrapping zones around their cards or pushing
 * anything else apart. In place. For canvases where zones don't follow their contents.
 */
export function arrangeZoneMaps(data: CanvasData, layout: Layout): void {
	const groups = groupsBySize(data);
	const parent = enclosing(groups);
	arrange(data, layout, contentsOf(data, groups, parent), parent);
}

/**
 * Adds an empty zone to a zone map, joined by an arrow: a child of `fromId`, or its sibling (a
 * sibling of a root is a child of it). A root's new child goes on the side with less in it;
 * deeper zones keep their parent's side. The map is laid out again. Null if `fromId` is not a
 * top-level zone.
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
	const groups = groupsBySize(data);
	const parent = enclosing(groups);
	const from = groups.find((g) => g.id === fromId);
	if (!from || parent.get(from)) return null;
	const up = zoneParents(data, parent);
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const target = kind === "sibling" ? (byId.get(up.get(from.id) ?? "") ?? from) : from;
	const kidsOf = (p: CanvasNode) =>
		[...up].filter(([, f]) => f === p.id).map(([c]) => byId.get(c)).filter((n): n is CanvasNode => !!n);
	const sideOf = (n: CanvasNode, of: CanvasNode): 1 | -1 => (centreX(n) >= centreX(of) ? 1 : -1);

	// Which side: a sibling takes `from`'s; under a root, the lighter side; deeper, the parent's.
	const grand = byId.get(up.get(target.id) ?? "");
	let dir: 1 | -1;
	if (target !== from) dir = sideOf(from, target);
	else if (grand) dir = sideOf(target, grand);
	else {
		const weight = (side: 1 | -1) => kidsOf(target).filter((k) => sideOf(k, target) === side).reduce((sum, k) => sum + k.height, 0);
		dir = weight(-1) < weight(1) ? -1 : 1;
	}
	// Where it starts decides its place among its siblings: just below `from`, or below them all.
	const below = target !== from ? from : kidsOf(target).filter((k) => sideOf(k, target) === dir).sort((a, b) => centreY(b) - centreY(a))[0];
	const size = emptyZoneSize(layout);
	const { across } = mapGaps(layout);
	const zone: CanvasNode = {
		id: newId(),
		type: "group",
		label: options.label ?? "",
		x: dir > 0 ? target.x + target.width + across : target.x - across - size.width,
		y: below ? below.y + below.height + 1 : centreY(target) - size.height / 2,
		...size,
	};
	if (options.color) zone.color = options.color;
	data.nodes.unshift(zone); // groups first, so they render behind the cards
	data.edges.push({
		id: newId(),
		fromNode: target.id,
		toNode: zone.id,
		fromSide: dir > 0 ? "right" : "left",
		toSide: dir > 0 ? "left" : "right",
	});
	arrangeZoneMaps(data, layout);
	return { data, zone };
}

/**
 * Joins `rootId` with an arrow to every top-level zone in no map yet, and to the roots of other
 * maps, so they all form one map around it. Null if there was nothing to join.
 */
export function linkZonesTo(input: CanvasData, rootId: string, options: { newId?: () => string } = {}): CanvasData | null {
	const data = clone(input);
	const newId = options.newId ?? randomId;
	const groups = groupsBySize(data);
	const parent = enclosing(groups);
	const root = groups.find((g) => g.id === rootId);
	if (!root || parent.get(root)) return null;
	const roots = mapRoots(data, parent);
	const mine = roots.get(root.id) ?? root.id;
	let changed = false;
	for (const g of groups) {
		if (g === root || parent.get(g)) continue;
		const r = roots.get(g.id);
		if (r === mine || (r && r !== g.id)) continue; // already in this map, or below another root
		const right = centreX(g) >= centreX(root);
		data.edges.push({ id: newId(), fromNode: root.id, toNode: g.id, fromSide: right ? "right" : "left", toSide: right ? "left" : "right" });
		changed = true;
	}
	return changed ? data : null;
}
