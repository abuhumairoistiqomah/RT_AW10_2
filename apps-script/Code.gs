/**
 * GOOGLE APPS SCRIPT BACKEND FOR RUMAH TAHFIDZ LMS
 *
 * Deployment Target: Web App
 * Execute as: Me
 * Who has access: Anyone
 *
 * Script Properties Required:
 * - SPREADSHEET_ID: The Google Spreadsheet ID
 * - AUTH_PEPPER: Secret pepper for SHA-256 password hashing (REQUIRED)
 */

var _cachedSpreadsheet = null;

function getSpreadsheet() {
  if (_cachedSpreadsheet) {
    return _cachedSpreadsheet;
  }
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_ID script property is missing. Please configure it in Project Settings -> Script Properties.');
  }
  _cachedSpreadsheet = SpreadsheetApp.openById(id);
  return _cachedSpreadsheet;
}

function getSheet(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    if (sheetName === '16_SESSIONS') {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(['session_token', 'user_id', 'role', 'teacher_id', 'created_at', 'last_seen_at', 'revoked', 'revoked_at']);
      return sheet;
    }
    throw new Error('Sheet "' + sheetName + '" not found in Google Spreadsheet.');
  }
  return sheet;
}

function getPepper() {
  var pepper = PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER');
  if (!pepper) {
    throw new Error('SERVER_CONFIG_ERROR: Property "AUTH_PEPPER" belum dikonfigurasi di Script Properties.');
  }
  return pepper;
}

// ----------------------------------------------------
// SHORT-TERM CACHE (TTL: 180s)
// ----------------------------------------------------
var CACHEABLE_SHEETS = [
  '01_APP_CONFIG',
  '03_MASTER_STUDENTS',
  '04_MASTER_TEACHERS',
  '05_MASTER_SURAHS',
  '07_EVENTS',
  '08_SESSION_GROUPS',
  '09_SESSION_CONFIG',
  '10_HALAQAH',
  '11_HALAQAH_TEACHERS'
];
var CACHE_TTL_SECONDS = 180;

function getCachedSheetObjects(sheetName) {
  try {
    var cache = CacheService.getScriptCache();
    var metaStr = cache.get('CACHE_META_' + sheetName);
    var fullJson = null;
    if (metaStr) {
      var meta = JSON.parse(metaStr);
      if (meta && meta.chunks) {
        var keys = [];
        for (var i = 0; i < meta.chunks; i++) {
          keys.push('CACHE_' + sheetName + '_' + i);
        }
        var chunkMap = cache.getAll(keys);
        var combined = '';
        var allPresent = true;
        for (var j = 0; j < meta.chunks; j++) {
          var piece = chunkMap['CACHE_' + sheetName + '_' + j];
          if (!piece) { allPresent = false; break; }
          combined += piece;
        }
        if (allPresent) fullJson = combined;
      }
    } else {
      var direct = cache.get('CACHE_' + sheetName);
      if (direct) fullJson = direct;
    }
    if (fullJson) {
      return JSON.parse(fullJson);
    }
  } catch (e) {
    Logger.log('Cache read error for ' + sheetName + ': ' + e.message);
  }
  return null;
}

function setCachedSheetObjects(sheetName, data) {
  try {
    var cache = CacheService.getScriptCache();
    var jsonStr = JSON.stringify(data);
    var CHUNK_SIZE = 90000;
    if (jsonStr.length <= CHUNK_SIZE) {
      cache.put('CACHE_' + sheetName, jsonStr, CACHE_TTL_SECONDS);
      cache.remove('CACHE_META_' + sheetName);
    } else {
      var numChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);
      var chunkObj = {};
      for (var i = 0; i < numChunks; i++) {
        var start = i * CHUNK_SIZE;
        chunkObj['CACHE_' + sheetName + '_' + i] = jsonStr.substring(start, start + CHUNK_SIZE);
      }
      cache.putAll(chunkObj, CACHE_TTL_SECONDS);
      cache.put('CACHE_META_' + sheetName, JSON.stringify({ chunks: numChunks }), CACHE_TTL_SECONDS);
      cache.remove('CACHE_' + sheetName);
    }
  } catch (e) {
    Logger.log('Cache write error for ' + sheetName + ': ' + e.message);
  }
}

function invalidateSheetCache(sheetName) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove('CACHE_' + sheetName);
    var metaStr = cache.get('CACHE_META_' + sheetName);
    if (metaStr) {
      var meta = JSON.parse(metaStr);
      if (meta && meta.chunks) {
        var keys = ['CACHE_META_' + sheetName];
        for (var i = 0; i < meta.chunks; i++) {
          keys.push('CACHE_' + sheetName + '_' + i);
        }
        cache.removeAll(keys);
      }
    }
    cache.remove('CACHE_META_' + sheetName);
  } catch (e) {
    Logger.log('Cache invalidate error for ' + sheetName + ': ' + e.message);
  }
}

/**
 * Reads all rows from a sheet and returns an array of objects.
 * Headers are read dynamically from row 1.
 */
function readSheetObjects(sheetName, skipCache) {
  if (!skipCache && CACHEABLE_SHEETS.indexOf(sheetName) !== -1) {
    var cached = getCachedSheetObjects(sheetName);
    if (cached) {
      return cached;
    }
  }

  var sheet = getSheet(sheetName);
  var range = sheet.getDataRange();
  var data = range.getValues();
  var displayData = range.getDisplayValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var displayRow = displayData[i] || [];
    var obj = {};
    var hasValue = false;

    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      if (!header) continue;
      var val = row[j];
      var dispVal = displayRow[j] !== undefined ? displayRow[j] : '';
      
      if (header === 'start_time' || header === 'end_time') {
        // ALWAYS use normalizeClockTime for clock times.
        // Prefer cell's formatted display value (e.g. "10:00"), falling back to raw cell value
        val = normalizeClockTime(dispVal) || normalizeClockTime(val);
      } else if (val instanceof Date) {
        val = val.toISOString();
      } else if (typeof val === 'string') {
        val = val.trim();
        if (val === 'TRUE' || val === 'true') val = true;
        else if (val === 'FALSE' || val === 'false') val = false;
      }
      
      if (val !== '' && val !== null && val !== undefined) {
        hasValue = true;
      }
      obj[header] = val;
    }

    if (hasValue) {
      result.push(obj);
    }
  }

  if (!skipCache && CACHEABLE_SHEETS.indexOf(sheetName) !== -1) {
    setCachedSheetObjects(sheetName, result);
  }

  return result;
}

/**
 * Helper to update an array of row values atomically into a sheet range.
 */
function batchUpdateRowValues(sheet, rowIndex, headers, obj) {
  var rowValues = headers.map(function(header) {
    var val = obj[header];
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
}

/**
 * Appends a new object row to a sheet based on header column names.
 */
function appendObject(sheetName, obj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

    var newRow = headers.map(function(header) {
      var val = obj[header];
      if (val === undefined || val === null) return '';
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });

    sheet.appendRow(newRow);
    invalidateSheetCache(sheetName);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates a row in a sheet matching a primary key or unique filter.
 */
function updateObject(sheetName, keyField, keyValue, newFields) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var keyIndex = headers.indexOf(String(keyField).trim().toLowerCase());
    if (keyIndex === -1) return false;

    var targetRowIndex = -1;
    var targetObj = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][keyIndex]).trim().toLowerCase() === String(keyValue).trim().toLowerCase()) {
        targetRowIndex = i + 1;
        targetObj = {};
        for (var j = 0; j < headers.length; j++) {
          targetObj[headers[j]] = data[i][j];
        }
        break;
      }
    }

    if (targetRowIndex === -1) return false;

    for (var k in newFields) {
      if (newFields.hasOwnProperty(k)) {
        targetObj[k.toLowerCase()] = newFields[k];
      }
    }

    batchUpdateRowValues(sheet, targetRowIndex, headers, targetObj);
    invalidateSheetCache(sheetName);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a row in a sheet matching a primary key or unique filter.
 * Returns the deleted object if found and deleted, or null if not found.
 */
function deleteRowByField(sheetName, keyField, keyValue) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return null;

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var keyIndex = headers.indexOf(String(keyField).trim().toLowerCase());
    if (keyIndex === -1) return null;

    var targetRowNumber = -1;
    var deletedObj = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][keyIndex]).trim().toLowerCase() === String(keyValue).trim().toLowerCase()) {
        targetRowNumber = i + 1;
        deletedObj = {};
        for (var j = 0; j < headers.length; j++) {
          deletedObj[headers[j]] = data[i][j];
        }
        break;
      }
    }

    if (targetRowNumber === -1) return null;

    Logger.log('DELETE ROW FOUND: ' + targetRowNumber);
    sheet.deleteRow(targetRowNumber);
    SpreadsheetApp.flush();
    invalidateSheetCache(sheetName);
    return deletedObj;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Upserts an object row matching compound key fields.
 * Preserves existing primary key IDs during updates to ensure ID stability.
 */
function upsertObject(sheetName, keyFields, obj, idFieldName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) {
        return String(h).trim().toLowerCase();
      });
      var newRow = headers.map(function(h) {
        var val = obj[h];
        if (val === undefined || val === null) return '';
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      });
      sheet.appendRow(newRow);
      return 'INSERTED';
    }

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var keyIndices = keyFields.map(function(kf) {
      return headers.indexOf(String(kf).trim().toLowerCase());
    });

    var targetRowIndex = -1;
    var existingRowObj = {};

    for (var i = 1; i < data.length; i++) {
      var match = true;
      for (var k = 0; k < keyFields.length; k++) {
        var idx = keyIndices[k];
        if (idx === -1) { match = false; break; }
        var cellVal = String(data[i][idx]).trim().toLowerCase();
        var matchVal = String(obj[keyFields[k]] || '').trim().toLowerCase();
        if (cellVal !== matchVal) {
          match = false;
          break;
        }
      }
      if (match) {
        targetRowIndex = i + 1;
        for (var hIdx = 0; hIdx < headers.length; hIdx++) {
          existingRowObj[headers[hIdx]] = data[i][hIdx];
        }
        break;
      }
    }

    if (targetRowIndex === -1) {
      var newRow = headers.map(function(header) {
        var val = obj[header];
        if (val === undefined || val === null) return '';
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      });
      sheet.appendRow(newRow);
      invalidateSheetCache(sheetName);
      return 'INSERTED';
    } else {
      // Update row: merge obj onto existing object
      // PRESERVE EXISTING PRIMARY KEY ID
      for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          var propLower = prop.toLowerCase();
          if (idFieldName && propLower === String(idFieldName).toLowerCase() && existingRowObj[propLower]) {
            obj[prop] = existingRowObj[propLower];
            continue;
          }
          if ((propLower === 'assessment_id' || propLower === 'final_evaluation_id' || propLower === 'participant_id' || propLower === 'student_id') && existingRowObj[propLower]) {
            obj[prop] = existingRowObj[propLower];
            continue;
          }
          existingRowObj[propLower] = obj[prop];
        }
      }
      batchUpdateRowValues(sheet, targetRowIndex, headers, existingRowObj);
      invalidateSheetCache(sheetName);
      return 'UPDATED';
    }
  } finally {
    lock.releaseLock();
  }
}

// JSON Output Helpers
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(code, message) {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: false,
      error: { code: code || 'SERVER_ERROR', message: message || 'An error occurred' }
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Password Security (Salted SHA-256)
function hashPasswordGS(password, salt) {
  var pepper = getPepper();
  if (!salt) {
    salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  }
  var rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pepper + password);
  var hashHex = rawBytes.map(function(byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
  return salt + ':' + hashHex;
}

function verifyPasswordGS(inputPassword, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (storedHash.indexOf(':') === -1) {
    return false; // Plaintext or unsalted legacy passwords rejected
  }
  var parts = storedHash.split(':');
  var salt = parts[0];
  var computed = hashPasswordGS(inputPassword, salt);
  return computed === storedHash;
}

function generatePasswordHashForSetup(password) {
  var hash = hashPasswordGS(password);
  Logger.log('Password hash generated for setup: ' + hash);
  return hash;
}

// ====================================================
// SESSION MANAGEMENT (Spreadsheet-Authoritative via 16_SESSIONS)
// ====================================================

function createSession(user) {
  var token = 'SES_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  var nowIso = new Date().toISOString();
  var sessionObj = {
    session_token: token,
    user_id: user.user_id,
    role: user.role,
    teacher_id: user.teacher_id || '',
    created_at: nowIso,
    last_seen_at: nowIso,
    revoked: 'FALSE',
    revoked_at: ''
  };

  appendObject('16_SESSIONS', sessionObj);

  return {
    token: token,
    user_id: user.user_id,
    display_name: user.display_name,
    role: user.role,
    teacher_id: user.teacher_id || '',
    created_at: nowIso
  };
}

function getSession(token) {
  if (!token) return null;

  // 1. Read authoritative 16_SESSIONS (skip cache for instant consistency)
  var sessions = readSheetObjects('16_SESSIONS', true);
  var sessionRow = sessions.find(function(s) {
    return String(s.session_token || '').trim() === String(token).trim();
  });

  if (!sessionRow) return null;

  // 2. Check revoked status
  var isRevoked = sessionRow.revoked === true || String(sessionRow.revoked).toLowerCase() === 'true';
  if (isRevoked) return null;

  // 3. Load corresponding user from 06_USERS
  var users = readSheetObjects('06_USERS');
  var user = users.find(function(u) {
    return String(u.user_id || '').trim() === String(sessionRow.user_id || '').trim();
  });

  if (!user) return null;

  // 4. Verify user active status
  var isUserActive = user.active == null || user.active === '' || user.active === true || String(user.active).toLowerCase() === 'true' || String(user.active).toUpperCase() === 'ACTIVE';
  if (!isUserActive) {
    return {
      is_disabled_account: true,
      user_id: user.user_id
    };
  }

  // 5. Throttled last_seen_at update (e.g. at most once every 15 minutes)
  try {
    var lastSeen = sessionRow.last_seen_at ? new Date(sessionRow.last_seen_at).getTime() : 0;
    var nowTime = Date.now();
    if (!lastSeen || (nowTime - lastSeen > 15 * 60 * 1000)) {
      updateObject('16_SESSIONS', 'session_token', token, {
        last_seen_at: new Date(nowTime).toISOString()
      });
    }
  } catch (e) {
    Logger.log('Warning updating last_seen_at for session: ' + e.message);
  }

  // 6. Return current role, display_name, and teacher_id from 06_USERS (never stale)
  return {
    token: token,
    user_id: user.user_id,
    display_name: user.display_name || user.username,
    role: user.role,
    teacher_id: user.teacher_id || '',
    created_at: sessionRow.created_at
  };
}

function removeSession(token) {
  if (!token) return;
  var nowIso = new Date().toISOString();
  updateObject('16_SESSIONS', 'session_token', token, {
    revoked: 'TRUE',
    revoked_at: nowIso
  });
}

function revokeAllUserSessions(userId) {
  if (!userId) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet('16_SESSIONS');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var userIdx = headers.indexOf('user_id');
    var revokedIdx = headers.indexOf('revoked');
    var revokedAtIdx = headers.indexOf('revoked_at');
    if (userIdx === -1 || revokedIdx === -1 || revokedAtIdx === -1) return;

    var nowIso = new Date().toISOString();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][userIdx]).trim() === String(userId).trim()) {
        var isRevoked = data[i][revokedIdx] === true || String(data[i][revokedIdx]).toLowerCase() === 'true';
        if (!isRevoked) {
          sheet.getRange(i + 1, revokedIdx + 1).setValue('TRUE');
          sheet.getRange(i + 1, revokedAtIdx + 1).setValue(nowIso);
        }
      }
    }
    invalidateSheetCache('16_SESSIONS');
  } catch (e) {
    Logger.log('Error revoking sessions for user ' + userId + ': ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

function cleanupRevokedSessions() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet('16_SESSIONS');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var revokedIdx = headers.indexOf('revoked');
    var revokedAtIdx = headers.indexOf('revoked_at');
    if (revokedIdx === -1) return 0;

    var thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    var rowsToDelete = [];

    for (var i = 1; i < data.length; i++) {
      var isRevoked = data[i][revokedIdx] === true || String(data[i][revokedIdx]).toLowerCase() === 'true';
      if (isRevoked) {
        var revokedAtVal = data[i][revokedAtIdx];
        var revokedAtTime = revokedAtVal ? new Date(revokedAtVal).getTime() : 0;
        if (revokedAtTime && revokedAtTime < thirtyDaysAgo) {
          rowsToDelete.push(i + 1); // 1-based row number
        }
      }
    }

    // Delete in reverse order to preserve indexes
    for (var d = rowsToDelete.length - 1; d >= 0; d--) {
      sheet.deleteRow(rowsToDelete[d]);
    }

    invalidateSheetCache('16_SESSIONS');
    return rowsToDelete.length;
  } finally {
    lock.releaseLock();
  }
}

function requireAuth(token) {
  var session = getSession(token);
  if (!session) {
    throw new Error('AUTH_REQUIRED: Sesi Anda telah berakhir atau tidak valid. Silakan login kembali.');
  }
  if (session.is_disabled_account) {
    throw new Error('AUTH_REQUIRED: Akun Anda sudah tidak aktif. Silakan hubungi administrator.');
  }
  return session;
}

function requireRole(token, allowedRoles) {
  var session = requireAuth(token);
  if (allowedRoles.indexOf(session.role) === -1) {
    throw new Error('FORBIDDEN: Anda tidak memiliki hak akses untuk tindakan ini.');
  }
  return session;
}

// Redact sensitive keys from Audit Log payloads
function redactSensitiveData(data) {
  if (!data) return '';
  try {
    var obj = typeof data === 'string' ? JSON.parse(data) : JSON.parse(JSON.stringify(data));
    var sensitiveKeys = ['access_code', 'accesscode', 'newaccesscode', 'password', 'password_hash'];
    
    function redactRecursive(item) {
      if (!item || typeof item !== 'object') return;
      for (var k in item) {
        if (item.hasOwnProperty(k)) {
          if (sensitiveKeys.indexOf(k.toLowerCase()) !== -1) {
            item[k] = '[REDACTED]';
          } else if (typeof item[k] === 'object') {
            redactRecursive(item[k]);
          }
        }
      }
    }
    
    redactRecursive(obj);
    return JSON.stringify(obj);
  } catch (e) {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }
}

// Audit Logger
function addAuditLog(action, entityType, entityId, oldData, newData, notes, actorUserId, eventId) {
  try {
    var logs = readSheetObjects('15_AUDIT_LOG');
    var logId = 'LOG' + String(logs.length + 1).padStart(6, '0');
    var logObj = {
      log_id: logId,
      timestamp: new Date().toISOString(),
      user_id: actorUserId || 'SYSTEM',
      action: action,
      entity_type: entityType,
      entity_id: entityId,
      event_id: eventId || '',
      old_data_json: redactSensitiveData(oldData),
      new_data_json: redactSensitiveData(newData),
      notes: notes || ''
    };
    appendObject('15_AUDIT_LOG', logObj);
  } catch (e) {
    Logger.log('Audit log error: ' + e.toString());
  }
}

// Web App Request Handlers
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'health';
    if (action === 'health') {
      return handleHealth();
    }
    return jsonError('METHOD_NOT_ALLOWED', 'Aksi API "' + action + '" memerlukan HTTP POST.');
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err || '');
    if (msg.indexOf('AUTH_REQUIRED:') === 0) {
      return jsonError('AUTH_REQUIRED', msg.replace('AUTH_REQUIRED:', '').trim());
    }
    if (msg.indexOf('FORBIDDEN:') === 0) {
      return jsonError('FORBIDDEN', msg.replace('FORBIDDEN:', '').trim());
    }
    if (msg.indexOf('VALIDATION_ERROR:') === 0) {
      return jsonError('VALIDATION_ERROR', msg.replace('VALIDATION_ERROR:', '').trim());
    }
    return jsonError('SERVER_ERROR', msg);
  }
}

function doPost(e) {
  try {
    var contents = {};
    if (e && e.postData && e.postData.contents) {
      try {
        contents = JSON.parse(e.postData.contents);
      } catch (pe) {
        return jsonError('VALIDATION_ERROR', 'Format JSON post body tidak valid.');
      }
    }

    var action = contents.action || (e && e.parameter && e.parameter.action) || '';
    var payload = contents.payload || {};
    var authToken = contents.authToken || contents.token || '';

    return handlePostAndGetRouter(action, payload, authToken);
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err || '');
    if (msg.indexOf('AUTH_REQUIRED:') === 0) {
      return jsonError('AUTH_REQUIRED', msg.replace('AUTH_REQUIRED:', '').trim());
    }
    if (msg.indexOf('FORBIDDEN:') === 0) {
      return jsonError('FORBIDDEN', msg.replace('FORBIDDEN:', '').trim());
    }
    if (msg.indexOf('VALIDATION_ERROR:') === 0) {
      return jsonError('VALIDATION_ERROR', msg.replace('VALIDATION_ERROR:', '').trim());
    }
    return jsonError('SERVER_ERROR', msg);
  }
}

function handleHealth() {
  try {
    var ss = getSpreadsheet();
    var connected = Boolean(ss);
    return jsonResponse({
      status: 'ok',
      spreadsheetConnected: connected
    });
  } catch (e) {
    return jsonError('SERVER_ERROR', 'Gagal terhubung ke Google Spreadsheet: ' + e.message);
  }
}

// Reusable helper to resolve requested event ID or fall back to current/active event
function resolveRequestedEventId(eventId) {
  if (eventId && String(eventId).trim() !== '') {
    return String(eventId).trim();
  }
  try {
    var configs = readSheetObjects('01_APP_CONFIG');
    var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
    if (currConf && currConf.config_value && String(currConf.config_value).trim() !== '') {
      return String(currConf.config_value).trim();
    }
  } catch (e) {}
  try {
    var events = readSheetObjects('07_EVENTS');
    var activeEvt = events.find(function(evt) { return evt.status === 'ACTIVE'; }) || events[0];
    if (activeEvt && activeEvt.event_id) return String(activeEvt.event_id).trim();
  } catch (e) {}
  return '';
}

// Helper to get active teacher halaqahs for a resolved event
function getTeacherAuthorizedHalaqahIds(teacherId, eventId) {
  if (!teacherId) return [];
  var resolvedEvtId = resolveRequestedEventId(eventId);
  if (!resolvedEvtId) return []; // Fail closed if no event can be resolved
  var assignments = readSheetObjects('11_HALAQAH_TEACHERS')
    .filter(function(ht) {
      var isTeacher = ht.teacher_id === teacherId;
      var isActive = ht.active === true || String(ht.active) === 'true';
      var isEvt = ht.event_id === resolvedEvtId;
      return isTeacher && isActive && isEvt;
    });
  return assignments.map(function(ht) { return ht.halaqah_id; });
}

function handlePostAndGetRouter(action, payload, authToken) {
  switch (action) {
    // PUBLIC ROUTES
    case 'health':
      return handleHealth();

    case 'login':
      return handleLogin(payload);

    case 'searchLoginAccounts':
      return handleSearchLoginAccounts(payload);

    case 'logout':
      removeSession(authToken);
      return jsonResponse({ message: 'Berhasil logout' });

    case 'validateSession':
      var sess = requireAuth(authToken);
      return jsonResponse({
        valid: true,
        user: {
          user_id: sess.user_id,
          display_name: sess.display_name,
          role: sess.role,
          teacher_id: sess.teacher_id || ''
        }
      });

    case 'cleanupRevokedSessions':
      requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var deletedCount = cleanupRevokedSessions();
      return jsonResponse({ success: true, deletedCount: deletedCount });

    case 'publicStudentProgress':
      return handlePublicStudentProgress(payload);

    // PROTECTED ROUTES
    case 'getCurrentEvent':
      requireAuth(authToken);
      var events = readSheetObjects('07_EVENTS');
      var configs = readSheetObjects('01_APP_CONFIG');
      var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
      var activeId = currConf ? currConf.config_value : '';
      var activeEvt = events.find(function(evt) { return evt.event_id === activeId; }) ||
                        events.find(function(evt) { return evt.status === 'ACTIVE'; }) ||
                        events[0] || null;
      return jsonResponse(activeEvt);

    case 'getAppConfigs':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('01_APP_CONFIG'));

    case 'updateAppConfig':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      updateObject('01_APP_CONFIG', 'config_key', payload.key, {
        config_value: payload.value,
        updated_at: new Date().toISOString()
      });
      addAuditLog('UPDATE_CONFIG', 'CONFIG', payload.key, null, JSON.stringify(payload), null, sess.user_id);
      return jsonResponse({ success: true });

    case 'getLookups':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('02_LOOKUPS'));

    case 'getEvents':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('07_EVENTS'));

    case 'saveEvent':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      upsertObject('07_EVENTS', ['event_id'], payload.event, 'event_id');
      addAuditLog('SAVE_EVENT', 'EVENT', payload.event.event_id, null, payload.event, null, sess.user_id, payload.event.event_id);
      return jsonResponse(payload.event);

    case 'getEventDays':
      requireAuth(authToken);
      var days = readSheetObjects('07A_EVENT_DAYS');
      if (payload.eventId) {
        days = days.filter(function(d) { return d.event_id === payload.eventId; });
      }
      return jsonResponse(days);

    case 'saveEventDay':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      upsertObject('07A_EVENT_DAYS', ['event_day_id'], payload.eventDay, 'event_day_id');
      addAuditLog('SAVE_EVENT_DAY', 'EVENT_DAY', payload.eventDay.event_day_id, null, payload.eventDay, null, sess.user_id, payload.eventDay.event_id);
      return jsonResponse(payload.eventDay);

    case 'getSessionGroups':
      requireAuth(authToken);
      var groups = readSheetObjects('08_SESSION_GROUPS');
      if (payload.eventId) {
        groups = groups.filter(function(g) { return g.event_id === payload.eventId; });
      }
      return jsonResponse(groups);

    case 'saveSessionGroup':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      upsertObject('08_SESSION_GROUPS', ['session_group_id'], payload.sessionGroup, 'session_group_id');
      addAuditLog('SAVE_SESSION_GROUP', 'SESSION_GROUP', payload.sessionGroup.session_group_id, null, payload.sessionGroup, null, sess.user_id, payload.sessionGroup.event_id);
      return jsonResponse(payload.sessionGroup);

    case 'getSessionConfigs':
      requireAuth(authToken);
      var sConfigs = readSheetObjects('09_SESSION_CONFIG');
      if (payload.eventId) {
        sConfigs = sConfigs.filter(function(sc) { return sc.event_id === payload.eventId; });
      }
      sConfigs = sConfigs.map(function(sc) {
        sc.start_time = normalizeClockTime(sc.start_time);
        sc.end_time = normalizeClockTime(sc.end_time);
        return sc;
      });
      return jsonResponse(sConfigs);

    case 'saveSessionConfig':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var sc = payload.sessionConfig;
      if (!sc || !sc.session_config_id) {
        return jsonError('VALIDATION_ERROR', 'Data konfigurasi sesi dan session_config_id wajib diisi.');
      }

      // Explicitly retrieve start_time and end_time (handling camelCase as fallback)
      var rawStartTime = sc.start_time !== undefined && sc.start_time !== null ? sc.start_time : (sc.startTime || '');
      var rawEndTime = sc.end_time !== undefined && sc.end_time !== null ? sc.end_time : (sc.endTime || '');

      if (!rawStartTime || String(rawStartTime).trim() === '') {
        return jsonError('VALIDATION_ERROR', 'Jam mulai (start_time) wajib diisi.');
      }
      if (!rawEndTime || String(rawEndTime).trim() === '') {
        return jsonError('VALIDATION_ERROR', 'Jam selesai (end_time) wajib diisi.');
      }

      var normStartTime = normalizeClockTime(rawStartTime);
      var normEndTime = normalizeClockTime(rawEndTime);

      if (!normStartTime) {
        return jsonError('VALIDATION_ERROR', 'Format Jam Mulai tidak valid ("' + rawStartTime + '"). Gunakan format HH:mm (contoh: 08:00).');
      }
      if (!normEndTime) {
        return jsonError('VALIDATION_ERROR', 'Format Jam Selesai tidak valid ("' + rawEndTime + '"). Gunakan format HH:mm (contoh: 09:00).');
      }

      if (normStartTime >= normEndTime) {
        return jsonError('VALIDATION_ERROR', 'Jam Mulai (' + normStartTime + ') harus lebih awal dari Jam Selesai (' + normEndTime + ').');
      }

      sc.start_time = normStartTime;
      sc.end_time = normEndTime;
      delete sc.startTime;
      delete sc.endTime;

      Logger.log('SESSION TIME SAVE start=' + sc.start_time + ' end=' + sc.end_time);

      upsertObject('09_SESSION_CONFIG', ['session_config_id'], sc, 'session_config_id');
      addAuditLog('SAVE_SESSION_CONFIG', 'SESSION_CONFIG', sc.session_config_id, null, sc, null, sess.user_id, sc.event_id);
      return jsonResponse(sc);

    case 'getStudents':
      var sess = requireAuth(authToken);
      var students = readSheetObjects('03_MASTER_STUDENTS');

      if (sess.role === 'ADMIN') {
        return jsonResponse(students);
      }

      if (sess.role === 'COORDINATOR') {
        return jsonResponse(students.map(function(s) {
          var copy = Object.assign({}, s);
          copy.access_code = '';
          return copy;
        }));
      }

      if (sess.role === 'TEACHER') {
        if (!sess.teacher_id) {
          return jsonError('FORBIDDEN', 'Akun Guru Anda tidak memiliki ID Guru yang terhubung.');
        }
        var resolvedEvtId = resolveRequestedEventId(payload.eventId);
        var teacherHalaqahIds = getTeacherAuthorizedHalaqahIds(sess.teacher_id, resolvedEvtId);
        var allowedStudentIds = {};
        readSheetObjects('12_EVENT_PARTICIPANTS').forEach(function(p) {
          if (p.event_id === resolvedEvtId && teacherHalaqahIds.indexOf(p.halaqah_id) !== -1) {
            allowedStudentIds[p.student_id] = true;
          }
        });
        var teacherStudents = students.filter(function(s) { return allowedStudentIds[s.student_id]; }).map(function(s) {
          var copy = Object.assign({}, s);
          copy.access_code = '';
          return copy;
        });
        return jsonResponse(teacherStudents);
      }

      // VIEWER or others: mask access_code
      return jsonResponse(students.map(function(s) {
        var copy = Object.assign({}, s);
        copy.access_code = '';
        return copy;
      }));

    case 'saveStudent':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var studentObj = payload.student;
      var allStudents = readSheetObjects('03_MASTER_STUDENTS');

      if (!studentObj || !studentObj.student_id) {
        return jsonError('VALIDATION_ERROR', 'Data siswa dan student_id wajib diisi.');
      }

      if (studentObj.access_code && String(studentObj.access_code).trim() !== '') {
        var reqCode = String(studentObj.access_code).trim().toLowerCase();
        var duplicate = allStudents.find(function(s) {
          return s.student_id !== studentObj.student_id && String(s.access_code || '').trim().toLowerCase() === reqCode;
        });
        if (duplicate) {
          return jsonError('VALIDATION_ERROR', 'Kode Akses "' + studentObj.access_code + '" sudah digunakan oleh siswa lain (' + duplicate.full_name + ').');
        }
      } else {
        var existingCodes = allStudents.map(function(s) { return s.access_code; });
        studentObj.access_code = generateRandomAccessCodeGS(existingCodes);
      }

      upsertObject('03_MASTER_STUDENTS', ['student_id'], studentObj, 'student_id');
      addAuditLog('SAVE_STUDENT', 'STUDENT', studentObj.student_id, null, studentObj, null, sess.user_id);
      return jsonResponse(studentObj);

    case 'regenerateAccessCode':
      // Admin/Coordinator ONLY
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var studentId = payload.studentId;
      var allStudents = readSheetObjects('03_MASTER_STUDENTS');
      var targetStudent = allStudents.find(function(s) { return s.student_id === studentId; });
      if (!targetStudent) {
        return jsonError('NOT_FOUND', 'Siswa tidak ditemukan.');
      }

      var existingCodes = allStudents.map(function(s) { return s.access_code; });
      var newCode = generateRandomAccessCodeGS(existingCodes);
      var oldCode = targetStudent.access_code;
      targetStudent.access_code = newCode;
      targetStudent.updated_at = new Date().toISOString();
      upsertObject('03_MASTER_STUDENTS', ['student_id'], targetStudent, 'student_id');
      addAuditLog('REGENERATE_ACCESS_CODE', 'STUDENT', studentId, { access_code: oldCode }, { access_code: newCode }, null, sess.user_id);
      return jsonResponse({ success: true, newAccessCode: newCode });

    case 'getTeachers':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('04_MASTER_TEACHERS'));

    case 'saveTeacher':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      upsertObject('04_MASTER_TEACHERS', ['teacher_id'], payload.teacher, 'teacher_id');
      addAuditLog('SAVE_TEACHER', 'TEACHER', payload.teacher.teacher_id, null, payload.teacher, null, sess.user_id);
      return jsonResponse(payload.teacher);

    case 'getUsers':
      requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var users = readSheetObjects('06_USERS').map(function(u) {
        var safe = Object.assign({}, u);
        delete safe.password_hash;
        delete safe.password;
        return safe;
      });
      return jsonResponse(users);

    case 'saveUser':
      var sess = requireRole(authToken, ['ADMIN']);
      var userPayload = Object.assign({}, payload.user);
      if (!userPayload || !userPayload.user_id || !userPayload.username || !userPayload.display_name) {
        return jsonError('VALIDATION_ERROR', 'ID Pengguna, username, dan nama tampilan wajib diisi.');
      }
      
      var allowedRoles = ['ADMIN', 'COORDINATOR', 'TEACHER', 'VIEWER'];
      var role = String(userPayload.role || '').toUpperCase().trim();
      if (allowedRoles.indexOf(role) === -1) {
        return jsonError('VALIDATION_ERROR', 'Peran (role) "' + userPayload.role + '" tidak valid. Pilihan: ADMIN, COORDINATOR, TEACHER, VIEWER.');
      }
      userPayload.role = role;

      if (role === 'TEACHER') {
        if (!userPayload.teacher_id || String(userPayload.teacher_id).trim() === '') {
          return jsonError('VALIDATION_ERROR', 'Akun dengan role Guru (TEACHER) wajib menghubungkan Guru Terkait.');
        }
        var teachers = readSheetObjects('04_MASTER_TEACHERS');
        var matchedTeacher = teachers.find(function(t) { return t.teacher_id === userPayload.teacher_id; });
        if (!matchedTeacher) {
          return jsonError('VALIDATION_ERROR', 'Guru yang dipilih tidak ditemukan di Master Data Guru.');
        }
      } else {
        userPayload.teacher_id = '';
      }

      // Check username uniqueness (case-insensitive)
      var allUsers = readSheetObjects('06_USERS');
      var usernameLower = String(userPayload.username).trim().toLowerCase();
      var duplicate = allUsers.find(function(u) {
        return u.user_id !== userPayload.user_id && String(u.username || '').trim().toLowerCase() === usernameLower;
      });
      if (duplicate) {
        return jsonError('VALIDATION_ERROR', 'Username "' + userPayload.username + '" sudah digunakan oleh akun lain (' + duplicate.display_name + ').');
      }

      var existingUser = allUsers.find(function(u) { return u.user_id === userPayload.user_id; });
      var passwordChanged = false;
      var nowIso = new Date().toISOString();

      if (userPayload.password && String(userPayload.password).trim() !== '') {
        userPayload.password_hash = hashPasswordGS(String(userPayload.password).trim());
        passwordChanged = true;
      } else if (existingUser) {
        userPayload.password_hash = existingUser.password_hash || '';
      } else {
        return jsonError('VALIDATION_ERROR', 'Password awal wajib diisi untuk pembuatan akun baru.');
      }

      delete userPayload.password;
      userPayload.updated_at = nowIso;
      if (!existingUser) {
        userPayload.created_at = nowIso;
        userPayload.last_login_at = '';
      }

      upsertObject('06_USERS', ['user_id'], userPayload, 'user_id');

      if (passwordChanged || userPayload.active === false || String(userPayload.active).toLowerCase() === 'false') {
        revokeAllUserSessions(userPayload.user_id);
      }

      addAuditLog(
        existingUser ? 'UPDATE_USER' : 'CREATE_USER',
        'USER',
        userPayload.user_id,
        existingUser ? { display_name: existingUser.display_name, username: existingUser.username, role: existingUser.role, active: existingUser.active, teacher_id: existingUser.teacher_id } : null,
        { display_name: userPayload.display_name, username: userPayload.username, role: userPayload.role, active: userPayload.active, teacher_id: userPayload.teacher_id },
        null,
        sess.user_id
      );

      delete userPayload.password_hash;
      delete userPayload.password;
      return jsonResponse(userPayload);

    case 'resetUserPassword':
      return handleResetUserPassword(payload, authToken);

    case 'getHalaqahList':
      requireAuth(authToken);
      var list = readSheetObjects('10_HALAQAH');
      if (payload.eventId) {
        list = list.filter(function(h) { return h.event_id === payload.eventId; });
      }
      return jsonResponse(list);

    case 'saveHalaqah':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      upsertObject('10_HALAQAH', ['halaqah_id'], payload.halaqah, 'halaqah_id');
      addAuditLog('SAVE_HALAQAH', 'HALAQAH', payload.halaqah.halaqah_id, null, payload.halaqah, null, sess.user_id, payload.halaqah.event_id);
      return jsonResponse(payload.halaqah);

    case 'getHalaqahTeachers':
      requireAuth(authToken);
      var hts = readSheetObjects('11_HALAQAH_TEACHERS');
      hts = hts.filter(function(item) {
        return item.active === true || String(item.active).toLowerCase() === 'true';
      });
      if (payload.eventId) {
        hts = hts.filter(function(item) { return item.event_id === payload.eventId; });
      }
      return jsonResponse(hts);

    case 'saveHalaqahTeacher':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var ht = payload.halaqahTeacher;
      if (!ht || !ht.event_id || !ht.halaqah_id || !ht.teacher_id) {
        return jsonError('VALIDATION_ERROR', 'Data penugasan guru tidak lengkap.');
      }

      var allHts = readSheetObjects('11_HALAQAH_TEACHERS');
      var nowIso = new Date().toISOString();

      // Find matching assignments by business key: event_id + halaqah_id + teacher_id
      var matchingList = allHts.filter(function(item) {
        return item.event_id === ht.event_id &&
               item.halaqah_id === ht.halaqah_id &&
               item.teacher_id === ht.teacher_id;
      });

      var activeMatch = matchingList.find(function(item) {
        return item.active === true || String(item.active).toLowerCase() === 'true';
      });

      if (activeMatch) {
        // Active assignment already exists - update role if changed
        if (ht.teacher_role && activeMatch.teacher_role !== ht.teacher_role) {
          activeMatch.teacher_role = ht.teacher_role;
          activeMatch.updated_at = nowIso;
          var updateSuccess = updateObject('11_HALAQAH_TEACHERS', 'assignment_id', activeMatch.assignment_id, {
            teacher_role: activeMatch.teacher_role,
            updated_at: activeMatch.updated_at
          });
          if (!updateSuccess) {
            return jsonError('SERVER_ERROR', 'Gagal memperbarui peran penugasan guru.');
          }
          addAuditLog('UPDATE_HALAQAH_TEACHER_ROLE', 'HALAQAH_TEACHER', activeMatch.assignment_id, null, activeMatch, null, sess.user_id, activeMatch.event_id);
          invalidateSheetCache('11_HALAQAH_TEACHERS');
          invalidateSheetCache('10_HALAQAH');
        }
        return jsonResponse(activeMatch);
      }

      // Check for inactive matching assignment to reactivate
      var inactiveMatch = matchingList.find(function(item) {
        return item.active === false || String(item.active).toLowerCase() === 'false';
      }) || matchingList[0];

      if (inactiveMatch) {
        inactiveMatch.active = 'TRUE';
        inactiveMatch.teacher_role = ht.teacher_role || inactiveMatch.teacher_role || 'PRIMARY';
        inactiveMatch.updated_at = nowIso;
        var reactivateSuccess = updateObject('11_HALAQAH_TEACHERS', 'assignment_id', inactiveMatch.assignment_id, {
          active: 'TRUE',
          teacher_role: inactiveMatch.teacher_role,
          updated_at: inactiveMatch.updated_at
        });
        if (!reactivateSuccess) {
          return jsonError('SERVER_ERROR', 'Gagal mengaktifkan kembali penugasan guru.');
        }
        addAuditLog('REACTIVATE_HALAQAH_TEACHER', 'HALAQAH_TEACHER', inactiveMatch.assignment_id, null, inactiveMatch, null, sess.user_id, inactiveMatch.event_id);
        invalidateSheetCache('11_HALAQAH_TEACHERS');
        invalidateSheetCache('10_HALAQAH');
        return jsonResponse(inactiveMatch);
      }

      // No matching assignment found at all, create new row
      var newAssignment = {
        assignment_id: ht.assignment_id || ('HT-' + Utilities.getUuid().replace(/-/g, '').substring(0, 16)),
        event_id: ht.event_id,
        halaqah_id: ht.halaqah_id,
        teacher_id: ht.teacher_id,
        teacher_role: ht.teacher_role || 'PRIMARY',
        active: 'TRUE',
        created_at: nowIso,
        updated_at: nowIso
      };
      upsertObject('11_HALAQAH_TEACHERS', ['assignment_id'], newAssignment, 'assignment_id');
      addAuditLog('ASSIGN_HALAQAH_TEACHER', 'HALAQAH_TEACHER', newAssignment.assignment_id, null, newAssignment, null, sess.user_id, newAssignment.event_id);
      invalidateSheetCache('11_HALAQAH_TEACHERS');
      invalidateSheetCache('10_HALAQAH');
      return jsonResponse(newAssignment);

    case 'deleteHalaqahTeacher':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var assignmentId = payload.assignmentId;
      if (!assignmentId) {
        return jsonError('VALIDATION_ERROR', 'ID penugasan guru (assignmentId) wajib diisi.');
      }

      Logger.log('DELETE HALAQAH TEACHER REQUEST: ' + assignmentId);

      var deleted = deleteRowByField('11_HALAQAH_TEACHERS', 'assignment_id', assignmentId);
      if (!deleted) {
        return jsonError('NOT_FOUND', 'Penugasan guru tidak ditemukan.');
      }

      invalidateSheetCache('11_HALAQAH_TEACHERS');
      invalidateSheetCache('10_HALAQAH');

      Logger.log('DELETE COMPLETED: ' + assignmentId);

      addAuditLog(
        'DELETE_HALAQAH_TEACHER',
        'HALAQAH_TEACHER',
        assignmentId,
        deleted,
        { deleted: true, deleted_at: new Date().toISOString() },
        null,
        sess.user_id,
        deleted.event_id
      );

      return jsonResponse({
        deleted: true,
        assignmentId: assignmentId,
        teacherId: deleted.teacher_id,
        halaqahId: deleted.halaqah_id
      });

    case 'getEventParticipants':
      var sess = requireAuth(authToken);
      var resolvedEvtId = resolveRequestedEventId(payload.eventId);
      var parts = readSheetObjects('12_EVENT_PARTICIPANTS');
      if (resolvedEvtId) {
        parts = parts.filter(function(p) { return p.event_id === resolvedEvtId; });
      }

      if (sess.role === 'TEACHER') {
        var teacherHalaqahIds = getTeacherAuthorizedHalaqahIds(sess.teacher_id, resolvedEvtId);
        parts = parts.filter(function(p) { return teacherHalaqahIds.indexOf(p.halaqah_id) !== -1; });
      }

      return jsonResponse(parts);

    case 'getStudentPlacementBootstrap':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      var startTime = new Date().getTime();
      Logger.log('BOOTSTRAP START');

      // 1. Resolve Event
      var targetEventId = payload.eventId;
      var allEvents = readSheetObjects('07_EVENTS');
      var targetEvent = null;
      if (targetEventId) {
        targetEvent = allEvents.find(function(e) { return e.event_id === targetEventId; });
      }
      if (!targetEvent) {
        var configs = readSheetObjects('01_APP_CONFIG');
        var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
        var activeId = currConf ? currConf.config_value : '';
        targetEvent = allEvents.find(function(e) { return e.event_id === activeId; }) ||
                      allEvents.find(function(e) { return e.status === 'ACTIVE'; }) ||
                      allEvents[0] || null;
      }
      var resolvedEvtId = targetEvent ? targetEvent.event_id : targetEventId;

      // 2. Load Master Students (Project only required fields)
      var t1 = new Date().getTime();
      var rawStudents = readSheetObjects('03_MASTER_STUDENTS');
      var students = rawStudents.map(function(s) {
        return {
          student_id: s.student_id,
          nis: s.nis,
          full_name: s.full_name,
          gender: s.gender,
          grade_level: s.grade_level,
          class_name: s.class_name,
          active: s.active
        };
      });
      var studentsTime = new Date().getTime() - t1;
      Logger.log('students loaded: ' + studentsTime + ' ms');

      // 3. Load Participants (filtered by event_id)
      var t2 = new Date().getTime();
      var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS');
      var participants = allParticipants.filter(function(p) {
        return p.event_id === resolvedEvtId;
      });
      var participantsTime = new Date().getTime() - t2;
      Logger.log('participants loaded: ' + participantsTime + ' ms');

      // 4. Load Halaqahs (filtered by event_id)
      var t3 = new Date().getTime();
      var allHalaqahs = readSheetObjects('10_HALAQAH');
      var halaqahs = allHalaqahs.filter(function(h) {
        return h.event_id === resolvedEvtId && (h.active === true || String(h.active) === 'true');
      });
      var halaqahsTime = new Date().getTime() - t3;
      Logger.log('halaqahs loaded: ' + halaqahsTime + ' ms');

      var totalTime = new Date().getTime() - startTime;
      Logger.log('total bootstrap: ' + totalTime + ' ms');

      return jsonResponse({
        event: targetEvent,
        students: students,
        participants: participants,
        halaqahs: halaqahs
      });

    case 'getTeacherWorkspaceBootstrap':
      return handleGetTeacherWorkspaceBootstrap(payload, authToken);

    case 'bulkRegisterAndAssignStudentsToHalaqah':
    case 'bulkAssignStudentsToHalaqah':
      return handleBulkRegisterAndAssignStudentsToHalaqah(payload, authToken);

    case 'updateParticipantTarget':
      var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      upsertObject('12_EVENT_PARTICIPANTS', ['participant_id'], payload.participant, 'participant_id');
      addAuditLog('UPDATE_BASELINE_TARGET', 'PARTICIPANT', payload.participant.participant_id, null, payload.participant, null, sess.user_id, payload.participant.event_id);
      return jsonResponse(payload.participant);

    case 'getSessionAssessments':
      var sess = requireAuth(authToken);
      var resolvedEvtId = resolveRequestedEventId(payload.eventId);
      var asms = readSheetObjects('13_SESSION_ASSESSMENTS');
      asms = asms.filter(function(a) { return !a.is_deleted && String(a.is_deleted) !== 'true'; });
      if (resolvedEvtId) {
        asms = asms.filter(function(a) { return a.event_id === resolvedEvtId; });
      }

      if (sess.role === 'TEACHER') {
        var teacherHalaqahs = getTeacherAuthorizedHalaqahIds(sess.teacher_id, resolvedEvtId);
        asms = asms.filter(function(a) { return teacherHalaqahs.indexOf(a.halaqah_id) !== -1; });
      }

      return jsonResponse(asms);

    case 'saveSessionAssessment':
      var sess = requireRole(authToken, ['TEACHER', 'ADMIN', 'COORDINATOR']);
      var asm = Object.assign({}, payload.assessment);
      if (!asm || !asm.participant_id) {
        return jsonError('VALIDATION_ERROR', 'ID Peserta (participant_id) wajib diisi.');
      }

      // Resolve participant server-side
      var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS');
      var participant = allParticipants.find(function(p) { return p.participant_id === asm.participant_id; });
      if (!participant) {
        return jsonError('VALIDATION_ERROR', 'Peserta dengan ID "' + asm.participant_id + '" tidak ditemukan.');
      }

      // Derive authoritative participant values
      asm.student_id = participant.student_id;
      asm.halaqah_id = participant.halaqah_id;
      asm.event_id = participant.event_id;

      // Check teacher authorization
      if (sess.role === 'TEACHER') {
        if (!sess.teacher_id) {
          return jsonError('FORBIDDEN', 'Akun Guru Anda tidak terhubung dengan Master Data Guru.');
        }
        var teacherHalaqahs = getTeacherAuthorizedHalaqahIds(sess.teacher_id, participant.event_id);
        if (teacherHalaqahs.indexOf(participant.halaqah_id) === -1) {
          return jsonError('FORBIDDEN', 'Anda tidak berwenang mengedit penilaian untuk peserta ini.');
        }
        asm.teacher_id = sess.teacher_id;
      } else {
        // ADMIN or COORDINATOR: resolve responsible teacher for halaqah from 11_HALAQAH_TEACHERS
        var responsibleTeacherId = resolveResponsibleHalaqahTeacherId(participant.halaqah_id, participant.event_id, asm.teacher_id);
        if (!responsibleTeacherId) {
          return jsonError('VALIDATION_ERROR', 'Tidak ada guru penanggung jawab yang terdaftar untuk halaqah ini di Master Penugasan Guru.');
        }
        asm.teacher_id = responsibleTeacherId;
      }

      // Validate session_config_id
      if (!asm.session_config_id) {
        return jsonError('VALIDATION_ERROR', 'Sesi penilaian (session_config_id) wajib diisi.');
      }
      var allSessionConfigs = readSheetObjects('09_SESSION_CONFIG');
      var sConfig = allSessionConfigs.find(function(sc) { return sc.session_config_id === asm.session_config_id; });
      if (!sConfig) {
        return jsonError('VALIDATION_ERROR', 'Konfigurasi sesi "' + asm.session_config_id + '" tidak ditemukan.');
      }

      if (sConfig.event_id !== participant.event_id) {
        return jsonError('VALIDATION_ERROR', 'Sesi penilaian tidak sesuai dengan event peserta.');
      }

      if (participant.session_group_id && String(participant.session_group_id).trim() !== '') {
        if (sConfig.session_group_id !== participant.session_group_id) {
          return jsonError('VALIDATION_ERROR', 'Sesi penilaian tidak sesuai dengan kelompok sesi peserta.');
        }
      }

      // Derive session values from SessionConfig
      asm.event_day_id = sConfig.event_day_id;
      asm.session_no = sConfig.session_no;

      // Validate attendance status & progress fields
      var status = String(asm.attendance_status || 'UNASSESSED').toUpperCase().trim();
      var allowedStatuses = ['UNASSESSED', 'PRESENT', 'SICK', 'PERMISSION', 'ABSENT'];
      if (allowedStatuses.indexOf(status) === -1) {
        return jsonError('VALIDATION_ERROR', 'Status kehadiran "' + asm.attendance_status + '" tidak valid. Pilihan yang valid: UNASSESSED, PRESENT, SICK, PERMISSION, ABSENT.');
      }
      asm.attendance_status = status;

      if (status === 'PRESENT') {
        if (asm.surah_start == null || asm.surah_start === '' ||
            asm.ayah_start == null || asm.ayah_start === '' ||
            asm.surah_end == null || asm.surah_end === '' ||
            asm.ayah_end == null || asm.ayah_end === '' ||
            asm.lines_added == null || asm.lines_added === '') {
          return jsonError('VALIDATION_ERROR', 'Untuk status HADIR (PRESENT), data surah/ayat awal & akhir serta jumlah baris wajib diisi.');
        }
        asm.surah_start = Number(asm.surah_start);
        asm.ayah_start = Number(asm.ayah_start);
        asm.surah_end = Number(asm.surah_end);
        asm.ayah_end = Number(asm.ayah_end);
        asm.lines_added = Number(asm.lines_added); // preserves explicit 0
        asm.assessment_status = 'COMPLETED';
      } else if (status === 'UNASSESSED') {
        asm.assessment_status = 'PENDING';
        asm.surah_start = '';
        asm.ayah_start = '';
        asm.surah_end = '';
        asm.ayah_end = '';
        asm.lines_added = '';
      } else {
        // Clear Quran progress fields for non-PRESENT (do not store 0 for absence)
        asm.assessment_status = 'COMPLETED';
        asm.surah_start = '';
        asm.ayah_start = '';
        asm.surah_end = '';
        asm.ayah_end = '';
        asm.lines_added = '';
      }

      asm.updated_at = new Date().toISOString();
      if (!asm.created_at) asm.created_at = new Date().toISOString();
      asm.is_deleted = 'FALSE';
      asm.deleted_at = '';
      asm.deleted_by = '';

      // UPSERT by event_id + participant_id + session_config_id, PRESERVE assessment_id
      var resStatus = upsertObject('13_SESSION_ASSESSMENTS', ['event_id', 'participant_id', 'session_config_id'], asm, 'assessment_id');
      addAuditLog(resStatus === 'INSERTED' ? 'CREATE_ASSESSMENT' : 'UPDATE_ASSESSMENT', 'SESSION_ASSESSMENT', asm.assessment_id, null, asm, null, sess.user_id, asm.event_id);
      return jsonResponse(asm);

    case 'bulkSaveSessionAttendance':
      return handleBulkSaveSessionAttendance(payload, authToken);

    case 'deleteSessionAssessment':
      var sess = requireRole(authToken, ['TEACHER', 'ADMIN', 'COORDINATOR']);
      var assessmentId = payload.assessmentId;
      var existingAsm = readSheetObjects('13_SESSION_ASSESSMENTS').find(function(a) { return a.assessment_id === assessmentId; });
      if (!existingAsm) {
        return jsonError('NOT_FOUND', 'Penilaian tidak ditemukan.');
      }

      if (sess.role === 'TEACHER') {
        var teacherHalaqahs = getTeacherAuthorizedHalaqahIds(sess.teacher_id, existingAsm.event_id);
        if (teacherHalaqahs.indexOf(existingAsm.halaqah_id) === -1 && existingAsm.teacher_id !== sess.teacher_id) {
          return jsonError('FORBIDDEN', 'Anda tidak berwenang menghapus penilaian ini.');
        }
      }

      updateObject('13_SESSION_ASSESSMENTS', 'assessment_id', assessmentId, {
        is_deleted: 'TRUE',
        deleted_at: new Date().toISOString(),
        deleted_by: sess.user_id
      });
      addAuditLog('SOFT_DELETE_ASSESSMENT', 'SESSION_ASSESSMENT', assessmentId, null, null, null, sess.user_id);
      return jsonResponse({ success: true });

    case 'getFinalEvaluations':
      var sess = requireAuth(authToken);
      var resolvedEvtId = resolveRequestedEventId(payload.eventId);
      var evals = readSheetObjects('14_FINAL_EVALUATIONS');
      if (resolvedEvtId) {
        evals = evals.filter(function(e) { return e.event_id === resolvedEvtId; });
      }

      if (sess.role === 'TEACHER') {
        var teacherHalaqahs = getTeacherAuthorizedHalaqahIds(sess.teacher_id, resolvedEvtId);
        var allowedParticipants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) {
          return p.event_id === resolvedEvtId && teacherHalaqahs.indexOf(p.halaqah_id) !== -1;
        });
        var allowedIds = {};
        allowedParticipants.forEach(function(p) {
          allowedIds[p.participant_id] = true;
          allowedIds[p.student_id] = true;
        });
        evals = evals.filter(function(e) { return allowedIds[e.participant_id] || allowedIds[e.student_id]; });
      }

      return jsonResponse(evals);

    case 'saveFinalEvaluation':
      var sess = requireRole(authToken, ['TEACHER', 'ADMIN', 'COORDINATOR']);
      var fe = Object.assign({}, payload.finalEvaluation);
      if (!fe || !fe.participant_id) {
        return jsonError('VALIDATION_ERROR', 'ID Peserta (participant_id) wajib diisi.');
      }

      var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS');
      var participant = allParticipants.find(function(p) { return p.participant_id === fe.participant_id; });
      if (!participant) {
        return jsonError('VALIDATION_ERROR', 'Peserta dengan ID "' + fe.participant_id + '" tidak ditemukan.');
      }

      // Derive student_id and event_id from participant
      fe.student_id = participant.student_id;
      fe.event_id = participant.event_id;

      if (sess.role === 'TEACHER') {
        if (!sess.teacher_id) {
          return jsonError('FORBIDDEN', 'Akun Guru Anda tidak terhubung dengan Master Data Guru.');
        }
        var teacherHalaqahs = getTeacherAuthorizedHalaqahIds(sess.teacher_id, participant.event_id);
        if (teacherHalaqahs.indexOf(participant.halaqah_id) === -1) {
          return jsonError('FORBIDDEN', 'Anda tidak berwenang mengedit evaluasi akhir untuk peserta ini.');
        }
        fe.evaluator_teacher_id = sess.teacher_id;
      } else {
        // ADMIN or COORDINATOR: resolve responsible evaluator teacher for halaqah from 11_HALAQAH_TEACHERS
        var responsibleTeacherId = resolveResponsibleHalaqahTeacherId(participant.halaqah_id, participant.event_id, fe.evaluator_teacher_id || fe.teacher_id);
        if (!responsibleTeacherId) {
          return jsonError('VALIDATION_ERROR', 'Tidak ada guru evaluator penanggung jawab yang terdaftar untuk halaqah ini di Master Penugasan Guru.');
        }
        fe.evaluator_teacher_id = responsibleTeacherId;
      }

      // Validate completion_status ONLY: COMPLETE, INCOMPLETE
      var compStatus = String(fe.completion_status || '').toUpperCase().trim();
      if (['COMPLETE', 'INCOMPLETE'].indexOf(compStatus) === -1) {
        return jsonError('VALIDATION_ERROR', 'Status kelulusan (completion_status) harus COMPLETE atau INCOMPLETE.');
      }
      fe.completion_status = compStatus;

      // Validate skill_status_end ONLY: NON_BBL, BBL, BBLS
      var skillEnd = String(fe.skill_status_end || '').toUpperCase().trim();
      if (['NON_BBL', 'BBL', 'BBLS'].indexOf(skillEnd) === -1) {
        return jsonError('VALIDATION_ERROR', 'Status kemampuan akhir (skill_status_end) harus NON_BBL, BBL, atau BBLS.');
      }
      fe.skill_status_end = skillEnd;

      // Validate affective_rating ONLY: A, B, C, D or empty string
      var affRating = String(fe.affective_rating || '').toUpperCase().trim();
      delete fe.affective_grade;
      if (affRating !== '') {
        if (['A', 'B', 'C', 'D'].indexOf(affRating) === -1) {
          return jsonError('VALIDATION_ERROR', 'Nilai sikap (affective_rating) harus A, B, C, D, atau dikosongkan.');
        }
        fe.affective_rating = affRating;
      } else {
        fe.affective_rating = '';
      }

      // Require actual Quran evaluation range
      if (fe.evaluation_surah_start == null || fe.evaluation_surah_start === '' ||
          fe.evaluation_ayah_start == null || fe.evaluation_ayah_start === '' ||
          fe.evaluation_surah_end == null || fe.evaluation_surah_end === '' ||
          fe.evaluation_ayah_end == null || fe.evaluation_ayah_end === '') {
        return jsonError('VALIDATION_ERROR', 'Jangkauan surah dan ayat evaluasi akhir wajib diisi.');
      }

      fe.evaluation_surah_start = Number(fe.evaluation_surah_start);
      fe.evaluation_ayah_start = Number(fe.evaluation_ayah_start);
      fe.evaluation_surah_end = Number(fe.evaluation_surah_end);
      fe.evaluation_ayah_end = Number(fe.evaluation_ayah_end);

      fe.updated_at = new Date().toISOString();
      if (!fe.created_at) fe.created_at = new Date().toISOString();

      // UPSERT by event_id + participant_id, PRESERVE final_evaluation_id
      var feStatus = upsertObject('14_FINAL_EVALUATIONS', ['event_id', 'participant_id'], fe, 'final_evaluation_id');
      addAuditLog(feStatus === 'INSERTED' ? 'SAVE_FINAL_EVALUATION' : 'UPDATE_FINAL_EVALUATION', 'FINAL_EVALUATION', fe.final_evaluation_id, null, fe, null, sess.user_id, fe.event_id);
      return jsonResponse(fe);

    case 'getMyHalaqahData':
      var sess = requireRole(authToken, ['TEACHER', 'ADMIN', 'COORDINATOR']);
      var teacherId = null;
      if (sess.role === 'TEACHER') {
        teacherId = sess.teacher_id || null;
      } else {
        if (payload.teacherId && String(payload.teacherId).trim() !== '') {
          teacherId = String(payload.teacherId).trim();
        } else if (sess.teacher_id && String(sess.teacher_id).trim() !== '') {
          teacherId = String(sess.teacher_id).trim();
        }
      }
      return handleGetMyHalaqahData(teacherId, payload.eventId, payload.selectedHalaqahId, sess.role);

    case 'getAdminOverview':
      return handleGetAdminOverview(payload.eventId, authToken);

    case 'getCompletenessReport':
      return handleGetCompletenessReport(payload.eventId, authToken);

    case 'getExecutiveAnalytics':
      return handleGetExecutiveAnalytics(payload, authToken);

    case 'getAuditLogs':
      requireRole(authToken, ['ADMIN', 'COORDINATOR']);
      return jsonResponse(readSheetObjects('15_AUDIT_LOG'));

    default:
      return jsonError('VALIDATION_ERROR', 'Aksi API "' + action + '" tidak dikenal.');
  }
}

// Search Login Accounts Handler (Public minimal endpoint)
function handleSearchLoginAccounts(payload) {
  var query = (payload.query || payload.q || '').trim().toLowerCase();
  if (!query || query.length < 2) {
    return jsonResponse([]);
  }

  var users = readSheetObjects('06_USERS');
  var activeUsers = users.filter(function(u) {
    return u.active === true || String(u.active).toLowerCase() === 'true';
  });

  var matches = [];
  for (var i = 0; i < activeUsers.length; i++) {
    var u = activeUsers[i];
    var username = String(u.username || '').trim();
    var displayName = String(u.display_name || '').trim();
    
    var usernameLower = username.toLowerCase();
    var displayNameLower = displayName.toLowerCase();

    if (usernameLower.indexOf(query) !== -1 || displayNameLower.indexOf(query) !== -1) {
      matches.push({
        username: username,
        display_name: displayName
      });
      if (matches.length >= 8) {
        break;
      }
    }
  }

  return jsonResponse(matches);
}

// Login Handler
function handleLogin(payload) {
  var username = (payload.username || '').trim().toLowerCase();
  var password = (payload.password || '').trim();

  if (!username || !password) {
    return jsonError('VALIDATION_ERROR', 'Username dan password wajib diisi.');
  }

  var users = readSheetObjects('06_USERS');
  var user = users.find(function(u) {
    return String(u.username || '').trim().toLowerCase() === username && (u.active === true || String(u.active) === 'true');
  });

  if (!user) {
    return jsonError('AUTH_INVALID', 'Username atau password tidak cocok.');
  }

  // Salted SHA-256 password validation ONLY
  var passValid = verifyPasswordGS(password, user.password_hash);

  if (!passValid) {
    return jsonError('AUTH_INVALID', 'Username atau password tidak cocok.');
  }

  var session = createSession(user);

  addAuditLog('USER_LOGIN', 'USER', user.user_id, null, { username: user.username }, 'Login berhasil', user.user_id);

  return jsonResponse({
    token: session.token,
    user: {
      user_id: user.user_id,
      display_name: user.display_name,
      role: user.role,
      teacher_id: user.teacher_id || ''
    }
  });
}

// Reset User Password Handler (ADMIN only)
function handleResetUserPassword(payload, authToken) {
  var sess = requireRole(authToken, ['ADMIN']);
  var targetUserId = payload.userId || payload.user_id;
  var newPlainPassword = payload.newPassword || payload.password;

  if (!targetUserId || String(targetUserId).trim() === '') {
    return jsonError('VALIDATION_ERROR', 'ID Pengguna wajib diisi.');
  }

  if (!newPlainPassword || String(newPlainPassword).trim() === '') {
    return jsonError('VALIDATION_ERROR', 'Password baru tidak boleh kosong.');
  }

  var cleanPassword = String(newPlainPassword).trim();
  if (cleanPassword.length < 6) {
    return jsonError('VALIDATION_ERROR', 'Password baru minimal harus terdiri dari 6 karakter.');
  }

  var allUsers = readSheetObjects('06_USERS');
  var targetUser = allUsers.find(function(u) { return u.user_id === targetUserId; });
  if (!targetUser) {
    return jsonError('NOT_FOUND', 'Pengguna tidak ditemukan.');
  }

  var newHash = hashPasswordGS(cleanPassword);
  var nowIso = new Date().toISOString();

  // Update ONLY password_hash and updated_at
  updateObject('06_USERS', 'user_id', targetUserId, {
    password_hash: newHash,
    updated_at: nowIso
  });

  // Revoke all active sessions for that user
  revokeAllUserSessions(targetUserId);

  // Write audit log without password or hash
  addAuditLog(
    'RESET_USER_PASSWORD',
    'USER',
    targetUserId,
    null,
    {
      username: targetUser.username,
      display_name: targetUser.display_name,
      reset_at: nowIso
    },
    'Reset password user berhasil dilakukan oleh Admin',
    sess.user_id
  );

  return jsonResponse({
    success: true,
    userId: targetUserId
  });
}

// Teacher Halaqah Data Resolver
function handleGetMyHalaqahData(teacherId, eventId, selectedHalaqahId, userRole) {
  if (!teacherId) {
    return jsonResponse({ halaqah: null, students: [], sessions: [], sessionConfigs: [] });
  }

  var events = readSheetObjects('07_EVENTS');
  var configs = readSheetObjects('01_APP_CONFIG');
  var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
  var activeId = eventId || (currConf ? currConf.config_value : '') || (events[0] ? events[0].event_id : '');

  if (!activeId) {
    return jsonResponse({ halaqah: null, students: [], sessions: [], sessionConfigs: [] });
  }

  var halaqahList = readSheetObjects('10_HALAQAH').filter(function(h) {
    return h.event_id === activeId && (h.active === true || String(h.active).toLowerCase() === 'true');
  });
  var halaqahTeachers = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    return ht.event_id === activeId && (ht.active === true || String(ht.active).toLowerCase() === 'true');
  });
  var teachers = readSheetObjects('04_MASTER_TEACHERS');

  var myAssignments = halaqahTeachers.filter(function(ht) { return ht.teacher_id === teacherId; });
  if (myAssignments.length === 0) {
    return jsonResponse({ halaqah: null, students: [], sessions: [], sessionConfigs: [] });
  }

  var targetHalaqahId = selectedHalaqahId && myAssignments.some(function(a) { return a.halaqah_id === selectedHalaqahId; })
    ? selectedHalaqahId
    : myAssignments[0].halaqah_id;

  var currentHalaqah = halaqahList.find(function(h) { return h.halaqah_id === targetHalaqahId; });
  if (!currentHalaqah) {
    return jsonResponse({ halaqah: null, students: [], sessions: [], sessionConfigs: [] });
  }

  var teacherObj = teachers.find(function(t) { return t.teacher_id === teacherId; });
  var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return p.event_id === activeId; });
  var halaqahParticipants = allParticipants.filter(function(p) { return p.halaqah_id === currentHalaqah.halaqah_id; });
  var studentIdsInHalaqah = {};
  halaqahParticipants.forEach(function(p) { studentIdsInHalaqah[p.student_id] = true; });

  var students = readSheetObjects('03_MASTER_STUDENTS');
  var allAssessments = readSheetObjects('13_SESSION_ASSESSMENTS')
    .filter(function(a) { return a.event_id === activeId && !a.is_deleted && String(a.is_deleted) !== 'true'; });

  var halaqahAssessments = allAssessments.filter(function(a) {
    return a.halaqah_id === currentHalaqah.halaqah_id || studentIdsInHalaqah[a.student_id];
  });

  var evals = readSheetObjects('14_FINAL_EVALUATIONS').filter(function(e) { return e.event_id === activeId; });

  var studentMap = {};
  students.forEach(function(s) { studentMap[s.student_id] = s; });

  var evalMap = {};
  evals.forEach(function(e) {
    if (e.student_id) evalMap[e.student_id] = e;
    if (e.participant_id) evalMap[e.participant_id] = e;
  });

  var studentAsmsMap = {};
  halaqahAssessments.forEach(function(a) {
    if (a.attendance_status === 'PRESENT') {
      if (!studentAsmsMap[a.student_id]) studentAsmsMap[a.student_id] = [];
      studentAsmsMap[a.student_id].push(a);
    }
  });

  var mappedStudents = halaqahParticipants.map(function(p) {
    var st = studentMap[p.student_id];
    var studentEval = evalMap[p.student_id] || evalMap[p.participant_id];
    
    var studentAsms = studentAsmsMap[p.student_id] || [];
    var totalLines = studentAsms.reduce(function(sum, a) { return sum + (Number(a.lines_added) || 0); }, 0);

    return {
      student_id: p.student_id,
      participant_id: p.participant_id,
      nis: st ? st.nis : '',
      full_name: st ? st.full_name : 'Siswa',
      access_code: (userRole === 'ADMIN' && st) ? (st.access_code || '') : '',
      grade_class: (p.grade_snapshot || '') + ' (' + (p.class_snapshot || '') + ')',
      targetText: 'Target: ' + (p.target_lines || 0) + ' Baris',
      totalLinesAdded: totalLines,
      completionStatus: studentEval ? studentEval.completion_status : 'NOT_EVALUATED'
    };
  });

  var allSessionConfigs = readSheetObjects('09_SESSION_CONFIG').filter(function(sc) { return sc.event_id === activeId; });
  var sessionConfigs = (currentHalaqah.session_group_id && String(currentHalaqah.session_group_id).trim() !== '')
    ? allSessionConfigs.filter(function(sc) { return sc.session_group_id === currentHalaqah.session_group_id; })
    : [];

  return jsonResponse({
    halaqah: {
      halaqah_id: currentHalaqah.halaqah_id,
      group_name: currentHalaqah.halaqah_name,
      teacher_name: teacherObj ? teacherObj.full_name : 'Guru Tahfidz',
      session_group_id: currentHalaqah.session_group_id
    },
    students: mappedStudents,
    sessions: halaqahAssessments,
    sessionConfigs: sessionConfigs
  });
}

/**
 * Resolve responsible teacher_id for a halaqah from 11_HALAQAH_TEACHERS.
 * Prefer active PRIMARY teacher. If multiple/no primary, allows explicitly selected valid teacher or falls back to first active assigned teacher.
 */
function resolveResponsibleHalaqahTeacherId(halaqahId, eventId, preferredTeacherId) {
  var allHts = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    var isMatch = ht.halaqah_id === halaqahId && (!eventId || ht.event_id === eventId);
    var isActive = ht.active === true || String(ht.active) === 'true';
    return isMatch && isActive;
  });

  if (allHts.length === 0) {
    // If halaqah has no assigned teachers in 11_HALAQAH_TEACHERS, check if preferredTeacherId is a valid Master Teacher
    if (preferredTeacherId && String(preferredTeacherId).trim() !== '') {
      var allMasterTeachers = readSheetObjects('04_MASTER_TEACHERS');
      var validMaster = allMasterTeachers.find(function(t) { return t.teacher_id === preferredTeacherId; });
      if (validMaster) return validMaster.teacher_id;
    }
    return '';
  }

  var primaryTeachers = allHts.filter(function(ht) { return ht.teacher_role === 'PRIMARY'; });

  // If there is exactly one active PRIMARY teacher and no preferred or preferred matches:
  if (primaryTeachers.length === 1 && !preferredTeacherId) {
    return primaryTeachers[0].teacher_id;
  }

  // If preferredTeacherId is provided, check if it's among the active teachers assigned to this halaqah
  if (preferredTeacherId && String(preferredTeacherId).trim() !== '') {
    var matchedAssigned = allHts.find(function(ht) { return ht.teacher_id === preferredTeacherId; });
    if (matchedAssigned) {
      return matchedAssigned.teacher_id;
    }
  }

  // Otherwise fallback to primary teacher if available
  if (primaryTeachers.length > 0) {
    return primaryTeachers[0].teacher_id;
  }

  // Otherwise first active assigned teacher
  return allHts[0].teacher_id;
}

// Handler for Teacher Workspace Bootstrap (Optimized Single Snapshot)
function handleGetTeacherWorkspaceBootstrap(payload, authToken) {
  var sess = requireRole(authToken, ['TEACHER', 'ADMIN', 'COORDINATOR']);
  var startTime = new Date().getTime();
  Logger.log('TEACHER WORKSPACE BOOTSTRAP START for ' + sess.user_id + ' (role: ' + sess.role + ')');

  // 1. Resolve Event
  var targetEventId = payload.eventId;
  var allEvents = readSheetObjects('07_EVENTS');
  var targetEvent = null;
  if (targetEventId) {
    targetEvent = allEvents.find(function(e) { return e.event_id === targetEventId; });
  }
  if (!targetEvent) {
    var configs = readSheetObjects('01_APP_CONFIG');
    var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
    var activeId = currConf ? currConf.config_value : '';
    targetEvent = allEvents.find(function(e) { return e.event_id === activeId; }) ||
                  allEvents.find(function(e) { return e.status === 'ACTIVE'; }) ||
                  allEvents[0] || null;
  }
  var resolvedEvtId = targetEvent ? targetEvent.event_id : targetEventId;
  if (!resolvedEvtId) {
    return jsonResponse({
      event: null,
      halaqah: null,
      availableHalaqahs: [],
      students: [],
      sessionConfigs: [],
      assessments: [],
      finalEvaluations: [],
      assignedTeachers: [],
      serverTimestamp: new Date().toISOString()
    });
  }

  // 2. Read Reference Data (Single Pass)
  var allHalaqahs = readSheetObjects('10_HALAQAH').filter(function(h) {
    return h.event_id === resolvedEvtId && (h.active === true || String(h.active).toLowerCase() === 'true');
  });
  var allHalaqahTeachers = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    return ht.event_id === resolvedEvtId && (ht.active === true || String(ht.active).toLowerCase() === 'true');
  });
  var allTeachers = readSheetObjects('04_MASTER_TEACHERS');

  var teacherMap = {};
  allTeachers.forEach(function(t) { teacherMap[t.teacher_id] = t; });

  // 3. Determine Resolved Teacher ID and Accessible Halaqahs
  var resolvedTeacherId = null;
  if (sess.role === 'TEACHER') {
    resolvedTeacherId = sess.teacher_id || null;
  } else {
    // ADMIN or COORDINATOR: payload.teacherId must be used as the resolved teacher identity.
    if (payload.teacherId && String(payload.teacherId).trim() !== '') {
      resolvedTeacherId = String(payload.teacherId).trim();
    } else if (sess.teacher_id && String(sess.teacher_id).trim() !== '') {
      resolvedTeacherId = String(sess.teacher_id).trim();
    }
  }

  var availableHalaqahs = [];
  var selectedHalaqah = null;

  if (resolvedTeacherId) {
    var assignments = allHalaqahTeachers.filter(function(ht) {
      var isTeacherMatch = ht.teacher_id === resolvedTeacherId;
      var isEventMatch = ht.event_id === resolvedEvtId;
      var isActive = ht.active === true || String(ht.active).toLowerCase() === 'true';
      return isTeacherMatch && isEventMatch && isActive;
    });

    Logger.log('WORKSPACE teacherId=' + resolvedTeacherId);
    Logger.log('WORKSPACE eventId=' + resolvedEvtId);
    Logger.log('WORKSPACE assignments found=' + assignments.length);

    var authorizedHalaqahIds = {};
    assignments.forEach(function(ht) { authorizedHalaqahIds[ht.halaqah_id] = true; });

    availableHalaqahs = allHalaqahs.filter(function(h) {
      return authorizedHalaqahIds[h.halaqah_id];
    });

    if (availableHalaqahs.length === 0) {
      return jsonResponse({
        event: targetEvent,
        halaqah: null,
        availableHalaqahs: [],
        students: [],
        sessionConfigs: [],
        assessments: [],
        finalEvaluations: [],
        assignedTeachers: [],
        serverTimestamp: new Date().toISOString()
      });
    }

    if (payload.halaqahId && authorizedHalaqahIds[payload.halaqahId]) {
      selectedHalaqah = availableHalaqahs.find(function(h) { return h.halaqah_id === payload.halaqahId; }) || availableHalaqahs[0];
    } else {
      selectedHalaqah = availableHalaqahs[0];
    }
  } else {
    // ADMIN or COORDINATOR without specific teacher selected: Access all halaqahs for event
    availableHalaqahs = allHalaqahs;

    if (availableHalaqahs.length === 0) {
      return jsonResponse({
        event: targetEvent,
        halaqah: null,
        availableHalaqahs: [],
        students: [],
        sessionConfigs: [],
        assessments: [],
        finalEvaluations: [],
        assignedTeachers: [],
        serverTimestamp: new Date().toISOString()
      });
    }

    if (payload.halaqahId) {
      selectedHalaqah = availableHalaqahs.find(function(h) { return h.halaqah_id === payload.halaqahId; }) || availableHalaqahs[0];
    } else {
      selectedHalaqah = availableHalaqahs[0];
    }
  }

  if (!selectedHalaqah) {
    return jsonResponse({
      event: targetEvent,
      halaqah: null,
      availableHalaqahs: availableHalaqahs,
      students: [],
      sessionConfigs: [],
      assessments: [],
      finalEvaluations: [],
      assignedTeachers: [],
      serverTimestamp: new Date().toISOString()
    });
  }

  // 4. Resolve Assigned Teachers for Selected Halaqah
  var halaqahAssignments = allHalaqahTeachers.filter(function(ht) {
    return ht.halaqah_id === selectedHalaqah.halaqah_id;
  });

  var assignedTeachers = halaqahAssignments.map(function(ht) {
    var tObj = teacherMap[ht.teacher_id];
    return {
      teacher_id: ht.teacher_id,
      full_name: tObj ? tObj.full_name : 'Guru Tahfidz',
      short_name: tObj ? (tObj.short_name || '') : '',
      teacher_role: ht.teacher_role || 'PRIMARY'
    };
  });

  var primaryAssignment = halaqahAssignments.find(function(ht) { return ht.teacher_role === 'PRIMARY'; }) || halaqahAssignments[0];
  var primaryTeacherObj = primaryAssignment ? teacherMap[primaryAssignment.teacher_id] : null;

  var halaqahSummary = {
    halaqah_id: selectedHalaqah.halaqah_id,
    event_id: resolvedEvtId,
    halaqah_name: selectedHalaqah.halaqah_name,
    group_name: selectedHalaqah.halaqah_name,
    teacher_name: primaryTeacherObj ? primaryTeacherObj.full_name : (assignedTeachers.length > 0 ? assignedTeachers[0].full_name : 'Belum Ditugaskan'),
    gender: selectedHalaqah.gender || 'IKHWAN',
    grade_group: selectedHalaqah.grade_group || '',
    session_group_id: selectedHalaqah.session_group_id || '',
    location: selectedHalaqah.location || '',
    active: true
  };

  // 5. Load Participants for Selected Halaqah ONLY
  var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS');
  var targetParticipants = allParticipants.filter(function(p) {
    return p.event_id === resolvedEvtId && p.halaqah_id === selectedHalaqah.halaqah_id;
  });

  var studentIdMap = {};
  var participantIdMap = {};
  targetParticipants.forEach(function(p) {
    studentIdMap[p.student_id] = true;
    participantIdMap[p.participant_id] = true;
  });

  // 6. Load Master Students ONLY for accessible participants in this halaqah (Do NOT load all Master Students)
  var allStudents = readSheetObjects('03_MASTER_STUDENTS');
  var studentMap = {};
  allStudents.forEach(function(s) {
    if (studentIdMap[s.student_id]) {
      studentMap[s.student_id] = s;
    }
  });

  // 7. Load Assessments for target halaqah / students
  var rawAssessments = readSheetObjects('13_SESSION_ASSESSMENTS');
  var targetAssessments = rawAssessments.filter(function(a) {
    var notDeleted = !a.is_deleted && String(a.is_deleted) !== 'true';
    var isEvt = a.event_id === resolvedEvtId;
    var isInHalaqah = a.halaqah_id === selectedHalaqah.halaqah_id || studentIdMap[a.student_id];
    return notDeleted && isEvt && isInHalaqah;
  });

  var studentAsmsMap = {};
  targetAssessments.forEach(function(a) {
    if (a.attendance_status === 'PRESENT') {
      if (!studentAsmsMap[a.student_id]) studentAsmsMap[a.student_id] = [];
      studentAsmsMap[a.student_id].push(a);
    }
  });

  // 8. Load Final Evaluations for target participants / students
  var rawEvaluations = readSheetObjects('14_FINAL_EVALUATIONS');
  var targetEvaluations = rawEvaluations.filter(function(e) {
    var isEvt = e.event_id === resolvedEvtId;
    var matchesStudent = studentIdMap[e.student_id] || participantIdMap[e.participant_id];
    return isEvt && matchesStudent;
  });

  var evalMap = {};
  targetEvaluations.forEach(function(e) {
    if (e.participant_id) evalMap[e.participant_id] = e;
    if (e.student_id) evalMap[e.student_id] = e;
  });

  // 9. Load Session Configs
  var allSessionConfigs = readSheetObjects('09_SESSION_CONFIG').filter(function(sc) {
    return sc.event_id === resolvedEvtId;
  });
  var targetSessionConfigs = (selectedHalaqah.session_group_id && String(selectedHalaqah.session_group_id).trim() !== '')
    ? allSessionConfigs.filter(function(sc) { return sc.session_group_id === selectedHalaqah.session_group_id; })
    : allSessionConfigs;

  // 10. Map Students with Target & Progress
  var mappedStudents = targetParticipants.map(function(p) {
    var st = studentMap[p.student_id];
    var studentEval = evalMap[p.participant_id] || evalMap[p.student_id];
    var studentAsms = studentAsmsMap[p.student_id] || [];
    var totalLines = studentAsms.reduce(function(sum, a) { return sum + (Number(a.lines_added) || 0); }, 0);

    return {
      student_id: p.student_id,
      participant_id: p.participant_id,
      nis: st ? st.nis : '',
      full_name: st ? st.full_name : 'Siswa',
      access_code: (sess.role === 'ADMIN' && st) ? (st.access_code || '') : '',
      grade_snapshot: p.grade_snapshot || '',
      class_snapshot: p.class_snapshot || '',
      grade_class: (p.grade_snapshot || '') + ' (' + (p.class_snapshot || '') + ')',
      gender: st ? st.gender : (selectedHalaqah.gender || 'IKHWAN'),
      skill_status_start: p.skill_status_start || 'NON_BBL',
      baseline_surah: p.baseline_surah != null && p.baseline_surah !== '' ? Number(p.baseline_surah) : undefined,
      baseline_ayah: p.baseline_ayah != null && p.baseline_ayah !== '' ? Number(p.baseline_ayah) : undefined,
      target_surah_start: p.target_surah_start != null && p.target_surah_start !== '' ? Number(p.target_surah_start) : undefined,
      target_ayah_start: p.target_ayah_start != null && p.target_ayah_start !== '' ? Number(p.target_ayah_start) : undefined,
      target_surah_end: p.target_surah_end != null && p.target_surah_end !== '' ? Number(p.target_surah_end) : undefined,
      target_ayah_end: p.target_ayah_end != null && p.target_ayah_end !== '' ? Number(p.target_ayah_end) : undefined,
      target_lines: p.target_lines != null && p.target_lines !== '' ? Number(p.target_lines) : 0,
      targetText: 'Target: ' + (p.target_lines || 0) + ' Baris',
      totalLinesAdded: totalLines,
      completionStatus: studentEval ? studentEval.completion_status : 'NOT_EVALUATED',
      session_group_id: p.session_group_id || selectedHalaqah.session_group_id || ''
    };
  });

  var totalDuration = new Date().getTime() - startTime;
  Logger.log('TEACHER WORKSPACE BOOTSTRAP COMPLETE in ' + totalDuration + ' ms');

  return jsonResponse({
    event: targetEvent,
    halaqah: halaqahSummary,
    availableHalaqahs: availableHalaqahs,
    students: mappedStudents,
    sessionConfigs: targetSessionConfigs,
    assessments: targetAssessments,
    finalEvaluations: targetEvaluations,
    assignedTeachers: assignedTeachers,
    serverTimestamp: new Date().toISOString()
  });
}

/**
 * Handle bulk save attendance for multiple students for a specific SessionConfig.
 * Preserves Quran progress data for PRESENT if already exists.
 * Marks assessment_status = PENDING for PRESENT without progress, COMPLETED for others.
 */
function handleBulkSaveSessionAttendance(payload, authToken) {
  var sess = requireRole(authToken, ['TEACHER', 'ADMIN', 'COORDINATOR']);
  var sessionConfigId = payload.sessionConfigId;
  var studentIds = payload.studentIds || [];
  var rawStatus = payload.attendanceStatus || payload.status || '';
  var attendanceStatus = String(rawStatus).toUpperCase().trim();

  if (!sessionConfigId) {
    return jsonError('VALIDATION_ERROR', 'sessionConfigId wajib diisi.');
  }
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return jsonError('VALIDATION_ERROR', 'Pilih minimal satu siswa untuk mengisi presensi.');
  }

  var allowedStatuses = ['PRESENT', 'SICK', 'PERMISSION', 'ABSENT'];
  if (allowedStatuses.indexOf(attendanceStatus) === -1) {
    return jsonError('VALIDATION_ERROR', 'Status presensi "' + attendanceStatus + '" tidak valid. Pilihan: PRESENT, SICK, PERMISSION, ABSENT.');
  }

  var allSessionConfigs = readSheetObjects('09_SESSION_CONFIG');
  var sConfig = allSessionConfigs.find(function(sc) { return sc.session_config_id === sessionConfigId; });
  if (!sConfig) {
    return jsonError('NOT_FOUND', 'Konfigurasi sesi tidak ditemukan.');
  }

  var eventId = sConfig.event_id;
  var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return p.event_id === eventId; });

  var teacherHalaqahIds = null;
  if (sess.role === 'TEACHER') {
    if (!sess.teacher_id) {
      return jsonError('FORBIDDEN', 'Akun Guru Anda tidak memiliki ID Guru yang terhubung.');
    }
    teacherHalaqahIds = getTeacherAuthorizedHalaqahIds(sess.teacher_id, eventId);
  }

  var allAssessments = readSheetObjects('13_SESSION_ASSESSMENTS');
  var nowIso = new Date().toISOString();
  var updatedCount = 0;
  var updatedAssessments = [];

  studentIds.forEach(function(sid) {
    var participant = allParticipants.find(function(p) { return p.student_id === sid; });
    if (!participant) return;

    if (sess.role === 'TEACHER' && teacherHalaqahIds && teacherHalaqahIds.indexOf(participant.halaqah_id) === -1) {
      return; // Unauthorized halaqah for this teacher
    }

    var existingAsm = allAssessments.find(function(a) {
      var notDeleted = !a.is_deleted && String(a.is_deleted) !== 'true';
      return notDeleted &&
        a.event_id === eventId &&
        a.participant_id === participant.participant_id &&
        a.session_config_id === sessionConfigId;
    });

    var teacherIdToUse = sess.role === 'TEACHER'
      ? sess.teacher_id
      : (resolveResponsibleHalaqahTeacherId(participant.halaqah_id, eventId, sess.teacher_id) || sess.teacher_id || sess.user_id);

    var isPresent = attendanceStatus === 'PRESENT';

    if (existingAsm) {
      var asm = Object.assign({}, existingAsm);
      asm.attendance_status = attendanceStatus;
      asm.event_day_id = sConfig.event_day_id;
      asm.session_no = sConfig.session_no;
      asm.halaqah_id = participant.halaqah_id;
      asm.student_id = participant.student_id;
      asm.teacher_id = asm.teacher_id || teacherIdToUse;
      asm.updated_at = nowIso;
      asm.is_deleted = 'FALSE';

      if (isPresent) {
        var hasQuran = asm.surah_start != null && asm.surah_start !== '' && asm.lines_added != null && asm.lines_added !== '';
        var hasIqra = asm.iqra_level != null && asm.iqra_level !== '' && asm.iqra_page_start != null && asm.iqra_page_start !== '';
        asm.assessment_status = (hasQuran || hasIqra) ? 'COMPLETED' : 'PENDING';
      } else {
        asm.assessment_status = 'COMPLETED';
        asm.surah_start = '';
        asm.ayah_start = '';
        asm.surah_end = '';
        asm.ayah_end = '';
        asm.lines_added = '';
        asm.iqra_level = '';
        asm.iqra_page_start = '';
        asm.iqra_page_end = '';
      }

      upsertObject('13_SESSION_ASSESSMENTS', ['event_id', 'participant_id', 'session_config_id'], asm, 'assessment_id');
      updatedAssessments.push(asm);
      updatedCount++;
    } else {
      var newAsmId = 'ASM_' + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      var newAsm = {
        assessment_id: newAsmId,
        event_id: eventId,
        event_day_id: sConfig.event_day_id,
        session_config_id: sConfig.session_config_id,
        participant_id: participant.participant_id,
        student_id: participant.student_id,
        halaqah_id: participant.halaqah_id,
        session_no: sConfig.session_no,
        attendance_status: attendanceStatus,
        assessment_status: isPresent ? 'PENDING' : 'COMPLETED',
        assessment_mode: '',
        surah_start: '',
        ayah_start: '',
        surah_end: '',
        ayah_end: '',
        lines_added: '',
        iqra_level: '',
        iqra_page_start: '',
        iqra_page_end: '',
        session_note: '',
        teacher_id: teacherIdToUse,
        created_at: nowIso,
        updated_at: nowIso,
        is_deleted: 'FALSE',
        deleted_at: '',
        deleted_by: ''
      };

      upsertObject('13_SESSION_ASSESSMENTS', ['event_id', 'participant_id', 'session_config_id'], newAsm, 'assessment_id');
      updatedAssessments.push(newAsm);
      updatedCount++;
    }
  });

  addAuditLog(
    'BULK_ATTENDANCE',
    'SESSION_ASSESSMENT',
    sessionConfigId,
    null,
    { sessionConfigId: sessionConfigId, studentCount: updatedCount, status: attendanceStatus },
    'Presensi massal ' + updatedCount + ' siswa (' + attendanceStatus + ')',
    sess.user_id,
    eventId
  );

  return jsonResponse({
    success: true,
    updatedCount: updatedCount,
    updatedAssessments: updatedAssessments
  });
}

// Server-Side Admin Overview Handler
function handleGetAdminOverview(eventId, authToken) {
  var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
  var events = readSheetObjects('07_EVENTS');
  var configs = readSheetObjects('01_APP_CONFIG');
  var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
  var activeId = eventId || (currConf ? currConf.config_value : '') || (events[0] ? events[0].event_id : '');

  var activeEvt = events.find(function(e) { return e.event_id === activeId; }) || events[0] || null;
  if (!activeEvt) {
    return jsonResponse({
      activeEvent: null,
      metrics: { totalStudents: 0, totalHalaqahs: 0, inputCompletionRate: 0 },
      teachersProgress: [],
      anomalies: []
    });
  }

  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return p.event_id === activeEvt.event_id; });
  var halaqahs = readSheetObjects('10_HALAQAH').filter(function(h) { return h.event_id === activeEvt.event_id; });
  var sessionConfigs = readSheetObjects('09_SESSION_CONFIG').filter(function(sc) { return sc.event_id === activeEvt.event_id; });
  var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
    return a.event_id === activeEvt.event_id && !a.is_deleted && String(a.is_deleted) !== 'true';
  });
  var halaqahTeachers = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    return ht.event_id === activeEvt.event_id && (ht.active === true || String(ht.active) === 'true');
  });
  var teachers = readSheetObjects('04_MASTER_TEACHERS');
  var students = readSheetObjects('03_MASTER_STUDENTS');

  var teacherMap = {};
  teachers.forEach(function(t) { teacherMap[t.teacher_id] = t; });

  var halaqahMap = {};
  halaqahs.forEach(function(h) { halaqahMap[h.halaqah_id] = h; });

  var studentMap = {};
  students.forEach(function(s) { studentMap[s.student_id] = s; });

  var totalStudents = participants.length;
  var totalHalaqahs = halaqahs.length;

  var totalExpectedAssessments = 0;
  participants.forEach(function(p) {
    if (p.session_group_id && String(p.session_group_id).trim() !== '') {
      var activeConfigs = sessionConfigs.filter(function(sc) {
        return (sc.active === true || String(sc.active) === 'true') && sc.session_group_id === p.session_group_id;
      });
      totalExpectedAssessments += activeConfigs.length;
    }
  });

  var actualAssessmentsCount = assessments.length;
  var inputCompletionRate = totalExpectedAssessments > 0
    ? Math.min(100, Number(((actualAssessmentsCount / totalExpectedAssessments) * 100).toFixed(1)))
    : 0;

  var teachersProgress = halaqahTeachers.map(function(ht) {
    var teacherObj = teacherMap[ht.teacher_id];
    var halaqahObj = halaqahMap[ht.halaqah_id];

    var groupParticipants = participants.filter(function(p) { return p.halaqah_id === ht.halaqah_id; });
    var expectedForGroup = 0;
    groupParticipants.forEach(function(p) {
      if (p.session_group_id && String(p.session_group_id).trim() !== '') {
        var configs = sessionConfigs.filter(function(sc) {
          return (sc.active === true || String(sc.active) === 'true') && sc.session_group_id === p.session_group_id;
        });
        expectedForGroup += configs.length;
      }
    });

    var actualForGroup = assessments.filter(function(a) { return a.halaqah_id === ht.halaqah_id; }).length;
    var percentage = expectedForGroup > 0
      ? Math.min(100, Math.round((actualForGroup / expectedForGroup) * 100))
      : 100;

    return {
      teacherName: teacherObj ? teacherObj.full_name : 'Guru Tahfidz',
      groupName: halaqahObj ? halaqahObj.halaqah_name : 'Halaqah',
      completedSessions: actualForGroup,
      totalSessions: expectedForGroup,
      percentage: percentage
    };
  });

  var anomalies = [];
  assessments.forEach(function(a) {
    var lines = Number(a.lines_added) || 0;
    if (lines > 40) {
      var st = studentMap[a.student_id];
      anomalies.push({
        studentName: st ? st.full_name : 'Siswa',
        sessionNo: a.session_no,
        description: 'Setoran melampaui ' + lines + ' baris dalam 1 sesi (perlu verifikasi)'
      });
    }
  });

  return jsonResponse({
    activeEvent: activeEvt,
    metrics: {
      totalStudents: totalStudents,
      totalHalaqahs: totalHalaqahs,
      inputCompletionRate: inputCompletionRate
    },
    teachersProgress: teachersProgress,
    anomalies: anomalies
  });
}

// Server-Side Completeness Report Handler
function handleGetCompletenessReport(eventId, authToken) {
  var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
  var events = readSheetObjects('07_EVENTS');
  var configs = readSheetObjects('01_APP_CONFIG');
  var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
  var activeId = eventId || (currConf ? currConf.config_value : '') || (events[0] ? events[0].event_id : '');

  var activeEvt = events.find(function(e) { return e.event_id === activeId; }) || events[0] || null;
  if (!activeEvt) {
    return jsonResponse({
      event: null,
      counts: { totalParticipants: 0, withoutHalaqahCount: 0, withoutSessionGroupCount: 0, withoutBaselineCount: 0, withoutTargetCount: 0, withoutFinalEvalCount: 0 },
      issues: { withoutHalaqah: [], withoutSessionGroup: [], withoutBaseline: [], withoutTarget: [], withoutFinalEval: [] },
      halaqahReports: []
    });
  }

  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return p.event_id === activeEvt.event_id; });
  var students = readSheetObjects('03_MASTER_STUDENTS');
  var halaqahs = readSheetObjects('10_HALAQAH').filter(function(h) { return h.event_id === activeEvt.event_id; });
  var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
    return a.event_id === activeEvt.event_id && !a.is_deleted && String(a.is_deleted) !== 'true';
  });
  var evals = readSheetObjects('14_FINAL_EVALUATIONS').filter(function(e) { return e.event_id === activeEvt.event_id; });
  var sessionConfigs = readSheetObjects('09_SESSION_CONFIG').filter(function(sc) { return sc.event_id === activeEvt.event_id; });

  var studentMap = {};
  students.forEach(function(s) { studentMap[s.student_id] = s; });

  var withoutHalaqah = participants.filter(function(p) { return !p.halaqah_id || String(p.halaqah_id).trim() === ''; });
  var withoutSessionGroup = participants.filter(function(p) { return !p.session_group_id || String(p.session_group_id).trim() === ''; });
  var withoutBaseline = participants.filter(function(p) { return p.baseline_surah == null || p.baseline_surah === '' || p.baseline_ayah == null || p.baseline_ayah === ''; });
  var withoutTarget = participants.filter(function(p) { return p.target_surah_start == null || p.target_surah_start === '' || p.target_lines == null || Number(p.target_lines) === 0; });
  var withoutFinalEval = participants.filter(function(p) { return !evals.some(function(e) { return e.student_id === p.student_id || e.participant_id === p.participant_id; }); });

  var halaqahReports = halaqahs.map(function(h) {
    var hParts = participants.filter(function(p) { return p.halaqah_id === h.halaqah_id; });
    var expectedRecordCount = 0;
    hParts.forEach(function(p) {
      if (p.session_group_id && String(p.session_group_id).trim() !== '') {
        var configsForGroup = sessionConfigs.filter(function(sc) {
          return (sc.active === true || String(sc.active) === 'true') && sc.session_group_id === p.session_group_id;
        });
        expectedRecordCount += configsForGroup.length;
      }
    });

    var actualAsms = assessments.filter(function(a) { return a.halaqah_id === h.halaqah_id; });
    var missingCount = Math.max(0, expectedRecordCount - actualAsms.length);
    var percentage = expectedRecordCount > 0 ? Math.round((actualAsms.length / expectedRecordCount) * 100) : 0;

    return {
      halaqah_id: h.halaqah_id,
      halaqah_name: h.halaqah_name,
      studentCount: hParts.length,
      submittedSessions: actualAsms.length,
      expectedSessions: expectedRecordCount,
      missingCount: missingCount,
      percentage: Math.min(100, percentage)
    };
  });

  function mapStudentIssue(p) {
    var st = studentMap[p.student_id];
    return {
      student_id: p.student_id,
      name: st ? st.full_name : 'Siswa',
      class: (p.grade_snapshot || '') + ' (' + (p.class_snapshot || '') + ')'
    };
  }

  return jsonResponse({
    event: activeEvt,
    counts: {
      totalParticipants: participants.length,
      withoutHalaqahCount: withoutHalaqah.length,
      withoutSessionGroupCount: withoutSessionGroup.length,
      withoutBaselineCount: withoutBaseline.length,
      withoutTargetCount: withoutTarget.length,
      withoutFinalEvalCount: withoutFinalEval.length
    },
    issues: {
      withoutHalaqah: withoutHalaqah.map(mapStudentIssue),
      withoutSessionGroup: withoutSessionGroup.map(mapStudentIssue),
      withoutBaseline: withoutBaseline.map(mapStudentIssue),
      withoutTarget: withoutTarget.map(mapStudentIssue),
      withoutFinalEval: withoutFinalEval.map(mapStudentIssue)
    },
    halaqahReports: halaqahReports
  });
}

// Statistical Computation Utilities for Executive Analytics
function calculateStatsGS(values) {
  var sanitized = (values || []).filter(function(v) {
    return typeof v === 'number' && isFinite(v) && !isNaN(v) && v >= 0;
  });

  if (sanitized.length === 0) {
    return {
      count: 0, totalLines: 0, mean: 0, median: 0, stdDev: 0, cv: 0,
      min: 0, max: 0, q1: 0, q3: 0, iqr: 0, lowerWhisker: 0, upperWhisker: 0,
      bottom25Avg: 0, completionRate: 0, outliers: []
    };
  }

  var sorted = sanitized.slice().sort(function(a, b) { return a - b; });
  var count = sorted.length;
  var totalLines = sorted.reduce(function(acc, v) { return acc + v; }, 0);
  var mean = totalLines / count;

  var median = 0;
  var mid = Math.floor(count / 2);
  if (count % 2 === 0) {
    median = (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    median = sorted[mid];
  }

  var variance = sorted.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / count;
  var stdDev = Math.sqrt(variance);
  var cv = mean > 0 ? stdDev / mean : 0;

  var min = sorted[0];
  var max = sorted[count - 1];

  function getPercentileGS(arr, p) {
    if (arr.length === 0) return 0;
    if (arr.length === 1) return arr[0];
    var idx = (p / 100) * (arr.length - 1);
    var l = Math.floor(idx);
    var u = Math.ceil(idx);
    var w = idx - l;
    if (u >= arr.length) return arr[arr.length - 1];
    return arr[l] * (1 - w) + arr[u] * w;
  }

  var q1 = getPercentileGS(sorted, 25);
  var q3 = getPercentileGS(sorted, 75);
  var iqr = q3 - q1;

  var lowerBound = q1 - 1.5 * iqr;
  var upperBound = q3 + 1.5 * iqr;
  var outliers = sorted.filter(function(v) { return v < lowerBound || v > upperBound; });

  var inBoundValues = sorted.filter(function(v) { return v >= lowerBound && v <= upperBound; });
  var lowerWhisker = inBoundValues.length > 0 ? inBoundValues[0] : min;
  var upperWhisker = inBoundValues.length > 0 ? inBoundValues[inBoundValues.length - 1] : max;

  var bottom25Count = Math.max(1, Math.ceil(count * 0.25));
  var bottom25Values = sorted.slice(0, bottom25Count);
  var bottom25Avg = bottom25Values.reduce(function(acc, v) { return acc + v; }, 0) / bottom25Values.length;

  return {
    count: count,
    totalLines: totalLines,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    cv: Number(cv.toFixed(3)),
    min: min,
    max: max,
    q1: Number(q1.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    iqr: Number(iqr.toFixed(2)),
    lowerWhisker: lowerWhisker,
    upperWhisker: upperWhisker,
    bottom25Avg: Number(bottom25Avg.toFixed(2)),
    completionRate: 0,
    outliers: outliers
  };
}

function getDistributionBucketsGS(values) {
  var sanitized = (values || []).filter(function(v) {
    return typeof v === 'number' && isFinite(v) && !isNaN(v) && v >= 0;
  });
  var total = sanitized.length || 1;
  var r0_10 = 0, r11_20 = 0, r21_30 = 0, rOver30 = 0;
  sanitized.forEach(function(v) {
    if (v <= 10) r0_10++;
    else if (v <= 20) r11_20++;
    else if (v <= 30) r21_30++;
    else rOver30++;
  });
  return [
    { range: '0–10 Baris', count: r0_10, percentage: Number(((r0_10 / total) * 100).toFixed(1)) },
    { range: '11–20 Baris', count: r11_20, percentage: Number(((r11_20 / total) * 100).toFixed(1)) },
    { range: '21–30 Baris', count: r21_30, percentage: Number(((r21_30 / total) * 100).toFixed(1)) },
    { range: '> 30 Baris', count: rOver30, percentage: Number(((rOver30 / total) * 100).toFixed(1)) }
  ];
}

function calculateSkillTransitionsGS(participants, evalMap) {
  var map = {};
  var notEvaluatedSkillCount = 0;
  var missingSkillStartCount = 0;

  participants.forEach(function(p) {
    var endSkill = evalMap[p.student_id] || evalMap[p.participant_id];
    if (!endSkill) {
      notEvaluatedSkillCount++;
      return;
    }
    var from = p.skill_status_start;
    if (!from || String(from).trim() === '') {
      missingSkillStartCount++;
      return;
    }
    var to = endSkill;
    var key = from + '->' + to;
    map[key] = (map[key] || 0) + 1;
  });

  var transitions = [];
  var statuses = ['NON_BBL', 'BBL', 'BBLS'];
  statuses.forEach(function(from) {
    statuses.forEach(function(to) {
      var key = from + '->' + to;
      transitions.push({ from: from, to: to, count: map[key] || 0 });
    });
  });

  return {
    transitions: transitions,
    notEvaluatedSkillCount: notEvaluatedSkillCount,
    missingSkillStartCount: missingSkillStartCount
  };
}

// Server-Side Executive Analytics Handler
function handleGetExecutiveAnalytics(params, authToken) {
  requireRole(authToken, ['ADMIN', 'COORDINATOR', 'VIEWER']);
  var allEvents = readSheetObjects('07_EVENTS');

  var filteredEvents = allEvents;
  if (params && params.academicYearFilter && params.academicYearFilter !== 'ALL') {
    filteredEvents = filteredEvents.filter(function(e) { return e.academic_year === params.academicYearFilter; });
  }

  var students = readSheetObjects('03_MASTER_STUDENTS');
  var studentMap = {};
  students.forEach(function(s) { studentMap[s.student_id] = s; });

  function filterParticipantsGS(parts) {
    return parts.filter(function(p) {
      var st = studentMap[p.student_id];
      if (!st) return false;

      if (params.gradeFilter && params.gradeFilter !== 'ALL') {
        if (p.grade_snapshot !== params.gradeFilter && st.grade_level !== params.gradeFilter) return false;
      }
      if (params.genderFilter && params.genderFilter !== 'ALL') {
        if (st.gender !== params.genderFilter) return false;
      }
      if (params.halaqahFilter && params.halaqahFilter !== 'ALL') {
        if (p.halaqah_id !== params.halaqahFilter) return false;
      }
      return true;
    });
  }

  var cohortStudentIds = null;
  if (params.analyticsMode === 'COHORT') {
    var eventStudentSets = filteredEvents.map(function(evt) {
      var rawParts = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return p.event_id === evt.event_id; });
      var fp = filterParticipantsGS(rawParts);
      var setObj = {};
      fp.forEach(function(p) { setObj[p.student_id] = true; });
      return setObj;
    });

    if (eventStudentSets.length > 0) {
      cohortStudentIds = {};
      var firstSet = eventStudentSets[0];
      for (var sid in firstSet) {
        if (firstSet.hasOwnProperty(sid)) {
          var inAll = eventStudentSets.every(function(setObj) { return Boolean(setObj[sid]); });
          if (inAll) cohortStudentIds[sid] = true;
        }
      }
    } else {
      cohortStudentIds = {};
    }
  }

  var targetEvent = null;
  if (params.eventId) {
    targetEvent = filteredEvents.find(function(e) { return e.event_id === params.eventId; }) ||
                  allEvents.find(function(e) { return e.event_id === params.eventId; });
  }
  if (!targetEvent) {
    var currConf = readSheetObjects('01_APP_CONFIG').find(function(c) { return c.config_key === 'current_event_id'; });
    var activeId = currConf ? currConf.config_value : '';
    targetEvent = allEvents.find(function(e) { return e.event_id === activeId; }) || allEvents[0] || null;
  }

  var targetEventId = targetEvent ? targetEvent.event_id : null;

  function computeEventMetricsGS(evtId) {
    var rawParts = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return p.event_id === evtId; });
    var participants = filterParticipantsGS(rawParts);

    if (cohortStudentIds) {
      participants = participants.filter(function(p) { return Boolean(cohortStudentIds[p.student_id]); });
    }

    var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
      return a.event_id === evtId && !a.is_deleted && String(a.is_deleted) !== 'true';
    });
    var evaluations = readSheetObjects('14_FINAL_EVALUATIONS').filter(function(e) { return e.event_id === evtId; });

    var studentAsmMap = {};
    assessments.forEach(function(a) {
      if (!studentAsmMap[a.student_id]) studentAsmMap[a.student_id] = [];
      studentAsmMap[a.student_id].push(a);
    });

    var validProgressLines = [];
    var missingProgressCount = 0;

    participants.forEach(function(p) {
      var asms = studentAsmMap[p.student_id];
      if (asms && asms.length > 0) {
        var presentAsms = asms.filter(function(a) { return a.attendance_status === 'PRESENT'; });
        if (presentAsms.length > 0) {
          var totalLines = presentAsms.reduce(function(sum, a) { return sum + (Number(a.lines_added) || 0); }, 0);
          validProgressLines.push(totalLines);
        } else {
          missingProgressCount++;
        }
      } else {
        missingProgressCount++;
      }
    });

    var participantCount = participants.length;
    var validProgressCount = validProgressLines.length;

    var stats = calculateStatsGS(validProgressLines);
    var distributionBuckets = getDistributionBucketsGS(validProgressLines);

    var evalMap = {};
    var completionMap = {};

    evaluations.forEach(function(e) {
      evalMap[e.student_id] = e.skill_status_end;
      evalMap[e.participant_id] = e.skill_status_end;
      completionMap[e.student_id] = e.completion_status;
      completionMap[e.participant_id] = e.completion_status;
    });

    var evaluatedCount = 0;
    var notEvaluatedCount = 0;
    var completedCount = 0;
    var incompleteCount = 0;

    participants.forEach(function(p) {
      var compStatus = completionMap[p.student_id] || completionMap[p.participant_id];
      if (compStatus) {
        evaluatedCount++;
        if (compStatus === 'COMPLETE') completedCount++;
        else incompleteCount++;
      } else {
        notEvaluatedCount++;
      }
    });

    var evaluationCoverage = participantCount > 0
      ? Number(((evaluatedCount / participantCount) * 100).toFixed(1))
      : 0;

    var completionRateAmongEvaluated = evaluatedCount > 0
      ? Number(((completedCount / evaluatedCount) * 100).toFixed(1))
      : 0;

    stats.completionRate = completionRateAmongEvaluated;

    var resTrans = calculateSkillTransitionsGS(participants, evalMap);

    return {
      participantCount: participantCount,
      validProgressCount: validProgressCount,
      missingProgressCount: missingProgressCount,
      evaluatedCount: evaluatedCount,
      notEvaluatedCount: notEvaluatedCount,
      evaluationCoverage: evaluationCoverage,
      completedCount: completedCount,
      incompleteCount: incompleteCount,
      completionRateAmongEvaluated: completionRateAmongEvaluated,
      stats: stats,
      distributionBuckets: distributionBuckets,
      skillTransitions: resTrans.transitions,
      notEvaluatedSkillCount: resTrans.notEvaluatedSkillCount,
      participants: participants
    };
  }

  if (params.analyticsMode === 'ANNUAL') {
    var sortedEvents = filteredEvents.slice().sort(function(a, b) { return (Number(a.sequence_no) || 0) - (Number(b.sequence_no) || 0); });
    var annualData = sortedEvents.map(function(evt) {
      var metrics = computeEventMetricsGS(evt.event_id);
      return {
        eventId: evt.event_id,
        eventName: evt.event_name,
        academicYear: evt.academic_year,
        sequenceNo: evt.sequence_no,
        participantCount: metrics.participantCount,
        validProgressCount: metrics.validProgressCount,
        missingProgressCount: metrics.missingProgressCount,
        evaluatedCount: metrics.evaluatedCount,
        completedCount: metrics.completedCount,
        incompleteCount: metrics.incompleteCount,
        evaluationCoverage: metrics.evaluationCoverage,
        completionRateAmongEvaluated: metrics.completionRateAmongEvaluated,
        stats: metrics.stats,
        totalLines: metrics.stats.totalLines,
        meanLines: metrics.stats.mean,
        medianLines: metrics.stats.median,
        stdDev: metrics.stats.stdDev,
        cv: metrics.stats.cv
      };
    });

    return jsonResponse({
      mode: 'ANNUAL',
      eventsCount: sortedEvents.length,
      annualData: annualData
    });
  }

  if (params.analyticsMode === 'COHORT') {
    var sortedEvents = filteredEvents.slice().sort(function(a, b) { return (Number(a.sequence_no) || 0) - (Number(b.sequence_no) || 0); });
    var cohortData = sortedEvents.map(function(evt) {
      var metrics = computeEventMetricsGS(evt.event_id);
      return {
        eventId: evt.event_id,
        eventName: evt.event_name,
        academicYear: evt.academic_year,
        sequenceNo: evt.sequence_no,
        participantCount: metrics.participantCount,
        validProgressCount: metrics.validProgressCount,
        missingProgressCount: metrics.missingProgressCount,
        evaluatedCount: metrics.evaluatedCount,
        completedCount: metrics.completedCount,
        incompleteCount: metrics.incompleteCount,
        evaluationCoverage: metrics.evaluationCoverage,
        completionRateAmongEvaluated: metrics.completionRateAmongEvaluated,
        stats: metrics.stats,
        totalLines: metrics.stats.totalLines,
        meanLines: metrics.stats.mean,
        medianLines: metrics.stats.median,
        stdDev: metrics.stats.stdDev,
        cv: metrics.stats.cv
      };
    });

    var targetMetrics = targetEventId ? computeEventMetricsGS(targetEventId) : {};
    var cohortSize = cohortStudentIds ? Object.keys(cohortStudentIds).length : 0;

    return jsonResponse(Object.assign({
      mode: 'COHORT',
      eventsCount: sortedEvents.length,
      cohortSize: cohortSize,
      cohortData: cohortData,
      event: targetEvent
    }, targetMetrics));
  }

  if (!targetEventId) {
    return jsonResponse({
      mode: params.analyticsMode || 'SINGLE',
      event: null,
      participantCount: 0,
      validProgressCount: 0,
      missingProgressCount: 0,
      evaluatedCount: 0,
      notEvaluatedCount: 0,
      evaluationCoverage: 0,
      completedCount: 0,
      incompleteCount: 0,
      completionRateAmongEvaluated: 0,
      stats: calculateStatsGS([]),
      distributionBuckets: [],
      skillTransitions: [],
      notEvaluatedSkillCount: 0,
      cohortSize: 0
    });
  }

  var targetMetrics = computeEventMetricsGS(targetEventId);
  var cohortSizeVal = cohortStudentIds ? Object.keys(cohortStudentIds).length : 0;

  return jsonResponse(Object.assign({
    mode: params.analyticsMode || 'SINGLE',
    event: targetEvent,
    cohortSize: cohortSizeVal
  }, targetMetrics));
}

// Public Student Progress Lookup Handler
function handlePublicStudentProgress(payload) {
  var accessCode = String(payload.accessCode || '').trim();
  if (!accessCode) {
    return jsonError('VALIDATION_ERROR', 'Kode Akses wajib diisi untuk melihat perkembangan siswa.');
  }

  var students = readSheetObjects('03_MASTER_STUDENTS');
  var matchedStudent = students.find(function(s) {
    var isCode = String(s.access_code || '').trim().toLowerCase() === accessCode.toLowerCase();
    var isActive = s.active == null || s.active === '' || s.active === true || String(s.active) === 'true' || String(s.active).toUpperCase() === 'ACTIVE';
    return isCode && isActive;
  });

  if (!matchedStudent) {
    return jsonError('NOT_FOUND', 'Kode Akses siswa tidak ditemukan atau data siswa tidak aktif.');
  }

  var events = readSheetObjects('07_EVENTS');
  var configs = readSheetObjects('01_APP_CONFIG');
  var currConf = configs.find(function(c) { return c.config_key === 'current_event_id'; });
  var activeId = (currConf ? currConf.config_value : '') ||
                 (events.find(function(e) { return e.status === 'ACTIVE'; }) || events[0] || {}).event_id || '';

  if (!activeId) {
    return jsonError('NOT_FOUND', 'Kegiatan tidak aktif atau tidak ditemukan.');
  }

  var currentEvt = events.find(function(e) { return e.event_id === activeId; });
  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return p.event_id === activeId; });
  var participant = participants.find(function(p) { return p.student_id === matchedStudent.student_id; });

  if (!participant) {
    return jsonError('NOT_FOUND', 'Siswa tidak terdaftar sebagai peserta pada kegiatan aktif.');
  }

  var surahs = readSheetObjects('05_MASTER_SURAHS');
  function getSurahNameGS(surahNo) {
    if (!surahNo) return null;
    var found = surahs.find(function(s) {
      return Number(s.surah_no || s.surah_number || s.number || s.id) === Number(surahNo);
    });
    return found ? (found.surah_name || found.surah_name_latin || found.name) : ('Surah #' + surahNo);
  }

  var allAssessments = readSheetObjects('13_SESSION_ASSESSMENTS')
    .filter(function(a) { return a.event_id === activeId && !a.is_deleted && String(a.is_deleted) !== 'true' && a.student_id === matchedStudent.student_id; });

  var evals = readSheetObjects('14_FINAL_EVALUATIONS').filter(function(e) { return e.event_id === activeId; });
  var studentEval = evals.find(function(e) { return e.student_id === matchedStudent.student_id || e.participant_id === participant.participant_id; });

  var totalLinesAdded = allAssessments
    .filter(function(a) { return a.attendance_status === 'PRESENT'; })
    .reduce(function(sum, a) { return sum + (Number(a.lines_added) || 0); }, 0);

  var gradeClassText = (participant.grade_snapshot && participant.class_snapshot)
    ? (participant.grade_snapshot + ' (' + participant.class_snapshot + ')')
    : (participant.grade_snapshot || participant.class_snapshot || 'Belum tersedia');

  var baselineText = participant.baseline_surah
    ? (getSurahNameGS(participant.baseline_surah) + (participant.baseline_ayah ? (' Ayat ' + participant.baseline_ayah) : ''))
    : 'Belum diisi';

  var sessionsList = allAssessments.map(function(a) {
    var isPresent = a.attendance_status === 'PRESENT';
    return {
      sessionNo: Number(a.session_no) || 0,
      attendance: a.attendance_status,
      surahName: isPresent ? getSurahNameGS(a.surah_start) : null,
      ayahRange: (isPresent && a.ayah_start != null && a.ayah_end != null) ? (a.ayah_start + '–' + a.ayah_end) : null,
      linesAdded: isPresent ? (Number(a.lines_added) || 0) : null
    };
  });

  sessionsList.sort(function(a, b) { return a.sessionNo - b.sessionNo; });

  return jsonResponse({
    studentName: matchedStudent.full_name,
    nis: matchedStudent.nis || '',
    gradeClass: gradeClassText,
    eventName: currentEvt ? currentEvt.event_name : 'Rumah Tahfidz',
    baselineText: baselineText,
    targetText: participant.target_surah_start ? (getSurahNameGS(participant.target_surah_start) + ' s/d ' + (participant.target_surah_end ? getSurahNameGS(participant.target_surah_end) : getSurahNameGS(participant.target_surah_start))) : 'Belum diisi',
    targetLines: participant.target_lines || null,
    totalLinesAdded: totalLinesAdded,
    completionStatus: studentEval ? studentEval.completion_status : 'NOT_EVALUATED',
    sessions: sessionsList
  });
}

function generateRandomAccessCodeGS(existingCodes) {
  var chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var code = '';
  do {
    var rand = '';
    for (var i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = 'RT-' + rand;
  } while (existingCodes && existingCodes.indexOf(code) !== -1);
  return code;
}

/**
 * Handle bulk registration and assignment of students from Master Siswa to Halaqah.
 * Restricted to ADMIN and COORDINATOR.
 */
function handleBulkRegisterAndAssignStudentsToHalaqah(payload, authToken) {
  var sess = requireRole(authToken, ['ADMIN', 'COORDINATOR']);
  var eventId = payload.eventId;
  var studentIds = payload.studentIds || [];
  var targetHalaqahId = payload.targetHalaqahId || '';

  var allEvents = readSheetObjects('07_EVENTS');
  var targetEvent = allEvents.find(function(e) { return e.event_id === eventId; });
  if (!targetEvent) {
    return jsonError('NOT_FOUND', 'Kegiatan tidak ditemukan.');
  }

  var halaqahs = readSheetObjects('10_HALAQAH');
  var targetHalaqah = null;
  if (targetHalaqahId) {
    targetHalaqah = halaqahs.find(function(h) { return h.halaqah_id === targetHalaqahId; });
    if (!targetHalaqah) {
      return jsonError('NOT_FOUND', 'Halaqah tujuan tidak ditemukan.');
    }
    if (targetHalaqah.event_id !== eventId) {
      return jsonError('VALIDATION_ERROR', 'Halaqah tujuan tidak terdaftar pada kegiatan ini.');
    }
  }

  var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS');
  var allStudents = readSheetObjects('03_MASTER_STUDENTS');

  // Build lookup maps for O(1) lookups
  var studentMap = {};
  allStudents.forEach(function(s) { studentMap[s.student_id] = s; });

  var participantMap = {};
  allParticipants.forEach(function(p) {
    if (p.event_id === eventId) {
      participantMap[p.student_id] = p;
    }
  });

  var createdCount = 0;
  var updatedCount = 0;
  var skippedRecords = [];

  studentIds.forEach(function(sid) {
    var student = studentMap[sid];
    if (!student) {
      skippedRecords.push({ studentId: sid, reason: 'Data siswa tidak ditemukan di Master Siswa.' });
      return;
    }

    var isStudentActive = student.active == null || student.active === '' || student.active === true || String(student.active) === 'true' || String(student.active).toUpperCase() === 'ACTIVE';
    if (!isStudentActive) {
      skippedRecords.push({ studentId: sid, studentName: student.full_name, reason: 'Status siswa tidak aktif di Master Siswa.' });
      return;
    }

    if (targetHalaqah && targetHalaqah.gender && student.gender) {
      var halaqahGenderNorm = String(targetHalaqah.gender).toUpperCase();
      var studentGenderNorm = String(student.gender).toUpperCase();
      if (halaqahGenderNorm !== studentGenderNorm) {
        skippedRecords.push({
          studentId: sid,
          studentName: student.full_name,
          reason: 'Gender siswa (' + student.gender + ') tidak sesuai dengan gender halaqah (' + targetHalaqah.gender + ')'
        });
        return;
      }
    }

    var participant = participantMap[sid];
    var nowIso = new Date().toISOString();

    if (participant) {
      participant.halaqah_id = targetHalaqahId;
      participant.session_group_id = targetHalaqah ? (targetHalaqah.session_group_id || '') : (participant.session_group_id || '');
      participant.updated_at = nowIso;
      upsertObject('12_EVENT_PARTICIPANTS', ['participant_id'], participant, 'participant_id');
      updatedCount++;
    } else {
      var newParticipantId = 'PART_' + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      var newParticipant = {
        participant_id: newParticipantId,
        event_id: eventId,
        student_id: student.student_id,
        class_snapshot: student.class_name || '',
        grade_snapshot: student.grade_level || '',
        halaqah_id: targetHalaqahId,
        session_group_id: targetHalaqah ? (targetHalaqah.session_group_id || '') : '',
        participant_status: 'ACTIVE',
        created_at: nowIso,
        updated_at: nowIso,
        skill_status_start: '',
        baseline_surah: '',
        baseline_ayah: '',
        baseline_note: '',
        baseline_date: '',
        target_surah_start: '',
        target_ayah_start: '',
        target_surah_end: '',
        target_ayah_end: '',
        target_lines: '',
        target_note: ''
      };
      upsertObject('12_EVENT_PARTICIPANTS', ['participant_id'], newParticipant, 'participant_id');
      participantMap[sid] = newParticipant;
      createdCount++;
    }
  });

  var skippedStudentIds = skippedRecords.map(function(r) { return r.studentId; });
  addAuditLog('BULK_REGISTER_ASSIGN_HALAQAH', 'PARTICIPANT', targetHalaqahId || eventId, null, {
    createdCount: createdCount,
    updatedCount: updatedCount,
    skippedCount: skippedRecords.length,
    targetHalaqahId: targetHalaqahId
  }, null, sess.user_id, eventId);

  return jsonResponse({
    createdCount: createdCount,
    updatedCount: updatedCount,
    skippedCount: skippedRecords.length,
    skippedStudentIds: skippedStudentIds,
    skippedRecords: skippedRecords
  });
}

/**
 * Utility function to clean up duplicate active assignments in 11_HALAQAH_TEACHERS.
 * Keeps the oldest assignment active (by created_at ascending), deactivates subsequent duplicates (active = FALSE).
 * Run manually from the Apps Script editor when needed.
 */
function cleanupDuplicateHalaqahTeacherAssignments() {
  Logger.log('Starting duplicate cleanup for 11_HALAQAH_TEACHERS...');
  var allHts = readSheetObjects('11_HALAQAH_TEACHERS');

  // Filter only active assignments
  var activeHts = allHts.filter(function(item) {
    return item.active === true || String(item.active).toLowerCase() === 'true';
  });

  // Group by event_id + halaqah_id + teacher_id
  var groups = {};
  activeHts.forEach(function(item) {
    var key = String(item.event_id || '').trim() + '|||' + String(item.halaqah_id || '').trim() + '|||' + String(item.teacher_id || '').trim();
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  });

  var duplicateGroupsCount = 0;
  var deactivatedCount = 0;
  var retainedCount = 0;
  var nowIso = new Date().toISOString();

  for (var key in groups) {
    if (groups.hasOwnProperty(key)) {
      var list = groups[key];
      if (list.length > 1) {
        duplicateGroupsCount++;
        // Sort by created_at ascending (oldest first)
        list.sort(function(a, b) {
          var dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          var dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });

        // Retain oldest
        var kept = list[0];
        retainedCount++;
        Logger.log('Group [' + key + '] -> Retaining oldest assignment: ' + kept.assignment_id + ' (created: ' + kept.created_at + ')');

        // Deactivate remaining duplicates
        for (var i = 1; i < list.length; i++) {
          var dup = list[i];
          var ok = updateObject('11_HALAQAH_TEACHERS', 'assignment_id', dup.assignment_id, {
            active: 'FALSE',
            updated_at: nowIso
          });
          if (ok) {
            deactivatedCount++;
            Logger.log('  Deactivated duplicate: ' + dup.assignment_id + ' (created: ' + dup.created_at + ')');
          } else {
            Logger.log('  Failed to deactivate duplicate: ' + dup.assignment_id);
          }
        }
      } else if (list.length === 1) {
        retainedCount++;
      }
    }
  }

  Logger.log('=== CLEANUP SUMMARY ===');
  Logger.log('Duplicate groups found: ' + duplicateGroupsCount);
  Logger.log('Assignments deactivated: ' + deactivatedCount);
  Logger.log('Assignments retained: ' + retainedCount);
  Logger.log('Cleanup completed successfully.');
}

/**
 * Reusable helper: normalizeClockTime(value)
 * Normalizes clock time into strict "HH:mm" (e.g., "08:00", "10:00", "19:15").
 * Supports:
 * - "08:00"
 * - "08:00:00" or "10:00:00"
 * - Date objects from Google Sheets (local time getHours/getMinutes)
 * - Display values from Google Sheets
 * - 12-hour values like "8:00 AM" or "07:15 PM"
 * - ISO datetime strings from previous saves like "1899-12-30T02:52:48.000Z"
 * Returns: "HH:mm" string or "" if invalid. Never converts clock time into an ISO Date.
 */
function normalizeClockTime(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) {
    var h = ('0' + value.getHours()).slice(-2);
    var m = ('0' + value.getMinutes()).slice(-2);
    return h + ':' + m;
  }
  var str = String(value).trim();
  if (!str) return '';

  // 1. Check HH:mm or HH:mm:ss or H:mm:ss or H:mm
  var match = str.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (match) {
    var hour = ('0' + match[1]).slice(-2);
    var minute = match[2];
    return hour + ':' + minute;
  }

  // 2. Check 12-hour format e.g. "8:00 AM", "08:00:00 PM"
  var match12 = str.match(/^([0]?[1-9]|1[0-2]):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)$/i);
  if (match12) {
    var hourNum = parseInt(match12[1], 10);
    var isPM = match12[3].toUpperCase() === 'PM';
    if (isPM && hourNum < 12) hourNum += 12;
    if (!isPM && hourNum === 12) hourNum = 0;
    return ('0' + hourNum).slice(-2) + ':' + match12[2];
  }

  // 3. Check ISO string like 1899-12-30T08:00:00.000Z or 1899-12-30T02:52:48.000Z
  var matchIso = str.match(/T([01]?\d|2[0-3]):([0-5]\d)/);
  if (matchIso) {
    var hourIso = ('0' + matchIso[1]).slice(-2);
    var minIso = matchIso[2];
    return hourIso + ':' + minIso;
  }

  return '';
}

function normalizeTimeFormatGS(timeVal) {
  return normalizeClockTime(timeVal);
}



