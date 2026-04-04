# Product Design Record (PDR) - OnPoint

## 1. Introduzione
Questo documento funge da linea guida per la progettazione e lo sviluppo di **OnPoint**, un'applicazione web HTML per la gestione delle task (To-Do List). Questo file verrà aggiornato iterativamente ad ogni nuova richiesta per mantenere traccia delle funzionalità e delle specifiche dell'app.

L'app implementa la **persistenza automatica dello stato** tramite salvataggio offline locale (`localStorage`), che salva e ricarica i task in tempo reale ogni volta che chiudi e riapri l'applicazione.

## 2. Obiettivi e Funzionalità
- **Struttura dei Dati**: Le task devono essere rappresentate sotto forma di "blocchetti" visivi distinti.
- **Design della Task**: 
  - Sulla sinistra c'è un quadratino per la selezione rapida.
  - Subito a destra del quadratino c'è un'icona "Stella" vuota (☆) colorata di azzurro. Al click, si riempie di oro lucente (★) e tutta la riga torna ad evidenziarsi come prima.
- **Logo**: L'app utilizza un'icona personalizzata (`icon.png`) caricata dall'utente.

## 3. Layout e Sezioni
L'app è divisa verticalmente in due sezioni principali:
- **To Do**: Per le task immediate.
- **Will Do**: Per le task future o meno urgenti.

## 4. UI/UX
- **Design AMOLED**: L'app utilizza un tema scuro profondo (nero puro) per risparmiare batteria e migliorare il contrasto.
- **Micro-animazioni**: Transizioni fluide per l'aggiunta, la rimozione e il trascinamento delle task.
- **Toolbar**: Accesso rapido a ricerca, cronologia e impostazioni.

## 5. Gestione Task
- **Drag & Drop**: Possibilità di riordinare le task o spostarle tra le sezioni trascinandole.
- **Cestino**: Una zona di eliminazione (violetta) che appare in alto durante il trascinamento.
- **Cronologia**: Possibilità di recuperare task eliminate di recente.

## 6. Personalizzazione
- **Temi e Colore**: L'app supporta diversi temi (Cyan, Emerald, Violet, Coral, Gold).
- **Light Flash Fix**: La zona del cestino è stata configurata per nascondere la sua ombra violetta quando non è attiva, eliminando il "riflesso" luminoso che si vedeva in alto nella homepage.

## 10. Stack Tecnologico e Architettura
- **Single-File Architecture**: Per massima compatibilità Android/Offline, l'intero codice (HTML/CSS/JS) è inlined in `index.html`.
- **Librerie**: SortableJS locale per il drag & drop avanzato e multi-selezione.
- **Persistenza**: `localStorage` per il salvataggio automatico sul dispositivo.

## 11. Risoluzione Problemi e Fix Noti
- **GitHub Pages Deployment (Drag & Drop)**: Corretti i percorsi dei file per le librerie locali (come `Sortable.min.js`), rimuovendo i prefissi di cartell (es. `js/`) non validi per assicurare il corretto funzionamento del Drag & Drop su server case-sensitive e strict path come GitHub Pages.

---
*Nota: Secondo la regola globale stabilita, questo file (pdr.md) verrà aggiornato in automatico con le nuove modifiche richieste alla fine di ogni iterazione.*
