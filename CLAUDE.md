# Canvas Pensum: notes for Claude

Obsidian plugin by `Akatrielaiic`. A spatial task manager: every note with open tasks lands as a card on one canvas, the **Pensatorium**. Sister plugin: [Canvas Arbor](https://github.com/Akatrielaiic/canvas-arbor) (mind maps on Canvas). Clone both side by side (`../canvas-arbor`); several things below depend on it.

Read `README.md` (what it does), `docs/FRAMEWORK.md` (principles, architecture, roadmap; in Italian) and `CHANGELOG.md` before changing behaviour.

## Working on this project

- Code, UI text, README and commits are in English.
- Releases are how changes reach the maintainer: he installs through **BRAT** and tests each release in a real vault (Obsidian 1.15 on macOS, also iOS). Nothing is tried until it is released.
- **You cannot run Obsidian.** Anything touching the UI or canvas internals is untested until the maintainer tries it: say so plainly, and say what was verified (tests, build, reading Obsidian's bundle).
- Decisions already taken, don't reopen unprompted: cards show the whole note (no compact cards); no "New zone" button (zones are created from *Move to zone*); Canvas Arbor keeps Enter = new node even inside note cards; no translations.

## Commands

```bash
npm install
npm test              # node --test on tests/*.test.ts (native TypeScript, Node 24+)
npm run build         # tsc --noEmit + esbuild -> main.js
npm run check:shared  # shared files still match Canvas Arbor's copies
```

## Releasing

1. Set the version in `package.json`, then `npm_package_version=X.Y.Z node version-bump.mjs` (updates `manifest.json`, `versions.json`) and `npm install --package-lock-only`.
2. Add a `CHANGELOG.md` entry. Run tests and build.
3. Commit, `git tag X.Y.Z` (no `v`), `git push origin main X.Y.Z`.
4. The `release.yml` workflow builds and creates the GitHub release with `main.js` and `manifest.json`. Check it finished: `gh run watch`, `gh release view X.Y.Z`.

There is no `styles.css`; if one is added, attach it in `release.yml` too.

## Architecture

| File | Role |
|---|---|
| `src/zone-engine.ts` | Pure. Zones: place cards, move them, keep zones wrapped around contents without overlaps. **Shared verbatim with Canvas Arbor.** |
| `src/help.ts` | Adds rows to the canvas help modal. **Shared verbatim with Canvas Arbor.** |
| `src/sync.ts` | Pure. `(canvas data, notes with tasks) -> new canvas data`: Inbox, Done, colours. |
| `src/zones.ts` | Pure. Which labelled zone each note sits in (for the note property). |
| `src/capture.ts` | Pure. Where a captured task goes inside a note. |
| `src/scanner.ts` | Vault -> notes with open/done tasks (Tasks plugin index if present, else metadata cache). |
| `src/tasks-plugin.ts` | Optional bridge to the Tasks plugin. |
| `src/main.ts` | Commands, events, canvas reading/writing, modals. |
| `src/settings.ts` | Settings tab. |

Pure files have no Obsidian imports and are covered by `tests/`. Put new logic there when possible: it is the only part that can be verified without Obsidian.

**Shared files.** `src/zone-engine.ts`, `src/help.ts`, `scripts/check-shared.mjs` exist identically in both repos. Change both copies together and run `npm run check:shared`.

## Things that are easy to get wrong

- **Idempotence.** `syncDesk` and `tidyZones` must change nothing when run twice. The desk's own "modify" event triggers a sync, so a sync that keeps changing things loops forever. Every new rule needs a "second run changes nothing" test.
- **Ownership.** Only cards the plugin created (id prefix `st-`, kept from the first name "Spatial Tasks") are coloured, removed or filed in Done. Cards the user added by hand are only moved by explicit commands and by zone tidying. Don't rename the prefix: existing desks rely on it.
- **Writing an open canvas** (`applyLive` in `main.ts`). Position/size/colour changes go node by node (`moveAndResize`, `setColor`) so a card being typed in is not disturbed. Structural changes use `canvas.setData`, deferred while a node is being edited or dragged. A closed canvas is edited with `vault.process`.
- **Canvas internals are undocumented.** Everything is feature-checked (`?.`) and degrades to doing nothing. To see how Obsidian really behaves, read its bundle: `~/Library/Application Support/obsidian/obsidian-<version>.asar` is readable as text; search it with Python/regex (this is how the points below were established).
- **Keys.** No default hotkeys (Obsidian's guideline; its lint rule cannot be disabled). `Cmd/Ctrl+Shift+A` and `Cmd/Ctrl+Shift+M` are registered on each canvas view's `scope`. A scope runs only the **first** handler registered for a key, and Obsidian runs only the **first** command bound to a hotkey even if its `checkCallback` fails. Canvas Arbor registers `M` too, so each plugin exposes `zoneCommand(checking)` / `zoneKey()` and hands over to the other.
- **Division with Canvas Arbor.** Pensum looks after zones on the Pensatorium (`ownsCanvas(path)`); Arbor on every other canvas.
- **Editing a note card.** A card's embedded note is only loaded while on screen and reloads a moment after the file changes; `startEditing()` does nothing before that. See `writeInCard`. A note with only an empty `- [ ]` may not count as having an open task: `capturing` keeps its card on the desk meanwhile.
- **Zone map** (0.11.0). Arrows between top-level zones make a tree laid out around its root (`arrange` in `zone-engine.ts`, shared with Arbor). **The arrows hold the shape**: a root child's side is its arrow's `fromSide`, siblings come in the order of their arrows; positions never decide, so a dragged zone goes back. Placement and balancing are Arbor's node rules too (`join`, `balanceRoot` in the engine, threshold 5 like Arbor's default `balanceFrom`): a root's new child goes to the side with less reach, from 5 children on the ring is re-split evenly on every add, on Alt moves (swap with the ring neighbour) and on *Arrange zones around Inbox*. Done joins through `joinZoneMap`. Same rules as Arbor's node maps: the root's children clockwise (right top to bottom, then left bottom to top: on the left the first arrow is the bottom zone), deeper levels top to bottom. Alt+Up/Down (`moveMapZone`) move one step and, for the root's children, cross to the other side at the ends. Canvas `setData` keeps existing edges in their old order, so `applyLive` removes the edges first when their order changes. Map zones are never nested, and the sync passes `stay` (card id -> zone id, `this.homes`, plus cards it places itself) so a zone dropped over another doesn't take its cards. It runs inside `tidyZones`, and each map then moves as one piece when pushing overlaps apart. On the desk the root is the Inbox. `zonesOrbitInbox` (sync.ts) decides whether new zones (Done, *New zone*, a new name in *Move to zone*) are joined to the Inbox: yes when it already has a zone arrow or is the only zone. Shift+Tab / Shift+Enter on a selected zone are handled by `onZoneKey` (window capture listener); Arbor leaves them to Pensum on the desk.
- **Membership changes only by hand** (Arbor 0.12.0 / Pensum 0.15.0): `stay` is `Map<id, Home>` (`{zone?, x?, y?}`, no zone = in none). A remembered card keeps its zone, or no zone, unless moved by hand: in the `moved` set when given (Arbor tracks pointer drags in `zones.dragStart/dragEnd`, because its own layouts move nodes too), else when its position differs from the record (Pensum, whose only moves go through the sync). A card moved by hand takes along the cards below it that shared its old zone (`byHandFrom` in `homes`). A card with no record under another card takes that card's zone, once a tidy is remembered (records with a position). Cards in no zone are pushed off the zones (`pushOff`) in `tidyZones` and, for map zones, in `arrangeZoneMaps`.
- **Tasks plugin.** `getTasks()`, `getState()` and the `obsidian-tasks-plugin:cache-update` workspace event are not documented API. Never sync before its state is `Warm`: it returns an empty list and every card would be marked done.

## State and ideas

Not yet done, in rough order of value: verify on iPad; record the GIFs listed in `docs/media/README.md` and uncomment their lines in the README; submit to the community directory (via community.obsidian.md with the maintainer's Obsidian account; he does this himself) after a period of real use.

Ideas discussed and not started: open-task counter in zone labels; "Clear Done" command; distinct look for Inbox/Done (needs a `styles.css`); several Pensatoria, each with its own filter.
