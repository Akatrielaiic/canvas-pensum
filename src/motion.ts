// Gliding moves, shared verbatim by Canvas Arbor and Canvas Pensum (scripts/check-shared.mjs).
//
// Layouts are still computed instantly; afterwards the nodes that moved are put back where they were
// and walked to their new place a little each frame through moveAndResize, so Canvas redraws nodes
// and arrows together (a CSS transition would leave the arrows behind: Canvas draws them at the final
// place at once).
//
// While a glide runs the nodes sit between two places, so anything that reads positions must call
// settle() first: batch() does it, and each plugin's pointer and key handlers do too. Each plugin has
// its own copy of this module, with its own glides.

/** The parts of a live canvas node used here. */
export interface GlideNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	canvas: GlideCanvas;
	nodeEl?: HTMLElement;
	moveAndResize(rect: Rect): void;
}

/** The parts of a live canvas used here. */
export interface GlideCanvas {
	nodes: Map<string, GlideNode>;
	canvasEl?: HTMLElement;
	requestSave(): void;
}

export interface Rect { x: number; y: number; width: number; height: number }

interface Run { node: GlideNode; from: Rect; to: Rect }

/** How long a glide lasts, in ms. */
export const GLIDE_MS = 180;

/** Whether this canvas may glide right now (setting, reduced motion, canvas shown…). Set by each plugin. */
export const motionHooks = { enabled: (_canvas: GlideCanvas): boolean => false };

const runs = new Map<GlideNode, Run>();
let started = 0;
let frame = 0;
let frameWin: Window | null = null;
const touched = new Set<GlideCanvas>();

let depth = 0;
let before: Map<GlideNode, Rect> | null = null;
let batchCanvas: GlideCanvas | null = null;

const rectOf = (n: GlideNode): Rect => ({ x: n.x, y: n.y, width: n.width, height: n.height });
const same = (a: Rect, b: Rect) =>
	Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
const ease = (t: number) => 1 - Math.pow(1 - t, 3); // ease-out cubic

/** Where a gliding node is going, if it is gliding. */
export function target(node: GlideNode): Rect | undefined {
	return runs.get(node)?.to;
}

/** Whether anything is gliding. */
export function gliding(): boolean {
	return runs.size > 0;
}

/** End every glide now: each node jumps to where it is going. */
export function settle(): void {
	if (frame && frameWin) frameWin.cancelAnimationFrame(frame);
	frame = 0;
	frameWin = null;
	if (!runs.size) return;
	for (const { node, to } of runs.values()) if (node.canvas.nodes.has(node.id)) node.moveAndResize(to);
	runs.clear();
	for (const canvas of touched) canvas.requestSave();
	touched.clear();
}

/**
 * Run `fn`, which moves nodes of `canvas` instantly, then let the nodes it moved glide there from
 * where they were. Nested batches join the outermost one.
 */
export function batch<T>(canvas: GlideCanvas | null | undefined, fn: () => T): T {
	if (depth === 0) {
		settle();
		if (canvas && motionHooks.enabled(canvas)) {
			before = new Map();
			for (const n of canvas.nodes.values()) before.set(n, rectOf(n));
			batchCanvas = canvas;
		}
	}
	depth++;
	try {
		return fn();
	} finally {
		depth--;
		if (depth === 0 && before && batchCanvas) {
			const from = before;
			const canvas = batchCanvas;
			before = null;
			batchCanvas = null;
			for (const [node, rect] of from) {
				if (!canvas.nodes.has(node.id) || node.nodeEl?.hasClass("is-dragging")) continue;
				glide(node, rect, rectOf(node));
			}
		}
	}
}

/**
 * Let one node glide from `from` to `to`. With `heightNow`, its height (and so its vertical centre)
 * changes at once and only the rest glides: used for the node being typed in.
 */
export function glide(node: GlideNode, from: Rect, to: Rect, heightNow = false): void {
	if (heightNow) from = { ...from, y: to.y, height: to.height };
	if (same(from, to) || !motionHooks.enabled(node.canvas)) {
		if (!same(rectOf(node), to)) node.moveAndResize(to);
		return;
	}
	// Glides already running go on from where they are now, on a fresh clock with this one.
	for (const run of runs.values()) run.from = rectOf(run.node);
	started = performance.now();
	runs.set(node, { node, from, to });
	touched.add(node.canvas);
	node.moveAndResize(from);
	if (!frame) {
		frameWin = node.canvas.canvasEl?.win ?? window;
		frame = frameWin.requestAnimationFrame(step);
	}
}

function step() {
	frame = 0;
	const t = Math.min(1, Math.max(0, (performance.now() - started) / GLIDE_MS));
	if (t >= 1) {
		frameWin = null;
		settle();
		return;
	}
	const k = ease(t);
	const lerp = (a: number, b: number) => a + (b - a) * k;
	for (const [node, { from, to }] of runs) {
		if (!node.canvas.nodes.has(node.id)) {
			runs.delete(node);
			continue;
		}
		node.moveAndResize({ x: lerp(from.x, to.x), y: lerp(from.y, to.y), width: lerp(from.width, to.width), height: lerp(from.height, to.height) });
	}
	if (!runs.size) return void (frameWin = null);
	frame = (frameWin ?? window).requestAnimationFrame(step);
}
