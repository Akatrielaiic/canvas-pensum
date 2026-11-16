import { type App, PluginSettingTab, Setting } from "obsidian";
import type CanvasPensumPlugin from "./main.ts";
import { getTasksPlugin } from "./tasks-plugin.ts";

export interface CanvasPensumSettings {
	deskPath: string;
	excludeFolders: string;
	requiredTag: string;
	autoSync: boolean;
	onComplete: "mark" | "move" | "remove";
	growZones: boolean;
	inheritZoneColor: boolean;
	colorByDue: boolean;
	captureNote: string;
	writeZones: boolean;
	zoneProperty: string;
	cardWidth: number;
	cardHeight: number;
	columns: number;
}

export const DEFAULT_SETTINGS: CanvasPensumSettings = {
	deskPath: "Pensatorium.canvas",
	excludeFolders: "",
	requiredTag: "",
	autoSync: true,
	onComplete: "move",
	growZones: true,
	inheritZoneColor: true,
	colorByDue: true,
	captureNote: "Inbox.md",
	writeZones: false,
	zoneProperty: "pensum-zone",
	cardWidth: 400,
	cardHeight: 400,
	columns: 4,
};

export class CanvasPensumSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CanvasPensumPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		containerEl.empty();

		new Setting(containerEl)
			.setName("Pensatorium canvas")
			.setDesc("Path of the canvas used as your Pensatorium. Created on first use.")
			.addText((t) =>
				t.setValue(s.deskPath).onChange(async (v) => {
					s.deskPath = v.trim() || DEFAULT_SETTINGS.deskPath;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Sync automatically")
			.setDesc("Keep the Pensatorium up to date as tasks are added and completed.")
			.addToggle((t) =>
				t.setValue(s.autoSync).onChange(async (v) => {
					s.autoSync = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("One folder per line, e.g. Templates. A note can also opt out with `pensum: false` in its properties.")
			.addTextArea((t) =>
				t.setValue(s.excludeFolders).onChange(async (v) => {
					s.excludeFolders = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Only notes tagged")
			.setDesc("Optional. If set, only notes with this tag are pulled onto the Pensatorium.")
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
					.addOption("move", "Turn its card green and move it to the Done zone")
					.addOption("mark", "Turn its card green, leave it where it is")
					.addOption("remove", "Remove its card")
					.setValue(s.onComplete)
					.onChange(async (v) => {
						s.onComplete = v as CanvasPensumSettings["onComplete"];
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
					? "Detected. the Pensatorium follows its global filter, custom statuses and dates, and “Add task” opens its task editor."
					: "Not installed. the Pensatorium works with plain checkboxes; install Tasks for due dates, custom statuses and its task editor.",
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

		new Setting(containerEl)
			.setName("Zones")
			.setHeading()
			.setDesc("A zone is any group you draw on the Pensatorium.");

		new Setting(containerEl)
			.setName("Grow zones to fit")
			.setDesc("When you drop a card in a zone, the zone grows to contain it. Zones never shrink or move.")
			.addToggle((t) =>
				t.setValue(s.growZones).onChange(async (v) => {
					s.growZones = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Cards take the zone's colour")
			.setDesc("Give a zone a colour and the cards inside follow it. Done and due-date colours win; a colour you set on a card by hand is kept.")
			.addToggle((t) =>
				t.setValue(s.inheritZoneColor).onChange(async (v) => {
					s.inheritZoneColor = v;
					await save();
				}),
			);

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
