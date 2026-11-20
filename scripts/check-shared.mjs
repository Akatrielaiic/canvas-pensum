// Canvas Arbor and Canvas Pensum share a few files verbatim. This checks the copies still match.
//
// Compares against the sister repository checked out next to this one (../canvas-…), or, when it
// is not there (CI), against its main branch on GitHub. Exits with 1 when a copy has drifted.
// This file is one of the shared ones.
import { existsSync, readFileSync } from "node:fs";

const SHARED = ["src/zone-engine.ts", "src/help.ts", "src/motion.ts", "scripts/check-shared.mjs"];
const OWNER = "Akatrielaiic";

const self = JSON.parse(readFileSync("manifest.json", "utf8")).id;
const sister = self === "canvas-arbor" ? "canvas-pensum" : "canvas-arbor";

async function sisterCopy(file) {
	const local = `../${sister}/${file}`;
	if (existsSync(local)) return { text: readFileSync(local, "utf8"), from: local };
	const url = `https://raw.githubusercontent.com/${OWNER}/${sister}/main/${file}`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	return { text: await response.text(), from: url };
}

let drifted = 0;
for (const file of SHARED) {
	try {
		const theirs = await sisterCopy(file);
		if (readFileSync(file, "utf8") === theirs.text) {
			console.log(`same     ${file}`);
		} else {
			drifted++;
			console.log(`DIFFERS  ${file}  (compared with ${theirs.from})`);
		}
	} catch (error) {
		drifted++;
		console.log(`MISSING  ${file}  (${error.message})`);
	}
}
if (drifted) {
	console.log(`\n${drifted} shared file(s) differ between ${self} and ${sister}. Bring both copies in line.`);
	process.exit(1);
}
