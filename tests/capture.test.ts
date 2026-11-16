import assert from "node:assert/strict";
import { test } from "node:test";
import { insertAtTop, notePath, withLink } from "../src/capture.ts";

const task = "- [ ] call back";

test("insertAtTop: empty note, plain note, note that starts with tasks", () => {
	assert.equal(insertAtTop("", task), "- [ ] call back\n");
	assert.equal(insertAtTop("Some text\n", task), "- [ ] call back\nSome text\n");
	assert.equal(insertAtTop("- [ ] old\n- [x] done\n", task), "- [ ] call back\n- [ ] old\n- [x] done\n");
});

test("insertAtTop: goes below the properties and the title", () => {
	assert.equal(insertAtTop("---\ntags: [client]\n---\nBody\n", task), "---\ntags: [client]\n---\n- [ ] call back\nBody\n");
	assert.equal(insertAtTop("---\na: 1\n---", task), "---\na: 1\n---\n- [ ] call back\n");
	assert.equal(insertAtTop("# Acme\n\n- [ ] old\n", task), "# Acme\n\n- [ ] call back\n- [ ] old\n");
	assert.equal(insertAtTop("# Acme", task), "# Acme\n- [ ] call back\n");
	assert.equal(
		insertAtTop("---\na: 1\n---\n\n# Acme\n\nNotes\n\n## Later\n", task),
		"---\na: 1\n---\n\n# Acme\n\n- [ ] call back\nNotes\n\n## Later\n",
	);
	// A second-level heading is not the title: the task goes above it.
	assert.equal(insertAtTop("## Section\ntext\n", task), "- [ ] call back\n## Section\ntext\n");
	// A horizontal rule further down is not frontmatter.
	assert.equal(insertAtTop("Intro\n---\nmore\n", task), "- [ ] call back\nIntro\n---\nmore\n");
});

test("withLink puts the link right after the checkbox, before any Tasks fields", () => {
	assert.equal(withLink("- [ ] call back 📅 2026-11-20", "[[2026-11-16]]"), "- [ ] [[2026-11-16]] call back 📅 2026-11-20");
	assert.equal(withLink("* [/] half", "[[d]]"), "* [/] [[d]] half");
	assert.equal(withLink("plain", "[[d]]"), "[[d]] plain");
});

test("notePath cleans a typed name and honours folders", () => {
	assert.equal(notePath("Acme", ""), "Acme.md");
	assert.equal(notePath("Acme", "Clients/"), "Clients/Acme.md");
	assert.equal(notePath("Clients/Acme.md", "Inbox"), "Clients/Acme.md");
	assert.equal(notePath(' Ac:me? [x] ', ""), "Acme x.md");
	assert.equal(notePath("///", ""), "");
});
