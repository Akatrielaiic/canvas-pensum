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

/** Adds a link (the day's note, say) right after the checkbox: `- [ ] [[2026-11-16]] text`. */
export function withLink(line: string, link: string): string {
	const checkbox = line.match(/^\s*[-*+] \[.\] /)?.[0];
	return checkbox ? checkbox + link + " " + line.slice(checkbox.length) : link + " " + line;
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
