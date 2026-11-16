import {
	type App,
	type Editor,
	type EventRef,
	ItemView,
	type Menu,
	Modal,
	Notice,
	Platform,
	Plugin,
	Setting,
	SuggestModal,
	TFile,
	addIcon,
	debounce,
	moment,
	normalizePath,
	prepareFuzzySearch,
	setIcon,
	setTooltip,
} from "obsidian";
import { type CanvasData, type CanvasNode, parseCanvas, serializeCanvas } from "./canvas.ts";
import { insertAtTop, insertUnderHeading, notePath } from "./capture.ts";
import { type HelpRow, commandKeys, keyText, watchCanvasHelp } from "./help.ts";
import { scanVault } from "./scanner.ts";
import { DEFAULT_SETTINGS, type CanvasPensumSettings, CanvasPensumSettingTab } from "./settings.ts";
import { DONE_ID, INBOX_ID, type Layout, type SyncResult, addZone, moveToZone, syncDesk } from "./sync.ts";
import { TASKS_CACHE_EVENT, getTasksPlugin } from "./tasks-plugin.ts";
import { computeZones } from "./zones.ts";

/** The parts of Obsidian's (undocumented) canvas view we rely on. Always feature-checked. */
interface LiveCanvas {
	getData(): CanvasData;
	setData(data: CanvasData): void;
	requestSave(): void;
	selection?: Set<{ id: string }>;
	nodes?: Map<string, LiveNode>;
	isDragging?: boolean;
	zoomToBbox?(box: { minX: number; minY: number; maxX: number; maxY: number }): void;
	panIntoView?(box: { minX: number; minY: number; maxX: number; maxY: number }): void;
}

/** A small temple with a tick: the Pensatorium as a place. Drawn on a 24-unit grid, edge to edge like Obsidian's own icons, scaled to its 100. */
const PENSATORIUM_ICON = "pensatorium";
const PENSATORIUM_SVG =
	'<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
	'<path d="M1.2 8.95 12 2.35l10.8 6.6"/><path d="M3 8.95h18"/><path d="M5.4 12.55v6.6M18.6 12.55v6.6"/>' +
	'<path d="M1.8 22.15h20.4"/><path d="m9 15.8 2.16 2.16 4.08-4.32"/></g>';

const GUIDE_ID = "pensum-guide";

/** The card that explains the Pensatorium, put on a new one. Plain text: the user can edit or delete it. */
function guideText(addTask: string, moveToZone: string): string {
	const key = (keys: string) => (keys ? ` (${keys})` : "");
	return [
		"## Welcome to the Pensatorium",
		"",
		"Every note with open tasks (`- [ ]`) lands here as a card. The cards are the notes themselves: tick and edit them right here.",
		"",
		"- **Inbox**: new cards arrive there. Drag them wherever you like.",
		`- **Zones**: named groups, like *Today* or *Waiting*. Select cards and use *Move to zone…*${key(moveToZone)}; type a new name to create a zone. A zone wraps its cards and gives them its colour.`,
		"- **Done**: when a note has no open tasks left, its card turns green and moves there. Delete cards from Done freely: the notes stay.",
		`- **New task**: *Add task to a note*${key(addTask)}, or the button among the canvas controls. Pick a note and type.`,
		"- **Arrows**: cards joined by arrows travel together.",
		"",
		"The keys are also in the canvas help (the **?** among the canvas controls). Delete this card when you no longer need it.",
	].join("\n");
}

interface LiveNode {
	isEditing?: boolean;
	file?: TFile;
	startEditing?(): void;
	getBBox?(): { minX: number; minY: number; maxX: number; maxY: number };
	/** The embedded note, once the card is on screen: its text as loaded, and its editor while editing. */
	child?: { editor?: Editor; text?: string } | null;
	moveAndResize?(rect: { x: number; y: number; width: number; height: number }): void;
	setColor?(color: string): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Updates an open canvas. Position, size and colour changes go node by node, which does not
 * disturb a card being typed in. Anything bigger reloads the canvas data, so it waits until
 * nobody is typing. Returns false when the change has to be retried later.
 */
function applyLive(live: LiveCanvas, next: CanvasData): boolean {
	if (live.isDragging) return false;
	const current = live.getData();
	const rest = ({ x, y, width, height, color, ...other }: CanvasNode) => JSON.stringify(other);
	const nodes = live.nodes;
	const light =
		!!nodes &&
		current.nodes.length === next.nodes.length &&
		JSON.stringify(current.edges) === JSON.stringify(next.edges) &&
		next.nodes.every((n, i) => {
			const c = current.nodes[i];
			const node = nodes.get(n.id);
			return c.id === n.id && rest(c) === rest(n) && !!node?.moveAndResize && !!node.setColor;
		});
	if (light && nodes) {
		next.nodes.forEach((n, i) => {
			const c = current.nodes[i];
			const node = nodes.get(n.id) as LiveNode;
			if (c.x !== n.x || c.y !== n.y || c.width !== n.width || c.height !== n.height) {
				node.moveAndResize?.({ x: n.x, y: n.y, width: n.width, height: n.height });
			}
			if (c.color !== n.color) node.setColor?.(n.color ?? "");
		});
	} else {
		if ([...(nodes?.values() ?? [])].some((n) => n.isEditing)) return false;
		live.setData(next);
	}
	live.requestSave();
	return true;
}

/** Undocumented workspace events fired by the canvas for its context menus. */
type CanvasMenuEvents = {
	on(name: "canvas:node-menu", cb: (menu: Menu, node: { id: string; canvas?: unknown; file?: unknown }) => void): EventRef;
	on(name: "canvas:selection-menu", cb: (menu: Menu, canvas: unknown) => void): EventRef;
	on(name: string, cb: () => void): EventRef;
};

export default class CanvasPensumPlugin extends Plugin {
	settings: CanvasPensumSettings = DEFAULT_SETTINGS;
	/** Notes with a task being written in their card: kept on the desk even while the task is still empty. */
	private capturing = new Map<string, number>();
	/** Re-run the sync shortly (the desk changed, or an update had to wait). */
	private syncSoon = debounce(() => this.sync(false), 1000, true);

	async onload() {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
		this.addSettingTab(new CanvasPensumSettingTab(this.app, this));

		addIcon(PENSATORIUM_ICON, PENSATORIUM_SVG);
		this.addRibbonIcon(PENSATORIUM_ICON, "Open Pensatorium", () => this.openDesk());
		this.addCommand({ id: "open-desk", name: "Open Pensatorium", icon: PENSATORIUM_ICON, callback: () => this.openDesk() });
		this.addCommand({ id: "sync-desk", name: "Sync Pensatorium now", callback: () => this.sync(true) });
		this.addCommand({ id: "add-task", name: "Add task", callback: () => this.addTask() });
		this.addCommand({
			id: "add-task-to-note",
			name: "Add task to a note",
			icon: "list-plus",
			// A for "add". Free in Obsidian, Canvas and Canvas Arbor; can be changed in Settings → Hotkeys.
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "a" }],
			callback: () => this.addTaskToNote(),
		});
		this.addCommand({ id: "add-guide", name: "Add the guide card", callback: () => this.addGuide() });
		this.addCommand({ id: "new-zone", name: "New zone", callback: () => this.newZone() });
		this.addCommand({
			id: "move-to-zone",
			name: "Move selected cards to zone",
			// M for "move". Free in Obsidian, Canvas and Canvas Arbor; can be changed in Settings → Hotkeys.
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "m" }],
			// Obsidian runs only the first command bound to a key, even when it does not apply. Canvas
			// Arbor binds the same key on every other canvas, so when pressed there we hand over to it.
			checkCallback: (checking) => this.zoneCommand(checking) || (!checking && !!this.arbor()?.zoneCommand?.(false)),
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
				if (!node?.id || node.canvas !== this.liveCanvas(this.deskPath())) return;
				const note = node.file;
				if (note instanceof TFile && note.extension === "md") {
					menu.addItem((item) =>
						item
							.setTitle("Add task to this note")
							.setIcon("list-plus")
							.onClick(() => this.captureTo(note, true)),
					);
				}
				addMenuItem(menu, [node.id]);
			}),
		);
		this.registerEvent(
			events.on("canvas:selection-menu", (menu, canvas) => {
				if (canvas === this.liveCanvas(this.deskPath())) addMenuItem(menu, this.selectedIds());
			}),
		);

		const autoSync = debounce(() => this.settings.autoSync && this.sync(false), 2000, true);
		const watchHelp = (win: Window) => this.register(watchCanvasHelp(win.document, "pensum-help", "Canvas Pensum", () => this.helpRows()));
		watchHelp(window);
		this.registerEvent(this.app.workspace.on("window-open", (_w, win) => watchHelp(win)));

		// A button for it among the canvas controls, on the Pensatorium only.
		this.registerEvent(this.app.workspace.on("layout-change", () => this.addCanvasButton()));
		this.register(() => activeDocument.querySelectorAll(".pensum-controls").forEach((el) => el.remove()));

		// Wait for the layout: before that, the cache fires "changed" for every file in the vault.
		this.app.workspace.onLayoutReady(() => {
			this.addCanvasButton();
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
					// A card was dragged or resized, a zone recoloured: re-apply the zone rules.
					if (file.path === this.deskPath()) this.syncSoon();
				}),
			);
		});
	}

	/**
	 * For other plugins (Canvas Arbor): true when this canvas is the Pensatorium, whose zones
	 * Canvas Pensum looks after. Whoever else handles zones should leave that canvas alone.
	 */
	ownsCanvas(path: string): boolean {
		return path === this.deskPath();
	}

	/** "Move selected cards to zone" on the Pensatorium. Public so Canvas Arbor can hand the key over. */
	zoneCommand(checking: boolean): boolean {
		if (!this.deskIsActive()) return false;
		const ids = this.selectedIds();
		if (!ids.length) return false;
		if (!checking) this.moveToZone(ids);
		return true;
	}

	/** The Pensatorium is the canvas in front, not merely open in another tab. */
	private deskIsActive(): boolean {
		const active = this.app.workspace.getActiveViewOfType(ItemView) as (ItemView & { file?: TFile }) | null;
		return active?.file?.path === this.deskPath() && !!this.liveCanvas(this.deskPath());
	}

	private arbor(): { zoneCommand?(checking: boolean): boolean } | undefined {
		type Plugins = { plugins?: { plugins?: Record<string, { zoneCommand?(checking: boolean): boolean } | undefined> } };
		return (this.app as unknown as Plugins).plugins?.plugins?.["canvas-arbor"];
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
		// A new Pensatorium starts with a card that explains it.
		return this.app.vault.create(path, serializeCanvas({ nodes: [this.guideNode({ nodes: [], edges: [] })], edges: [] }));
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

	private keysOf(command: string): string {
		return commandKeys(this.app, `${this.manifest.id}:${command}`).map(keyText).join(" / ");
	}

	/** The guide card, placed above everything already on the canvas. */
	private guideNode(data: CanvasData): CanvasNode {
		const width = 520;
		const height = 560;
		const nodes = data.nodes;
		return {
			id: GUIDE_ID,
			type: "text",
			text: guideText(this.keysOf("add-task-to-note"), this.keysOf("move-to-zone")),
			x: nodes.length ? Math.min(...nodes.map((n) => n.x)) : 0,
			y: (nodes.length ? Math.min(...nodes.map((n) => n.y)) : 0) - height - 160,
			width,
			height,
		};
	}

	private async addGuide() {
		const desk = await this.getDesk(true);
		if (!desk) return;
		await this.editDesk(desk, (data) => (data.nodes.some((n) => n.id === GUIDE_ID) ? null : { ...data, nodes: [...data.nodes, this.guideNode(data)] }));
		const guide = this.liveCanvas(desk.path)?.nodes?.get(GUIDE_ID)?.getBBox?.();
		if (guide) this.liveCanvas(desk.path)?.zoomToBbox?.(guide);
	}

	/** Our keys, for the canvas help. Only on the Pensatorium. */
	private helpRows(): HelpRow[] | null {
		if (!this.deskIsActive()) return null;
		return [
			{ label: "Add task to a note", keys: commandKeys(this.app, `${this.manifest.id}:add-task-to-note`) },
			{ label: "Move the selected cards to a zone (a new name creates it)", keys: commandKeys(this.app, `${this.manifest.id}:move-to-zone`) },
		];
	}

	/** Applies `edit` to the desk; `edit` returns null to leave it untouched. */
	private async editDesk(desk: TFile, edit: (data: CanvasData) => CanvasData | null): Promise<void> {
		const live = this.liveCanvas(desk.path);
		if (live) {
			const next = edit(live.getData());
			if (next && !applyLive(live, next)) this.syncSoon(); // busy: try again in a moment
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
				const result = addZone(data, zone, this.layout(), { anchorId: INBOX_ID });
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
					const created = addZone(data, { label: pick }, this.layout(), { anchorId: INBOX_ID });
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
		for (const [path, until] of this.capturing) {
			const note = notes.find((n) => n.path === path);
			if ((note && note.open > 0) || Date.now() > until) this.capturing.delete(path);
			else if (note) note.open = 1;
			else notes.push({ path, open: 1, done: 0 });
		}
		const run = (data: CanvasData) =>
			syncDesk(data, notes, {
				...this.layout(),
				inboxLabel: "Inbox",
				doneLabel: "Done",
				growZones: this.settings.growZones,
				pinned: this.selectedIds(),
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

	private addCanvasButton() {
		const path = this.deskPath();
		for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
			const view = leaf.view as unknown as { file?: TFile; containerEl?: HTMLElement };
			const controls = view.containerEl?.querySelector(".canvas-controls");
			if (!controls) continue;
			const existing = controls.querySelector(".pensum-controls");
			if (view.file?.path !== path) {
				existing?.remove(); // the tab now shows another canvas
				continue;
			}
			if (existing) continue;
			const group = controls.createDiv({ cls: "canvas-control-group mod-raised pensum-controls" });
			const item = group.createDiv({ cls: "canvas-control-item" });
			setIcon(item, "list-plus");
			setTooltip(item, `Add task to a note (${Platform.isMacOS ? "⇧⌘A" : "Ctrl+Shift+A"})`, { placement: "left" });
			item.addEventListener("click", () => this.addTaskToNote());
		}
	}

	/** The note of the one selected card, if any: the likeliest target for a new task. */
	private selectedNote(): TFile | null {
		const live = this.liveCanvas(this.deskPath());
		const ids = this.selectedIds();
		if (!live || ids.length !== 1) return null;
		const node = live.getData().nodes.find((n) => n.id === ids[0]);
		const file = node?.type === "file" && node.file ? this.app.vault.getAbstractFileByPath(node.file) : null;
		return file instanceof TFile && file.extension === "md" ? file : null;
	}

	private taskLine(): Promise<string> {
		const tasksApi = getTasksPlugin(this.app)?.apiV1;
		return tasksApi ? tasksApi.createTaskLineModal() : promptTaskLine(this.app);
	}

	/**
	 * Pick a note (or name a new one) and add a task at the top of it.
	 * On the Pensatorium the empty task is written and the cursor goes to it, inside the note's
	 * card, so it is typed in the note itself (with Tasks' suggestions). Anywhere else the task
	 * is typed in a one-line box, without leaving what you were doing.
	 */
	private addTaskToNote() {
		const onDesk = this.deskIsActive();
		new NotePicker(this.app, this.selectedNote(), (pick) => this.captureTo(pick, onDesk)).open();
	}

	/** Adds a task at the top of a note (a name creates the note). `onDesk`: type it in the card. */
	private async captureTo(pick: TFile | string, onDesk: boolean) {
		try {
			const name = typeof pick === "string" ? pick : pick.basename;
			const line = onDesk ? "- [ ] " : await promptTaskLine(this.app, `Task for ${name}`);
			if (!line) return;
			const heading = this.settings.captureDate ? `### [[${moment().format(this.settings.captureDateFormat || "YYYY-MM-DD")}]]` : null;
			const place = (text: string) => (heading ? insertUnderHeading(text, heading, line) : insertAtTop(text, line));

			let file = typeof pick === "string" ? null : pick;
			if (typeof pick === "string") {
				const path = normalizePath(notePath(pick, this.app.fileManager.getNewFileParent("").path));
				if (!path) return;
				const existing = this.app.vault.getAbstractFileByPath(path);
				if (existing instanceof TFile) file = existing;
				else {
					const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
					if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
					file = await this.app.vault.create(path, "");
				}
			}
			if (!file) return;
			await this.app.vault.process(file, place);

			if (!onDesk) {
				new Notice(`Task added to ${file.basename}`);
				return;
			}
			// An empty task may not count as a task yet: hold the card on the desk meanwhile.
			this.capturing.set(file.path, Date.now() + 2 * 60 * 1000);
			await this.sync(false);
			if (!(await this.writeInCard(file.path))) new Notice(`Empty task added to ${file.basename}: open its card to write it.`);
		} catch (e) {
			console.error("Canvas Pensum", e);
			new Notice("Canvas Pensum: could not add the task (see console).");
		}
	}

	/**
	 * Opens the note's card for writing, cursor right after the empty task's "- [ ] ".
	 * False if it can't be done in a few seconds.
	 *
	 * A card only has its note loaded while it is on screen, and it reloads the note a moment
	 * after the file changes; entering edit mode before that would show the old text. So: bring
	 * the card into view, wait until it has the new line, start editing, then place the cursor.
	 */
	private async writeInCard(path: string): Promise<boolean> {
		const emptyTask = /^- \[ \][ \t]*$/;
		let shown = false;
		for (let attempt = 0; attempt < 100; attempt++, await sleep(50)) {
			const live = this.liveCanvas(this.deskPath());
			const node = live?.nodes && [...live.nodes.values()].find((n) => n.file?.path === path);
			if (!live || !node?.startEditing) continue; // the card is still being added
			if (!shown) {
				const box = node.getBBox?.();
				if (box) live.panIntoView?.(box);
				shown = true;
				continue;
			}
			const child = node.child;
			if (typeof child?.text !== "string" || !child.text.split("\n").some((l) => emptyTask.test(l))) continue;
			const editor = child.editor;
			if (!node.isEditing || !editor) {
				node.startEditing();
				continue;
			}
			for (let i = 0; i < Math.min(editor.lineCount(), 500); i++) {
				if (!emptyTask.test(editor.getLine(i))) continue;
				const place = () => {
					if (editor.getLine(i) !== "- [ ] ") editor.setLine(i, "- [ ] ");
					editor.setCursor({ line: i, ch: 6 });
					editor.focus();
				};
				place();
				// The card focuses and scrolls its editor a moment after opening it: have the last word.
				await sleep(150);
				if (node.isEditing && emptyTask.test(editor.getLine(i))) place();
				return true;
			}
		}
		return false;
	}

	/** Quick capture: Tasks' own editor when available, a one-line prompt otherwise. */
	private async addTask() {
		try {
			const line = await this.taskLine();
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

function promptTaskLine(app: App, title = "Add task"): Promise<string> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		let text = "";
		let submitted = false;
		const submit = () => {
			submitted = true;
			modal.close();
		};
		modal.titleEl.setText(title);
		new Setting(modal.contentEl).setName("Task").addText((t) => {
			t.inputEl.addClass("pensum-task-input");
			t.inputEl.style.width = "100%";
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

/** Pick a note, or type a new name and press Enter to create it. A string means "create". */
class NotePicker extends SuggestModal<TFile | string> {
	constructor(app: App, private preferred: TFile | null, private onPick: (note: TFile | string) => void) {
		super(app);
		this.setPlaceholder("Add task to… pick a note, or type a new name");
		this.emptyStateText = "Type a name to create a note";
	}
	getSuggestions(query: string): (TFile | string)[] {
		const name = query.trim();
		const files = this.app.vault.getMarkdownFiles();
		if (!name) {
			const recent = this.app.workspace
				.getLastOpenFiles()
				.map((p) => this.app.vault.getAbstractFileByPath(p))
				.filter((f): f is TFile => f instanceof TFile && f.extension === "md" && f !== this.preferred);
			return [...(this.preferred ? [this.preferred] : []), ...recent].slice(0, 20);
		}
		const search = prepareFuzzySearch(name);
		// A match on the note's name beats one that needs its folder.
		const matches = files
			.map((file) => ({ file, score: search(file.basename)?.score ?? (search(file.path)?.score ?? -Infinity) - 10 }))
			.filter((m) => m.score > -Infinity)
			.sort((a, b) => b.score - a.score)
			.slice(0, 30)
			.map((m) => m.file);
		const exists = files.some((f) => f.basename.toLowerCase() === name.toLowerCase());
		return exists ? matches : [...matches, name];
	}
	renderSuggestion(item: TFile | string, el: HTMLElement): void {
		if (typeof item === "string") {
			el.setText(`Create note “${item}”`);
			return;
		}
		el.createDiv({ text: item.basename });
		const folder = item.parent?.path;
		if (folder && folder !== "/") el.createDiv({ text: folder, cls: "suggestion-note" });
	}
	onChooseSuggestion(item: TFile | string): void {
		this.onPick(item);
	}
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
