import type { CanvasData } from "./zone-engine.ts";

export type { CanvasData, CanvasEdge, CanvasNode } from "./zone-engine.ts";

export function parseCanvas(raw: string): CanvasData {
	const data = raw.trim() ? JSON.parse(raw) : {};
	return { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] };
}

export function serializeCanvas(data: CanvasData): string {
	return JSON.stringify(data, null, "\t");
}
