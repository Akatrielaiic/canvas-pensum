# Canvas Pensum: framework

*Pensum*: il compito da fare. *Pensatorium*: la scrivania, cioè il canvas dove i pensa stanno (nel codice resta "desk").

Documento di lavoro. Fissa i principi da cui deriva ogni decisione, così le iterazioni restano coerenti.


Una scrivania infinita dove compaiono da sole tutte le note con cose da fare, e dove **la posizione è l'informazione**: vicino = collegato, in alto = urgente, dentro un gruppo = in quello stato. Decidi tu cosa significa lo spazio.

## Principi

1. **Canvas nativo, nessuna vista custom.** La scrivania è un normale file `.canvas` (formato aperto JSON Canvas). Pan, zoom, touch, gruppi, frecce, colori: tutto già fatto da Obsidian, anche su mobile. Se disinstalli il plugin, la scrivania resta.
2. **Le card sono le note, non copie.** Ogni card è un nodo `file` che incorpora la nota. Spuntare un task sulla card modifica la nota vera. Niente sincronizzazione bidirezionale, niente stati duplicati.
3. **La posizione è dell'utente, l'ordine è del plugin.** Il plugin piazza le card nuove (Inbox) e archivia quelle completate (Done). Dentro le zone tiene in ordine: le zone avvolgono card e figli (crescono e si restringono), e ciò che si sovrappone viene spinto a destra o in basso. Fuori dalle zone non tocca nulla.
4. **Il plugin possiede solo ciò che crea.** I nodi creati dal plugin hanno id con prefisso `st-`. Tutto il resto del canvas è intoccabile.
5. **Solo metadata cache.** La scansione legge l'indice che Obsidian ha già in memoria, senza aprire file: veloce anche su telefono e su vault grandi.
6. **Lo spazio diventa dato (opzionale).** Il gruppo in cui sta una card può essere scritto nella nota (`pensum-zone: Oggi`), così la disposizione è interrogabile da Bases, Dataview, ricerca.

## Architettura

| File | Ruolo | Dipende da Obsidian |
|---|---|---|
| `src/scanner.ts` | vault → elenco note con task aperti/chiusi | sì |
| `src/zone-engine.ts` | zone: piazzare, spostare, riordinare. Pura, copiata identica in Canvas Arbor | no |
| `src/sync.ts` | (canvas, note) → canvas aggiornato. Funzione pura | no |
| `src/zones.ts` | canvas → zona di ogni nota. Funzione pura | no |
| `src/tasks-plugin.ts` | ponte verso il plugin Tasks (opzionale) | sì |
| `src/main.ts` | comandi, eventi, lettura/scrittura del canvas | sì |
| `src/settings.ts` | impostazioni | sì |

La logica che decide *cosa cambia sul canvas* è pura e coperta da test (`npm test`), perché è la parte dove un bug rovinerebbe una disposizione fatta a mano.

Scrittura del canvas: se la scrivania è aperta si passa dalla vista (`canvas.getData/setData/requestSave`, API interna non documentata, sempre verificata prima dell'uso) per non perdere spostamenti non ancora salvati; altrimenti si modifica il file con `vault.process`.

## Rischi noti

- **API di Tasks**: `getTasks()`, `getState()` e l'evento `cache-update` sono usati da altri plugin ma non sono API pubbliche documentate (lo è solo `apiV1`). Se cambiano, si ricade sui checkbox semplici.
- **API interna del canvas**: può cambiare con un aggiornamento di Obsidian. In quel caso si ricade sulla scrittura del file.
- **Scrivanie molto affollate**: ogni card renderizza una nota intera. Obsidian renderizza solo ciò che è a schermo, ma oltre qualche centinaio di card va verificato su mobile.
- **Granularità**: una card = una nota. Una nota con 30 task è una card sola (vedi roadmap).

## Roadmap

Ordine indicativo; ogni voce va validata con l'uso reale.

- **v0.1 (fatto)**: scrivania, Inbox, completate in verde, zone → proprietà, filtri.
- **Integrazione Tasks (fatto)**: se il plugin Tasks è installato si usa il suo indice (filtro globale, stati personalizzati, date); colore per scadenza; comando "Add task" con l'editor di Tasks.
- **v0.2 (fatto)**: zona Done, zone che si allargano, colore ereditato dalla zona.
- **v0.3 (fatto)**: comando "New zone", "Move to zone…" dal menu della card.
- **v0.4 (fatto)**: zona creata al volo dal selettore; le card figlie (frecce uscenti) seguono la card spostata.
- **v0.5 (fatto)**: zone ordinate (figli inclusi, niente sovrapposizioni, zone vicine spostate); aggiornamenti nodo per nodo che non interrompono la scrittura.
- **v0.6 (fatto)**: zone che si restringono; motore delle zone in `src/zone-engine.ts`, condiviso con Canvas Arbor (Pensum gestisce il Pensatorium, Arbor gli altri canvas).
- **Disposizione iniziale**: al primo riempimento, raggruppare per cartella o tag invece di un'unica Inbox. Comando "riordina Inbox".
- **Card per sezione**: nodo `file` con `subpath` (`#Titolo`) per mostrare solo la sezione con i task, card più compatte.
- **Zone attive**: la zona scrive anche altre proprietà (es. gruppo "Oggi" → `due: <oggi>`), e viceversa una proprietà cambiata altrove sposta la card.
- **Card per singolo task**: nodi testo con link al task d'origine. Richiede sync bidirezionale: farlo solo se la card-nota si rivela troppo grossolana.
- **Più scrivanie**: una per progetto/area, ciascuna con il suo filtro.
- **Priorità di Tasks** sulla card (oggi si usano solo scadenza e data pianificata).

## Domande aperte

- La card deve mostrare la nota intera o solo i task aperti?
- Una nota completata deve restare (verde) come traccia, o sparire in un gruppo "Fatto"?
- Le zone devono essere libere (qualsiasi gruppo) o un set predefinito?
