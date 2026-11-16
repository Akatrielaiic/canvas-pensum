import { type App, PluginSettingTab, Setting } from "obsidian";
import type CanvasPensumPlugin from "./main.ts";
import { commandKeys, keyText } from "./help.ts";
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
	canvasKeys: boolean;
	captureNote: string;
	captureDate: boolean;
	captureDateFormat: string;
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
	canvasKeys: true,
	captureNote: "Inbox.md",
	captureDate: true,
	captureDateFormat: "YYYY-MM-DD",
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
			.setName("How it works")
			.setDesc(
				"Every note with open tasks lands on the Pensatorium as a card, first in the Inbox. Drag cards into zones (named groups), or select them and use “Move to zone”. When a note has no open tasks left, its card turns green and moves to Done. “Add task to a note” adds a task from anywhere. The keys are listed in the canvas help (the ? among the canvas controls), and “Add the guide card” puts this explanation on the canvas.",
			);

		new Setting(containerEl).setName("Keys").setHeading();

		const add = keyText(["Mod", "Shift", "A"]);
		const move = keyText(["Mod", "Shift", "M"]);
		new Setting(containerEl)
			.setName("Keys on the canvas")
			.setDesc(`On any canvas, ${add} adds a task to a note; on the Pensatorium, ${move} moves the selected cards to a zone. These keys only exist while a canvas is in front, so they can't clash with keys you use elsewhere.`)
			.addToggle((t) =>
				t.setValue(s.canvasKeys).onChange(async (v) => {
					s.canvasKeys = v;
					await save();
				}),
			);

		const bound = commandKeys(this.app, `${this.plugin.manifest.id}:add-task-to-note`).map(keyText);
		new Setting(containerEl)
			.setName("Add tasks from anywhere")
			.setDesc(
				bound.length
					? `“Add task to a note” answers to ${bound.join(" / ")} everywhere in Obsidian. Change it in Settings → Hotkeys.`
					: `Recommended: let ${add} add a task from anywhere in Obsidian, not only from a canvas. You can change the key later in Settings → Hotkeys.`,
			)
			.addButton((b) =>
				b
					.setButtonText(`Use ${add} everywhere`)
					.setCta()
					.setDisabled(bound.length > 0)
					.onClick(async () => {
						await this.plugin.bindAddTaskEverywhere();
						this.display();
					}),
			);

		new Setting(containerEl).setName("The Pensatorium").setHeading();

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
			.setDesc("Where the plain “Add task” command writes new tasks. Created on first use. “Add task to a note” asks for the note each time.")
			.addText((t) =>
				t.setValue(s.captureNote).onChange(async (v) => {
					s.captureNote = v.trim() || DEFAULT_SETTINGS.captureNote;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Put new tasks under the day")
			.setDesc("“Add task to a note” writes a heading that links to today, like ### [[2026-11-16]], with the task below it. Off: just the task.")
			.addToggle((t) =>
				t.setValue(s.captureDate).onChange(async (v) => {
					s.captureDate = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Day link format")
			.setDesc("The name of your daily notes, as a date format. YYYY-MM-DD gives 2026-11-16.")
			.addText((t) =>
				t.setValue(s.captureDateFormat).onChange(async (v) => {
					s.captureDateFormat = v.trim() || DEFAULT_SETTINGS.captureDateFormat;
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
			.setName("Keep zones tidy")
			.setDesc(
				"Zones wrap their cards and the cards those point to with arrows, growing and shrinking with them. Overlapping cards and zones are pushed apart, to the right or down.",
			)
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
