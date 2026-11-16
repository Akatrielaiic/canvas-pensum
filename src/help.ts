// Adds a plugin's keys to the canvas help: the window behind the "?" among the canvas controls.
//
// Obsidian has no API for this. The help is a modal (.mod-canvas-help) holding a list
// (.canvas-help) of rows (.canvas-instruction); we wait for it to open and append rows built
// the same way. If Obsidian changes that window, nothing is added and nothing breaks.
//
// Shared verbatim by Canvas Arbor and Canvas Pensum: change both copies together.
import { type App, Platform } from "obsidian";

/** One line of help: what it does, and the key combinations that do it (each a list of key names). */
export interface HelpRow {
	label: string;
	keys: string[][];
}

const MAC: Record<string, string> = { Mod: "⌘", Meta: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃" };
const OTHER: Record<string, string> = { Mod: "Ctrl", Meta: "Win" };

/** A combination as Obsidian writes it in its own help: "⇧ ⌘ M" on a Mac, "Ctrl + Shift + M" elsewhere. */
export function keyText(parts: string[]): string {
	const names = Platform.isMacOS ? MAC : OTHER;
	return parts.map((p) => names[p] ?? (p.length === 1 ? p.toUpperCase() : p)).join(Platform.isMacOS ? " " : " + ");
}

/** The keys a command is bound to right now: the user's own if they changed them, else the defaults. */
export function commandKeys(app: App, commandId: string): string[][] {
	type Hotkey = { modifiers?: string[]; key?: string };
	type Manager = { getHotkeys?(id: string): Hotkey[] | undefined; getDefaultHotkeys?(id: string): Hotkey[] | undefined };
	const manager = (app as unknown as { hotkeyManager?: Manager }).hotkeyManager;
	const hotkeys = manager?.getHotkeys?.(commandId) ?? manager?.getDefaultHotkeys?.(commandId) ?? [];
	return hotkeys.filter((h) => h.key).map((h) => [...(h.modifiers ?? []), h.key as string]);
}

/**
 * Watches a document for the canvas help opening and appends a titled section to it.
 * `rows` is asked each time; return null to add nothing (the plugin does not apply to this canvas).
 * Returns a function that stops watching.
 */
export function watchCanvasHelp(doc: Document, cls: string, title: string, rows: () => HelpRow[] | null): () => void {
	const add = (root: Element) => {
		const list = root.querySelector(".mod-canvas-help .canvas-help");
		if (!list || list.querySelector(`.${cls}`)) return;
		const shown = (rows() ?? []).filter((row) => row.keys.length);
		if (!shown.length) return;
		list.createDiv({ cls: `canvas-instruction ${cls}` }, (el) => el.createDiv({ cls: "canvas-instruction-label" }).createEl("strong", { text: title }));
		for (const row of shown) {
			list.createDiv({ cls: `canvas-instruction ${cls}` }, (el) => {
				el.createDiv({ cls: "canvas-instruction-label", text: row.label });
				el.createDiv({ cls: "canvas-instruction-desc" }, (desc) => {
					for (const keys of row.keys) desc.createSpan({ cls: "setting-hotkey", text: keyText(keys) });
				});
			});
		}
	};
	const observer = new MutationObserver((changes) => {
		for (const change of changes) {
			for (const node of Array.from(change.addedNodes)) {
				if (node.instanceOf(HTMLElement)) add(node);
			}
		}
	});
	observer.observe(doc.body, { childList: true });
	return () => observer.disconnect();
}
