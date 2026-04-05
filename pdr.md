# Product Design Record (PDR) - OnPoint

## 1. Introduzione
Questo documento funge da linea guida per la progettazione e lo sviluppo di **OnPoint**, un'applicazione web HTML per la gestione delle task (To-Do List). Questo file verrà aggiornato iterativamente ad ogni nuova richiesta per mantenere traccia delle funzionalità e delle specifiche dell'app.

L'app implementa la **persistenza automatica dello stato** tramite salvataggio offline locale (`localStorage`), che salva e ricarica i task in tempo reale ogni volta che chiudi e riapri l'applicazione.

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
- **Testo delle task**: Font 0.95rem, weight 500, con text-overflow ellipsis — identico ai nomi delle note/cartelle in Notes.
- **Eliminazione per scorrimento (swipe-to-delete)**: Niente barra colorata sotto. Lo sfondo dello swipe è trasparente con icona cestino che appare dalla direzione dello scorrimento, come nell'app Notes.
- **Add Buttons**: In cima alla lista sono presenti due pulsanti rettangolari ("To Do" e "Will Do") affiancati per aggiungere velocemente nuove task, in coerenza con la grafica originaria ma riadattati allo stile Notes.
- **AMOLED Mode**: Background nero puro (#000000) di default con toggle (slider a pallino visibile) nelle impostazioni.
- **Micro-animazioni**: Transizioni fluide con `slideUp` staggered per l'ingresso delle card.

## 5. Gestione Task
- **Drag & Drop**: Possibilità di riordinare le task (verticalmente) all'interno o tra le sezioni trascinandole.
- **Eliminazione Immediata**: Trascinando una task lateralmente oltre una certa soglia (~80px), la task viene eliminata istantaneamente e rimossa dalla lista con un'animazione di collasso verticale coerente con il design di Notes.
- **Cronologia**: Possibilità di recuperare task eliminate di recente tramite modal dedicata.

## 6. Personalizzazione
- **Temi e Colore**: L'app supporta diversi temi (Cyan, Emerald, Violet, Coral, Gold, White). Il tema di default è White.
- **Impostazioni**: Modale in stile Notes con card raggruppate, toggle switch per AMOLED, bottoni per export/import/cancella dati.

## 7. Struttura dei File
- **`index.html`**: Struttura HTML con top-bar, content-area scrollabile, FAB, modali.
- **`style.css`**: File CSS esterno con design system identico a Notes (variabili CSS, transizioni, layout).
- **`app.js`**: Logica applicativa esterna (rendering, swipe, state management, Sortable).
- **`Sortable.min.js`**: Libreria locale per il drag & drop.

## 8. Stack Tecnologico e Architettura
- **Architettura a file separati**: HTML, CSS e JS in file distinti per manutenibilità.
- **Librerie**: SortableJS locale per il drag & drop avanzato e multi-selezione.
- **Persistenza**: `localStorage` per il salvataggio automatico sul dispositivo.
- **PWA**: Service Worker e manifest per installazione come app.

---
*Nota: Secondo la regola globale stabilita, questo file (pdr.md) verrà aggiornato in automatico con le nuove modifiche richieste alla fine di ogni iterazione.*
