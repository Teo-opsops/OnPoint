// ══════════════════════════════════════════════════════════
//  Google Auth & Drive Sync (On Point)
//  Merge strategy: ID-based per-task merge with updatedAt
//  timestamps, mirroring Notes' approach exactly.
// ══════════════════════════════════════════════════════════

var GOOGLE_CLIENT_ID = '662885517517-vub0f92dpv1765ckf02nn3ubpgqtpa25.apps.googleusercontent.com';
var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
var DRIVE_FILE_NAME = 'onpoint_app_data.json';

var googleSignedOut = document.getElementById('google-signed-out');
var googleSignedIn = document.getElementById('google-signed-in');
var googleSigninBtn = document.getElementById('google-signin-btn');
var googleSignoutBtn = document.getElementById('google-signout-btn');
var profileAvatar = document.getElementById('profile-avatar');
var profileName = document.getElementById('profile-name');
var profileEmail = document.getElementById('profile-email');
var syncNowBtn = document.getElementById('sync-now-btn');
var syncStatusEl = document.getElementById('sync-status');

var googleAccessToken = null;
var googleUser = null;
var driveFileId = null;
var isSyncing = false;
var tokenClient = null;

// ── Sync Diagnostic Log ──
var syncLog = [];
function logSyncEvent(msg, type) {
  syncLog.push({ time: new Date().toLocaleTimeString('it-IT'), msg: msg, type: type || 'info' });
  if (syncLog.length > 30) syncLog.shift();
  renderSyncLog();
}
function renderSyncLog() {
  var el = document.getElementById('sync-details-log');
  if (!el) return;
  if (syncLog.length === 0) { el.innerHTML = '<div class="sync-log-empty">Nessun evento recente</div>'; return; }
  var html = '';
  for (var i = syncLog.length - 1; i >= 0; i--) {
    var e = syncLog[i];
    var cls = e.type === 'error' ? 'sync-log-error' : e.type === 'success' ? 'sync-log-success' : 'sync-log-info';
    html += '<div class="sync-log-entry ' + cls + '"><span class="sync-log-time">' + e.time + '</span>' + e.msg + '</div>';
  }
  el.innerHTML = html;
}
function toggleSyncDetails() {
  var el = document.getElementById('sync-details-log');
  var chevron = document.getElementById('sync-details-chevron');
  if (!el) return;
  var isHidden = el.style.display === 'none' || !el.style.display;
  el.style.display = isHidden ? 'block' : 'none';
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
}

function now() { return new Date().toISOString(); }

// ── Token persistence ──
function saveTokenToStorage(accessToken, expiresIn) {
  var expiryTime = Date.now() + (expiresIn * 1000) - 60000;
  localStorage.setItem('onpointGoogleToken', JSON.stringify({ token: accessToken, expiry: expiryTime }));
}

function loadTokenFromStorage(returnFullData) {
  try {
    var saved = localStorage.getItem('onpointGoogleToken');
    if (!saved) return null;
    var parsed = JSON.parse(saved);
    if (parsed.token && parsed.expiry && Date.now() < parsed.expiry) {
      return returnFullData === true ? parsed : parsed.token;
    }
    localStorage.removeItem('onpointGoogleToken');
    return null;
  } catch (e) {
    localStorage.removeItem('onpointGoogleToken');
    return null;
  }
}

function clearTokenFromStorage() {
  localStorage.removeItem('onpointGoogleToken');
}

// ══════════════════════════════════════════════════════════
//  Token Refresh via GIS (Google Identity Services)
//  The old gapi.auth.authorize({ immediate: true }) API is
//  DEPRECATED and broken in modern browsers (third-party
//  cookies are blocked). We now use the GIS tokenClient
//  exclusively for obtaining tokens. When the user has
//  already granted consent, requestAccessToken({ prompt: '' })
//  opens a popup that auto-closes near-instantly.
// ══════════════════════════════════════════════════════════

// Pending token request: only one at a time.
// Stores { resolve, reject } from the Promise so the
// handleTokenResponse callback can fulfil it.
var _pendingTokenRequest = null;

// Request a fresh token via GIS tokenClient.
// If prompt is '' and user already consented, the popup
// auto-closes in <1s. Returns a Promise with the token.
function requestTokenSilently() {
  if (_pendingTokenRequest) {
    // Already in flight — return the same promise
    return _pendingTokenRequest.promise;
  }
  var p = new Promise(function (resolve, reject) {
    _pendingTokenRequest = { resolve: resolve, reject: reject };

    if (!tokenClient) {
      _pendingTokenRequest = null;
      reject(new Error('tokenClient non inizializzato'));
      return;
    }

    // Timeout: if nothing comes back within 15s, give up
    _pendingTokenRequest.timeout = setTimeout(function () {
      if (_pendingTokenRequest) {
        var rej = _pendingTokenRequest.reject;
        _pendingTokenRequest = null;
        rej(new Error('Token request timeout'));
      }
    }, 15000);

    try {
      tokenClient.requestAccessToken({
        prompt: '',
        login_hint: googleUser ? googleUser.email : ''
      });
      logSyncEvent('Richiesta token a Google...', 'info');
    } catch (err) {
      clearTimeout(_pendingTokenRequest.timeout);
      _pendingTokenRequest = null;
      reject(err);
    }
  });
  _pendingTokenRequest.promise = p;
  return p;
}

// ── Predictive token refresh ──
var tokenRefreshTimer = null;
function schedulePredictiveTokenRefresh(expiresInSec) {
  if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
  var refreshDelayMs = (expiresInSec - 300) * 1000;
  if (refreshDelayMs <= 0) refreshDelayMs = 10000;
  tokenRefreshTimer = setTimeout(function() {
    if (googleUser && googleUser.email) {
      requestTokenSilently().then(function (accessToken) {
        logSyncEvent('Token rinnovato preventivamente', 'success');
      }).catch(function () {
        logSyncEvent('Refresh preventivo fallito, retry tra 60s', 'error');
        schedulePredictiveTokenRefresh(360);
      });
    }
  }, refreshDelayMs);
}

// ── Init ──
var _googleAuthInitRetries = 0;
function initGoogleAuth() {
  if (typeof google === 'undefined' || !google.accounts) {
    var gScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (gScript && !gScript.dataset.hooked) {
      gScript.dataset.hooked = 'true';
      gScript.addEventListener('load', initGoogleAuth);
    }
    // Always add polling fallback — the load event may have already fired
    _googleAuthInitRetries++;
    if (_googleAuthInitRetries < 75) { // retry up to ~15s (75 × 200ms)
      setTimeout(initGoogleAuth, 200);
    }
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE + ' https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    callback: handleTokenResponse,
    error_callback: function (err) {
      console.warn('GIS token error:', err);
      logSyncEvent('Errore richiesta token: ' + (err.type || err.message || JSON.stringify(err)), 'error');
      // Reject the pending request if any
      if (_pendingTokenRequest) {
        clearTimeout(_pendingTokenRequest.timeout);
        var rej = _pendingTokenRequest.reject;
        _pendingTokenRequest = null;
        rej(new Error(err.type || 'Token request error'));
      }
    }
  });

  logSyncEvent('Libreria Google caricata', 'info');

  var savedUser = localStorage.getItem('onpointGoogleUser');
  if (savedUser) {
    try {
      googleUser = JSON.parse(savedUser);
      showSignedInUI();

      var storedTokenObj = loadTokenFromStorage(true);
      if (storedTokenObj && storedTokenObj.token) {
        googleAccessToken = storedTokenObj.token;
        logSyncEvent('Token valido ripristinato dalla cache', 'success');
        var timeToExpireSec = Math.floor((storedTokenObj.expiry - Date.now()) / 1000);
        schedulePredictiveTokenRefresh(timeToExpireSec);
        if (localStorage.getItem('onpointLastSync')) performStartupSync();
        else firstSyncCheck();
      } else {
        // Token expired — request a new one via GIS
        logSyncEvent('Token scaduto, rinnovo via GIS...', 'info');
        updateSyncStatus('Rinnovo token...', 'syncing');
        requestTokenSilently().then(function () {
          logSyncEvent('Token ottenuto, avvio sync', 'success');
          if (localStorage.getItem('onpointLastSync')) performStartupSync();
          else firstSyncCheck();
        }).catch(function (err) {
          logSyncEvent('Rinnovo token fallito: ' + (err.message || err), 'error');
          updateSyncStatus('Tocca Sincronizza per aggiornare', '');
        });
      }
    } catch (e) {
      localStorage.removeItem('onpointGoogleUser');
      clearTokenFromStorage();
    }
  }
}

googleSigninBtn.addEventListener('click', function () {
  if (!tokenClient) {
    if (typeof google !== 'undefined' && google.accounts) {
      initGoogleAuth();
    }
    if (!tokenClient) {
      alert('Connessione in corso... Assicurati di avere internet (o disattiva eventuali AdBlock) e riprova a premere tra 2 secondi.');
      
      var oldGsi = document.querySelectorAll('script[src*="accounts.google.com/gsi/client"]');
      for (var i = 0; i < oldGsi.length; i++) oldGsi[i].remove();

      var s = document.createElement('script');
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true; s.defer = true;
      s.onload = initGoogleAuth;
      document.body.appendChild(s);

      return;
    }
  }
  tokenClient.requestAccessToken();
});

function handleTokenResponse(response) {
  if (response.error) {
    // Reject pending if any
    if (_pendingTokenRequest) {
      clearTimeout(_pendingTokenRequest.timeout);
      var rej = _pendingTokenRequest.reject;
      _pendingTokenRequest = null;
      rej(new Error(response.error));
    }
    return updateSyncStatus('Errore di autenticazione', 'error');
  }

  googleAccessToken = response.access_token;
  saveTokenToStorage(response.access_token, response.expires_in || 3600);
  schedulePredictiveTokenRefresh(response.expires_in || 3600);

  // If this was triggered by requestTokenSilently(), resolve the promise
  // and let the caller handle sync. No need to fetch user info again.
  if (_pendingTokenRequest) {
    clearTimeout(_pendingTokenRequest.timeout);
    var res = _pendingTokenRequest.resolve;
    _pendingTokenRequest = null;
    res(response.access_token);
    return;
  }

  // Otherwise this is a fresh sign-in — fetch user info and start sync
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': 'Bearer ' + googleAccessToken } })
  .then(function (res) { return res.json(); })
  .then(function (user) {
    googleUser = { name: user.name, email: user.email, picture: user.picture };
    localStorage.setItem('onpointGoogleUser', JSON.stringify(googleUser));
    showSignedInUI();
    if (user.picture) {
      var img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = function() {
        var cvs = document.createElement('canvas');
        cvs.width = img.width; cvs.height = img.height;
        cvs.getContext('2d').drawImage(img, 0, 0);
        try {
          googleUser.picture = cvs.toDataURL('image/jpeg', 0.8);
          localStorage.setItem('onpointGoogleUser', JSON.stringify(googleUser));
          if (profileAvatar) profileAvatar.src = googleUser.picture;
        } catch (e) {}
      };
      img.src = user.picture;
    }
    setTimeout(function() {
      if (localStorage.getItem('onpointLastSync')) performStartupSync();
      else firstSyncCheck();
    }, 0);
  });
}

googleSignoutBtn.addEventListener('click', function () {
  if (googleAccessToken) google.accounts.oauth2.revoke(googleAccessToken, function () {});
  googleAccessToken = null; googleUser = null; driveFileId = null;
  localStorage.removeItem('onpointGoogleUser'); clearTokenFromStorage();
  localStorage.removeItem('onpointLastSync'); localStorage.removeItem('onpointDriveFileId');
  showSignedOutUI();
});

// ── UI ──
function showSignedInUI() {
  googleSignedOut.style.display = 'none'; googleSignedIn.style.display = '';
  if (googleUser) {
    profileName.textContent = googleUser.name || '';
    profileAvatar.src = googleUser.picture || '';
    profileAvatar.style.display = googleUser.picture ? '' : 'none';
  }
}

function showSignedOutUI() {
  googleSignedOut.style.display = ''; googleSignedIn.style.display = 'none';
  updateSyncStatus('Non sincronizzato', '');
}

function updateSyncStatus(text, st) {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = text;
  
  let className = 'sync-status-compact';
  if (st === 'syncing') className += ' syncing';
  else if (st === 'success') className += ' success';
  else if (st === 'error') className += ' error';
  
  syncStatusEl.className = className;
  // Clear any inline colors
  syncStatusEl.style.color = '';
}

// ── Drive helpers ──
function ensureToken() {
  return new Promise(function (resolve, reject) {
    // 1. Check in-memory token via local expiry timestamp
    var validToken = loadTokenFromStorage();
    if (validToken) {
      googleAccessToken = validToken;
      resolve(validToken);
      return;
    }

    // 2. Token expired or missing — request via GIS
    googleAccessToken = null;
    if (googleUser && googleUser.email) {
      requestTokenSilently()
        .then(function (accessToken) {
          console.log('OnPoint: token auto-refreshed during ensureToken');
          logSyncEvent('Token auto-rinnovato', 'success');
          resolve(accessToken);
        })
        .catch(function (err) {
          console.warn('OnPoint: token refresh in ensureToken failed —', err.message);
          logSyncEvent('Token scaduto, rinnovo fallito', 'error');
          reject(new Error('Token scaduto. Tocca Sincronizza per aggiornare.'));
        });
    } else {
      reject(new Error('Nessun token disponibile. Accedi a Google.'));
    }
  });
}

function driveFetch(url, options, _isRetry) {
  options = options || {};
  options.headers = options.headers || {};
  options.headers['Authorization'] = 'Bearer ' + googleAccessToken;
  return fetch(url, options).then(function (res) {
    if (!res.ok) {
      var err = new Error('HTTP ' + res.status + ' ' + res.statusText);
      err.status = res.status;
      throw err;
    }
    return res;
  }).catch(function (err) {
    if (!_isRetry && err.status && (err.status === 401 || err.status === 403) && googleUser && googleUser.email) {
      logSyncEvent('Errore auth ' + err.status + ', retry...', 'info');
      return requestTokenSilently().then(function (newToken) {
        var retryOpts = JSON.parse(JSON.stringify(options));
        retryOpts.headers['Authorization'] = 'Bearer ' + newToken;
        if (options.body) retryOpts.body = options.body;
        return driveFetch(url, retryOpts, true);
      });
    }
    if (err.message && err.message.toLowerCase().indexOf('failed to fetch') !== -1) {
      logSyncEvent('Errore di rete (connessione assente)', 'error');
      throw new Error('Errore di rete. Controlla la connessione.');
    }
    throw err;
  });
}

function findDriveFile() {
  if (driveFileId) return Promise.resolve({ id: driveFileId });
  var savedId = localStorage.getItem('onpointDriveFileId');
  if (savedId) { driveFileId = savedId; return Promise.resolve({ id: driveFileId }); }
  return driveFetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27' + DRIVE_FILE_NAME + '%27&fields=files(id,modifiedTime)')
  .then(function (res) { return res.json(); })
  .then(function (data) {
    if (data.files && data.files.length > 0) {
      driveFileId = data.files[0].id;
      localStorage.setItem('onpointDriveFileId', driveFileId);
      return { id: driveFileId, modifiedTime: data.files[0].modifiedTime };
    }
    return null;
  });
}

function readDriveFile(fileId) {
  return driveFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media')
  .then(function (res) { return res.json(); })
  .catch(function (err) {
    if (err.status === 404) {
      logSyncEvent('File cloud non trovato, ricerca...', 'info');
      driveFileId = null;
      localStorage.removeItem('onpointDriveFileId');
    }
    throw err;
  });
}

function writeDriveFile(data) {
  var jsonStr = JSON.stringify(data);
  if (driveFileId) {
    return driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=media', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonStr
    }).then(function (res) { return res.json(); })
    .catch(function (err) {
      if (err.status === 404) {
        logSyncEvent('File PATCH 404, ricreazione...', 'info');
        driveFileId = null;
        localStorage.removeItem('onpointDriveFileId');
        return writeDriveFile(data);
      }
      throw err;
    });
  }
  var boundary = '---onpoint' + Date.now();
  var metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] };
  var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + jsonStr + '\r\n--' + boundary + '--';
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body
  })
  .then(function (res) { return res.json(); })
  .then(function (file) {
    driveFileId = file.id;
    localStorage.setItem('onpointDriveFileId', driveFileId);
    return file;
  });
}

// ══════════════════════════════════════════════════════════
//  MERGE LOGIC — ID-based per-task merge with updatedAt
//  On Point tasks already have unique IDs. We add updatedAt
//  timestamps transparently so the merge can pick the newest
//  version of each individual task, exactly like Notes.
// ══════════════════════════════════════════════════════════

// Ensure every task object carries an updatedAt timestamp.
// Called before any save/sync. Cheap O(n) scan.
function ensureTimestamps(taskObj) {
  var ts = now();
  ['todo', 'willdo', 'deleted'].forEach(function(listName) {
    var list = taskObj[listName];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].updatedAt) list[i].updatedAt = ts;
      if (typeof list[i].orderIndex !== 'number') list[i].orderIndex = i;
      // Also tag which list the task belongs to (for restore)
      if (listName !== 'deleted') list[i].listType = listName;
    }
  });
}

// Merge two task datasets. For each unique task ID, keep the version
// with the most recent updatedAt. Union of all tasks = no data loss.
function mergeTasks(localTasks, cloudTasks) {
  var merged = { todo: [], willdo: [], deleted: [] };
  // Build a map of id -> { task, listName }
  var map = {};

  function ingest(taskObj, source) {
    ['todo', 'willdo', 'deleted'].forEach(function(listName) {
      var list = taskObj[listName];
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (!t.id) continue;
        var existing = map[t.id];
        if (!existing) {
          map[t.id] = { task: t, listName: listName };
        } else {
          // Keep the one with the newer updatedAt
          var existingTime = existing.task.updatedAt || '';
          var newTime = t.updatedAt || '';
          if (newTime > existingTime) {
            map[t.id] = { task: t, listName: listName };
          }
        }
      }
    });
  }

  ingest(cloudTasks, 'cloud');
  ingest(localTasks, 'local');

  // Distribute merged tasks back into lists
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    var entry = map[keys[i]];
    merged[entry.listName].push(entry.task);
  }

  // Sort lists based on orderIndex
  ['todo', 'willdo'].forEach(function(listName) {
    if (merged[listName].length > 0) {
      merged[listName].sort(function(a, b) {
        var aIdx = (typeof a.orderIndex === 'number') ? a.orderIndex : 999999;
        var bIdx = (typeof b.orderIndex === 'number') ? b.orderIndex : 999999;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return parseInt(a.id || 0) - parseInt(b.id || 0); // fallback if equal
      });
    }
  });

  return merged;
}

function getTasksCount(t) {
  return (t.todo ? t.todo.length : 0) + (t.willdo ? t.willdo.length : 0) + (t.deleted ? t.deleted.length : 0);
}

// Conflict UI
var syncConflictOverlay = document.getElementById('sync-conflict-overlay');
var syncUseCloud = document.getElementById('sync-use-cloud');
var syncUseLocal = document.getElementById('sync-use-local');
var syncLocalCount = document.getElementById('sync-local-count');
var syncCloudCount = document.getElementById('sync-cloud-count');
var pendingDriveData = null;

// ── First sync check (first login / no lastSync) ──
function firstSyncCheck() {
  ensureTimestamps(tasks);
  ensureToken().then(findDriveFile).then(function (fileInfo) {
    var localCount = getTasksCount(tasks);

    if (!fileInfo) {
      // No cloud file at all
      if (localCount > 0) {
        // Local has data but no cloud file → show dialog (cloud = 0)
        pendingDriveData = { todo: [], willdo: [], deleted: [] };
        syncLocalCount.textContent = localCount + ' task';
        syncCloudCount.textContent = '0 task';
        syncConflictOverlay.classList.add('visible');
        return;
      }
      // Both empty → nothing to ask
      localStorage.setItem('onpointLastSync', now());
      updateSyncStatus('Sincronizzato ✓', '');
      return;
    }
    return readDriveFile(fileInfo.id).then(function (driveData) {
      var cloudCount = getTasksCount(driveData || {});

      if (localCount === 0 && cloudCount === 0) {
        // Both empty → nothing to ask
        localStorage.setItem('onpointLastSync', now());
        updateSyncStatus('Sincronizzato ✓', '');
        return;
      }

      // At least one side has data → always ask the user
      pendingDriveData = driveData;
      syncLocalCount.textContent = localCount + ' task';
      syncCloudCount.textContent = cloudCount + ' task';
      syncConflictOverlay.classList.add('visible');
    });
  }).catch(function (err) {
    console.error('First sync error:', err);
    logSyncEvent('Errore primo check: ' + (err ? err.message : ''), 'error');
  });
}

// ── Conflict handlers ──
syncUseCloud.addEventListener('click', function () {
  if (pendingDriveData) {
    tasks = pendingDriveData;
    ensureTimestamps(tasks);
    writeToIDB(tasks).then(function() { renderAll(); });
    localStorage.setItem('onpointLastSync', now());
    updateSyncStatus('Sincronizzato ✓', '');
  }
  syncConflictOverlay.classList.remove('visible');
  pendingDriveData = null;
});
syncUseLocal.addEventListener('click', function () {
  syncConflictOverlay.classList.remove('visible');
  pendingDriveData = null;
  ensureTimestamps(tasks);
  writeDriveFile(tasks).then(function () {
    localStorage.setItem('onpointLastSync', now());
    updateSyncStatus('Sincronizzato ✓', '');
  });
});

// ── Startup sync (already synced before — do merge) ──
function performStartupSync() {
  if (isSyncing || !googleUser) return;
  isSyncing = true;
  logSyncEvent('Sync automatica avvio...', 'info');
  ensureTimestamps(tasks);

  ensureToken().then(findDriveFile).then(function (fileInfo) {
    if (fileInfo) {
      return readDriveFile(fileInfo.id).then(function (driveData) {
        if (driveData && (driveData.todo || driveData.willdo)) {
          ensureTimestamps(driveData);
          tasks = mergeTasks(tasks, driveData);
          writeToIDB(tasks).then(function() { renderAll(); });
        }
        return writeDriveFile(tasks);
      });
    } else {
      return writeDriveFile(tasks);
    }
  }).then(function () {
    localStorage.setItem('onpointLastSync', now());
    hasPendingChanges = false;
    updateSyncStatus('Sincronizzato ✓', '');
    logSyncEvent('Sync completata ✓', 'success');
  }).catch(function(err) {
    console.error('Startup sync error:', err);
    logSyncEvent('Errore sync avvio: ' + (err.message || err), 'error');
    updateSyncStatus('Errore sync iniziale', 'error');
  }).finally(function () { isSyncing = false; });
}

// ── Manual / silent full sync (with merge) ──
function syncWithDrive(silent) {
  if (isSyncing || !googleUser) return;
  isSyncing = true;
  if (!silent) updateSyncStatus('Sincronizzazione...', 'syncing');
  ensureTimestamps(tasks);

  ensureToken().then(findDriveFile).then(function (fileInfo) {
    if (fileInfo) {
      return readDriveFile(fileInfo.id).then(function (driveData) {
        if (driveData && (driveData.todo || driveData.willdo)) {
          ensureTimestamps(driveData);
          tasks = mergeTasks(tasks, driveData);
          writeToIDB(tasks).then(function() { renderAll(); });
        }
        return writeDriveFile(tasks);
      });
    } else {
      return writeDriveFile(tasks);
    }
  }).then(function () {
    localStorage.setItem('onpointLastSync', now());
    hasPendingChanges = false;
    updateSyncStatus('Sincronizzato ✓', '');
    if (!silent) {
      updateSyncStatus('Ultima sync: adesso', 'success');
      setTimeout(function () { if (!isSyncing) updateSyncStatus('Sincronizzato ✓', ''); }, 3000);
    }
  }).catch(function(err) {
    console.error('Sync error:', err);
    var errMsg = err && err.message ? err.message : 'Errore di sync';
    logSyncEvent('Errore sync: ' + errMsg, 'error');
    if (!silent) updateSyncStatus(errMsg, 'error');
  }).finally(function () { isSyncing = false; });
}

syncNowBtn.addEventListener('click', function () {
  if (!googleAccessToken && googleUser) {
    tokenClient.requestAccessToken({ prompt: '', login_hint: googleUser.email || '' });
    return;
  }
  syncWithDrive(false);
});

// ── Fast sync (direct PATCH, ~150ms) ──
var fastSyncTimer = null;
var hasPendingChanges = false;
function scheduleFastSync() {
  if (!googleUser || !googleAccessToken || !driveFileId) return;
  clearTimeout(fastSyncTimer);
  fastSyncTimer = setTimeout(function() {
    if (isSyncing) return;
    isSyncing = true;
    hasPendingChanges = false;
    updateSyncStatus('Salvataggio...', 'syncing');
    ensureTimestamps(tasks);
    writeDriveFile(tasks)
      .then(function() {
        localStorage.setItem('onpointLastSync', now());
        if (!hasPendingChanges) updateSyncStatus('Sincronizzato ✓', '');
      })
      .catch(function(err) {
        console.error('Fast sync error:', err);
        var isAuthError = (err && err.status && (err.status === 401 || err.status === 403));
        if (isAuthError) {
          ensureToken().then(function() {
            scheduleFastSync();
          }).catch(function() {
            updateSyncStatus('Sessione scaduta', 'error');
          });
          return;
        }
        updateSyncStatus('Errore di salvataggio', 'error');
      })
      .finally(function() {
        isSyncing = false;
        if (hasPendingChanges) scheduleFastSync();
      });
  }, 500);
}

window.triggerAutoSync = function() {
  hasPendingChanges = true;
  // Stamp updatedAt on all tasks at save time
  ensureTimestamps(tasks);
  if (googleUser && googleAccessToken) {
    if (driveFileId) scheduleFastSync();
    else syncWithDrive(true);
  }
};

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden' && hasPendingChanges && googleUser && googleAccessToken && driveFileId && !isSyncing) {
    ensureTimestamps(tasks);
    writeDriveFile(tasks).catch(function(){});
    localStorage.setItem('onpointLastSync', now());
    hasPendingChanges = false;
  }
});

// Initialize immediately — no delay
initGoogleAuth();
