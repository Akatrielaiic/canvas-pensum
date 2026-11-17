# Changelog

## 0.11.0

- **Zone map.** Zones joined to the Inbox by arrows sit around it, on both sides, stacked and evenly spaced, and keep that order as they grow and shrink: when one fills up, the others make room; when it empties, they close the gap. Drag a zone above or below another, or to the other side of the Inbox, to reorder it.
- With a zone selected, **Shift+Tab** adds a zone beside it and **Shift+Enter** one below it, joined by an arrow, with the name open for typing.
- **Arrange zones around Inbox** (command) joins every zone, Done included, to the Inbox. On a new Pensatorium this happens by itself: new zones are joined to the Inbox as they are created. Existing desks don't change until you run the command.

## 0.10.1

- **Add task to a note** on the Pensatorium zooms to the note's card, as *Zoom to selection* does, before placing the cursor on the new task. Before, it only scrolled the card into view.

## 0.10.0

- **Keys moved to the canvas.** Cmd/Ctrl+Shift+A (add a task) and Cmd/Ctrl+Shift+M (move to zone) are no longer default global hotkeys, which Obsidian asks plugins not to set. They now live on the canvas views: A works on any canvas, M on the Pensatorium, and a setting turns them off.
- **After updating:** Cmd/Ctrl+Shift+A no longer works outside a canvas until you press *Use ⇧⌘A everywhere* in the settings (one click), or bind a key in Settings → Hotkeys.

## 0.9.1

- *Add task to a note* is listed in the help of every canvas, not only the Pensatorium's.

## 0.9.0

- **Keys in the canvas help.** The canvas help (the ? among the canvas controls) lists Canvas Pensum's keys below Canvas's own, with any hotkey you changed.
- **Guide card.** A new Pensatorium starts with a card that explains Inbox, zones, Done and how to add tasks. *Add the guide card* puts it on an existing one.
- **Add task to this note** in a card's menu.
- The settings start with a short "How it works".

## 0.8.x

- **On the Pensatorium, a new task is typed in the note's card.** *Add task to a note* writes the day's heading and an empty task, then opens the card with the cursor right after `- [ ] `. Anywhere else the task is typed in a one-line box.
- A larger Pensatorium icon.

## 0.7.x

- **Add task to a note** (Cmd/Ctrl+Shift+A, and a button among the canvas controls): pick a note with search, or type a new name to create it. The task goes at the top of the note, under a heading that links to the day (`### [[2026-11-16]]`).

## 0.6.x

- **Responsive zones.** A zone wraps its cards and follows them, shrinking as well as growing, down to the size of an empty zone.
- The zone code moved to its own file, shared with Canvas Arbor; with both plugins on, Canvas Pensum looks after the Pensatorium and Canvas Arbor after every other canvas.
- The *Move to zone* key works in both plugins: each hands it to the other on the canvas it does not look after.
- The Pensatorium has its own icon, a small temple with a tick.

## 0.5.0

- **Tidy zones.** Cards reached by arrows belong to their parent's zone; resizing a card or adding children pushes overlapping cards and zones apart, to the right or down. Cards joined by arrows move as one piece.
- An open canvas is updated card by card, so a card being typed in is not disturbed.

## 0.4.x

- *Move to zone*: typing a name that does not exist creates the zone. The cards an arrow leads to move along and keep their arrangement, also on the way to Done.
- Cmd/Ctrl+Shift+M for *Move selected cards to zone*.
- A funding link.

## 0.3.0

- **New zone** command (name and colour) and **Move to zone…** in a card's menu.

## 0.2.x

- **Done zone.** A note with no open tasks left turns green and moves to Done; reopened, it goes back to the Inbox.
- Zones grow to hold the cards dropped in them, and cards take their zone's colour.
- Renamed from Spatial Tasks to **Canvas Pensum**; the desk became the **Pensatorium**.

## 0.1.0

- First version: every note with open tasks lands as a card on one canvas, in the Inbox. Completed notes turn green. Zones can be written to a note property. Folder and tag filters.
- Works with the Tasks plugin when it is installed: its global filter, custom statuses and due dates (red when overdue, orange when due today).
