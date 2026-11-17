import assert from "node:assert/strict";
import { test } from "node:test";
import type { CanvasData } from "../src/canvas.ts";
import { DONE_ID, INBOX_ID, type SyncOptions, addMapZone, addZone, linkZonesTo, moveToZone, syncDesk, tidyZones, zonesOrbitInbox } from "../src/sync.ts";
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
	assert.deepEqual([g.x, g.y], [3050 - opts.gap, 50 - opts.gap], "the zone wraps the card with a margin");
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
	const one = addZone(first.data, { label: "Today", color: "5" }, opts, { newId: () => "z1", anchorId: INBOX_ID });
	const two = addZone(one.data, { label: "Waiting" }, opts, { newId: () => "z2", anchorId: INBOX_ID });
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
	const { data, zone } = addZone(first.data, { label: "Today", color: "5" }, { ...opts, columns: 1 }, { newId: () => "z", anchorId: INBOX_ID });
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

test("move to zone takes the cards the arrows lead to, keeping their arrangement", () => {
	const data: CanvasData = {
		nodes: [
			{ id: "z", type: "group", label: "Today", x: 5000, y: 0, width: 500, height: 500 },
			{ id: "root", type: "file", file: "a.md", x: 0, y: 0, width: 400, height: 400 },
			{ id: "kid", type: "text", x: 500, y: 100, width: 200, height: 60 },
			{ id: "grandkid", type: "text", x: 800, y: 300, width: 200, height: 60 },
			{ id: "parent", type: "text", x: -400, y: 0, width: 200, height: 60 },
			{ id: "loose", type: "text", x: 0, y: 900, width: 200, height: 60 },
		],
		edges: [
			{ id: "e0", fromNode: "parent", toNode: "root" },
			{ id: "e1", fromNode: "root", toNode: "kid" },
			{ id: "e2", fromNode: "kid", toNode: "grandkid" },
			{ id: "e3", fromNode: "grandkid", toNode: "root" }, // a cycle must not hang
		],
	};
	const moved = moveToZone(data, ["root"], "z", opts)!;
	const at = (id: string) => moved.nodes.find((x) => x.id === id)!;
	const z = at("z");
	for (const id of ["root", "kid", "grandkid"]) {
		assert.ok(at(id).x >= z.x && at(id).x + at(id).width <= z.x + z.width, `${id} inside zone (x)`);
		assert.ok(at(id).y >= z.y && at(id).y + at(id).height <= z.y + z.height, `${id} inside zone (y)`);
	}
	assert.deepEqual([at("kid").x - at("root").x, at("kid").y - at("root").y], [500, 100], "shape kept");
	assert.deepEqual([at("grandkid").x - at("root").x, at("grandkid").y - at("root").y], [800, 300]);
	assert.deepEqual([at("parent").x, at("loose").y], [-400, 900], "parents and unrelated cards stay");
	assert.equal(moveToZone(moved, ["root"], "z", opts), null);

	// Selecting a parent and its child moves them once, as one block.
	const both = moveToZone(data, ["kid", "root"], "z", opts)!;
	const b = (id: string) => both.nodes.find((x) => x.id === id)!;
	assert.deepEqual([b("kid").x - b("root").x, b("kid").y - b("root").y], [500, 100]);
});

test("a finished card takes its children to Done, but not notes that are still open", () => {
	const move = { ...opts, onComplete: "move" as const };
	const notes = [note("parent.md"), note("openkid.md")];
	const first = syncDesk(empty(), notes, move);
	const id = (p: string) => first.data.nodes.find((x) => x.file === p)!.id;
	const parent = first.data.nodes.find((x) => x.file === "parent.md")!;
	first.data.nodes.push({ id: "memo", type: "text", x: parent.x + 20, y: parent.y + 2000, width: 200, height: 60 });
	first.data.edges.push(
		{ id: "e1", fromNode: id("parent.md"), toNode: "memo" },
		{ id: "e2", fromNode: id("parent.md"), toNode: id("openkid.md") },
	);

	const after = [note("parent.md", 0, 1), note("openkid.md")];
	const done = syncDesk(first.data, after, move);
	const at = (r: typeof done, key: string) => r.data.nodes.find((x) => x.id === key || x.file === key)!;
	const zone = at(done, DONE_ID);
	assert.ok(centreInside(at(done, "parent.md"), zone));
	assert.ok(centreInside(at(done, "memo"), zone), "the attached memo came along");
	assert.deepEqual(
		[at(done, "memo").x - at(done, "parent.md").x, at(done, "memo").y - at(done, "parent.md").y],
		[20, 2000],
		"arrangement kept",
	);
	assert.ok(zone.y + zone.height >= at(done, "memo").y + 60, "Done grew to hold the block");
	assert.deepEqual(at(done, "openkid.md"), at(first, "openkid.md"), "the open note stayed put");
	assert.equal(syncDesk(done.data, after, move).changed, false);

	// Reopened: back to the Inbox, memo included.
	const back = syncDesk(done.data, notes, move);
	const inbox = at(back, INBOX_ID);
	assert.ok(centreInside(at(back, "parent.md"), inbox));
	assert.deepEqual([at(back, "memo").x - at(back, "parent.md").x, at(back, "memo").y - at(back, "parent.md").y], [20, 2000]);
	assert.equal(syncDesk(back.data, notes, move).changed, false);
});

const contains = (zone: any, n: any) =>
	n.x >= zone.x && n.y >= zone.y && n.x + n.width <= zone.x + zone.width && n.y + n.height <= zone.y + zone.height;

test("tidy: a resized card pushes its neighbours away and the zone grows", () => {
	const data: CanvasData = {
		nodes: [
			{ id: "z", type: "group", label: "Today", x: 0, y: 0, width: 920, height: 480 },
			{ id: "a", type: "file", file: "a.md", x: 40, y: 40, width: 700, height: 400 }, // was 400 wide
			{ id: "b", type: "file", file: "b.md", x: 480, y: 40, width: 400, height: 400 },
			{ id: "free", type: "text", x: 5000, y: 5000, width: 100, height: 100 },
		],
		edges: [],
	};
	const before = JSON.parse(JSON.stringify(data));
	tidyZones(data, opts);
	const [z, a, b, free] = data.nodes;
	assert.deepEqual(a, before.nodes[1], "the resized card stays");
	assert.ok(!overlap(a, b) && b.x >= a.x + a.width, "neighbour moved right");
	assert.ok(contains(z, a) && contains(z, b), "zone holds both");
	assert.deepEqual(free, before.nodes[3], "cards outside zones are left alone");
	const settled = JSON.stringify(data);
	tidyZones(data, opts);
	assert.equal(JSON.stringify(data), settled, "stable");
});

test("tidy: children added outside the zone are taken in, and the tree moves as one", () => {
	const data: CanvasData = {
		nodes: [
			{ id: "z", type: "group", label: "Today", x: 0, y: 0, width: 480, height: 1000 },
			{ id: "next", type: "group", label: "Waiting", x: 560, y: 0, width: 480, height: 480 },
			{ id: "w", type: "file", file: "w.md", x: 600, y: 40, width: 400, height: 400 },
			{ id: "a", type: "file", file: "a.md", x: 40, y: 40, width: 400, height: 400 },
			{ id: "b", type: "file", file: "b.md", x: 40, y: 500, width: 400, height: 400 },
			{ id: "kid", type: "text", x: 500, y: 600, width: 200, height: 60 }, // child of b, outside the zone
			{ id: "elsewhere", type: "text", x: 620, y: 300, width: 100, height: 40 }, // child of a, in another zone
		],
		edges: [
			{ id: "e1", fromNode: "b", toNode: "kid" },
			{ id: "e2", fromNode: "a", toNode: "elsewhere" },
		],
	};
	tidyZones(data, opts);
	const at = (id: string) => data.nodes.find((x) => x.id === id)!;
	assert.ok(contains(at("z"), at("kid")), "zone grew around the new child");
	assert.deepEqual([at("kid").x - at("b").x, at("kid").y - at("b").y], [460, 100], "tree kept its shape");
	assert.ok(!overlap(at("z"), at("next")), "the neighbouring zone was pushed away");
	assert.ok(contains(at("next"), at("w")) && contains(at("next"), at("elsewhere")), "with its cards");
	assert.ok(!contains(at("z"), at("elsewhere")), "a child living in another zone stays there");
	const settled = JSON.stringify(data);
	tidyZones(data, opts);
	assert.equal(JSON.stringify(data), settled, "stable");
});

test("tidy: the pinned card stays even when it is not the top-left one", () => {
	const make = (): CanvasData => ({
		nodes: [
			{ id: "z", type: "group", label: "Today", x: 0, y: 0, width: 1000, height: 1000 },
			{ id: "a", type: "text", x: 40, y: 40, width: 300, height: 300 },
			{ id: "b", type: "text", x: 200, y: 200, width: 300, height: 300 },
		],
		edges: [],
	});
	const plain = make();
	tidyZones(plain, opts);
	assert.deepEqual([plain.nodes[1].x, plain.nodes[1].y], [40, 40]);
	const pinned = make();
	tidyZones(pinned, opts, ["b"]);
	assert.deepEqual([pinned.nodes[2].x, pinned.nodes[2].y], [200, 200]);
	assert.ok(!overlap(pinned.nodes[1], pinned.nodes[2]));
});

test("tidy inside a sync settles in one go", () => {
	const zoned = { ...opts, growZones: true, onComplete: "move" as const };
	const notes = [note("a.md"), note("b.md"), note("c.md")];
	const first = syncDesk(empty(), notes, zoned);
	const a = first.data.nodes.find((x) => x.file === "a.md")!;
	a.width = 900;
	a.height = 900;
	const r = syncDesk(first.data, notes, zoned);
	const cards = r.data.nodes.filter((x) => x.type === "file");
	for (let i = 0; i < cards.length; i++)
		for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]));
	const inbox = r.data.nodes.find((x) => x.id === INBOX_ID)!;
	assert.ok(cards.every((c) => contains(inbox, c)));
	assert.equal(syncDesk(r.data, notes, zoned).changed, false);
});

test("tidy: a zone shrinks when cards leave or get smaller, down to the size of an empty zone", () => {
	const data: CanvasData = {
		nodes: [
			{ id: "z", type: "group", label: "Today", x: 0, y: 0, width: 3000, height: 2000 },
			{ id: "empty", type: "group", label: "Later", x: 5000, y: 0, width: 3000, height: 2000 },
			{ id: "a", type: "text", x: 1000, y: 500, width: 400, height: 400 },
			{ id: "b", type: "text", x: 1500, y: 500, width: 400, height: 900 },
			{ id: "c", type: "text", x: 1000, y: 1500, width: 400, height: 400 },
		],
		edges: [],
	};
	const at = (id: string) => data.nodes.find((x) => x.id === id)!;
	const box = (id: string) => [at(id).x, at(id).y, at(id).width, at(id).height];
	tidyZones(data, opts);
	assert.deepEqual(box("z"), [960, 460, 980, 1480], "wraps a, b and c with a 40px margin");
	assert.deepEqual(box("empty"), [5000, 0, 3000, 2000], "an empty zone keeps its size");
	assert.deepEqual([at("a").x, at("c").y], [1000, 1500], "cards did not move");

	at("c").x = 9000; // dragged out
	at("b").height = 400; // made smaller
	tidyZones(data, opts);
	assert.deepEqual(box("z"), [960, 460, 980, 480]);

	at("b").y = 9000; // out as well: one card left, the zone stops at the empty-zone size
	tidyZones(data, opts);
	assert.deepEqual(box("z"), [960, 460, 2 * 440 + 40, 480]);
	const settled = JSON.stringify(data);
	tidyZones(data, opts);
	assert.equal(JSON.stringify(data), settled, "stable");
});

test("zone map: a new Pensatorium's Done zone is joined to the Inbox and sits beside it", () => {
	const first = syncDesk(empty(), [note("a.md"), note("b.md")], { ...opts, onComplete: "move", growZones: true });
	assert.ok(zonesOrbitInbox(first.data), "only the Inbox: zones will orbit it");
	const second = syncDesk(first.data, [note("a.md", 0, 1), note("b.md")], { ...opts, onComplete: "move", growZones: true });
	const inbox = second.data.nodes.find((x) => x.id === INBOX_ID)!;
	const done = second.data.nodes.find((x) => x.id === DONE_ID)!;
	assert.ok(second.data.edges.some((e) => e.fromNode === INBOX_ID && e.toNode === DONE_ID), "arrow Inbox → Done");
	assert.equal(done.x, inbox.x + inbox.width + 160, "Done one map gap to the right of the Inbox");
	assert.equal(done.y + done.height / 2, inbox.y + inbox.height / 2, "centred on the Inbox");
	const third = syncDesk(second.data, [note("a.md", 0, 1), note("b.md")], { ...opts, onComplete: "move", growZones: true });
	assert.equal(third.changed, false, "second run changes nothing");
});

test("zone map: desks with zones placed by hand are left alone until linked", () => {
	const data: CanvasData = {
		nodes: [
			{ id: INBOX_ID, type: "group", label: "Inbox", x: 0, y: 0, width: 920, height: 480 },
			{ id: "z", type: "group", label: "Today", x: 3000, y: 2000, width: 920, height: 480 },
		],
		edges: [],
	};
	assert.equal(zonesOrbitInbox(data), false);
	const r = syncDesk(data, [], { ...opts, growZones: true });
	assert.equal(r.data.nodes.find((x) => x.id === "z")!.x, 3000, "not moved");
	const linked = linkZonesTo(data, INBOX_ID)!;
	assert.ok(zonesOrbitInbox(linked));
	const arranged = syncDesk(linked, [], { ...opts, growZones: true });
	const z = arranged.data.nodes.find((x) => x.id === "z")!;
	assert.equal(z.x, 920 + 160, "now beside the Inbox");
	assert.equal(syncDesk(arranged.data, [], { ...opts, growZones: true }).changed, false, "second run changes nothing");
	const added = addMapZone(arranged.data, INBOX_ID, "child", opts, { label: "Later" })!;
	const later = added.data.nodes.find((x) => x.id === added.zone.id)!;
	assert.ok(later.x + later.width <= 0, "the next zone balances on the left");
});
