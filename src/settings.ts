import { type App, PluginSettingTab, Setting } from "obsidian";
import type SpatialTasksPlugin from "./main.ts";
import { getTasksPlugin } from "./tasks-plugin.ts";

export interface SpatialTasksSettings {
	deskPath: string;
	excludeFolders: string;
	requiredTag: string;
	autoSync: boolean;
	onComplete: "mark" | "remove";
	colorByDue: boolean;
	captureNote: string;
	writeZones: boolean;
	zoneProperty: string;
	cardWidth: number;
	cardHeight: number;
	columns: number;
}

export const DEFAULT_SETTINGS: SpatialTasksSettings = {
	deskPath: "Task Desk.canvas",
	excludeFolders: "",
	requiredTag: "",
	autoSync: true,
	onComplete: "mark",
	colorByDue: true,
	captureNote: "Inbox.md",
	writeZones: false,
	zoneProperty: "desk-zone",
	cardWidth: 400,
	cardHeight: 400,
	columns: 4,
};

export class SpatialTasksSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: SpatialTasksPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		containerEl.empty();

		new Setting(containerEl)
			.setName("Desk canvas")
			.setDesc("Path of the canvas used as your desk. Created on first use.")
			.addText((t) =>
				t.setValue(s.deskPath).onChange(async (v) => {
					s.deskPath = v.trim() || DEFAULT_SETTINGS.deskPath;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Sync automatically")
			.setDesc("Keep the desk up to date as tasks are added and completed.")
			.addToggle((t) =>
				t.setValue(s.autoSync).onChange(async (v) => {
					s.autoSync = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("One folder per line, e.g. Templates. A note can also opt out with `desk: false` in its properties.")
			.addTextArea((t) =>
				t.setValue(s.excludeFolders).onChange(async (v) => {
					s.excludeFolders = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Only notes tagged")
			.setDesc("Optional. If set, only notes with this tag are pulled onto the desk.")
			.addText((t) =>
				t
					.setPlaceholder("#todo")
					.setValue(s.requiredTag)
					.onChange(async (v) => {
						s.requiredTag = v;
						await save();
					}),
			);

		new Setting(containerEl)
			.setName("When a note has no open tasks left")
			.addDropdown((d) =>
				d
					.addOption("mark", "Turn its card green")
					.addOption("remove", "Remove its card")
					.setValue(s.onComplete)
					.onChange(async (v) => {
						s.onComplete = v as SpatialTasksSettings["onComplete"];
						await save();
					}),
			);

		new Setting(containerEl)
			.setName("Capture note")
			.setDesc("Where the “Add task” command writes new tasks. Created on first use.")
			.addText((t) =>
				t.setValue(s.captureNote).onChange(async (v) => {
					s.captureNote = v.trim() || DEFAULT_SETTINGS.captureNote;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Tasks plugin")
			.setHeading()
			.setDesc(
				getTasksPlugin(this.app)
					? "Detected. The desk follows its global filter, custom statuses and dates, and “Add task” opens its task editor."
					: "Not installed. The desk works with plain checkboxes; install Tasks for due dates, custom statuses and its task editor.",
			);

		new Setting(containerEl)
			.setName("Colour cards by due date")
			.setDesc("Red when a task in the note is overdue, orange when due or scheduled today. Needs the Tasks plugin.")
			.addToggle((t) =>
				t.setValue(s.colorByDue).onChange(async (v) => {
					s.colorByDue = v;
					await save();
				}),
			);

		new Setting(containerEl).setName("Zones").setHeading();

		new Setting(containerEl)
			.setName("Write zone to note property")
			.setDesc(
				"When a card sits inside a labelled group, store the group's label in the note's properties, so the layout can be queried from Bases, Dataview or search.",
			)
			.addToggle((t) =>
				t.setValue(s.writeZones).onChange(async (v) => {
					s.writeZones = v;
					await save();
				}),
			);

		new Setting(containerEl).setName("Zone property name").addText((t) =>
			t.setValue(s.zoneProperty).onChange(async (v) => {
				s.zoneProperty = v.trim() || DEFAULT_SETTINGS.zoneProperty;
				await save();
			}),
		);

		new Setting(containerEl).setName("New cards").setHeading();

		const numeric = (name: string, key: "cardWidth" | "cardHeight" | "columns", min: number) =>
			new Setting(containerEl).setName(name).addText((t) =>
				t.setValue(String(s[key])).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					s[key] = Number.isFinite(n) && n >= min ? n : DEFAULT_SETTINGS[key];
					await save();
				}),
			);
		numeric("Card width", "cardWidth", 100);
		numeric("Card height", "cardHeight", 60);
		numeric("Inbox columns", "columns", 1);
	}
}
