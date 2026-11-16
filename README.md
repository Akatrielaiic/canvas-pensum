# Spatial Tasks

A spatial task manager for [Obsidian](https://obsidian.md), built on the native Canvas.

Every note that has open tasks (`- [ ]`) lands as a card on one infinite canvas, your **desk**. You arrange the cards by hand; the plugin only keeps the desk complete.

> Status: early prototype (0.1.0). Not yet in the community plugin directory.

## How it works

- **Open task desk** (ribbon icon or command) creates `Task Desk.canvas` and fills it.
- New notes with open tasks appear in the **Inbox** group. Drag them wherever you like.
- Cards are the notes themselves: tick a checkbox on the card and the note is updated. Nothing is copied.
- When a note has no open tasks left, its card turns green (or is removed, your choice).
- The plugin never moves, resizes or deletes anything you placed yourself.

### Zones (optional)

Draw groups on the desk and name them (`Today`, `This week`, `Waiting`…). With *Write zone to note property* enabled, the label of the group a card sits in is written to the note as `desk-zone: Today`, so your layout can be queried from Bases, Dataview or search.

### Leaving notes out

- Exclude folders in the settings (e.g. `Templates`).
- Restrict the desk to one tag (e.g. `#todo`).
- Add `desk: false` to a note's properties.

## Mobile

Works on mobile: it uses only the vault and metadata-cache APIs and the built-in Canvas.

## Development

```bash
npm install
npm run dev    # watch build -> main.js
npm test       # sync logic, no Obsidian needed
npm run build  # type-check + production build
```

To try it, clone (or symlink) this folder into `<vault>/.obsidian/plugins/spatial-tasks/` and enable the plugin. Use a test vault.

Releasing: `npm version patch`, then push the tag; the release workflow attaches `main.js` and `manifest.json`.

Design notes and roadmap: [docs/FRAMEWORK.md](docs/FRAMEWORK.md) (Italian).

## License

MIT
