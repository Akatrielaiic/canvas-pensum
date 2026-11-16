// Minimal JSON Canvas types (https://jsoncanvas.org). Unknown fields are kept as-is.

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

export function parseCanvas(raw: string): CanvasData {
	const data = raw.trim() ? JSON.parse(raw) : {};
	return { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] };
}

export function serializeCanvas(data: CanvasData): string {
	return JSON.stringify(data, null, "\t");
}
