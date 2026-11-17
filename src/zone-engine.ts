// Zone engine: pure functions over JSON Canvas data (https://jsoncanvas.org). No Obsidian imports.
//
// A zone is a group. A card belongs to the innermost zone around its centre; the cards its
// arrows lead to belong there too. Once known, that only changes by hand: a card dragged into or
// out of a zone, or moved with Move to zone. Tidying never changes it: zones wrap what belongs
// to them, and cards that belong to none are pushed out of the way. This file places cards in
// zones, moves them between zones and keeps zones wrapped around their contents without overlaps.
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
 * Pushes each of `units` off the `fixed` ones, to the right or down; `fixed` don't move and the
 * units don't push each other. Used for cards in no zone, which never end up inside one.
 */
function pushOff(units: Unit[], fixed: Unit[], pad: number): void {
	const walls = fixed.flatMap((u) => u.solid);
	for (const unit of units) {
		for (let guard = 0; guard < 500; guard++) {
			let dx = 0;
			let dy = 0;
			for (const a of walls) {
				for (const b of unit.solid) {
					if (!intersects(a, b)) continue;
					dx = Math.max(dx, a.x + a.width + pad - b.x);
					dy = Math.max(dy, a.y + a.height + pad - b.y);
				}
			}
			if (!dx && !dy) break;
			for (const n of unit.nodes) {
				if (dx <= dy) n.x += dx;
				else n.y += dy;
			}
		}
	}
}

/** Where a card belongs, as remembered between tidies: its zone (none if missing) and where it was. */
export interface Home {
	zone?: string;
	x?: number;
	y?: number;
}

/** Cards joined by arrows, among `members`, as pieces that move as one. */
function piecesOf(members: CanvasNode[], data: CanvasData): Unit[] {
	const linked = new Map<string, string[]>();
	for (const e of data.edges) {
		linked.set(e.fromNode, [...(linked.get(e.fromNode) ?? []), e.toNode]);
		linked.set(e.toNode, [...(linked.get(e.toNode) ?? []), e.fromNode]);
	}
	const byId = new Map(members.map((c) => [c.id, c]));
	const seen = new Set<string>();
	const units: Unit[] = [];
	for (const start of members) {
		if (seen.has(start.id)) continue;
		seen.add(start.id);
		const piece = [start];
		for (const node of piece) {
			for (const id of linked.get(node.id) ?? []) {
				const next = byId.get(id);
				if (!next || seen.has(id)) continue;
				seen.add(id);
				piece.push(next);
			}
		}
		units.push({ nodes: piece, solid: piece });
	}
	return units;
}

/** What to remember for next time: each card's zone and where it is now. */
const homesOut = (data: CanvasData, home: Map<CanvasNode, CanvasNode>): Map<string, Home> =>
	new Map(data.nodes.filter((n) => n.type !== "group").map((c) => [c.id, { zone: home.get(c)?.id, x: c.x, y: c.y }]));

/**
 * Makes every zone hold what belongs to it without overlaps. In place.
 *
 * A card belongs to the innermost zone around its centre. Cards its arrows lead to belong there
 * too, unless they already sit in a zone of their own. Cards joined by arrows move as one piece.
 * A zone wraps its contents, growing and shrinking with them; zones that end up overlapping
 * are pushed apart with everything in them, and cards in no zone are pushed out of every zone.
 *
 * `stay`: where each card was last time, as returned. A card keeps that zone, or stays out of
 * every zone, until it is moved by hand: its position changed since, or (when given) it is in
 * `moved`. A new card under another (an arrow leads to it) takes that card's zone.
 * Returns where each card is now.
 */
export function tidyZones(data: CanvasData, layout: Layout, pinned: string[] = [], stay?: Map<string, Home>, moved?: Set<string>): Map<string, Home> {
	const pad = layout.gap / 2;
	const pins = new Set(pinned);
	const groups = groupsBySize(data);
	const cards = data.nodes.filter((n) => n.type !== "group");
	const parent = enclosing(data, groups);
	const home = homes(data, groups, parent, stay, moved);

	const contents = new Map<CanvasNode, CanvasNode[]>();
	const unitsIn = (zone: CanvasNode | undefined): Unit[] => {
		const units = zone ? piecesOf(cards.filter((c) => home.get(c) === zone), data) : [];
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
	pushOff(piecesOf(cards.filter((c) => !home.has(c)), data), top, pad);
	return homesOut(data, home);
}

/**
 * Which zone each card belongs to. A card remembered in `stay` keeps its zone (or no zone) unless
 * it was moved by hand; then, the zone it was in while its centre is still inside it, else the
 * innermost zone around its centre, and the cards below it that shared its zone go along. A card not remembered yet: under another card (once an
 * earlier tidy is remembered), that card's zone; else the innermost zone around it, else the zone
 * of the card its arrows come from.
 */
function homes(
	data: CanvasData,
	groups: CanvasNode[],
	parent: Map<CanvasNode, CanvasNode | undefined>,
	stay?: Map<string, Home>,
	moved?: Set<string>,
): Map<CanvasNode, CanvasNode> {
	const byId = new Map(groups.map((g) => [g.id, g]));
	const isCard = new Set(data.nodes.filter((n) => n.type !== "group").map((n) => n.id));
	const under = new Set(data.edges.filter((e) => isCard.has(e.fromNode) && e.fromNode !== e.toNode).map((e) => e.toNode));
	// Remembered from an earlier tidy (records with a position), not only cards placed just now.
	const known = [...(stay?.values() ?? [])].some((h) => h.x !== undefined);
	const home = new Map<CanvasNode, CanvasNode>();
	const decided = new Set<CanvasNode>();
	const byHandFrom = new Map<CanvasNode, string | undefined>(); // moved by hand, and the zone it was in
	for (const card of data.nodes) {
		if (card.type === "group") continue;
		const was = stay?.get(card.id);
		const inner = zoneOf(card, groups);
		let zone: CanvasNode | undefined;
		if (was) {
			const before = was.zone === undefined ? undefined : byId.get(was.zone);
			const gone = was.zone !== undefined && !before;
			const byHand = moved
				? moved.has(card.id)
				: was.x !== undefined && was.y !== undefined && (Math.abs(was.x - card.x) > 1 || Math.abs(was.y - card.y) > 1);
			// Moved by hand: the zone it was in, unless it was dropped into a zone inside that one.
			const keep = before && centreInside(card, before) && (!inner || !within(inner, before, parent));
			zone = byHand || gone ? (keep ? before : inner) : before;
			if (byHand) byHandFrom.set(card, was.zone);
			decided.add(card);
		} else if (known && under.has(card.id)) {
			continue; // new, under another card: takes its zone below
		} else {
			zone = inner;
		}
		if (zone) {
			home.set(card, zone);
			decided.add(card);
		}
	}
	const subtree = subtrees(data);
	// A card moved by hand takes its branches along: the cards below it that were in its zone (or in
	// none with it) go where it went. Branches living in another zone stay there.
	const branch = (card: CanvasNode) => subtree(card, (n) => stay?.get(n.id)?.zone !== byHandFrom.get(card)).slice(1);
	const carried = new Set([...byHandFrom.keys()].flatMap(branch));
	for (const card of byHandFrom.keys()) {
		if (carried.has(card)) continue; // its branch is carried by a card above it
		const zone = home.get(card);
		for (const below of branch(card)) {
			if (zone) home.set(below, zone);
			else home.delete(below);
		}
	}
	const fixed = new Set(decided);
	for (const card of home.keys()) {
		for (const below of subtree(card, (n) => fixed.has(n)).slice(1)) {
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

/** How zone maps are balanced, as Canvas Arbor's mind maps: from this many children of the root on (0: never). */
export interface MapOptions {
	balanceFrom?: number;
}
const DEFAULT_BALANCE_FROM = 5;

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

const sides = (dir: 1 | -1) => (dir > 0 ? { fromSide: "right", toSide: "left" } : { fromSide: "left", toSide: "right" });

/** A zone map read from the arrows: each zone's children (in file order, with their side), and band heights. */
function mapTree(data: CanvasData, layout: Layout) {
	const arrows = mapArrows(data);
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const kids = new Map<CanvasNode, { node: CanvasNode; side: 1 | -1; arrow: MapArrow }[]>();
	const hasParent = new Set<string>();
	for (const a of arrows) {
		const c = byId.get(a.to);
		const p = byId.get(a.from);
		if (!c || !p) continue;
		hasParent.add(c.id);
		kids.set(p, [...(kids.get(p) ?? []), { node: c, side: sideOf(a, byId), arrow: a }]);
	}
	const { along } = mapGaps(layout);
	const band = new Map<CanvasNode, number>();
	/** Height a zone takes with everything below it. */
	const bandOf = (n: CanvasNode): number => {
		const known = band.get(n);
		if (known !== undefined) return known;
		const list = kids.get(n) ?? [];
		const stack = list.reduce((sum, k) => sum + bandOf(k.node), 0) + along * Math.max(0, list.length - 1);
		const size = Math.max(n.height, stack);
		band.set(n, size);
		return size;
	};
	return { arrows, byId, kids, hasParent, bandOf };
}

/**
 * Lays out every zone map: the root stays where it is; its children go to the side their arrows
 * leave it from, deeper zones keep their parent's side. Each level is a column, siblings stacked
 * in the order of their arrows and centred on their parent: the root's children clockwise (on the
 * left the first is at the bottom), deeper zones top to bottom. Every zone takes its contents along.
 */
function arrange(data: CanvasData, layout: Layout, contents: Map<CanvasNode, CanvasNode[]>): void {
	const { arrows, kids, hasParent, bandOf } = mapTree(data, layout);
	if (!arrows.length) return;
	const { across, along } = mapGaps(layout);
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
 * other zones apart. In place. For canvases where zones don't follow their contents. Cards in no
 * zone are still pushed out of the map zones. `stay`, `moved` and the result: as for tidyZones.
 */
export function arrangeZoneMaps(data: CanvasData, layout: Layout, stay?: Map<string, Home>, moved?: Set<string>): Map<string, Home> {
	const groups = groupsBySize(data);
	const parent = enclosing(data, groups);
	const home = homes(data, groups, parent, stay, moved);
	const contents = contentsOf(home, groups, parent);
	arrange(data, layout, contents);
	const inMap = mapped(data);
	const maps = groups.filter((g) => inMap.has(g.id)).map((g) => ({ nodes: [g, ...(contents.get(g) ?? [])], solid: [g] }));
	if (maps.length) pushOff(piecesOf(data.nodes.filter((n) => n.type !== "group" && !home.has(n)), data), maps, layout.gap / 2);
	return homesOut(data, home);
}

/** The root's arrows clockwise: down the right side, then up the left one. */
function ringOf(list: { side: 1 | -1; arrow: MapArrow }[]): MapArrow[] {
	return [...list.filter((k) => k.side > 0), ...list.filter((k) => k.side < 0)].map((k) => k.arrow);
}

/**
 * Writes a root's arrows back in clockwise order `ring`, the first `right` of them on the right
 * and the rest on the left, into the places its arrows had in the file.
 */
function writeRing(data: CanvasData, ring: MapArrow[], right: number): void {
	const slots = ring.map((a) => data.edges.indexOf(a.edge)).sort((a, b) => a - b);
	ring.forEach((a, k) => {
		Object.assign(a.edge, sides(k < right ? 1 : -1));
		data.edges[slots[k]] = a.edge;
	});
}

/**
 * Shares a root's children out over its two sides, keeping their clockwise order and evening out
 * the heights, as Canvas Arbor balances a mind map: when two splits are as even, the right side
 * gets the extra zone. Only from `balanceFrom` children on. Returns whether it applied.
 */
function balanceRoot(data: CanvasData, rootId: string, layout: Layout, options: MapOptions, ring?: MapArrow[]): boolean {
	const from = options.balanceFrom ?? DEFAULT_BALANCE_FROM;
	const { byId, kids, bandOf } = mapTree(data, layout);
	const root = byId.get(rootId);
	const list = root ? (kids.get(root) ?? []) : [];
	if (from <= 0 || list.length < from) return false;
	const order = ring ?? ringOf(list);
	const spans = order.map((a) => bandOf(byId.get(a.to) as CanvasNode));
	const total = spans.reduce((a, b) => a + b, 0);
	let best = 1;
	let bestDiff = Infinity;
	let acc = 0;
	for (let k = 1; k < order.length; k++) {
		acc += spans[k - 1];
		const diff = Math.abs(acc - (total - acc));
		if (diff <= bestDiff + 0.5) {
			bestDiff = Math.min(diff, bestDiff);
			best = k;
		}
	}
	writeRing(data, order, best);
	return true;
}

/** Balances every zone map whose root has enough children (Tidy, Balance map). In place; lays them out again. */
export function balanceZoneMaps(data: CanvasData, layout: Layout, options: MapOptions = {}): void {
	const { kids, hasParent } = mapTree(data, layout);
	for (const root of kids.keys()) if (!hasParent.has(root.id)) balanceRoot(data, root.id, layout, options);
	arrangeZoneMaps(data, layout);
}

/**
 * Joins zone `childId` to the map under `targetId` with a new arrow, by the rules Canvas Arbor
 * uses for a new node: after `after` (its sibling, clockwise round a root) or last. Round a root
 * with enough children the sides are balanced again; with fewer, a new child goes on the side
 * that takes less room (on the left last clockwise, so at the top), a sibling on its sibling's side.
 */
function join(data: CanvasData, targetId: string, childId: string, after: string | null, layout: Layout, options: MapOptions & { newId?: () => string }): void {
	const newId = options.newId ?? randomId;
	const { arrows, byId, kids, hasParent, bandOf } = mapTree(data, layout);
	const target = byId.get(targetId) as CanvasNode;
	const own = kids.get(target) ?? [];
	const isRoot = !hasParent.has(target.id);
	const prev = own.find((k) => k.node.id === after);
	let dir: 1 | -1;
	const above = arrows.find((a) => a.to === target.id);
	if (prev) dir = prev.side;
	else if (above) dir = sideOf(above, byId);
	else {
		const { along } = mapGaps(layout);
		const reach = (side: 1 | -1) => own.filter((k) => k.side === side).reduce((sum, k) => sum + bandOf(k.node) + along, 0);
		dir = reach(-1) < reach(1) ? -1 : 1;
	}
	// Where the arrow goes in the file: right after its sibling's, or after the last on its side.
	const last = prev?.arrow ?? [...own].reverse().find((k) => !isRoot || k.side === dir)?.arrow;
	const edge: CanvasEdge = { id: newId(), fromNode: target.id, toNode: childId, ...sides(dir) };
	data.edges.splice(last ? data.edges.indexOf(last.edge) + 1 : data.edges.length, 0, edge);
	if (isRoot) {
		const { kids: now, byId: ids } = mapTree(data, layout);
		const list = now.get(ids.get(target.id) as CanvasNode) ?? [];
		const balanced = (options.balanceFrom ?? DEFAULT_BALANCE_FROM) > 0 && list.length >= (options.balanceFrom ?? DEFAULT_BALANCE_FROM);
		if (balanced) {
			// A new child goes last clockwise (top left), a sibling right after its sibling; then even the sides out.
			const ring = ringOf(list.map((k) => ({ side: k.side, arrow: k.arrow })));
			if (!prev) {
				const mine = ring.find((a) => a.edge === edge) as MapArrow;
				ring.splice(ring.indexOf(mine), 1);
				ring.push(mine);
			}
			balanceRoot(data, target.id, layout, options, ring);
		}
	}
}

/**
 * Adds an empty zone to a zone map, joined by an arrow, as Canvas Arbor adds a node: a child of
 * `fromId` (beside it), or its sibling (next to it: clockwise round a root, so above it on the
 * left; below it deeper down; a sibling of a root is a child of it). The map is laid out again.
 * Null if `fromId` is not a zone.
 */
export function addMapZone(
	input: CanvasData,
	fromId: string,
	kind: "child" | "sibling",
	layout: Layout,
	options: MapOptions & { label?: string; color?: string; newId?: () => string } = {},
): { data: CanvasData; zone: CanvasNode } | null {
	const data = clone(input);
	const newId = options.newId ?? randomId;
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const from = byId.get(fromId);
	if (from?.type !== "group") return null;
	const into = mapArrows(data).find((a) => a.to === from.id);
	const target = kind === "sibling" && into ? (byId.get(into.from) as CanvasNode) : from;
	const size = emptyZoneSize(layout);
	const zone: CanvasNode = { id: newId(), type: "group", label: options.label ?? "", x: target.x + target.width, y: centreY(target) - size.height / 2, ...size };
	if (options.color) zone.color = options.color;
	data.nodes.unshift(zone); // groups first, so they render behind the cards
	join(data, target.id, zone.id, target !== from ? from.id : null, layout, { ...options, newId });
	arrangeZoneMaps(data, layout);
	return { data, zone };
}

/** Joins an existing zone to a map as a new child of `parentId`, by the same rules. In place; lays the map out. */
export function joinZoneMap(data: CanvasData, parentId: string, childId: string, layout: Layout, options: MapOptions & { newId?: () => string } = {}): void {
	join(data, parentId, childId, null, layout, options);
	arrangeZoneMaps(data, layout);
}

/**
 * Moves a zone one step up or down beside its siblings. A child of the root goes round it
 * clockwise: past the top or the bottom of its column it moves to the same end of the other side;
 * when the root has enough children to be balanced, it trades places with the next one round
 * and the sides are evened out again (as Canvas Arbor does with nodes). Changes the order and
 * sides of the arrows, then lays the map out again. Null if nothing moves.
 */
export function moveMapZone(input: CanvasData, zoneId: string, where: "up" | "down", layout: Layout, options: MapOptions = {}): CanvasData | null {
	const data = clone(input);
	const { arrows, byId, kids, hasParent } = mapTree(data, layout);
	const mine = arrows.find((a) => a.to === zoneId);
	if (!mine) return null;
	const parentNode = byId.get(mine.from) as CanvasNode;
	const isRootChild = !hasParent.has(mine.from);
	const list = kids.get(parentNode) ?? [];
	const siblings = list.map((k) => k.arrow);
	const delta = where === "up" ? -1 : 1;
	if (isRootChild && list.length > 1) {
		const from = options.balanceFrom ?? DEFAULT_BALANCE_FROM;
		if (from > 0 && list.length >= from) {
			const ring = ringOf(list);
			const i = ring.indexOf(mine);
			// Down the right side and up the left one is clockwise.
			const step = sideOf(mine, byId) < 0 ? -delta : delta;
			const j = (i + step + ring.length) % ring.length;
			[ring[i], ring[j]] = [ring[j], ring[i]];
			balanceRoot(data, mine.from, layout, options, ring);
			arrangeZoneMaps(data, layout);
			return data;
		}
	}
	const sideOfKid = (a: MapArrow): 1 | -1 => list.find((k) => k.arrow === a)?.side ?? 1;
	// Each side top to bottom, as on screen.
	const right = siblings.filter((a) => sideOfKid(a) > 0);
	const leftInFile = siblings.filter((a) => sideOfKid(a) < 0);
	const left = isRootChild ? [...leftInFile].reverse() : leftInFile;
	const side = sideOfKid(mine);
	const column = side > 0 ? right : left;
	const i = column.indexOf(mine);
	const j = i + delta;
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
