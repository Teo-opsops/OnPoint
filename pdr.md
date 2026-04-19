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
- **Eliminazione per scorrimento (swipe-to-delete)**: Implementazione identica all'app Notes. Lo sfondo dello swipe è trasparente con icona cestino bianca (colore `--accent`) che appare dalla direzione dello scorrimento. Il gesto utilizza Pointer Events con gestione corretta di tutti i flag di stato al termine del gesto. L'animazione di ingresso delle card viene neutralizzata con `animationend` + `opacity: 1` per consentire le trasformazioni JS.
- **Add Buttons**: In cima alla lista sono presenti due pulsanti rettangolari ("To Do" e "Will Do") affiancati per aggiungere velocemente nuove task, in coerenza con la grafica originaria ma riadattati allo stile Notes.
- **AMOLED Mode**: Background nero puro (#000000) di default con toggle (slider a pallino visibile) nelle impostazioni. Il tag `<body>` include la classe `amoled` direttamente nell'HTML per garantire lo sfondo nero puro (#000000) dal primo render/splash screen, evitando il flash della variante grigia (#121212) che si verificava quando la classe veniva applicata solo via JavaScript.
- **Micro-animazioni**: Transizioni fluide con `slideUp` staggered per l'ingresso delle card.

## 5. Gestione Task
- **Riordino Task**: Le task ora possono essere riordinate tramite trascinamento (drag-and-drop) tenendole premute. SortableJS è configurato con `delay: 300ms`, vibrazione aptica sincronizzata all'evento `onChoose`, e modalità **forceFallback** (drag gestito interamente via JS, non tramite HTML5 nativo) per garantire stabilità su dispositivi touch. Dopo il long-press e la vibrazione, il trascinamento rimane agganciato senza richiedere uno spostamento rapido del dito: un listener `touchmove` con `preventDefault()` viene attivato immediatamente in `onChoose` per bloccare lo scroll nativo del browser durante il gap critico, e `fallbackTolerance: 0` elimina la zona morta di 10px post-delay. Il ghost viene appendato al body (`fallbackOnBody: true`) per evitare problemi di clipping.
- **Conflitti Touch Rigorosi (Sortable vs Swipe)**: Per correggere bug in cui il drag smetteva di funzionare o inviava task in fondo alla lista ("ghost drop"), è stata implementata un'esclusione mutua rigorosa tra la libreria Sortable e i listener di swipe (`window.isSortableActive`). I tentativi di swipe vengono istantaneamente abortiti non appena Sortable acquisisce l'elemento (`onChoose`), e viceversa.
- **Salvataggio di Stato Antifragile**: Per prevenire fughe di dati post-gesto, la funzione di sincronizzazione offline (`saveState()`) ora consolida il salvataggio iterando sui nodi strettamente tramite tracciatura ad `ID` univoci in DOM (`seenIds`), anziché fare affidamento sulla tempestività della rimozione delle classi transitorie CSS (`sortable-ghost` e `sortable-drag`).
- **Eliminazione Immediata**: Trascinando una task lateralmente oltre una certa soglia (~80px), la task viene eliminata istantaneamente e rimossa dalla lista con un'animazione di collasso verticale coerente con il design di Notes. Il pointer non viene catturato durante il `pointerdown` per non bloccare lo scroll nativo verticale; viene catturato solo nel `pointermove` quando il gesto è confermato come orizzontale.
- **Cronologia**: Possibilità di recuperare task eliminate di recente tramite modal dedicata. Ogni task eliminata mostra un pulsante di ripristino (icona rewind) che la reinserisce nella lista originale (To Do o Will Do).
- **Ordinamento Task Persistente**: L'ordine delle task stabilito dall'utente viene mantenuto attivamente attraverso ogni chiusura/apertura dell'app. A tale scopo, la funzione di salvataggio (`saveState()`) registra un parametro `orderIndex` allineato all'ordine visibile nel DOM. Questo indice viene impiegato per garantire che esportazioni, importazioni e in particolare le sincronizzazioni e i merge con Google Drive (`mergeTasks`) preservino in ogni caso l'esatta sequenza voluta dall'utente, senza mischiare casualmente le posizioni o resettarle seguendo l'ID cronologico.

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
- **Persistenza Offline e Cloud**:
  - `IndexedDB` e `localStorage` (fallback) per il salvataggio automatico e duraturo sul dispositivo locale, previene cancellazioni indesiderate.
  - Sincronizzazione in tempo reale e in background su **Google Drive** all'interno della cartella invisibile dell'App Data (`appDataFolder`). Il `google-sync.js` implementa un **merge ID-based per-task con timestamp `updatedAt`**: ogni singolo task viene confrontato individualmente tra locale e cloud, conservando sempre la versione più recente. Questo impedisce qualsiasi perdita di dati anche in caso di utilizzo simultaneo da più dispositivi. La risoluzione conflitti (modal interfaccia) viene mostrata al primo accesso quando i dati divergono.
- **PWA**: Service Worker configurato con una strategia *Network-First* rigorosa (`cache: 'no-store'`), previene il caricamento di file stantii dalla cache HTTP del browser e assicura che l'app scarichi e si aggiorni immediatamente all'ultima versione ad ogni avvio online (gestendo contemporaneamente il fallback offline corretto ed aggiornando la cache dinamicamente).
- **EnsureToken Resiliente con Auto-Refresh**: La funzione `ensureToken()` è stata potenziata. L'API obsoleta `gapi.auth.authorize({ immediate: true })`, che risultava rotta nei browser moderni a causa del blocco dei cookie di terze parti, è stata interamente rimossa. Il rinnovo del token avviene ora esclusivamente tramite **GIS (Google Identity Services)** utilizzando `tokenClient.requestAccessToken({ prompt: '' })`. Questo approccio richiede l'apertura di un breve popup che si autochiude in meno di un secondo se l'utente ha già fornito il consenso, garantendo sicurezza ed evasione dai blocchi tracking dei browser moderni.
- **Rilevamento Errori HTTP su Drive**: La funzione `driveFetch()` ora verifica lo stato HTTP della risposta (`response.ok`) e genera un errore specifico con codice di stato per le risposte non riuscite (401, 403, 500, ecc.). Questo permette al sistema di distinguere errori di autenticazione da altri tipi di errori e attivare la logica di retry appropriata.
- **Retry Automatico Fast Sync su Errori Auth**: Quando il Fast Sync rileva un errore HTTP 401 o 403 (token scaduto/revocato), il sistema tenta automaticamente un refresh del token tramite `ensureToken()` e rilancia la sincronizzazione. Solo se il refresh fallisce viene mostrato un messaggio di "Sessione scaduta" all'utente.
- **Architettura Auth GIS Estrema**: Il vecchio e pesante pacchetto `apis.google.com/js/api.js` è stato eliminato dal progetto, in quanto l'applicazione sfrutta unicamente i nuovi moduli Google Identity Services per gestire l'intero ciclo di vita OAuth 2.0 e ottenere i permessi di scrittura Drive con latenze minime e massima adesione agli standard correnti.
- **Init Google Auth con Polling Resiliente**: Risolto il bug critico che impediva l'auto-sincronizzazione all'avvio. La funzione `initGoogleAuth()` ora utilizza un meccanismo di **polling a fallback** (ogni 200ms, fino a 15 secondi) oltre al classico hook sull'evento `load` dello script Google. Questo risolve la race condition in cui l'evento `load` veniva perso perché lo script si caricava prima che il listener fosse registrato, lasciando l'auth bloccata permanentemente.
- **driveFetch con Retry Auth Automatico**: La funzione `driveFetch()` ora intercetta automaticamente errori HTTP 401/403 e tenta un **refresh silenzioso del token + retry** della richiesta originale prima di propagare l'errore. Inoltre, i messaggi di errore tecnici come "Failed to fetch" vengono tradotti in italiano user-friendly ("Errore di rete. Controlla la connessione.").
- **Diagnostica Sync "More Details"**: Aggiunto un menu a tendina collassabile "More details" all'interno della card Google nelle impostazioni. Quando espanso, mostra un log diagnostico in tempo reale con gli eventi del ciclo di vita della sincronizzazione (caricamento libreria, ripristino token, refresh silenzioso, avvio sync, completamento, errori). Ogni voce è color-coded (verde per successo, rosso per errori, grigio per info) con timestamp. Il log mantiene gli ultimi 30 eventi in memoria e si aggiorna automaticamente ad ogni evento.
- **Sistema Promise per Coda Token**: Aggiunto un meccanismo di accodamento (`_pendingTokenRequest`) che assicura che se la sincronizzazione automatica in background scatta mente l'operazione di auto-refresh del token è in volo, tutte le promesse attendono agilmente la prima risposta utile dal popup invece di fallire immediatamente.
- **Fix Retry driveFetch con Header Aggiornato**: Il retry dopo errore 401/403 ora crea un nuovo oggetto options con il token fresco nell'header `Authorization`, eliminando loop infiniti di autenticazione fallita.
- **Recupero Automatico File 404**: `readDriveFile()` intercetta errori 404 e resetta automaticamente il `driveFileId` cachato, permettendo la ri-scoperta del file corretto.
- **Recupero Automatico File 404 in writeDriveFile**: Corretto bug in caso di eliminazione file remoto in runtime. I Fast Sync in PATCH loggavano errore 404 perenne. Ora resetta il cache ID obsoleto e torna in fallback automatico alla creazione (POST).
- **Auto-Recovery Refresh Token Preventivo**: Il timer auto-rinnovo (`schedulePredictiveTokenRefresh`), se falliva offline, si disinnescava. Ora traccia l'errore e ri-tenta il check ogni 60s per impedire il crollo sessione in background.

### Ultimi Aggiornamenti
- **Aesthetic Impostazioni "Notes-Style"**: Il layout e il design della sezione impostazioni (Cloud Sync, Aspetto, Sistema, e Gestione Dati) sono stati resi visivamente identici all'app "Notes", inclusi i raggruppamenti in card separate per logica funzionale, icone all'interno delle righe e l'uso dello stesso design (padding, gap, e focus styles).
- **Tema Chiaro/Scuro (Light/Dark Mode)**: È stato aggiunto ed implementato funzionalmente il toggle del tema (Auto/Scuro/Chiaro) presente in Notes, pur mantenendo anche il selettore del colore di accento (Color Swatches) e il toggle AMOLED specifici di OnPoint.

---
*Nota: Secondo la regola globale stabilita, questo file (pdr.md) verrà aggiornato in automatico con le nuove modifiche richieste alla fine di ogni iterazione.*

