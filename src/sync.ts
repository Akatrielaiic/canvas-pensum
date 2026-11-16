// Pure desk sync: no Obsidian imports, so it runs under `node --test`.
//
// The contract with the user:
//   - where a card sits is the user's choice. The plugin only places new cards (Inbox), and,
//     if asked to, files completed ones in the Done zone;
//   - only cards the plugin created (id prefix "st-") are ever moved, coloured or removed;
//   - zones (groups) may grow to fit the cards dropped in them, but never shrink or move;
//   - running the sync twice in a row changes nothing the second time.

import type { CanvasData, CanvasNode } from "./canvas.ts";
import { area, centreInside, groupsBySize, zoneOf } from "./zones.ts";

// "st-" dates from the plugin's first name (Spatial Tasks). Kept so existing desks keep working.
export const MANAGED_PREFIX = "st-";
export const INBOX_ID = "st-inbox";
export const DONE_ID = "st-done";

export interface TaskNote {
	path: string;
	open: number;
	done: number;
	/** Earliest due/scheduled day among the open tasks, as YYYY-MM-DD. */
	due?: string | null;
}

/** Grid used when the plugin places a card. */
export interface Layout {
	cardWidth: number;
	cardHeight: number;
	gap: number;
	columns: number;
}

export interface SyncOptions extends Layout {
	inboxLabel: string;
	doneLabel?: string;
	/** What happens to a card when its note has no open tasks left. */
	onComplete: "mark" | "move" | "remove";
	doneColor: string; // canvas preset "1".."6" or a hex color
	/** Today as YYYY-MM-DD. When set, open cards are coloured by their due date. */
	today?: string;
	overdueColor?: string;
	todayColor?: string;
	/** Cards take the colour of the zone they sit in. */
	inheritZoneColor?: boolean;
	/** Zones grow to contain the cards dropped in them. */
	growZones?: boolean;
	/** Whether a path still exists in the vault. Cards of deleted notes are removed. */
	exists?: (path: string) => boolean;
	newId?: () => string;
}

export interface SyncResult {
	data: CanvasData;
	changed: boolean;
	added: string[];
	completed: string[];
	reopened: string[];
	removed: string[];
}

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const intersects = (a: Rect, b: Rect) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const randomId = () =>
	MANAGED_PREFIX + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

const clone = (data: CanvasData): CanvasData => {
	const copy: CanvasData = JSON.parse(JSON.stringify(data));
	copy.nodes ??= [];
	copy.edges ??= [];
	return copy;
};

/** Puts `node` in the first free grid slot of `group`, growing the group if needed. */
export function placeIn(data: CanvasData, node: CanvasNode, group: CanvasNode, layout: Layout): void {
	placeBlock(data, [node], group, layout);
}

/** Like placeIn, for several cards moved as one rigid block, so their arrangement is kept. */
function placeBlock(data: CanvasData, block: CanvasNode[], group: CanvasNode, layout: Layout): void {
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
 * Adds an empty zone in line with the Inbox, in the first free spot to its right.
 * The zone is the user's from then on: its id carries no plugin prefix.
 */
export function addZone(
	input: CanvasData,
	zone: { label: string; color?: string },
	layout: Layout,
	newId: () => string = () => randomId().slice(MANAGED_PREFIX.length),
): { data: CanvasData; zone: CanvasNode } {
	const data = clone(input);
	const anchor = data.nodes.find((n) => n.id === INBOX_ID && n.type === "group");
	const all = data.nodes;
	const spacing = layout.gap * 2;
	const group: CanvasNode = {
		id: newId(),
		type: "group",
		label: zone.label,
		x: anchor ? anchor.x + anchor.width + spacing : all.length ? Math.min(...all.map((n) => n.x)) : 0,
		y: anchor ? anchor.y : all.length ? Math.max(...all.map((n) => n.y + n.height)) + spacing : 0,
		width: 2 * (layout.cardWidth + layout.gap) + layout.gap,
		height: layout.cardHeight + layout.gap * 2,
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
 * Moves the given cards into a zone. Each card takes along the cards its arrows lead to
 * (children, grandchildren…), as one block that keeps its shape. Null if there is nothing to do.
 */
export function moveToZone(input: CanvasData, nodeIds: string[], zoneId: string, layout: Layout): CanvasData | null {
	const data = clone(input);
	const zone = data.nodes.find((n) => n.id === zoneId && n.type === "group");
	if (!zone) return null;
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const children = new Map<string, string[]>();
	for (const e of data.edges) children.set(e.fromNode, [...(children.get(e.fromNode) ?? []), e.toNode]);

	/** A card plus everything its arrows lead to, skipping groups and cards in `skip`. */
	const subtree = (root: CanvasNode, skip: Set<string>): CanvasNode[] => {
		const seen = new Set([root.id]);
		const block = [root];
		for (const node of block) {
			for (const id of children.get(node.id) ?? []) {
				const child = byId.get(id);
				if (!child || child.type === "group" || seen.has(id) || skip.has(id)) continue;
				seen.add(id);
				block.push(child);
			}
		}
		return block;
	};

	const selected = [...new Set(nodeIds)]
		.map((id) => byId.get(id))
		.filter((n): n is CanvasNode => !!n && n.type !== "group")
		.sort((a, b) => a.y - b.y || a.x - b.x);
	// A selected card that hangs off another selected card travels with it, so start from the top ones.
	const below = new Set(selected.flatMap((n) => subtree(n, new Set()).slice(1).map((d) => d.id)));
	const roots = [...selected.filter((n) => !below.has(n.id)), ...selected.filter((n) => below.has(n.id))];

	const taken = new Set<string>();
	let moved = false;
	for (const root of roots) {
		if (taken.has(root.id)) continue;
		const block = subtree(root, taken);
		for (const n of block) taken.add(n.id);
		if (block.every((n) => centreInside(n, zone))) continue;
		placeBlock(data, block, zone, layout);
		moved = true;
	}
	return moved ? data : null;
}

export function syncDesk(input: CanvasData, notes: TaskNote[], opts: SyncOptions): SyncResult {
	const data = clone(input);
	const before = JSON.stringify(data);
	const result: SyncResult = { data, changed: false, added: [], completed: [], reopened: [], removed: [] };
	const exists = opts.exists ?? (() => true);
	const newId = opts.newId ?? randomId;
	const open = new Map(notes.filter((n) => n.open > 0).map((n) => [n.path, n]));
	const ourCards = () =>
		data.nodes.filter((n) => n.type === "file" && n.file && n.id.startsWith(MANAGED_PREFIX)) as (CanvasNode & {
			file: string;
		})[];

	const place = (node: CanvasNode, group: CanvasNode) => placeIn(data, node, group, opts);

	const ensureGroup = (id: string, label: string, side: "below" | "right", color?: string): CanvasNode => {
		const existing = data.nodes.find((n) => n.id === id && n.type === "group");
		if (existing) return existing;
		// First use, or the user deleted it: put a fresh one clear of everything else.
		const all = data.nodes;
		const minX = all.length ? Math.min(...all.map((n) => n.x)) : 0;
		const minY = all.length ? Math.min(...all.map((n) => n.y)) : 0;
		const group: CanvasNode = {
			id,
			type: "group",
			label,
			x: side === "right" && all.length ? Math.max(...all.map((n) => n.x + n.width)) + opts.gap * 4 : minX,
			y: side === "below" && all.length ? Math.max(...all.map((n) => n.y + n.height)) + opts.gap * 4 : minY,
			width: opts.columns * (opts.cardWidth + opts.gap) + opts.gap,
			height: opts.cardHeight + opts.gap * 2,
		};
		if (color) group.color = color;
		data.nodes.unshift(group); // groups first, so they render behind the cards
		return group;
	};
	const inbox = () => ensureGroup(INBOX_ID, opts.inboxLabel, "below");

	// 1. Drop cards whose note is gone, or finished when the user prefers them removed.
	const dropped = new Set<string>();
	for (const node of ourCards()) {
		if (open.has(node.file)) continue;
		if (!exists(node.file) || opts.onComplete === "remove") {
			dropped.add(node.id);
			result.removed.push(node.file);
		}
	}
	if (dropped.size) {
		data.nodes = data.nodes.filter((n) => !dropped.has(n.id));
		data.edges = data.edges.filter((e) => !dropped.has(e.fromNode) && !dropped.has(e.toNode));
	}

	// 2. Add notes that are not on the desk yet (whoever put them there).
	const present = new Set(data.nodes.filter((n) => n.type === "file").map((n) => n.file));
	for (const path of [...open.keys()].filter((p) => !present.has(p)).sort()) {
		const node: CanvasNode = {
			id: newId(),
			type: "file",
			file: path,
			x: 0,
			y: 0,
			width: opts.cardWidth,
			height: opts.cardHeight,
		};
		place(node, inbox());
		data.nodes.push(node);
		result.added.push(path);
	}

	// 3. File finished cards in the Done zone; a card reopened while in there goes back to the Inbox.
	if (opts.onComplete === "move") {
		let doneZone = data.nodes.find((n) => n.id === DONE_ID && n.type === "group");
		for (const node of ourCards()) {
			if (open.has(node.file)) {
				if (doneZone && centreInside(node, doneZone)) place(node, inbox());
			} else {
				doneZone ??= ensureGroup(DONE_ID, opts.doneLabel ?? "Done", "right", opts.doneColor);
				if (!centreInside(node, doneZone)) place(node, doneZone);
			}
		}
	}

	// 4. Grow zones around what was dropped in them (smallest first, so outer zones wrap inner ones).
	if (opts.growZones) {
		const pad = opts.gap / 2;
		for (const group of groupsBySize(data)) {
			for (const m of data.nodes) {
				if (m === group || !centreInside(m, group) || (m.type === "group" && area(m) >= area(group))) continue;
				const right = Math.max(group.x + group.width, m.x + m.width + pad);
				const bottom = Math.max(group.y + group.height, m.y + m.height + pad);
				group.x = Math.min(group.x, m.x - pad);
				group.y = Math.min(group.y, m.y - pad);
				group.width = right - group.x;
				group.height = bottom - group.y;
			}
		}
	}

	// 5. Colours: done > overdue/today > zone colour. A colour the user picked is left alone.
	const overdueColor = opts.overdueColor ?? "1";
	const todayColor = opts.todayColor ?? "2";
	const groups = groupsBySize(data);
	const ours = new Set<unknown>([undefined, opts.doneColor]);
	if (opts.today) ours.add(overdueColor).add(todayColor);
	if (opts.inheritZoneColor) for (const g of groups) ours.add(g.color);
	for (const node of ourCards()) {
		const note = open.get(node.file);
		let want: string | undefined;
		if (!note) want = opts.doneColor;
		else if (opts.today && note.due && note.due <= opts.today) want = note.due < opts.today ? overdueColor : todayColor;
		else if (opts.inheritZoneColor) want = zoneOf(node, groups)?.color;
		if (node.color === want || !ours.has(node.color)) continue;
		if (!note) result.completed.push(node.file);
		else if (node.color === opts.doneColor) result.reopened.push(node.file);
		if (want) node.color = want;
		else delete node.color;
	}

	result.changed = JSON.stringify(data) !== before;
	return result;
}
