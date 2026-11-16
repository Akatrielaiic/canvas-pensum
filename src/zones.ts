// Pure: which labelled group ("zone") each note card sits in.

import type { CanvasData } from "./canvas.ts";

/** Maps note path -> label of the smallest labelled group containing the card's centre (null = no zone). */
export function computeZones(data: CanvasData): Map<string, string | null> {
	const groups = data.nodes
		.filter((n) => n.type === "group" && typeof n.label === "string" && n.label.trim())
		.sort((a, b) => a.width * a.height - b.width * b.height);
	const zones = new Map<string, string | null>();
	for (const node of data.nodes) {
		if (node.type !== "file" || !node.file || zones.has(node.file)) continue;
		const cx = node.x + node.width / 2;
		const cy = node.y + node.height / 2;
		const group = groups.find((g) => cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height);
		zones.set(node.file, group ? (group.label as string).trim() : null);
	}
	return zones;
}
