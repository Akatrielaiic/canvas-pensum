import assert from "node:assert/strict";
import { test } from "node:test";
import type { CanvasData } from "../src/canvas.ts";
import { INBOX_ID, type SyncOptions, syncDesk } from "../src/sync.ts";
import { computeZones } from "../src/zones.ts";

let n = 0;
const opts: SyncOptions = {
	cardWidth: 400,
	cardHeight: 400,
	gap: 40,
	columns: 2,
	inboxLabel: "Inbox",
	onComplete: "mark",
	doneColor: "4",
	newId: () => `st-${n++}`,
};
const empty = (): CanvasData => ({ nodes: [], edges: [] });
const note = (path: string, open = 1, done = 0) => ({ path, open, done });
const overlap = (a: any, b: any) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("first sync creates the inbox and one card per note with open tasks", () => {
	const r = syncDesk(empty(), [note("a.md"), note("b.md"), note("c.md"), note("d.md", 0, 3)], opts);
	assert.deepEqual(r.added, ["a.md", "b.md", "c.md"]);
	const [inbox, ...cards] = r.data.nodes;
	assert.equal(inbox.id, INBOX_ID);
	assert.equal(cards.length, 3);
	for (const c of cards) {
		assert.ok(c.x >= inbox.x && c.x + c.width <= inbox.x + inbox.width, "card inside inbox (x)");
		assert.ok(c.y >= inbox.y && c.y + c.height <= inbox.y + inbox.height, "card inside inbox (y)");
	}
	for (let i = 0; i < cards.length; i++)
		for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]), "no overlap");
});

test("a second sync with nothing new changes nothing", () => {
	const first = syncDesk(empty(), [note("a.md")], opts);
	const second = syncDesk(first.data, [note("a.md")], opts);
	assert.equal(second.changed, false);
	assert.deepEqual(second.data, first.data);
});

test("cards the user moved keep their position; new cards avoid occupied slots", () => {
	const first = syncDesk(empty(), [note("a.md")], opts);
	const a = first.data.nodes.find((x) => x.file === "a.md")!;
	const slot = { x: a.x, y: a.y };
	a.x = 5000;
	a.y = 5000;
	const second = syncDesk(first.data, [note("a.md"), note("b.md"), note("c.md")], opts);
	const get = (p: string) => second.data.nodes.find((x) => x.file === p)!;
	assert.deepEqual([get("a.md").x, get("a.md").y], [5000, 5000]);
	assert.deepEqual({ x: get("b.md").x, y: get("b.md").y }, slot, "freed slot is reused");
	assert.ok(!overlap(get("b.md"), get("c.md")));
});

test("completed notes are marked, reopened notes are unmarked", () => {
	const first = syncDesk(empty(), [note("a.md")], opts);
	const done = syncDesk(first.data, [note("a.md", 0, 1)], opts);
	assert.deepEqual(done.completed, ["a.md"]);
	assert.equal(done.data.nodes.find((x) => x.file === "a.md")!.color, "4");
	const again = syncDesk(done.data, [note("a.md", 0, 1)], opts);
	assert.equal(again.changed, false);
	const reopened = syncDesk(done.data, [note("a.md", 1, 1)], opts);
	assert.deepEqual(reopened.reopened, ["a.md"]);
	assert.equal(reopened.data.nodes.find((x) => x.file === "a.md")!.color, undefined);
});

test("remove mode and deleted notes drop the card and its edges", () => {
	const first = syncDesk(empty(), [note("a.md"), note("b.md")], opts);
	const [a, b] = first.data.nodes.filter((x) => x.type === "file");
	first.data.edges.push({ id: "e", fromNode: a.id, toNode: b.id });
	const removed = syncDesk(first.data, [note("b.md")], { ...opts, onComplete: "remove" });
	assert.deepEqual(removed.removed, ["a.md"]);
	assert.equal(removed.data.edges.length, 0);
	const deleted = syncDesk(first.data, [note("b.md")], { ...opts, exists: (p) => p !== "a.md" });
	assert.deepEqual(deleted.removed, ["a.md"]);
});

test("cards the user added by hand are never touched or duplicated", () => {
	const data: CanvasData = {
		nodes: [{ id: "mine", type: "file", file: "a.md", x: 0, y: 0, width: 300, height: 300, color: "1" }],
		edges: [],
	};
	const r = syncDesk(data, [note("a.md", 0, 2)], opts);
	assert.equal(r.changed, false);
	const r2 = syncDesk(data, [note("a.md")], opts);
	assert.equal(r2.changed, false);
});

test("zones: a card belongs to the smallest labelled group around its centre", () => {
	const data: CanvasData = {
		nodes: [
			{ id: "g1", type: "group", label: "This week", x: 0, y: 0, width: 2000, height: 2000 },
			{ id: "g2", type: "group", label: "Today", x: 0, y: 0, width: 600, height: 600 },
			{ id: "1", type: "file", file: "today.md", x: 50, y: 50, width: 400, height: 400 },
			{ id: "2", type: "file", file: "week.md", x: 1000, y: 1000, width: 400, height: 400 },
			{ id: "3", type: "file", file: "free.md", x: 9000, y: 0, width: 400, height: 400 },
		],
		edges: [],
	};
	assert.deepEqual(Object.fromEntries(computeZones(data)), {
		"today.md": "Today",
		"week.md": "This week",
		"free.md": null,
	});
});
