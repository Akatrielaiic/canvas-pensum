// Pure: where a captured task goes in a note, and what it looks like.

/**
 * Puts `line` at the top of a note: after the properties (frontmatter) and after the title,
 * when the note opens with a `# Heading`. Everything else keeps its place below.
 */
export function insertAtTop(content: string, line: string): string {
	let head = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/)?.[0] ?? "";
	let body = content.slice(head.length);
	if (head && !head.endsWith("\n")) head += "\n";

	const title = body.match(/^(?:[ \t]*\r?\n)*# [^\n]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/)?.[0];
	if (title) {
		head += title.endsWith("\n") ? title : title + "\n";
		body = body.slice(title.length);
	}
	return head + line + "\n" + body;
}

/**
 * Puts `line` at the top of a note under a heading for the day:
 *
 *     ### [[2026-11-16]]
 *     - [ ] the task
 *
 * If the note already opens with that heading, the task joins it (first in its list) instead
 * of repeating the heading.
 */
export function insertUnderHeading(content: string, heading: string, line: string): string {
	const marker = "\u0000";
	const placed = insertAtTop(content, marker);
	const at = placed.indexOf(marker);
	const head = placed.slice(0, at);
	const body = placed.slice(at + marker.length + 1);
	const first = body.match(/^[^\n]*/)?.[0] ?? "";
	if (first.trim() === heading.trim()) return head + first + "\n" + line + "\n" + body.slice(first.length).replace(/^\r?\n/, "");
	const gap = body && !/^\s*\n/.test(body) ? "\n" : "";
	return head + heading + "\n" + line + "\n" + gap + body;
}

/** A note name typed by hand, made safe as a path: `Clients/Acme` stays a folder and a file. */
export function notePath(name: string, defaultFolder: string): string {
	const clean = name
		.replace(/\.md$/i, "")
		.split("/")
		.map((part) => part.replace(/[\\:*?"<>|#^[\]]/g, "").trim())
		.filter(Boolean)
		.join("/");
	if (!clean) return "";
	const folder = defaultFolder.replace(/^\/+|\/+$/g, "");
	return (clean.includes("/") || !folder ? clean : `${folder}/${clean}`) + ".md";
}
