import { Notice, Plugin, TFile, debounce, normalizePath } from "obsidian";
import { type CanvasData, parseCanvas, serializeCanvas } from "./canvas.ts";
import { scanVault } from "./scanner.ts";
import { DEFAULT_SETTINGS, type SpatialTasksSettings, SpatialTasksSettingTab } from "./settings.ts";
import { type SyncResult, syncDesk } from "./sync.ts";
import { computeZones } from "./zones.ts";

/** The parts of Obsidian's (undocumented) canvas view we rely on. Always feature-checked. */
interface LiveCanvas {
	getData(): CanvasData;
	setData(data: CanvasData): void;
	requestSave(): void;
}

export default class SpatialTasksPlugin extends Plugin {
	settings: SpatialTasksSettings = DEFAULT_SETTINGS;

	async onload() {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
		this.addSettingTab(new SpatialTasksSettingTab(this.app, this));

		this.addRibbonIcon("layout-dashboard", "Open task desk", () => this.openDesk());
		this.addCommand({ id: "open-desk", name: "Open task desk", callback: () => this.openDesk() });
		this.addCommand({ id: "sync-desk", name: "Sync task desk now", callback: () => this.sync(true) });

		const autoSync = debounce(() => this.settings.autoSync && this.sync(false), 2000, true);
		const autoZones = debounce(() => this.settings.writeZones && this.writeZonesFromFile(), 1500, true);

		// Wait for the layout: before that, the cache fires "changed" for every file in the vault.
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.metadataCache.on("changed", autoSync));
			this.registerEvent(this.app.vault.on("delete", autoSync));
			this.registerEvent(
				this.app.vault.on("modify", (file) => {
					if (file.path === this.deskPath()) autoZones();
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
			console.error("Spatial Tasks", e);
			new Notice("Spatial Tasks: could not open the desk (see console).");
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

	/** `manual` = triggered by the user: creates the desk if missing and reports what changed. */
	async sync(manual: boolean): Promise<TFile | null> {
		const desk = await this.getDesk(manual);
		if (!desk) return null;

		const notes = scanVault(this.app, this.settings);
		const run = (data: CanvasData) =>
			syncDesk(data, notes, {
				cardWidth: this.settings.cardWidth,
				cardHeight: this.settings.cardHeight,
				columns: this.settings.columns,
				gap: 40,
				inboxLabel: "Inbox",
				onComplete: this.settings.onComplete,
				doneColor: "4",
				exists: (p) => this.app.vault.getAbstractFileByPath(p) instanceof TFile,
			});

		let result: SyncResult | undefined;
		const live = this.liveCanvas(desk.path);
		if (live) {
			result = run(live.getData());
			if (result.changed) {
				live.setData(result.data);
				live.requestSave();
			}
		} else {
			await this.app.vault.process(desk, (raw) => {
				result = run(parseCanvas(raw));
				return result.changed ? serializeCanvas(result.data) : raw;
			});
		}
		if (!result) return desk;

		if (this.settings.writeZones) await this.writeZones(result.data);
		if (manual) {
			const { added, completed, removed } = result;
			new Notice(
				result.changed
					? `Task desk: ${added.length} new, ${completed.length} completed, ${removed.length} removed.`
					: "Task desk is up to date.",
			);
		}
		return desk;
	}

	private async writeZonesFromFile() {
		const desk = await this.getDesk(false);
		if (desk) await this.writeZones(parseCanvas(await this.app.vault.read(desk)));
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
