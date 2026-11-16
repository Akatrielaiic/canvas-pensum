# Spatial Tasks: framework

Documento di lavoro. Fissa i principi da cui deriva ogni decisione, così le iterazioni restano coerenti.

## L'idea in una frase

Una scrivania infinita dove compaiono da sole tutte le note con cose da fare, e dove **la posizione è l'informazione**: vicino = collegato, in alto = urgente, dentro un gruppo = in quello stato. Decidi tu cosa significa lo spazio.

## Principi

1. **Canvas nativo, nessuna vista custom.** La scrivania è un normale file `.canvas` (formato aperto JSON Canvas). Pan, zoom, touch, gruppi, frecce, colori: tutto già fatto da Obsidian, anche su mobile. Se disinstalli il plugin, la scrivania resta.
2. **Le card sono le note, non copie.** Ogni card è un nodo `file` che incorpora la nota. Spuntare un task sulla card modifica la nota vera. Niente sincronizzazione bidirezionale, niente stati duplicati.
3. **La posizione è dell'utente.** Il plugin aggiunge card nuove (nell'Inbox) e segnala quelle completate. Non sposta, non ridimensiona e non cancella mai ciò che hai sistemato tu.
4. **Il plugin possiede solo ciò che crea.** I nodi creati dal plugin hanno id con prefisso `st-`. Tutto il resto del canvas è intoccabile.
5. **Solo metadata cache.** La scansione legge l'indice che Obsidian ha già in memoria, senza aprire file: veloce anche su telefono e su vault grandi.
6. **Lo spazio diventa dato (opzionale).** Il gruppo in cui sta una card può essere scritto nella nota (`desk-zone: Oggi`), così la disposizione è interrogabile da Bases, Dataview, ricerca.

## Architettura

| File | Ruolo | Dipende da Obsidian |
|---|---|---|
| `src/scanner.ts` | vault → elenco note con task aperti/chiusi | sì |
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

Ordine indicativo; ogni voce va validata usando la v0.1 per qualche giorno.

- **v0.1 (fatto)**: scrivania, Inbox, completate in verde, zone → proprietà, filtri.
- **Integrazione Tasks (fatto)**: se il plugin Tasks è installato si usa il suo indice (filtro globale, stati personalizzati, date); colore per scadenza; comando "Add task" con l'editor di Tasks.
- **v0.2 Disposizione iniziale**: al primo riempimento, raggruppare per cartella o tag invece di un'unica Inbox. Comando "riordina Inbox".
- **v0.3 Card per sezione**: nodo `file` con `subpath` (`#Titolo`) per mostrare solo la sezione con i task, card più compatte.
- **v0.4 Zone attive**: la zona scrive anche altre proprietà (es. gruppo "Oggi" → `due: <oggi>`), e viceversa una proprietà cambiata altrove sposta la card.
- **v0.5 Card per singolo task**: nodi testo con link al task d'origine. Richiede sync bidirezionale: farlo solo se la card-nota si rivela troppo grossolana.
- **Più scrivanie**: una per progetto/area, ciascuna con il suo filtro.
- **Priorità di Tasks** sulla card (oggi si usano solo scadenza e data pianificata).

## Domande aperte

- La card deve mostrare la nota intera o solo i task aperti?
- Una nota completata deve restare (verde) come traccia, o sparire in un gruppo "Fatto"?
- Le zone devono essere libere (qualsiasi gruppo) o un set predefinito?
