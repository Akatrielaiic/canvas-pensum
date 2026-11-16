# Canvas Pensum

A spatial task manager for [Obsidian](https://obsidian.md), built on the native Canvas.

Every note that has open tasks (`- [ ]`) lands as a card on one infinite canvas, the **Pensatorium**. You arrange the cards by hand; the plugin only keeps it complete.

<!-- GIF (uncomment when recorded): ![A task written in a note appears as a card in the Inbox](docs/media/task-to-card.gif) -->

> Status: early, in active development.

## How it works

- **Open Pensatorium** (ribbon icon or command) creates `Pensatorium.canvas` and fills it.
- New notes with open tasks appear in the **Inbox** group. Drag them wherever you like.
- Cards are the notes themselves: tick a checkbox on the card and the note is updated. Nothing is copied.
- When a note has no open tasks left, its card turns green and moves to the **Done** zone, along with the cards its arrows lead to (or stays put, or is removed: your choice). Delete cards from Done whenever you like; the notes are untouched, and a note only comes back if it gets a new open task.
- Apart from that, the plugin never moves or deletes a card you placed, and never touches cards you added by hand.

<!-- GIF (uncomment when recorded): ![Ticking the last task turns the card green and moves it to Done](docs/media/done.gif) -->

### Adding tasks

- **Add task to this note** in a card's menu does the same for that card's note, without asking which.
- **Add task to a note** (**Cmd/Ctrl+Shift+A**, or the button among the canvas controls on the right of the Pensatorium) asks which note, with search. Type a name that doesn't exist and press Enter to create the note. With one card selected, its note is the first suggestion. On the Pensatorium, the empty task is written and the cursor lands on it inside the note's card, so you type it in the note itself, with the Tasks plugin's suggestions. Anywhere else, you type the task in a one-line box and press Enter, without leaving what you were doing. Either way it goes at the top of the note, below the properties and the title, under a heading that links to the day:

  ```markdown
  ### [[2026-11-16]]
  - [ ] Call back
  ```

  A second task on the same day joins that heading. The heading and its date format can be changed or turned off in the settings.
- **Add task** writes to one fixed capture note (`Inbox.md` by default), for things to sort later.
- Or write `- [ ]` straight in a card: cards are the notes themselves.

<!-- GIF (uncomment when recorded): ![Add task to a note: pick the note, the cursor lands in its card](docs/media/add-task.gif) -->

### With the Tasks plugin

If the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin is installed, the Pensatorium uses it automatically; there is nothing to configure.

- What counts as a task, and as done, is decided by Tasks: its global filter and custom statuses apply.
- Cards turn red when a task in the note is overdue and orange when one is due or scheduled today. A colour you pick yourself is left alone, except red, orange and green, which the plugin manages.
- **Add task** opens the Tasks editor (dates, priority, recurrence) and saves the task to your capture note (`Inbox.md` by default), which then shows up on the Pensatorium.

Without Tasks, the Pensatorium works on plain checkboxes and **Add task** is a one-line prompt.

### Zones

A zone is a named group on the Pensatorium (`Today`, `This week`, `Waiting`…).

<!-- GIF (uncomment when recorded): ![Move to zone: select cards, type a new zone name, press Enter](docs/media/move-to-zone.gif) -->
<!-- GIF (uncomment when recorded): ![A zone grows and shrinks as cards are dragged in and out](docs/media/responsive-zone.gif) -->

- **New zone** (command) asks for a name and a colour and adds an empty zone next to the Inbox. Any group you draw yourself is a zone too.
- **Move to zone…** in a card's menu (or the *Move selected cards to zone* command, **Cmd/Ctrl+Shift+M**) sends the selected cards to a zone you pick from a list. Type a name that doesn't exist and press Enter to create that zone on the spot. Cards connected by arrows *from* the card (its children, and theirs) move with it and keep their arrangement. Dragging works as well.
- Zones are responsive: a zone wraps its cards with a margin and follows them. Drop a card in, resize one, add children with arrows, take a card out: the zone grows or shrinks to fit. It never gets smaller than an empty zone, so there is room to drop the next card. An empty zone keeps the size you gave it.
- Nothing overlaps: cards that would are pushed apart (right or down; the card you have selected stays put), and so are neighbouring zones, together with their cards. Cards joined by arrows move as one piece.
- A card reached by an arrow belongs to its parent's zone unless it sits in another zone. To detach it, drop it in another zone or remove the arrow.
- Give a zone a colour and its cards take it. Done (green) and due-date colours win over the zone's; a colour you set on a card by hand is kept, unless it matches a zone colour.

With *Write zone to note property* enabled, the label of the group a card sits in is written to the note as `pensum-zone: Today`, so your layout can be queried from Bases, Dataview or search.

### Finding your way

- A new Pensatorium starts with a **guide card** that explains Inbox, zones, Done and how to add tasks. Delete it when you no longer need it; *Add the guide card* brings it back.
- The canvas help (the **?** among the canvas controls) lists Canvas Pensum's keys below Canvas's own, with the ones you have changed.

### Leaving notes out

- Exclude folders in the settings (e.g. `Templates`).
- Restrict the Pensatorium to one tag (e.g. `#todo`).
- Add `pensum: false` to a note's properties.

## Mobile

Works on mobile: it uses only the vault and metadata-cache APIs and the built-in Canvas.

## Install

Until Canvas Pensum is in the Community plugins directory, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat): *Add beta plugin* → `https://github.com/Akatrielaiic/canvas-pensum`.

## Support

If Canvas Pensum is useful to you, you can [buy me a coffee](https://www.paypal.com/paypalme/nicotio). Thank you!

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
