// Bridge to the community "Tasks" plugin (obsidian-tasks-group/obsidian-tasks).
// Everything here is optional: without Tasks the desk falls back to plain checkboxes.

import type { App } from "obsidian";

const TASKS_ID = "obsidian-tasks-plugin";
/** Fired on app.workspace whenever Tasks has re-indexed. */
export const TASKS_CACHE_EVENT = "obsidian-tasks-plugin:cache-update";

interface DateLike {
	format(pattern: string): string;
}

export interface TasksTask {
	path?: string;
	taskLocation?: { path: string };
	/** True for DONE, CANCELLED and NON_TASK statuses, including custom ones. */
	isDone: boolean;
	dueDate?: DateLike | null;
	scheduledDate?: DateLike | null;
}

export interface TasksPlugin {
	getTasks(): TasksTask[];
	getState?(): string; // "Cold" | "Initializing" | "Warm"
	apiV1?: { createTaskLineModal(): Promise<string> };
}

export function getTasksPlugin(app: App): TasksPlugin | null {
	const plugin = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins?.[TASKS_ID] as
		| Partial<TasksPlugin>
		| undefined;
	return typeof plugin?.getTasks === "function" ? (plugin as TasksPlugin) : null;
}

/** Tasks returns an empty list until its index is ready; syncing then would mark every card as done. */
export function tasksReady(plugin: TasksPlugin): boolean {
	return plugin.getState ? plugin.getState() === "Warm" : true;
}
