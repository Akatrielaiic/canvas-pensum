# Changelog

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
