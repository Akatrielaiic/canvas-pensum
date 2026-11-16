import { type App, TFile, getAllTags } from "obsidian";
import type { SpatialTasksSettings } from "./settings.ts";
import type { TaskNote } from "./sync.ts";
import { getTasksPlugin, tasksReady } from "./tasks-plugin.ts";

const DONE_MARKS = new Set(["x", "X", "-"]);

/**
 * Lists the notes that have tasks. Returns null when the Tasks plugin is installed but still indexing.
 *
 * With Tasks installed we use its index, so its global filter, custom statuses and dates apply.
 * Otherwise we read Obsidian's metadata cache. Either way there is no file I/O.
 */
export function scanVault(app: App, settings: SpatialTasksSettings): TaskNote[] | null {
	const excluded = settings.excludeFolders
		.split("\n")
		.map((f) => f.trim().replace(/^\/+|\/+$/g, ""))
		.filter(Boolean);
	const tag = settings.requiredTag.trim().replace(/^#?/, "#").toLowerCase();

	const allowed = (file: TFile) => {
		if (excluded.some((f) => file.path === f || file.path.startsWith(f + "/"))) return false;
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter?.desk === false) return false; // per-note opt-out
		if (tag !== "#" && !(cache && getAllTags(cache)?.some((t) => t.toLowerCase() === tag))) return false;
		return true;
	};

	const tasks = getTasksPlugin(app);
	if (tasks) {
		if (!tasksReady(tasks)) return null;
		const byPath = new Map<string, TaskNote>();
		for (const task of tasks.getTasks()) {
			const path = task.path ?? task.taskLocation?.path;
			if (!path) continue;
			let note = byPath.get(path);
			if (!note) byPath.set(path, (note = { path, open: 0, done: 0, due: null }));
			if (task.isDone) {
				note.done++;
				continue;
			}
			note.open++;
			for (const date of [task.dueDate, task.scheduledDate]) {
				const day = date?.format("YYYY-MM-DD");
				if (day && (!note.due || day < note.due)) note.due = day;
			}
		}
		return [...byPath.values()].filter((note) => {
			const file = app.vault.getAbstractFileByPath(note.path);
			return file instanceof TFile && allowed(file);
		});
	}

	const notes: TaskNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const items = app.metadataCache.getFileCache(file)?.listItems;
		if (!items || !allowed(file)) continue;
		let open = 0;
		let done = 0;
		for (const item of items) {
			if (item.task === undefined) continue;
			if (DONE_MARKS.has(item.task)) done++;
			else open++;
		}
		if (open + done > 0) notes.push({ path: file.path, open, done });
	}
	return notes;
}
