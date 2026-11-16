// Pure: which group ("zone") each card sits in.

import type { CanvasData, CanvasNode } from "./canvas.ts";

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

/** Maps note path -> label of the smallest labelled group containing the card's centre (null = no zone). */
export function computeZones(data: CanvasData): Map<string, string | null> {
	const labelled = groupsBySize(data).filter((g) => typeof g.label === "string" && g.label.trim());
	const zones = new Map<string, string | null>();
	for (const node of data.nodes) {
		if (node.type !== "file" || !node.file || zones.has(node.file)) continue;
		const group = zoneOf(node, labelled);
		zones.set(node.file, group ? (group.label as string).trim() : null);
	}
	return zones;
}
