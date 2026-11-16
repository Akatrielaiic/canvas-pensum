import { type App, getAllTags } from "obsidian";
import type { SpatialTasksSettings } from "./settings.ts";
import type { TaskNote } from "./sync.ts";

const DONE_MARKS = new Set(["x", "X", "-"]);

/** Reads only the metadata cache: no file I/O, so it stays fast on mobile and large vaults. */
export function scanVault(app: App, settings: SpatialTasksSettings): TaskNote[] {
	const excluded = settings.excludeFolders
		.split("\n")
		.map((f) => f.trim().replace(/^\/+|\/+$/g, ""))
		.filter(Boolean);
	const tag = settings.requiredTag.trim().replace(/^#?/, "#").toLowerCase();
	const notes: TaskNote[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (excluded.some((f) => file.path === f || file.path.startsWith(f + "/"))) continue;
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.listItems) continue;
		if (cache.frontmatter?.desk === false) continue; // per-note opt-out
		if (tag !== "#" && !(getAllTags(cache) ?? []).some((t) => t.toLowerCase() === tag)) continue;

		let open = 0;
		let done = 0;
		for (const item of cache.listItems) {
			if (item.task === undefined) continue;
			if (DONE_MARKS.has(item.task)) done++;
			else open++;
		}
		if (open + done > 0) notes.push({ path: file.path, open, done });
	}
	return notes;
}
