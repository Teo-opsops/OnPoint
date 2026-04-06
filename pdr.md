# Product Design Record (PDR) - OnPoint

## 1. Introduzione
Questo documento funge da linea guida per la progettazione e lo sviluppo di **OnPoint**, un'applicazione web HTML per la gestione delle task (To-Do List). Questo file verrà aggiornato iterativamente ad ogni nuova richiesta per mantenere traccia delle funzionalità e delle specifiche dell'app.

L'app implementa la **persistenza automatica dello stato** tramite salvataggio offline locale (`IndexedDB` con fallback su `localStorage`), che salva e ricarica i task in tempo reale ogni volta che chiudi e riapri l'applicazione.

## 2. Obiettivi e Funzionalità
- **Struttura dei Dati**: Le task devono essere rappresentate sotto forma di "blocchetti" visivi distinti.
- **Design della Task**: 
  - A sinistra c'è un'icona "Stella" vuota (☆) colorata di azzurro. Al click, si riempie di oro lucente (★) e la task viene marcata come prioritaria.
- **Logo**: L'app utilizza un'icona personalizzata (`icon.png`) caricata dall'utente.

## 3. Layout e Sezioni
L'app è divisa verticalmente in due sezioni principali:
- **To Do**: Per le task immediate.
- **Will Do**: Per le task future o meno urgenti.

## 4. UI/UX — Redesign Notes-Style
- **Design ispirato all'app Notes**: L'intera interfaccia è stata ridisegnata per essere coerente con l'app Notes, mantenendo lo stesso stile minimale, la stessa palette di colori e le stesse dimensioni del testo.
- **Top Bar**: Il titolo "Tasks" è scritto come "Notes" nella top bar (font 1.25rem, peso 600, colore accent).
- **Tema di default bianco**: L'accent color di default è bianco (`#ffffff`), come nell'app Notes. Disponibili anche i temi Cyan, Emerald, Violet, Coral e Gold.
- **Card/Blocchi task**: Le task sono stilizzate come le cartelle/note di Notes — card con background `bg-card`, bordo trasparente, border-radius 12px, padding 14px 16px, gap 2px tra le card (non 0.75rem).
- **Testo delle task**: Font 0.95rem, weight 500, con word-break attivato per mandare a capo i testi più lunghi (rispetto a un singolo rigo fisso), permettendo alla card di crescere in altezza secondo necessità.
- **Eliminazione per scorrimento (swipe-to-delete)**: Implementazione identica all'app Notes. Lo sfondo dello swipe è trasparente con icona cestino bianca (colore `--accent`) che appare dalla direzione dello scorrimento. Il gesto utilizza Pointer Events con gestione corretta di `pointerdown`/`pointermove`/`pointerup`, cattura del pointer solo dopo aver determinato che il gesto è orizzontale (non verticale), e reset completo di tutti i flag di stato al termine del gesto. L'animazione di ingresso delle card viene neutralizzata con `animationend` + `opacity: 1` per consentire le trasformazioni JS.
- **Add Buttons**: In cima alla lista sono presenti due pulsanti rettangolari ("To Do" e "Will Do") affiancati per aggiungere velocemente nuove task, in coerenza con la grafica originaria ma riadattati allo stile Notes.
- **AMOLED Mode**: Background nero puro (#000000) di default con toggle (slider a pallino visibile) nelle impostazioni.
- **Micro-animazioni**: Transizioni fluide con `slideUp` staggered per l'ingresso delle card.

## 5. Gestione Task
- **Riordino Task**: Le task ora possono essere riordinate tramite trascinamento (drag-and-drop) tenendole premute. È stata reintegrata la libreria SortableJS configurata con un ritardo (`delay: 400ms`) che attiva il trascinamento solo dopo la pressione prolungata, funzionando uniformemente sia con tocco che con mouse. Questo permette la pacifica convivenza con lo swipe-to-delete e lo scroll verticale.
- **Eliminazione Immediata**: Trascinando una task lateralmente oltre una certa soglia (~80px), la task viene eliminata istantaneamente e rimossa dalla lista con un'animazione di collasso verticale coerente con il design di Notes. Il pointer non viene catturato durante il `pointerdown` per non bloccare lo scroll nativo verticale; viene catturato solo nel `pointermove` quando il gesto è confermato come orizzontale.
- **Cronologia**: Possibilità di recuperare task eliminate di recente tramite modal dedicata. Ogni task eliminata mostra un pulsante di ripristino (icona rewind) che la reinserisce nella lista originale (To Do o Will Do).

## 6. Personalizzazione
- **Temi e Colore**: L'app supporta diversi temi (Cyan, Emerald, Violet, Coral, Gold, White). Il tema di default è White.
- **Impostazioni**: Modale in stile Notes con card raggruppate, toggle switch per AMOLED. Bottoni "Esporta" (icona download) e "Importa" (icona upload) con testo minimale, e bottone "Cancella tutti i dati".

## 7. Struttura dei File
- **`index.html`**: Struttura HTML con top-bar, content-area scrollabile, FAB, modali.
- **`style.css`**: File CSS esterno con design system identico a Notes (variabili CSS, transizioni, layout).
- **`app.js`**: Logica applicativa esterna (rendering, swipe-to-delete con Pointer Events, state management).

## 8. Stack Tecnologico e Architettura
- **Architettura a file separati**: HTML, CSS e JS in file distinti per manutenibilità.
- **Nessuna libreria esterna**: L'app utilizza solo API native del browser (Pointer Events per lo swipe, localStorage per la persistenza).
- **Persistenza**: `IndexedDB` per il salvataggio automatico e duraturo sul dispositivo.
- **PWA**: Service Worker configurato con una strategia *Network-First* rigorosa (`cache: 'no-store'`), previene il caricamento di file stantii dalla cache HTTP del browser e assicura che l'app scarichi e si aggiorni immediatamente all'ultima versione ad ogni avvio online (gestendo contemporaneamente il fallback offline corretto ed aggiornando la cache dinamicamente).

- **Migrazione IndexedDB**: Implementato un sistema asincrono basato su IndexedDB per memorizzare in modo permanente i task, prevenendone la cancellazione in caso di pulizia dei dati di navigazione dal browser.

---
*Nota: Secondo la regola globale stabilita, questo file (pdr.md) verrà aggiornato in automatico con le nuove modifiche richieste alla fine di ogni iterazione.*
