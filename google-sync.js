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

// ── Pre-load GAPI Auth Module (eager, parallel with everything else) ──
var _gapiAuthReady = null;
function preloadGapiAuth() {
  if (_gapiAuthReady) return _gapiAuthReady;
  _gapiAuthReady = new Promise(function (resolve, reject) {
    function doLoad() {
      gapi.load('auth', { callback: resolve, onerror: function() { _gapiAuthReady = null; reject(); } });
    }
    if (typeof gapi !== 'undefined') {
      doLoad();
    } else {
      var gapiScript = document.querySelector('script[src*="apis.google.com/js/api"]');
      if (gapiScript) {
        gapiScript.addEventListener('load', doLoad);
      } else {
        _gapiAuthReady = null;
        reject(new Error('GAPI script not found'));
      }
    }
  });
  return _gapiAuthReady;
}
preloadGapiAuth().catch(function() {});

// ── Silent token refresh via pre-loaded GAPI ──
function silentRefreshViaGapi(email) {
  return preloadGapiAuth().then(function () {
    return new Promise(function (resolve, reject) {
      var authTimeout = setTimeout(function () {
        reject(new Error('Silent auth timeout'));
      }, 5000);

      gapi.auth.authorize({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE + ' https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        immediate: true,
        login_hint: email
      }, function (authResult) {
        clearTimeout(authTimeout);
        if (authResult && !authResult.error && authResult.access_token) {
          resolve({ access_token: authResult.access_token, expires_in: parseInt(authResult.expires_in) || 3600 });
        } else {
          reject(new Error(authResult ? authResult.error : 'Silent auth failed'));
        }
      });
    });
  });
}

// ── Predictive token refresh ──
var tokenRefreshTimer = null;
function schedulePredictiveTokenRefresh(expiresInSec) {
  if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
  var refreshDelayMs = (expiresInSec - 300) * 1000;
  if (refreshDelayMs <= 0) refreshDelayMs = 10000;
  tokenRefreshTimer = setTimeout(function() {
    if (googleUser && googleUser.email) {
      silentRefreshViaGapi(googleUser.email).then(function (result) {
        googleAccessToken = result.access_token;
        saveTokenToStorage(result.access_token, result.expires_in || 3600);
        schedulePredictiveTokenRefresh(result.expires_in || 3600);
      }).catch(function () {});
    }
  }, refreshDelayMs);
}

// ── Init ──
function initGoogleAuth() {
  if (typeof google === 'undefined' || !google.accounts) {
    var gScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (gScript && !gScript.dataset.hooked) {
      gScript.dataset.hooked = 'true';
      gScript.addEventListener('load', initGoogleAuth);
    } else if (!gScript) {
      setTimeout(initGoogleAuth, 500);
    }
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE + ' https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    callback: handleTokenResponse
  });

  var savedUser = localStorage.getItem('onpointGoogleUser');
  if (savedUser) {
    try {
      googleUser = JSON.parse(savedUser);
      showSignedInUI();

      var storedTokenObj = loadTokenFromStorage(true);
      if (storedTokenObj && storedTokenObj.token) {
        googleAccessToken = storedTokenObj.token;
        var timeToExpireSec = Math.floor((storedTokenObj.expiry - Date.now()) / 1000);
        schedulePredictiveTokenRefresh(timeToExpireSec);
        if (localStorage.getItem('onpointLastSync')) performStartupSync();
        else firstSyncCheck();
      } else {
        silentRefreshViaGapi(googleUser.email).then(function (result) {
          googleAccessToken = result.access_token;
          saveTokenToStorage(result.access_token, result.expires_in || 3600);
          if (localStorage.getItem('onpointLastSync')) performStartupSync();
          else firstSyncCheck();
        }).catch(function () {
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
  if (!tokenClient) return alert('Le librerie Google non sono ancora caricate. Riprova tra un momento.');
  tokenClient.requestAccessToken();
});

function handleTokenResponse(response) {
  if (response.error) return updateSyncStatus('Errore di autenticazione', 'error');
  googleAccessToken = response.access_token;
  saveTokenToStorage(response.access_token, response.expires_in || 3600);
  schedulePredictiveTokenRefresh(response.expires_in || 3600);

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

    // 2. Token expired or missing — attempt silent refresh
    googleAccessToken = null;
    if (googleUser && googleUser.email) {
      silentRefreshViaGapi(googleUser.email)
        .then(function (result) {
          googleAccessToken = result.access_token;
          saveTokenToStorage(result.access_token, result.expires_in || 3600);
          schedulePredictiveTokenRefresh(result.expires_in || 3600);
          console.log('OnPoint: token auto-refreshed during ensureToken');
          resolve(result.access_token);
        })
        .catch(function (err) {
          console.warn('OnPoint: silent refresh in ensureToken failed —', err.message);
          reject(new Error('Token scaduto. Tocca Sincronizza per aggiornare.'));
        });
    } else {
      reject(new Error('Nessun token disponibile. Accedi a Google.'));
    }
  });
}

function driveFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  options.headers['Authorization'] = 'Bearer ' + googleAccessToken;
  if (typeof options.keepalive === 'undefined') options.keepalive = true;
  return fetch(url, options).then(function (res) {
    if (!res.ok) {
      var err = new Error('HTTP ' + res.status + ' ' + res.statusText);
      err.status = res.status;
      throw err;
    }
    return res;
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
  .then(function (res) { return res.json(); });
}

function writeDriveFile(data) {
  var jsonStr = JSON.stringify(data);
  if (driveFileId) {
    return driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=media', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonStr
    }).then(function (res) { return res.json(); });
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
  }).catch(function (err) { console.error('First sync error:', err); });
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
  }).catch(function(err) {
    console.error('Startup sync error:', err);
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
