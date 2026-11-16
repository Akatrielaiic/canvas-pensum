import {
	type App,
	type EventRef,
	type Menu,
	Modal,
	Notice,
	Plugin,
	Setting,
	SuggestModal,
	TFile,
	debounce,
	moment,
	normalizePath,
	prepareFuzzySearch,
} from "obsidian";
import { type CanvasData, type CanvasNode, parseCanvas, serializeCanvas } from "./canvas.ts";
import { scanVault } from "./scanner.ts";
import { DEFAULT_SETTINGS, type CanvasPensumSettings, CanvasPensumSettingTab } from "./settings.ts";
import { DONE_ID, type Layout, type SyncResult, addZone, moveToZone, syncDesk } from "./sync.ts";
import { TASKS_CACHE_EVENT, getTasksPlugin } from "./tasks-plugin.ts";
import { computeZones } from "./zones.ts";

/** The parts of Obsidian's (undocumented) canvas view we rely on. Always feature-checked. */
interface LiveCanvas {
	getData(): CanvasData;
	setData(data: CanvasData): void;
	requestSave(): void;
	selection?: Set<{ id: string }>;
	zoomToBbox?(box: { minX: number; minY: number; maxX: number; maxY: number }): void;
}

/** Undocumented workspace events fired by the canvas for its context menus. */
type CanvasMenuEvents = {
	on(name: "canvas:node-menu", cb: (menu: Menu, node: { id: string; canvas?: unknown }) => void): EventRef;
	on(name: "canvas:selection-menu", cb: (menu: Menu, canvas: unknown) => void): EventRef;
	on(name: string, cb: () => void): EventRef;
};

export default class CanvasPensumPlugin extends Plugin {
	settings: CanvasPensumSettings = DEFAULT_SETTINGS;

	async onload() {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
		this.addSettingTab(new CanvasPensumSettingTab(this.app, this));

		this.addRibbonIcon("layout-dashboard", "Open Pensatorium", () => this.openDesk());
		this.addCommand({ id: "open-desk", name: "Open Pensatorium", callback: () => this.openDesk() });
		this.addCommand({ id: "sync-desk", name: "Sync Pensatorium now", callback: () => this.sync(true) });
		this.addCommand({ id: "add-task", name: "Add task", callback: () => this.addTask() });
		this.addCommand({ id: "new-zone", name: "New zone", callback: () => this.newZone() });
		this.addCommand({
			id: "move-to-zone",
			name: "Move selected cards to zone",
			checkCallback: (checking) => {
				const ids = this.selectedIds();
				if (!ids.length) return false;
				if (!checking) this.moveToZone(ids);
				return true;
			},
		});

		const events = this.app.workspace as unknown as CanvasMenuEvents;
		const addMenuItem = (menu: Menu, ids: string[]) =>
			menu.addItem((item) =>
				item
					.setTitle("Move to zone…")
					.setIcon("folder-input")
					.onClick(() => this.moveToZone(ids)),
			);
		this.registerEvent(
			events.on("canvas:node-menu", (menu, node) => {
				if (node?.id && node.canvas === this.liveCanvas(this.deskPath())) addMenuItem(menu, [node.id]);
			}),
		);
		this.registerEvent(
			events.on("canvas:selection-menu", (menu, canvas) => {
				if (canvas === this.liveCanvas(this.deskPath())) addMenuItem(menu, this.selectedIds());
			}),
		);

		const autoSync = debounce(() => this.settings.autoSync && this.sync(false), 2000, true);
		// The desk itself changed (a card was dragged, a zone recoloured): re-apply zone rules.
		const deskChanged = debounce(() => this.sync(false), 1000, true);

		// Wait for the layout: before that, the cache fires "changed" for every file in the vault.
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.metadataCache.on("changed", autoSync));
			this.registerEvent(this.app.vault.on("delete", autoSync));
			// The Tasks plugin re-indexes slightly after the metadata cache; follow its own signal too.
			this.registerEvent(
				events.on(TASKS_CACHE_EVENT, autoSync),
			);
			// Due-date colours change at midnight even if no file does.
			this.registerInterval(window.setInterval(autoSync, 60 * 60 * 1000));
			this.registerEvent(
				this.app.vault.on("modify", (file) => {
					if (file.path === this.deskPath()) deskChanged();
				}),
			);
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private deskPath(): string {
		const path = normalizePath(this.settings.deskPath);
		return path.endsWith(".canvas") ? path : path + ".canvas";
	}

	private async getDesk(create: boolean): Promise<TFile | null> {
		const path = this.deskPath();
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		if (!create) return null;
		const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		return this.app.vault.create(path, serializeCanvas({ nodes: [], edges: [] }));
	}

	private async openDesk() {
		try {
			const desk = await this.sync(true);
			if (desk) await this.app.workspace.getLeaf(false).openFile(desk);
		} catch (e) {
			console.error("Canvas Pensum", e);
			new Notice("Canvas Pensum: could not open the Pensatorium (see console).");
		}
	}

	/** If the desk is open in a canvas view, edit it through the view so unsaved moves are not lost. */
	private liveCanvas(path: string): LiveCanvas | null {
		for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
			const view = leaf.view as unknown as { file?: TFile; canvas?: Partial<LiveCanvas> };
			const c = view.canvas;
			if (view.file?.path === path && c?.getData && c.setData && c.requestSave) return c as LiveCanvas;
		}
		return null;
	}

	/** Applies `edit` to the desk; `edit` returns null to leave it untouched. */
	private async editDesk(desk: TFile, edit: (data: CanvasData) => CanvasData | null): Promise<void> {
		const live = this.liveCanvas(desk.path);
		if (live) {
			const next = edit(live.getData());
			if (next) {
				live.setData(next);
				live.requestSave();
			}
		} else {
			await this.app.vault.process(desk, (raw) => {
				const next = edit(parseCanvas(raw));
				return next ? serializeCanvas(next) : raw;
			});
		}
	}

	private layout(): Layout {
		const { cardWidth, cardHeight, columns } = this.settings;
		return { cardWidth, cardHeight, columns, gap: 40 };
	}

	private selectedIds(): string[] {
		const selection = this.liveCanvas(this.deskPath())?.selection;
		return selection ? [...selection].map((n) => n.id).filter(Boolean) : [];
	}

	private async newZone() {
		try {
			const zone = await promptZone(this.app);
			if (!zone) return;
			const desk = await this.getDesk(true);
			if (!desk) return;
			let created: CanvasNode | undefined;
			await this.editDesk(desk, (data) => {
				const result = addZone(data, zone, this.layout());
				created = result.zone;
				return result.data;
			});
			if (created) {
				const { x, y, width, height } = created;
				this.liveCanvas(desk.path)?.zoomToBbox?.({ minX: x, minY: y, maxX: x + width, maxY: y + height });
			}
			new Notice(`Zone “${zone.label}” added.`);
		} catch (e) {
			console.error("Canvas Pensum", e);
			new Notice("Canvas Pensum: could not add the zone (see console).");
		}
	}

	private moveToZone(ids: string[]) {
		const live = this.liveCanvas(this.deskPath());
		if (!live || !ids.length) return;
		const zones = live
			.getData()
			.nodes.filter((n) => n.type === "group" && n.id !== DONE_ID && typeof n.label === "string" && n.label.trim());
		new ZonePicker(this.app, zones, async (pick) => {
			try {
				const desk = await this.getDesk(false);
				if (!desk) return;
				await this.editDesk(desk, (data) => {
					if (typeof pick !== "string") return moveToZone(data, ids, pick.id, this.layout());
					const created = addZone(data, { label: pick }, this.layout());
					return moveToZone(created.data, ids, created.zone.id, this.layout()) ?? created.data;
				});
				await this.sync(false); // zone colour, zone property
			} catch (e) {
				console.error("Canvas Pensum", e);
				new Notice("Canvas Pensum: could not move the cards (see console).");
			}
		}).open();
	}

	/** `manual` = triggered by the user: creates the desk if missing and reports what changed. */
	async sync(manual: boolean): Promise<TFile | null> {
		const desk = await this.getDesk(manual);
		if (!desk) return null;

		const notes = scanVault(this.app, this.settings);
		if (!notes) {
			// Tasks is still indexing; its cache-update event will trigger the sync when it is done.
			if (manual) new Notice("Pensatorium: the Tasks plugin is still indexing, cards will appear in a moment.");
			return desk;
		}
		const run = (data: CanvasData) =>
			syncDesk(data, notes, {
				...this.layout(),
				inboxLabel: "Inbox",
				doneLabel: "Done",
				growZones: this.settings.growZones,
				inheritZoneColor: this.settings.inheritZoneColor,
				onComplete: this.settings.onComplete,
				doneColor: "4",
				today: this.settings.colorByDue && getTasksPlugin(this.app) ? moment().format("YYYY-MM-DD") : undefined,
				exists: (p) => this.app.vault.getAbstractFileByPath(p) instanceof TFile,
			});

		let result: SyncResult | undefined;
		await this.editDesk(desk, (data) => {
			result = run(data);
			return result.changed ? result.data : null;
		});
		if (!result) return desk;

		if (this.settings.writeZones) await this.writeZones(result.data);
		if (manual) {
			const { added, completed, removed } = result;
			new Notice(
				result.changed
					? `Pensatorium: ${added.length} new, ${completed.length} completed, ${removed.length} removed.`
					: "Pensatorium is up to date.",
			);
		}
		return desk;
	}

	/** Quick capture: Tasks' own editor when available, a one-line prompt otherwise. */
	private async addTask() {
		try {
			const tasksApi = getTasksPlugin(this.app)?.apiV1;
			const line = tasksApi ? await tasksApi.createTaskLineModal() : await promptTaskLine(this.app);
			if (!line?.trim()) return;

			const path = normalizePath(this.settings.captureNote.replace(/(\.md)?$/, ".md"));
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.process(existing, (text) => (text.trim() ? text.replace(/\n*$/, "\n") : "") + line + "\n");
			} else {
				const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
				if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
				await this.app.vault.create(path, line + "\n");
			}
			new Notice(`Task added to ${path}`);
		} catch (e) {
			console.error("Canvas Pensum", e);
			new Notice("Canvas Pensum: could not add the task (see console).");
		}
	}

	/** Mirrors "which group is this card in" into a note property. Only writes when the value changes. */
	private async writeZones(data: CanvasData) {
		const prop = this.settings.zoneProperty;
		for (const [path, zone] of computeZones(data)) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile) || file.extension !== "md") continue;
			const current = this.app.metadataCache.getFileCache(file)?.frontmatter?.[prop] ?? null;
			if (current === zone) continue;
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (zone) fm[prop] = zone;
				else delete fm[prop];
			});
		}
	}
}

function promptTaskLine(app: App): Promise<string> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		let text = "";
		let submitted = false;
		const submit = () => {
			submitted = true;
			modal.close();
		};
		modal.titleEl.setText("Add task");
		new Setting(modal.contentEl).setName("Task").addText((t) => {
			t.onChange((v) => (text = v));
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) submit();
			});
			window.setTimeout(() => t.inputEl.focus());
		});
		new Setting(modal.contentEl).addButton((b) => b.setButtonText("Add").setCta().onClick(submit));
		modal.onClose = () => resolve(submitted && text.trim() ? `- [ ] ${text.trim()}` : "");
		modal.open();
	});
}

/** Pick an existing zone, or type a new name and press Enter to create it. A string means "create". */
class ZonePicker extends SuggestModal<CanvasNode | string> {
	constructor(app: App, private zones: CanvasNode[], private onPick: (zone: CanvasNode | string) => void) {
		super(app);
		this.setPlaceholder("Zone name: pick one, or type a new one");
		this.emptyStateText = "Type a name to create a zone";
	}
	getSuggestions(query: string): (CanvasNode | string)[] {
		const name = query.trim();
		const label = (z: CanvasNode) => (z.label as string).trim();
		if (!name) return this.zones;
		const search = prepareFuzzySearch(name);
		const matches = this.zones
			.map((zone) => ({ zone, match: search(label(zone)) }))
			.filter((m) => m.match)
			.sort((a, b) => b.match!.score - a.match!.score)
			.map((m) => m.zone);
		const exists = this.zones.some((z) => label(z).toLowerCase() === name.toLowerCase());
		return exists ? matches : [...matches, name];
	}
	renderSuggestion(item: CanvasNode | string, el: HTMLElement): void {
		el.setText(typeof item === "string" ? `Create zone “${item}”` : (item.label as string).trim());
	}
	onChooseSuggestion(item: CanvasNode | string): void {
		this.onPick(item);
	}
}

const ZONE_COLOURS: Record<string, string> = {
	"": "No colour",
	"1": "Red",
	"2": "Orange",
	"3": "Yellow",
	"4": "Green",
	"5": "Cyan",
	"6": "Purple",
};

function promptZone(app: App): Promise<{ label: string; color?: string } | null> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		let label = "";
		let color = "";
		let submitted = false;
		const submit = () => {
			submitted = true;
			modal.close();
		};
		modal.titleEl.setText("New zone");
		new Setting(modal.contentEl).setName("Name").addText((t) => {
			t.setPlaceholder("Today").onChange((v) => (label = v));
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) submit();
			});
			window.setTimeout(() => t.inputEl.focus());
		});
		new Setting(modal.contentEl)
			.setName("Colour")
			.setDesc("Cards in the zone take its colour. Red, orange and green are also used for due dates and done.")
			.addDropdown((d) => d.addOptions(ZONE_COLOURS).onChange((v) => (color = v)));
		new Setting(modal.contentEl).addButton((b) => b.setButtonText("Add zone").setCta().onClick(submit));
		modal.onClose = () =>
			resolve(submitted && label.trim() ? { label: label.trim(), color: color || undefined } : null);
		modal.open();
	});
}
