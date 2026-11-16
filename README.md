# Canvas Pensum

A spatial task manager for [Obsidian](https://obsidian.md), built on the native Canvas.

Every note that has open tasks (`- [ ]`) lands as a card on one infinite canvas, the **Pensatorium**. You arrange the cards by hand; the plugin only keeps it complete.

> Status: early prototype. Not yet in the community plugin directory.

## How it works

- **Open Pensatorium** (ribbon icon or command) creates `Pensatorium.canvas` and fills it.
- New notes with open tasks appear in the **Inbox** group. Drag them wherever you like.
- Cards are the notes themselves: tick a checkbox on the card and the note is updated. Nothing is copied.
- When a note has no open tasks left, its card turns green and moves to the **Done** zone (or stays put, or is removed: your choice). Delete cards from Done whenever you like; the notes are untouched, and a note only comes back if it gets a new open task.
- Apart from that, the plugin never moves or deletes a card you placed, and never touches cards you added by hand.

### With the Tasks plugin

If the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin is installed, the Pensatorium uses it automatically; there is nothing to configure.

- What counts as a task, and as done, is decided by Tasks: its global filter and custom statuses apply.
- Cards turn red when a task in the note is overdue and orange when one is due or scheduled today. A colour you pick yourself is left alone, except red, orange and green, which the plugin manages.
- **Add task** opens the Tasks editor (dates, priority, recurrence) and saves the task to your capture note (`Inbox.md` by default), which then shows up on the Pensatorium.

Without Tasks, the Pensatorium works on plain checkboxes and **Add task** is a one-line prompt.

### Zones

A zone is a named group on the Pensatorium (`Today`, `This week`, `Waiting`…).

- **New zone** (command) asks for a name and a colour and adds an empty zone next to the Inbox. Any group you draw yourself is a zone too.
- **Move to zone…** in a card's menu (or the *Move selected cards to zone* command) sends the selected cards to a zone you pick from a list. Dragging works as well.
- Drop a card in a zone and the zone grows to contain it. Zones never shrink or move.
- Give a zone a colour and its cards take it. Done (green) and due-date colours win over the zone's; a colour you set on a card by hand is kept, unless it matches a zone colour.

With *Write zone to note property* enabled, the label of the group a card sits in is written to the note as `pensum-zone: Today`, so your layout can be queried from Bases, Dataview or search.

### Leaving notes out

- Exclude folders in the settings (e.g. `Templates`).
- Restrict the Pensatorium to one tag (e.g. `#todo`).
- Add `pensum: false` to a note's properties.

## Mobile

Works on mobile: it uses only the vault and metadata-cache APIs and the built-in Canvas.

## Development

```bash
npm install
npm run dev    # watch build -> main.js
npm test       # sync logic, no Obsidian needed
npm run build  # type-check + production build
```

To try it, clone (or symlink) this folder into `<vault>/.obsidian/plugins/canvas-pensum/` and enable the plugin. Use a test vault.

Releasing: `npm version patch`, then push the tag; the release workflow attaches `main.js` and `manifest.json`.

Design notes and roadmap: [docs/FRAMEWORK.md](docs/FRAMEWORK.md) (Italian).

## License

MIT
