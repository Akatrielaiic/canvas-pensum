import assert from "node:assert/strict";
import { test } from "node:test";
import type { CanvasData } from "../src/canvas.ts";
import { DONE_ID, INBOX_ID, type SyncOptions, addZone, moveToZone, syncDesk } from "../src/sync.ts";
import { centreInside, computeZones } from "../src/zones.ts";

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

test("due dates colour our cards, but never override a colour the user picked", () => {
	const today = "2026-11-16";
	const notes = [
		{ path: "late.md", open: 1, done: 0, due: "2026-11-10" },
		{ path: "now.md", open: 1, done: 0, due: today },
		{ path: "later.md", open: 1, done: 0, due: "2026-12-01" },
		{ path: "mine.md", open: 1, done: 0, due: "2026-11-10" },
	];
	const first = syncDesk(empty(), notes, { ...opts, today });
	const color = (r: typeof first, p: string) => r.data.nodes.find((x) => x.file === p)!.color;
	assert.equal(color(first, "late.md"), "1");
	assert.equal(color(first, "now.md"), "2");
	assert.equal(color(first, "later.md"), undefined);

	first.data.nodes.find((x) => x.file === "mine.md")!.color = "6";
	notes[0].due = "2026-12-24"; // rescheduled
	const second = syncDesk(first.data, notes, { ...opts, today });
	assert.equal(color(second, "late.md"), undefined);
	assert.equal(color(second, "mine.md"), "6");
	assert.equal(syncDesk(second.data, notes, { ...opts, today }).changed, false);
});

test("move mode files finished cards in the Done zone and brings reopened ones back", () => {
	const move = { ...opts, onComplete: "move" as const };
	const first = syncDesk(empty(), [note("a.md"), note("b.md")], move);
	assert.equal(first.data.nodes.find((x) => x.id === DONE_ID), undefined, "no Done zone until needed");

	const done = syncDesk(first.data, [note("a.md", 0, 1), note("b.md")], move);
	const zone = (r: typeof done, id: string) => r.data.nodes.find((x) => x.id === id)!;
	const card = (r: typeof done, p: string) => r.data.nodes.find((x) => x.file === p)!;
	assert.deepEqual(done.completed, ["a.md"]);
	assert.equal(card(done, "a.md").color, "4");
	assert.ok(centreInside(card(done, "a.md"), zone(done, DONE_ID)));
	assert.ok(!overlap(zone(done, DONE_ID), zone(done, INBOX_ID)), "Done zone is clear of the Inbox");
	assert.deepEqual(card(done, "b.md"), card(first, "b.md"), "other cards untouched");
	assert.equal(syncDesk(done.data, [note("a.md", 0, 1), note("b.md")], move).changed, false);

	const reopened = syncDesk(done.data, [note("a.md"), note("b.md")], move);
	assert.deepEqual(reopened.reopened, ["a.md"]);
	assert.ok(centreInside(card(reopened, "a.md"), zone(reopened, INBOX_ID)));
	assert.ok(!overlap(card(reopened, "a.md"), card(reopened, "b.md")));
	assert.equal(syncDesk(reopened.data, [note("a.md"), note("b.md")], move).changed, false);

	// A finished card the user deleted from the desk does not come back.
	const cleared = { ...done.data, nodes: done.data.nodes.filter((x) => x.file !== "a.md") };
	assert.equal(syncDesk(cleared, [note("a.md", 0, 1), note("b.md")], move).changed, false);
});

test("zones grow around cards dropped in them, and cards inherit the zone colour", () => {
	const zoned = { ...opts, growZones: true, inheritZoneColor: true };
	const first = syncDesk(empty(), [note("a.md"), note("b.md")], zoned);
	const data = first.data;
	data.nodes.unshift({ id: "g", type: "group", label: "Today", color: "5", x: 3000, y: 0, width: 300, height: 300 });
	const a = data.nodes.find((x) => x.file === "a.md")!;
	a.x = 3050; // centre lands inside the small zone, the card sticks out
	a.y = 50;

	const r = syncDesk(data, [note("a.md"), note("b.md")], zoned);
	const g = r.data.nodes.find((x) => x.id === "g")!;
	const moved = r.data.nodes.find((x) => x.file === "a.md")!;
	assert.deepEqual([moved.x, moved.y], [3050, 50], "the card itself is not moved");
	assert.deepEqual([g.x, g.y], [3000, 0], "the zone does not move");
	assert.ok(g.x + g.width >= moved.x + moved.width && g.y + g.height >= moved.y + moved.height, "zone grew");
	assert.equal(moved.color, "5");
	assert.equal(r.data.nodes.find((x) => x.file === "b.md")!.color, undefined);
	assert.equal(syncDesk(r.data, [note("a.md"), note("b.md")], zoned).changed, false);

	// Dragged back out: the inherited colour goes, a hand-picked one would stay.
	moved.x = 9000;
	const out = syncDesk(r.data, [note("a.md"), note("b.md")], zoned);
	assert.equal(out.data.nodes.find((x) => x.file === "a.md")!.color, undefined);
	const b = out.data.nodes.find((x) => x.file === "b.md")!;
	b.color = "6";
	b.x = 3050;
	b.y = 50;
	assert.equal(syncDesk(out.data, [note("a.md"), note("b.md")], zoned).data.nodes.find((x) => x.file === "b.md")!.color, "6");
});

test("new zones line up to the right of the Inbox without overlapping anything", () => {
	const first = syncDesk(empty(), [note("a.md"), note("b.md"), note("c.md")], opts);
	const one = addZone(first.data, { label: "Today", color: "5" }, opts, () => "z1");
	const two = addZone(one.data, { label: "Waiting" }, opts, () => "z2");
	const inbox = two.data.nodes.find((x) => x.id === INBOX_ID)!;
	const [z1, z2] = ["z1", "z2"].map((id) => two.data.nodes.find((x) => x.id === id)!);
	assert.equal(z1.color, "5");
	assert.equal(z2.color, undefined);
	assert.deepEqual([z1.y, z2.y], [inbox.y, inbox.y], "same row as the Inbox");
	assert.ok(z1.x >= inbox.x + inbox.width && z2.x >= z1.x + z1.width, "left to right");
	for (const z of [z1, z2]) for (const n of two.data.nodes) if (n !== z) assert.ok(!overlap(z, n), "no overlap");
	assert.equal(syncDesk(two.data, [note("a.md"), note("b.md"), note("c.md")], opts).changed, false);
	assert.equal(addZone(empty(), { label: "Solo" }, opts).zone.x, 0, "works on an empty canvas");
});

test("move to zone places cards in free slots and grows the zone", () => {
	const notes = [note("a.md"), note("b.md"), note("c.md")];
	const first = syncDesk(empty(), notes, opts);
	const { data, zone } = addZone(first.data, { label: "Today", color: "5" }, { ...opts, columns: 1 }, () => "z");
	const ids = data.nodes.filter((x) => x.type === "file").map((x) => x.id);
	const moved = moveToZone(data, [...ids, "z", INBOX_ID], "z", { ...opts, columns: 1 })!;
	const z = moved.nodes.find((x) => x.id === "z")!;
	const cards = moved.nodes.filter((x) => x.type === "file");
	assert.deepEqual([z.x, z.y], [zone.x, zone.y]);
	for (const c of cards) {
		assert.ok(centreInside(c, z));
		assert.ok(c.y + c.height <= z.y + z.height && c.x + c.width <= z.x + z.width, "zone grew to fit");
	}
	for (let i = 0; i < cards.length; i++)
		for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]));
	assert.equal(moveToZone(moved, ids, "z", opts), null, "already there: nothing to do");
	assert.equal(moveToZone(moved, ids, "missing", opts), null);
	// The next sync gives the cards the zone's colour.
	const synced = syncDesk(moved, notes, { ...opts, inheritZoneColor: true });
	assert.ok(synced.data.nodes.filter((x) => x.type === "file").every((x) => x.color === "5"));
});
