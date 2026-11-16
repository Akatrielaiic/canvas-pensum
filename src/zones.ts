// Pure: which labelled zone each note card sits in.

import { type CanvasData, groupsBySize, zoneOf } from "./zone-engine.ts";

export { area, centreInside, groupsBySize, zoneOf } from "./zone-engine.ts";

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
