// Pure desk sync: no Obsidian imports, so it runs under `node --test`.
//
// The contract with the user:
//   - positions, sizes and anything the user put on the canvas are never touched;
//   - notes with open tasks that are not on the desk yet are dropped in the Inbox group;
//   - cards the plugin added are marked (or removed) once their note has no open tasks,
//     and optionally coloured when their tasks are due or overdue.

import type { CanvasData, CanvasNode } from "./canvas.ts";

export const MANAGED_PREFIX = "st-";
export const INBOX_ID = "st-inbox";

export interface TaskNote {
	path: string;
	open: number;
	done: number;
	/** Earliest due/scheduled day among the open tasks, as YYYY-MM-DD. */
	due?: string | null;
}

export interface SyncOptions {
	cardWidth: number;
	cardHeight: number;
	gap: number;
	columns: number;
	inboxLabel: string;
	onComplete: "mark" | "remove";
	doneColor: string; // canvas preset "1".."6" or a hex color
	/** Today as YYYY-MM-DD. When set, open cards are coloured by their due date. */
	today?: string;
	overdueColor?: string;
	todayColor?: string;
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
	recolored: string[];
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

export function syncDesk(input: CanvasData, notes: TaskNote[], opts: SyncOptions): SyncResult {
	const data: CanvasData = JSON.parse(JSON.stringify(input));
	data.nodes ??= [];
	data.edges ??= [];
	const result: SyncResult = { data, changed: false, added: [], completed: [], reopened: [], recolored: [], removed: [] };
	const exists = opts.exists ?? (() => true);
	const newId = opts.newId ?? randomId;
	const open = new Map(notes.filter((n) => n.open > 0).map((n) => [n.path, n]));
	const overdueColor = opts.overdueColor ?? "1";
	const todayColor = opts.todayColor ?? "2";
	const urgency = (path: string): string | undefined => {
		const due = open.get(path)?.due;
		if (!opts.today || !due || due > opts.today) return undefined;
		return due < opts.today ? overdueColor : todayColor;
	};
	// Colours we are allowed to overwrite; anything else was chosen by the user.
	const ours = new Set<unknown>([undefined, opts.doneColor, ...(opts.today ? [overdueColor, todayColor] : [])]);

	// 1. Update the cards we own.
	const dropped = new Set<string>();
	for (const node of data.nodes) {
		if (node.type !== "file" || !node.file || !node.id.startsWith(MANAGED_PREFIX)) continue;
		if (open.has(node.file)) {
			const want = urgency(node.file);
			if (node.color !== want && ours.has(node.color)) {
				(node.color === opts.doneColor ? result.reopened : result.recolored).push(node.file);
				if (want) node.color = want;
				else delete node.color;
			}
		} else if (!exists(node.file) || opts.onComplete === "remove") {
			dropped.add(node.id);
			result.removed.push(node.file);
		} else if (node.color !== opts.doneColor) {
			node.color = opts.doneColor;
			result.completed.push(node.file);
		}
	}
	if (dropped.size) {
		data.nodes = data.nodes.filter((n) => !dropped.has(n.id));
		data.edges = data.edges.filter((e) => !dropped.has(e.fromNode) && !dropped.has(e.toNode));
	}

	// 2. Add notes that are not on the desk yet (whoever put them there).
	const present = new Set(data.nodes.filter((n) => n.type === "file").map((n) => n.file));
	const toAdd = [...open.keys()].filter((p) => !present.has(p)).sort();
	if (toAdd.length) {
		const inbox = ensureInbox(data, opts);
		const obstacles: Rect[] = data.nodes.filter((n) => n.type !== "group");
		const top = inbox.y + opts.gap;
		let slot = 0;
		for (const path of toAdd) {
			let rect: Rect;
			do {
				rect = {
					x: inbox.x + opts.gap + (slot % opts.columns) * (opts.cardWidth + opts.gap),
					y: top + Math.floor(slot / opts.columns) * (opts.cardHeight + opts.gap),
					width: opts.cardWidth,
					height: opts.cardHeight,
				};
				slot++;
			} while (obstacles.some((o) => intersects(o, rect)));
			const node: CanvasNode = { id: newId(), type: "file", file: path, ...rect };
			const color = urgency(path);
			if (color) node.color = color;
			data.nodes.push(node);
			obstacles.push(node);
			inbox.width = Math.max(inbox.width, rect.x + rect.width + opts.gap - inbox.x);
			inbox.height = Math.max(inbox.height, rect.y + rect.height + opts.gap - inbox.y);
			result.added.push(path);
		}
	}

	result.changed = [result.added, result.completed, result.reopened, result.recolored, result.removed].some(
		(list) => list.length > 0,
	);
	return result;
}

function ensureInbox(data: CanvasData, opts: SyncOptions): CanvasNode {
	const existing = data.nodes.find((n) => n.id === INBOX_ID && n.type === "group");
	if (existing) return existing;
	// First run, or the user deleted it: put a fresh one below everything else.
	const x = data.nodes.length ? Math.min(...data.nodes.map((n) => n.x)) : 0;
	const y = data.nodes.length ? Math.max(...data.nodes.map((n) => n.y + n.height)) + opts.gap * 4 : 0;
	const inbox: CanvasNode = {
		id: INBOX_ID,
		type: "group",
		label: opts.inboxLabel,
		x,
		y,
		width: opts.columns * (opts.cardWidth + opts.gap) + opts.gap,
		height: opts.cardHeight + opts.gap * 2,
	};
	data.nodes.unshift(inbox); // groups first, so they render behind the cards
	return inbox;
}
