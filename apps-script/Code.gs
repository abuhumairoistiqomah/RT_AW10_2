/**
 * GOOGLE APPS SCRIPT BACKEND FOR RUMAH TAHFIDZ LMS
 *
 * Rewritten backend goals:
 * - Role-first authorization. ADMIN never becomes TEACHER just because a teacher context exists.
 * - ADMIN/COORDINATOR may preview teacher workspace only when teacherId is explicitly supplied.
 * - TEACHER is always restricted to assigned halaqah.
 * - COORDINATOR is read-only.
 * - Nuroniyyah is a first-class assessment mode. IQRA remains legacy-compatible only.
 * - Ziyadah and Nuroniyyah progress are calculated separately.
 * - Spreadsheet writes are header-based.
 * - Session storage is spreadsheet-authoritative.
 *
 * Deployment Target: Web App
 * Execute as: Me
 * Who has access: Anyone
 *
 * Script Properties Required:
 * - SPREADSHEET_ID
 * - AUTH_PEPPER
 */

// ====================================================
// 0. CONSTANTS
// ====================================================

var _cachedSpreadsheet = null;

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

var ROLES = {
  ADMIN: 'ADMIN',
  COORDINATOR: 'COORDINATOR',
  TEACHER: 'TEACHER',
  VIEWER: 'VIEWER'
};

var ASSESSMENT_MODES = {
  ZIYADAH: 'ZIYADAH',
  NURONIYYAH: 'NURONIYYAH',
  IQRA: 'IQRA'
};

var ATTENDANCE_STATUSES = ['UNASSESSED', 'PRESENT', 'SICK', 'PERMISSION', 'ABSENT'];
var SKILL_STATUSES = ['NON_BBL', 'BBL', 'BBLS'];
var COMPLETION_STATUSES = ['COMPLETE', 'INCOMPLETE'];

// ====================================================
// 1. GENERIC HELPERS
// ====================================================

function nowIsoGS() {
  return new Date().toISOString();
}

function cleanStringGS(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function upperGS(value) {
  return cleanStringGS(value).toUpperCase();
}

function isTrueGS(value) {
  return value === true || upperGS(value) === 'TRUE' || upperGS(value) === 'ACTIVE';
}

function isFalseGS(value) {
  return value === false || upperGS(value) === 'FALSE' || upperGS(value) === 'INACTIVE';
}

function isActiveRecordGS(record) {
  if (!record) return false;
  if (record.active === undefined || record.active === null || record.active === '') return true;
  return !isFalseGS(record.active);
}

function isDeletedRecordGS(record) {
  if (!record) return false;
  return isTrueGS(record.is_deleted);
}

function hasValueGS(value) {
  return value !== undefined && value !== null && value !== '';
}

function toNumberOrUndefinedGS(value) {
  if (!hasValueGS(value)) return undefined;
  var n = Number(value);
  return isFinite(n) && !isNaN(n) ? n : undefined;
}

function positiveNumberOrNullGS(value) {
  if (!hasValueGS(value)) return null;
  var n = Number(value);
  return isFinite(n) && !isNaN(n) && n > 0 ? n : null;
}

function normalizeRoleGS(role) {
  return upperGS(role);
}

function safeCloneGS(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function makeIdGS(prefix, length) {
  var raw = Utilities.getUuid().replace(/-/g, '');
  var size = length || 16;
  return prefix + raw.substring(0, size);
}

function uniqueStringsGS(values) {
  var seen = {};
  var out = [];
  (values || []).forEach(function(v) {
    var s = cleanStringGS(v);
    if (s && !seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  });
  return out;
}

function normalizeWriteValueGS(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

// ====================================================
// 2. SPREADSHEET + CACHE
// ====================================================

function getSpreadsheet() {
  if (_cachedSpreadsheet) return _cachedSpreadsheet;

  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SERVER_CONFIG_ERROR: SPREADSHEET_ID belum dikonfigurasi di Script Properties.');
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
      sheet.appendRow([
        'session_token',
        'user_id',
        'role',
        'teacher_id',
        'created_at',
        'last_seen_at',
        'revoked',
        'revoked_at'
      ]);
      return sheet;
    }
    throw new Error('SERVER_CONFIG_ERROR: Sheet "' + sheetName + '" tidak ditemukan.');
  }

  return sheet;
}

function getHeadersGS(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(h) {
    return cleanStringGS(h).toLowerCase();
  });
}

function getCachedSheetObjects(sheetName) {
  try {
    var cache = CacheService.getScriptCache();
    var metaStr = cache.get('CACHE_META_' + sheetName);
    var fullJson = null;

    if (metaStr) {
      var meta = JSON.parse(metaStr);
      if (meta && meta.chunks) {
        var keys = [];
        for (var i = 0; i < meta.chunks; i++) keys.push('CACHE_' + sheetName + '_' + i);
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

    if (fullJson) return JSON.parse(fullJson);
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
      return;
    }

    var numChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);
    var chunkObj = {};
    for (var i = 0; i < numChunks; i++) {
      var start = i * CHUNK_SIZE;
      chunkObj['CACHE_' + sheetName + '_' + i] = jsonStr.substring(start, start + CHUNK_SIZE);
    }
    cache.putAll(chunkObj, CACHE_TTL_SECONDS);
    cache.put('CACHE_META_' + sheetName, JSON.stringify({ chunks: numChunks }), CACHE_TTL_SECONDS);
    cache.remove('CACHE_' + sheetName);
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
        for (var i = 0; i < meta.chunks; i++) keys.push('CACHE_' + sheetName + '_' + i);
        cache.removeAll(keys);
      }
    }
    cache.remove('CACHE_META_' + sheetName);
  } catch (e) {
    Logger.log('Cache invalidate error for ' + sheetName + ': ' + e.message);
  }
}

function readSheetObjects(sheetName, skipCache) {
  if (!skipCache && CACHEABLE_SHEETS.indexOf(sheetName) !== -1) {
    var cached = getCachedSheetObjects(sheetName);
    if (cached) return cached;
  }

  var sheet = getSheet(sheetName);
  var range = sheet.getDataRange();
  var data = range.getValues();
  var displayData = range.getDisplayValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return cleanStringGS(h).toLowerCase(); });
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var displayRow = displayData[i] || [];
    var obj = {};
    var hasAnyValue = false;

    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      if (!header) continue;
      var val = row[j];
      var displayVal = displayRow[j] !== undefined ? displayRow[j] : '';

      if (header === 'start_time' || header === 'end_time') {
        val = normalizeClockTime(displayVal) || normalizeClockTime(val);
      } else if (val instanceof Date) {
        val = val.toISOString();
      } else if (typeof val === 'string') {
        val = val.trim();
        if (upperGS(val) === 'TRUE') val = true;
        else if (upperGS(val) === 'FALSE') val = false;
      }

      if (hasValueGS(val)) hasAnyValue = true;
      obj[header] = val;
    }

    if (hasAnyValue) result.push(obj);
  }

  if (!skipCache && CACHEABLE_SHEETS.indexOf(sheetName) !== -1) setCachedSheetObjects(sheetName, result);
  return result;
}

function batchUpdateRowValues(sheet, rowIndex, headers, obj) {
  var rowValues = headers.map(function(header) { return normalizeWriteValueGS(obj[header]); });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
}

function appendObject(sheetName, obj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var headers = getHeadersGS(sheet);
    if (headers.length === 0) throw new Error('SERVER_CONFIG_ERROR: Sheet "' + sheetName + '" tidak memiliki header.');
    var row = headers.map(function(header) { return normalizeWriteValueGS(obj[header]); });
    sheet.appendRow(row);
    invalidateSheetCache(sheetName);
  } finally {
    lock.releaseLock();
  }
}

function updateObject(sheetName, keyField, keyValue, newFields) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;

    var headers = data[0].map(function(h) { return cleanStringGS(h).toLowerCase(); });
    var keyIndex = headers.indexOf(cleanStringGS(keyField).toLowerCase());
    if (keyIndex === -1) return false;

    var targetRowIndex = -1;
    var targetObj = null;
    var wanted = cleanStringGS(keyValue).toLowerCase();

    for (var i = 1; i < data.length; i++) {
      if (cleanStringGS(data[i][keyIndex]).toLowerCase() === wanted) {
        targetRowIndex = i + 1;
        targetObj = {};
        for (var j = 0; j < headers.length; j++) targetObj[headers[j]] = data[i][j];
        break;
      }
    }

    if (targetRowIndex === -1) return false;
    Object.keys(newFields || {}).forEach(function(k) { targetObj[cleanStringGS(k).toLowerCase()] = newFields[k]; });
    batchUpdateRowValues(sheet, targetRowIndex, headers, targetObj);
    invalidateSheetCache(sheetName);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function deleteRowByField(sheetName, keyField, keyValue) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return null;

    var headers = data[0].map(function(h) { return cleanStringGS(h).toLowerCase(); });
    var keyIndex = headers.indexOf(cleanStringGS(keyField).toLowerCase());
    if (keyIndex === -1) return null;

    var wanted = cleanStringGS(keyValue).toLowerCase();
    var targetRowNumber = -1;
    var deletedObj = null;

    for (var i = 1; i < data.length; i++) {
      if (cleanStringGS(data[i][keyIndex]).toLowerCase() === wanted) {
        targetRowNumber = i + 1;
        deletedObj = {};
        for (var j = 0; j < headers.length; j++) deletedObj[headers[j]] = data[i][j];
        break;
      }
    }

    if (targetRowNumber === -1) return null;
    sheet.deleteRow(targetRowNumber);
    SpreadsheetApp.flush();
    invalidateSheetCache(sheetName);
    return deletedObj;
  } finally {
    lock.releaseLock();
  }
}

function upsertObject(sheetName, keyFields, obj, idFieldName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    var headers = getHeadersGS(sheet);
    if (headers.length === 0) throw new Error('SERVER_CONFIG_ERROR: Sheet "' + sheetName + '" tidak memiliki header.');

    var sourceObj = safeCloneGS(obj);
    var keyIndices = keyFields.map(function(kf) { return headers.indexOf(cleanStringGS(kf).toLowerCase()); });
    if (keyIndices.some(function(idx) { return idx === -1; })) {
      throw new Error('SERVER_CONFIG_ERROR: Compound key [' + keyFields.join(', ') + '] tidak lengkap di sheet "' + sheetName + '".');
    }

    if (data.length < 2) {
      var firstRow = headers.map(function(header) { return normalizeWriteValueGS(sourceObj[header]); });
      sheet.appendRow(firstRow);
      invalidateSheetCache(sheetName);
      return 'INSERTED';
    }

    var targetRowIndex = -1;
    var existingRowObj = {};

    for (var i = 1; i < data.length; i++) {
      var match = true;
      for (var k = 0; k < keyFields.length; k++) {
        var idx = keyIndices[k];
        var keyName = cleanStringGS(keyFields[k]).toLowerCase();
        var cellVal = cleanStringGS(data[i][idx]).toLowerCase();
        var matchVal = cleanStringGS(sourceObj[keyName] !== undefined ? sourceObj[keyName] : sourceObj[keyFields[k]]).toLowerCase();
        if (cellVal !== matchVal) { match = false; break; }
      }
      if (match) {
        targetRowIndex = i + 1;
        for (var hIdx = 0; hIdx < headers.length; hIdx++) existingRowObj[headers[hIdx]] = data[i][hIdx];
        break;
      }
    }

    if (targetRowIndex === -1) {
      var newRow = headers.map(function(header) { return normalizeWriteValueGS(sourceObj[header]); });
      sheet.appendRow(newRow);
      invalidateSheetCache(sheetName);
      return 'INSERTED';
    }

    Object.keys(sourceObj).forEach(function(prop) {
      var propLower = cleanStringGS(prop).toLowerCase();
      if (idFieldName && propLower === cleanStringGS(idFieldName).toLowerCase() && hasValueGS(existingRowObj[propLower])) return;
      if (['assessment_id', 'final_evaluation_id', 'participant_id', 'student_id'].indexOf(propLower) !== -1 && hasValueGS(existingRowObj[propLower])) return;
      existingRowObj[propLower] = sourceObj[prop];
    });

    batchUpdateRowValues(sheet, targetRowIndex, headers, existingRowObj);
    invalidateSheetCache(sheetName);
    return 'UPDATED';
  } finally {
    lock.releaseLock();
  }
}

function batchUpsertObjectsGS(sheetName, keyFields, objects, idFieldName) {
  if (!Array.isArray(objects) || objects.length === 0) return [];

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    var headers = getHeadersGS(sheet);
    if (headers.length === 0) throw new Error('SERVER_CONFIG_ERROR: Sheet "' + sheetName + '" tidak memiliki header.');

    var keyIndices = keyFields.map(function(kf) { return headers.indexOf(cleanStringGS(kf).toLowerCase()); });
    if (keyIndices.some(function(idx) { return idx === -1; })) {
      throw new Error('SERVER_CONFIG_ERROR: Compound key [' + keyFields.join(', ') + '] tidak lengkap di sheet "' + sheetName + '".');
    }

    var rowMap = {};
    for (var i = 1; i < data.length; i++) {
      var keyParts = [];
      for (var k = 0; k < keyIndices.length; k++) keyParts.push(cleanStringGS(data[i][keyIndices[k]]).toLowerCase());
      rowMap[keyParts.join('|||')] = i + 1;
    }

    var results = [];
    var appendedRows = [];
    var appendedKeyMap = {};

    objects.forEach(function(originalObj) {
      var obj = safeCloneGS(originalObj);
      var keyParts = keyFields.map(function(kf) {
        var lower = cleanStringGS(kf).toLowerCase();
        return cleanStringGS(obj[lower] !== undefined ? obj[lower] : obj[kf]).toLowerCase();
      });
      var key = keyParts.join('|||');
      var existingRowNumber = rowMap[key];

      if (!existingRowNumber && appendedKeyMap[key] !== undefined) {
        var appendIndex = appendedKeyMap[key];
        var pending = appendedRows[appendIndex];
        headers.forEach(function(header, colIdx) {
          if (obj[header] !== undefined) pending[colIdx] = normalizeWriteValueGS(obj[header]);
        });
        results.push('UPDATED');
        return;
      }

      if (!existingRowNumber) {
        var newRow = headers.map(function(header) { return normalizeWriteValueGS(obj[header]); });
        appendedKeyMap[key] = appendedRows.length;
        appendedRows.push(newRow);
        results.push('INSERTED');
        return;
      }

      var rowValues = sheet.getRange(existingRowNumber, 1, 1, headers.length).getValues()[0];
      var existingObj = {};
      headers.forEach(function(header, idx) { existingObj[header] = rowValues[idx]; });

      Object.keys(obj).forEach(function(prop) {
        var propLower = cleanStringGS(prop).toLowerCase();
        if (idFieldName && propLower === cleanStringGS(idFieldName).toLowerCase() && hasValueGS(existingObj[propLower])) return;
        if (['assessment_id', 'final_evaluation_id', 'participant_id', 'student_id'].indexOf(propLower) !== -1 && hasValueGS(existingObj[propLower])) return;
        existingObj[propLower] = obj[prop];
      });

      var mergedRow = headers.map(function(header) { return normalizeWriteValueGS(existingObj[header]); });
      sheet.getRange(existingRowNumber, 1, 1, headers.length).setValues([mergedRow]);
      results.push('UPDATED');
    });

    if (appendedRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appendedRows.length, headers.length).setValues(appendedRows);
    }

    invalidateSheetCache(sheetName);
    return results;
  } finally {
    lock.releaseLock();
  }
}

// ====================================================
// 3. JSON / ERROR HELPERS
// ====================================================

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify({ success: true, data: data })).setMimeType(ContentService.MimeType.JSON);
}

function jsonError(code, message) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: { code: code || 'SERVER_ERROR', message: message || 'An error occurred' }
  })).setMimeType(ContentService.MimeType.JSON);
}

function exceptionToJsonGS(err) {
  var msg = err && err.message ? err.message : String(err || '');
  var known = ['AUTH_REQUIRED', 'FORBIDDEN', 'VALIDATION_ERROR', 'NOT_FOUND', 'SERVER_CONFIG_ERROR'];
  for (var i = 0; i < known.length; i++) {
    var prefix = known[i] + ':';
    if (msg.indexOf(prefix) === 0) return jsonError(known[i], msg.substring(prefix.length).trim());
  }
  return jsonError('SERVER_ERROR', msg || 'Terjadi kesalahan pada server.');
}

// ====================================================
// 4. PASSWORD + SESSION
// ====================================================

function getPepper() {
  var pepper = PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER');
  if (!pepper) throw new Error('SERVER_CONFIG_ERROR: AUTH_PEPPER belum dikonfigurasi di Script Properties.');
  return pepper;
}

function hashPasswordGS(password, salt) {
  var pepper = getPepper();
  if (!salt) salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  var rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pepper + password);
  var hashHex = rawBytes.map(function(byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
  return salt + ':' + hashHex;
}

function verifyPasswordGS(inputPassword, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (storedHash.indexOf(':') === -1) return false;
  var parts = storedHash.split(':');
  return hashPasswordGS(inputPassword, parts[0]) === storedHash;
}

function generatePasswordHashForSetup(password) {
  var hash = hashPasswordGS(password);
  Logger.log('Password hash generated for setup: ' + hash);
  return hash;
}

function createSession(user) {
  var token = 'SES_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  var now = nowIsoGS();
  var role = normalizeRoleGS(user.role);
  var sessionTeacherId = role === ROLES.TEACHER ? cleanStringGS(user.teacher_id) : '';
  appendObject('16_SESSIONS', {
    session_token: token,
    user_id: user.user_id,
    role: role,
    teacher_id: sessionTeacherId,
    created_at: now,
    last_seen_at: now,
    revoked: false,
    revoked_at: ''
  });
  return {
    token: token,
    user_id: user.user_id,
    display_name: user.display_name || user.username,
    role: role,
    teacher_id: sessionTeacherId,
    created_at: now
  };
}

function getSession(token) {
  token = cleanStringGS(token);
  if (!token) return null;

  var sessions = readSheetObjects('16_SESSIONS', true);
  var sessionRow = sessions.find(function(s) { return cleanStringGS(s.session_token) === token; });
  if (!sessionRow || isTrueGS(sessionRow.revoked)) return null;

  var users = readSheetObjects('06_USERS', true);
  var user = users.find(function(u) { return cleanStringGS(u.user_id) === cleanStringGS(sessionRow.user_id); });
  if (!user) return null;
  if (!isActiveRecordGS(user)) return { is_disabled_account: true, user_id: user.user_id };

  try {
    var lastSeen = sessionRow.last_seen_at ? new Date(sessionRow.last_seen_at).getTime() : 0;
    var nowMs = Date.now();
    if (!lastSeen || nowMs - lastSeen > 15 * 60 * 1000) {
      updateObject('16_SESSIONS', 'session_token', token, { last_seen_at: new Date(nowMs).toISOString() });
    }
  } catch (e) {
    Logger.log('Warning updating last_seen_at: ' + e.message);
  }

  var currentRole = normalizeRoleGS(user.role);
  return {
    token: token,
    user_id: user.user_id,
    display_name: user.display_name || user.username,
    role: currentRole,
    teacher_id: currentRole === ROLES.TEACHER ? cleanStringGS(user.teacher_id) : '',
    created_at: sessionRow.created_at
  };
}

function removeSession(token) {
  token = cleanStringGS(token);
  if (!token) return;
  updateObject('16_SESSIONS', 'session_token', token, { revoked: true, revoked_at: nowIsoGS() });
}

function revokeAllUserSessions(userId) {
  userId = cleanStringGS(userId);
  if (!userId) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet('16_SESSIONS');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    var headers = data[0].map(function(h) { return cleanStringGS(h).toLowerCase(); });
    var userIdx = headers.indexOf('user_id');
    var revokedIdx = headers.indexOf('revoked');
    var revokedAtIdx = headers.indexOf('revoked_at');
    if (userIdx === -1 || revokedIdx === -1 || revokedAtIdx === -1) return;

    var now = nowIsoGS();
    for (var i = 1; i < data.length; i++) {
      if (cleanStringGS(data[i][userIdx]) === userId && !isTrueGS(data[i][revokedIdx])) {
        sheet.getRange(i + 1, revokedIdx + 1).setValue(true);
        sheet.getRange(i + 1, revokedAtIdx + 1).setValue(now);
      }
    }
    invalidateSheetCache('16_SESSIONS');
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

    var headers = data[0].map(function(h) { return cleanStringGS(h).toLowerCase(); });
    var revokedIdx = headers.indexOf('revoked');
    var revokedAtIdx = headers.indexOf('revoked_at');
    if (revokedIdx === -1 || revokedAtIdx === -1) return 0;

    var threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var rowsToDelete = [];
    for (var i = 1; i < data.length; i++) {
      if (!isTrueGS(data[i][revokedIdx])) continue;
      var revokedAt = data[i][revokedAtIdx];
      var revokedMs = revokedAt ? new Date(revokedAt).getTime() : 0;
      if (revokedMs && revokedMs < threshold) rowsToDelete.push(i + 1);
    }

    for (var d = rowsToDelete.length - 1; d >= 0; d--) sheet.deleteRow(rowsToDelete[d]);
    invalidateSheetCache('16_SESSIONS');
    return rowsToDelete.length;
  } finally {
    lock.releaseLock();
  }
}

function requireAuth(token) {
  var session = getSession(token);
  if (!session) throw new Error('AUTH_REQUIRED: Sesi Anda telah berakhir atau tidak valid. Silakan login kembali.');
  if (session.is_disabled_account) throw new Error('AUTH_REQUIRED: Akun Anda sudah tidak aktif. Silakan hubungi administrator.');
  return session;
}

function requireRole(token, allowedRoles) {
  var session = requireAuth(token);
  var role = normalizeRoleGS(session.role);
  if (allowedRoles.indexOf(role) === -1) throw new Error('FORBIDDEN: Anda tidak memiliki hak akses untuk tindakan ini.');
  session.role = role;
  return session;
}

// ====================================================
// 5. AUDIT
// ====================================================

function redactSensitiveData(data) {
  if (!data) return '';
  try {
    var obj = typeof data === 'string' ? JSON.parse(data) : JSON.parse(JSON.stringify(data));
    var sensitiveKeys = ['access_code', 'accesscode', 'newaccesscode', 'password', 'password_hash', 'session_token', 'token', 'authtoken'];
    function redactRecursive(item) {
      if (!item || typeof item !== 'object') return;
      Object.keys(item).forEach(function(k) {
        if (sensitiveKeys.indexOf(cleanStringGS(k).toLowerCase()) !== -1) item[k] = '[REDACTED]';
        else if (typeof item[k] === 'object') redactRecursive(item[k]);
      });
    }
    redactRecursive(obj);
    return JSON.stringify(obj);
  } catch (e) {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }
}

function addAuditLog(action, entityType, entityId, oldData, newData, notes, actorUserId, eventId) {
  try {
    var logId = 'LOG_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
    appendObject('15_AUDIT_LOG', {
      log_id: logId,
      timestamp: nowIsoGS(),
      user_id: actorUserId || 'SYSTEM',
      action: action,
      entity_type: entityType,
      entity_id: entityId,
      event_id: eventId || '',
      old_data_json: redactSensitiveData(oldData),
      new_data_json: redactSensitiveData(newData),
      notes: notes || ''
    });
  } catch (e) {
    Logger.log('Audit log error: ' + e.toString());
  }
}

// ====================================================
// 6. DOMAIN HELPERS
// ====================================================

function resolveRequestedEventId(eventId) {
  var explicit = cleanStringGS(eventId);
  if (explicit) return explicit;

  try {
    var configs = readSheetObjects('01_APP_CONFIG');
    var current = configs.find(function(c) { return cleanStringGS(c.config_key) === 'current_event_id'; });
    if (current && cleanStringGS(current.config_value)) return cleanStringGS(current.config_value);
  } catch (e1) {}

  try {
    var events = readSheetObjects('07_EVENTS');
    var active = events.find(function(e) { return upperGS(e.status) === 'ACTIVE'; }) || events[0];
    return active ? cleanStringGS(active.event_id) : '';
  } catch (e2) {}

  return '';
}

function resolveEventObjectGS(eventId) {
  var events = readSheetObjects('07_EVENTS');
  var resolvedId = resolveRequestedEventId(eventId);
  var eventObj = resolvedId ? events.find(function(e) { return cleanStringGS(e.event_id) === resolvedId; }) : null;
  if (!eventObj) eventObj = events.find(function(e) { return upperGS(e.status) === 'ACTIVE'; }) || events[0] || null;
  return eventObj;
}

function getTeacherAuthorizedHalaqahIds(teacherId, eventId) {
  teacherId = cleanStringGS(teacherId);
  if (!teacherId) return [];
  var resolvedEventId = resolveRequestedEventId(eventId);
  if (!resolvedEventId) return [];
  return uniqueStringsGS(readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    return cleanStringGS(ht.teacher_id) === teacherId && cleanStringGS(ht.event_id) === resolvedEventId && isActiveRecordGS(ht);
  }).map(function(ht) { return ht.halaqah_id; }));
}

function resolveResponsibleHalaqahTeacherId(halaqahId, eventId, preferredTeacherId) {
  var assignments = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    return cleanStringGS(ht.halaqah_id) === cleanStringGS(halaqahId) && (!eventId || cleanStringGS(ht.event_id) === cleanStringGS(eventId)) && isActiveRecordGS(ht);
  });

  var preferred = cleanStringGS(preferredTeacherId);
  if (preferred) {
    var preferredAssigned = assignments.find(function(ht) { return cleanStringGS(ht.teacher_id) === preferred; });
    if (preferredAssigned) return cleanStringGS(preferredAssigned.teacher_id);
  }

  var primary = assignments.find(function(ht) { return upperGS(ht.teacher_role) === 'PRIMARY'; });
  if (primary) return cleanStringGS(primary.teacher_id);
  if (assignments.length > 0) return cleanStringGS(assignments[0].teacher_id);
  return '';
}

function resolveWorkspaceTeacherFilterGS(session, payload) {
  if (session.role === ROLES.TEACHER) {
    if (!cleanStringGS(session.teacher_id)) throw new Error('FORBIDDEN: Akun Guru Anda belum terhubung dengan Master Data Guru.');
    return cleanStringGS(session.teacher_id);
  }

  if ((session.role === ROLES.ADMIN || session.role === ROLES.COORDINATOR) && payload && cleanStringGS(payload.teacherId)) {
    return cleanStringGS(payload.teacherId);
  }

  return '';
}

function getEffectiveParticipantTargetsGS(participant, halaqah) {
  participant = participant || {};
  halaqah = halaqah || {};
  var isManual = upperGS(participant.target_source) === 'MANUAL';

  var participantZiyadah = positiveNumberOrNullGS(participant.target_lines);
  var halaqahZiyadah = positiveNumberOrNullGS(halaqah.target_ziyadah_lines);

  var participantNuroniyyah = positiveNumberOrNullGS(participant.target_nuroniyyah_lines) !== null
    ? positiveNumberOrNullGS(participant.target_nuroniyyah_lines)
    : positiveNumberOrNullGS(participant.target_iqra_pages);
  var halaqahNuroniyyah = positiveNumberOrNullGS(halaqah.target_nuroniyyah_lines) !== null
    ? positiveNumberOrNullGS(halaqah.target_nuroniyyah_lines)
    : positiveNumberOrNullGS(halaqah.target_iqra_pages);

  var ziyadah = null;
  var nuroniyyah = null;

  if (isManual && participantZiyadah !== null) ziyadah = participantZiyadah;
  else if (halaqahZiyadah !== null) ziyadah = halaqahZiyadah;
  else if (participantZiyadah !== null) ziyadah = participantZiyadah;

  if (isManual && participantNuroniyyah !== null) nuroniyyah = participantNuroniyyah;
  else if (halaqahNuroniyyah !== null) nuroniyyah = halaqahNuroniyyah;
  else if (participantNuroniyyah !== null) nuroniyyah = participantNuroniyyah;

  return { ziyadahLines: ziyadah, nuroniyyahLines: nuroniyyah, source: isManual ? 'MANUAL' : 'HALAQAH' };
}

function formatParticipantTargetGS(participant, halaqah) {
  participant = participant || {};
  halaqah = halaqah || {};
  var skill = participant.skill_status_start ? cleanStringGS(participant.skill_status_start).toUpperCase() : '';
  var target = getEffectiveParticipantTargetsGS(participant, halaqah);

  var hasZi = target.ziyadahLines !== null && target.ziyadahLines > 0;
  var hasNur = target.nuroniyyahLines !== null && target.nuroniyyahLines > 0;

  var ziText = hasZi ? 'Zi ' + target.ziyadahLines + ' Baris' : '';
  var nurText = hasNur ? 'Nur ' + target.nuroniyyahLines + ' Baris' : '';

  if (skill === 'NON_BBL') {
    return nurText || 'Belum ditentukan';
  } else {
    // All other cases (BBL, BBLS, blank, null, undefined): Ziyadah ONLY
    return ziText || 'Belum ditentukan';
  }
}

function normalizeAssessmentModeGS(assessment) {
  assessment = assessment || {};
  var rawMode = upperGS(assessment.assessment_mode);
  if (rawMode === ASSESSMENT_MODES.ZIYADAH) return ASSESSMENT_MODES.ZIYADAH;
  if (rawMode === ASSESSMENT_MODES.NURONIYYAH) return ASSESSMENT_MODES.NURONIYYAH;
  if (rawMode === ASSESSMENT_MODES.IQRA) return ASSESSMENT_MODES.NURONIYYAH;
  if (hasValueGS(assessment.nuroniyyah_dars)) return ASSESSMENT_MODES.NURONIYYAH;
  if (hasValueGS(assessment.iqra_level) || hasValueGS(assessment.iqra_page_start) || hasValueGS(assessment.iqra_page_end)) return ASSESSMENT_MODES.NURONIYYAH;
  return ASSESSMENT_MODES.ZIYADAH;
}

function getRawAssessmentModeGS(assessment) {
  var raw = upperGS(assessment && assessment.assessment_mode);
  if (raw === ASSESSMENT_MODES.IQRA) return ASSESSMENT_MODES.IQRA;
  return normalizeAssessmentModeGS(assessment);
}

function defaultAssessmentModeForParticipantGS(participant) {
  var skill = upperGS(participant && participant.skill_status_start);
  if (skill === 'NON_BBL') return ASSESSMENT_MODES.NURONIYYAH;
  return ASSESSMENT_MODES.ZIYADAH;
}

function clearQuranProgressFieldsGS(assessment) {
  assessment.surah_start = '';
  assessment.ayah_start = '';
  assessment.surah_end = '';
  assessment.ayah_end = '';
}

function clearNuroniyyahProgressFieldsGS(assessment) {
  assessment.nuroniyyah_dars = '';
}

function clearLegacyIqraFieldsGS(assessment) {
  assessment.iqra_level = '';
  assessment.iqra_page_start = '';
  assessment.iqra_page_end = '';
}

function clearAllProgressFieldsGS(assessment) {
  clearQuranProgressFieldsGS(assessment);
  clearNuroniyyahProgressFieldsGS(assessment);
  clearLegacyIqraFieldsGS(assessment);
  assessment.lines_added = '';
}

function hasCompletedPresentProgressGS(assessment) {
  if (upperGS(assessment.attendance_status) !== 'PRESENT') return false;
  var rawMode = getRawAssessmentModeGS(assessment);
  if (rawMode === ASSESSMENT_MODES.IQRA) return hasValueGS(assessment.iqra_level) && hasValueGS(assessment.iqra_page_start);
  var mode = normalizeAssessmentModeGS(assessment);
  if (mode === ASSESSMENT_MODES.NURONIYYAH) return hasValueGS(assessment.nuroniyyah_dars) && hasValueGS(assessment.lines_added);
  return hasValueGS(assessment.surah_start) && hasValueGS(assessment.ayah_start) && hasValueGS(assessment.surah_end) && hasValueGS(assessment.ayah_end) && hasValueGS(assessment.lines_added);
}

function summarizeAssessmentsByModeGS(assessments) {
  var result = { ziyadahLines: 0, nuroniyyahLines: 0, ziyadahPresentCount: 0, nuroniyyahPresentCount: 0 };
  (assessments || []).forEach(function(a) {
    if (upperGS(a.attendance_status) !== 'PRESENT') return;
    var mode = normalizeAssessmentModeGS(a);
    var lines = Number(a.lines_added);
    if (!isFinite(lines) || isNaN(lines)) lines = 0;
    if (mode === ASSESSMENT_MODES.NURONIYYAH) {
      result.nuroniyyahLines += lines;
      result.nuroniyyahPresentCount++;
    } else {
      result.ziyadahLines += lines;
      result.ziyadahPresentCount++;
    }
  });
  return result;
}

function buildLegacyIqraLabelGS(assessment) {
  if (!assessment) return '';
  var level = cleanStringGS(assessment.iqra_level);
  var start = cleanStringGS(assessment.iqra_page_start);
  var end = cleanStringGS(assessment.iqra_page_end);
  var text = level ? 'Iqra Jilid ' + level : 'Iqra';
  if (start && end) text += ' Hal. ' + start + '–' + end;
  else if (start) text += ' Hal. ' + start;
  return text;
}

function getSurahNameFromListGS(surahs, surahNo) {
  if (!hasValueGS(surahNo)) return null;
  var found = (surahs || []).find(function(s) {
    return Number(s.surah_no || s.surah_number || s.number || s.id) === Number(surahNo);
  });
  return found ? (found.surah_name || found.surah_name_latin || found.name) : 'Surah #' + surahNo;
}

function sanitizeSkillStatusGS(value) {
  var skill = upperGS(value);
  return SKILL_STATUSES.indexOf(skill) !== -1 ? skill : '';
}

// ====================================================
// 7. WEB APP ENTRY POINTS
// ====================================================

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action ? e.parameter.action : 'health';
    if (action === 'health') return handleHealth();
    return jsonError('METHOD_NOT_ALLOWED', 'Aksi API "' + action + '" memerlukan HTTP POST.');
  } catch (err) {
    return exceptionToJsonGS(err);
  }
}

function doPost(e) {
  try {
    var contents = {};
    if (e && e.postData && e.postData.contents) {
      try { contents = JSON.parse(e.postData.contents); }
      catch (parseError) { return jsonError('VALIDATION_ERROR', 'Format JSON post body tidak valid.'); }
    }

    var action = contents.action || (e && e.parameter && e.parameter.action) || '';
    var payload = contents.payload || {};
    var authToken = contents.authToken || contents.token || '';
    return handlePostAndGetRouter(action, payload, authToken);
  } catch (err) {
    return exceptionToJsonGS(err);
  }
}

function handleHealth() {
  try {
    var ss = getSpreadsheet();
    return jsonResponse({
      status: 'ok',
      spreadsheetConnected: Boolean(ss),
      backendVersion: 'RT-GS-ROLE-FIRST-NURONIYYAH-2026-08-18'
    });
  } catch (e) {
    return jsonError('SERVER_ERROR', 'Gagal terhubung ke Google Spreadsheet: ' + e.message);
  }
}

// ====================================================
// 8. ROUTER
// ====================================================

function handlePostAndGetRouter(action, payload, authToken) {
  payload = payload || {};

  switch (action) {
    case 'health': return handleHealth();
    case 'login': return handleLogin(payload);
    case 'searchLoginAccounts': return handleSearchLoginAccounts(payload);
    case 'logout':
      removeSession(authToken);
      return jsonResponse({ message: 'Berhasil logout' });
    case 'validateSession':
      var sessionCheck = requireAuth(authToken);
      return jsonResponse({
        valid: true,
        user: {
          user_id: sessionCheck.user_id,
          display_name: sessionCheck.display_name,
          role: sessionCheck.role,
          teacher_id: sessionCheck.teacher_id || ''
        }
      });
    case 'publicStudentProgress': return handlePublicStudentProgress(payload);

    case 'cleanupRevokedSessions':
      requireRole(authToken, [ROLES.ADMIN]);
      return jsonResponse({ deletedCount: cleanupRevokedSessions() });

    case 'getCurrentEvent':
      requireAuth(authToken);
      return jsonResponse(resolveEventObjectGS(payload.eventId));
    case 'getAppConfigs':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('01_APP_CONFIG'));
    case 'getLookups':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('02_LOOKUPS'));
    case 'getEvents':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('07_EVENTS'));
    case 'getEventDays':
      requireAuth(authToken);
      var eventDays = readSheetObjects('07A_EVENT_DAYS');
      if (payload.eventId) eventDays = eventDays.filter(function(d) { return cleanStringGS(d.event_id) === cleanStringGS(payload.eventId); });
      return jsonResponse(eventDays);
    case 'getSessionGroups':
      requireAuth(authToken);
      var groups = readSheetObjects('08_SESSION_GROUPS');
      if (payload.eventId) groups = groups.filter(function(g) { return cleanStringGS(g.event_id) === cleanStringGS(payload.eventId); });
      return jsonResponse(groups);
    case 'getSessionConfigs': return handleGetSessionConfigs(payload, authToken);
    case 'getStudents': return handleGetStudents(payload, authToken);
    case 'getTeachers':
      requireAuth(authToken);
      return jsonResponse(readSheetObjects('04_MASTER_TEACHERS'));
    case 'getUsers':
      requireRole(authToken, [ROLES.ADMIN, ROLES.COORDINATOR]);
      return jsonResponse(readSheetObjects('06_USERS', true).map(function(u) {
        var safe = Object.assign({}, u);
        delete safe.password_hash;
        delete safe.password;
        return safe;
      }));
    case 'getHalaqahList': return handleGetHalaqahList(payload, authToken);
    case 'getHalaqahTeachers': return handleGetHalaqahTeachers(payload, authToken);
    case 'getEventParticipants': return handleGetEventParticipants(payload, authToken);
    case 'getStudentPlacementBootstrap': return handleGetStudentPlacementBootstrap(payload, authToken);
    case 'getTeacherWorkspaceBootstrap': return handleGetTeacherWorkspaceBootstrap(payload, authToken);
    case 'getMyHalaqahData': return handleGetMyHalaqahData(payload, authToken);
    case 'getSessionAssessments': return handleGetSessionAssessments(payload, authToken);
    case 'getFinalEvaluations': return handleGetFinalEvaluations(payload, authToken);
    case 'getAdminOverview': return handleGetAdminOverview(payload.eventId, authToken);
    case 'getCompletenessReport': return handleGetCompletenessReport(payload.eventId, authToken);
    case 'getExecutiveAnalytics': return handleGetExecutiveAnalytics(payload, authToken);
    case 'getAuditLogs':
      requireRole(authToken, [ROLES.ADMIN, ROLES.COORDINATOR]);
      return jsonResponse(readSheetObjects('15_AUDIT_LOG'));

    case 'updateAppConfig': return handleUpdateAppConfig(payload, authToken);
    case 'saveEvent': return handleSaveEvent(payload, authToken);
    case 'saveEventDay': return handleSaveEventDay(payload, authToken);
    case 'saveSessionGroup': return handleSaveSessionGroup(payload, authToken);
    case 'saveSessionConfig': return handleSaveSessionConfig(payload, authToken);
    case 'saveStudent': return handleSaveStudent(payload, authToken);
    case 'regenerateAccessCode': return handleRegenerateAccessCode(payload, authToken);
    case 'saveTeacher': return handleSaveTeacher(payload, authToken);
    case 'saveUser': return handleSaveUser(payload, authToken);
    case 'resetUserPassword': return handleResetUserPassword(payload, authToken);
    case 'saveHalaqah': return handleSaveHalaqah(payload, authToken);
    case 'saveHalaqahTeacher': return handleSaveHalaqahTeacher(payload, authToken);
    case 'deleteHalaqahTeacher': return handleDeleteHalaqahTeacher(payload, authToken);
    case 'bulkRegisterAndAssignStudentsToHalaqah':
    case 'bulkAssignStudentsToHalaqah': return handleBulkRegisterAndAssignStudentsToHalaqah(payload, authToken);
    case 'updateParticipantTarget': return handleUpdateParticipantTarget(payload, authToken);

    case 'saveSessionAssessment': return handleSaveSessionAssessment(payload, authToken);
    case 'bulkSaveSessionAttendance': return handleBulkSaveSessionAttendance(payload, authToken);
    case 'deleteSessionAssessment': return handleDeleteSessionAssessment(payload, authToken);
    case 'saveFinalEvaluation': return handleSaveFinalEvaluation(payload, authToken);

    default:
      return jsonError('VALIDATION_ERROR', 'Aksi API "' + action + '" tidak dikenal.');
  }
}

// ====================================================
// 9. LOGIN / USER HANDLERS
// ====================================================

function handleSearchLoginAccounts(payload) {
  var query = cleanStringGS(payload.query || payload.q).toLowerCase();
  if (!query || query.length < 2) return jsonResponse([]);

  var users = readSheetObjects('06_USERS', true).filter(function(u) { return isActiveRecordGS(u); });
  var scored = [];

  users.forEach(function(u) {
    var username = cleanStringGS(u.username);
    var displayName = cleanStringGS(u.display_name);
    var usernameLower = username.toLowerCase();
    var displayLower = displayName.toLowerCase();
    var score = 999;

    if (usernameLower === query) score = 0;
    else if (usernameLower.indexOf(query) === 0) score = 1;
    else if (displayLower.indexOf(query) === 0) score = 2;
    else if (usernameLower.indexOf(query) !== -1) score = 3;
    else if (displayLower.indexOf(query) !== -1) score = 4;

    if (score < 999) scored.push({ score: score, username: username, display_name: displayName });
  });

  scored.sort(function(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    return a.display_name.localeCompare(b.display_name);
  });

  return jsonResponse(scored.slice(0, 8).map(function(item) {
    return { username: item.username, display_name: item.display_name };
  }));
}

function handleLogin(payload) {
  var username = cleanStringGS(payload.username).toLowerCase();
  var password = cleanStringGS(payload.password);

  if (!username || !password) return jsonError('VALIDATION_ERROR', 'Username dan password wajib diisi.');

  var users = readSheetObjects('06_USERS', true);
  var user = users.find(function(u) {
    return cleanStringGS(u.username).toLowerCase() === username && isActiveRecordGS(u);
  });

  if (!user || !verifyPasswordGS(password, user.password_hash)) {
    return jsonError('AUTH_INVALID', 'Username atau password tidak cocok.');
  }

  var role = normalizeRoleGS(user.role);
  if ([ROLES.ADMIN, ROLES.COORDINATOR, ROLES.TEACHER, ROLES.VIEWER].indexOf(role) === -1) {
    return jsonError('AUTH_INVALID', 'Role akun tidak valid. Silakan hubungi administrator.');
  }

  if (role === ROLES.TEACHER && !cleanStringGS(user.teacher_id)) {
    return jsonError('AUTH_INVALID', 'Akun Guru belum terhubung dengan Master Data Guru.');
  }

  var session = createSession(user);
  updateObject('06_USERS', 'user_id', user.user_id, { last_login_at: nowIsoGS() });
  addAuditLog('USER_LOGIN', 'USER', user.user_id, null, { username: user.username }, 'Login berhasil', user.user_id);

  return jsonResponse({
    token: session.token,
    user: {
      user_id: user.user_id,
      display_name: user.display_name,
      role: role,
      teacher_id: role === ROLES.TEACHER ? cleanStringGS(user.teacher_id) : ''
    }
  });
}

function handleSaveUser(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var incoming = Object.assign({}, payload.user || {});

  if (!cleanStringGS(incoming.user_id) || !cleanStringGS(incoming.username) || !cleanStringGS(incoming.display_name)) {
    return jsonError('VALIDATION_ERROR', 'ID Pengguna, username, dan nama tampilan wajib diisi.');
  }

  var role = normalizeRoleGS(incoming.role);
  var allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.TEACHER, ROLES.VIEWER];
  if (allowedRoles.indexOf(role) === -1) {
    return jsonError('VALIDATION_ERROR', 'Peran (role) "' + incoming.role + '" tidak valid. Pilihan: ADMIN, COORDINATOR, TEACHER, VIEWER.');
  }
  incoming.role = role;

  if (role === ROLES.TEACHER) {
    var teacherId = cleanStringGS(incoming.teacher_id);
    if (!teacherId) return jsonError('VALIDATION_ERROR', 'Akun dengan role Guru wajib menghubungkan Guru Terkait.');

    var teacherExists = readSheetObjects('04_MASTER_TEACHERS').some(function(t) {
      return cleanStringGS(t.teacher_id) === teacherId;
    });
    if (!teacherExists) return jsonError('VALIDATION_ERROR', 'Guru yang dipilih tidak ditemukan di Master Data Guru.');
    incoming.teacher_id = teacherId;
  } else {
    // Non-teacher accounts never inherit teacher identity.
    incoming.teacher_id = '';
  }

  var allUsers = readSheetObjects('06_USERS', true);
  var usernameLower = cleanStringGS(incoming.username).toLowerCase();
  var duplicate = allUsers.find(function(u) {
    return cleanStringGS(u.user_id) !== cleanStringGS(incoming.user_id) && cleanStringGS(u.username).toLowerCase() === usernameLower;
  });
  if (duplicate) {
    return jsonError('VALIDATION_ERROR', 'Username "' + incoming.username + '" sudah digunakan oleh akun lain (' + duplicate.display_name + ').');
  }

  var existing = allUsers.find(function(u) { return cleanStringGS(u.user_id) === cleanStringGS(incoming.user_id); });
  var passwordChanged = false;
  var now = nowIsoGS();

  if (cleanStringGS(incoming.password)) {
    incoming.password_hash = hashPasswordGS(cleanStringGS(incoming.password));
    passwordChanged = true;
  } else if (existing) {
    incoming.password_hash = existing.password_hash || '';
  } else {
    return jsonError('VALIDATION_ERROR', 'Password awal wajib diisi untuk pembuatan akun baru.');
  }

  delete incoming.password;
  incoming.updated_at = now;
  if (!existing) {
    incoming.created_at = now;
    incoming.last_login_at = '';
  }

  upsertObject('06_USERS', ['user_id'], incoming, 'user_id');

  if (passwordChanged || isFalseGS(incoming.active)) revokeAllUserSessions(incoming.user_id);

  addAuditLog(
    existing ? 'UPDATE_USER' : 'CREATE_USER',
    'USER',
    incoming.user_id,
    existing ? {
      display_name: existing.display_name,
      username: existing.username,
      role: existing.role,
      active: existing.active,
      teacher_id: existing.teacher_id
    } : null,
    {
      display_name: incoming.display_name,
      username: incoming.username,
      role: incoming.role,
      active: incoming.active,
      teacher_id: incoming.teacher_id
    },
    null,
    actor.user_id
  );

  var safe = Object.assign({}, incoming);
  delete safe.password_hash;
  delete safe.password;
  return jsonResponse(safe);
}

function handleResetUserPassword(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var targetUserId = cleanStringGS(payload.userId || payload.user_id);
  var plain = cleanStringGS(payload.newPassword || payload.password);

  if (!targetUserId) return jsonError('VALIDATION_ERROR', 'ID Pengguna wajib diisi.');
  if (!plain) return jsonError('VALIDATION_ERROR', 'Password baru tidak boleh kosong.');
  if (plain.length < 6) return jsonError('VALIDATION_ERROR', 'Password baru minimal 6 karakter.');

  var targetUser = readSheetObjects('06_USERS', true).find(function(u) {
    return cleanStringGS(u.user_id) === targetUserId;
  });
  if (!targetUser) return jsonError('NOT_FOUND', 'Pengguna tidak ditemukan.');

  var now = nowIsoGS();
  if (!updateObject('06_USERS', 'user_id', targetUserId, { password_hash: hashPasswordGS(plain), updated_at: now })) {
    return jsonError('SERVER_ERROR', 'Gagal memperbarui password pengguna.');
  }

  revokeAllUserSessions(targetUserId);
  addAuditLog('RESET_USER_PASSWORD', 'USER', targetUserId, null, {
    username: targetUser.username,
    display_name: targetUser.display_name,
    reset_at: now
  }, 'Reset password user dilakukan oleh Admin', actor.user_id);

  return jsonResponse({ success: true, userId: targetUserId });
}

// ====================================================
// 10. SIMPLE ADMIN WRITE HANDLERS
// ====================================================

function handleUpdateAppConfig(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  if (!cleanStringGS(payload.key)) return jsonError('VALIDATION_ERROR', 'Key konfigurasi wajib diisi.');

  var ok = updateObject('01_APP_CONFIG', 'config_key', payload.key, {
    config_value: payload.value,
    updated_at: nowIsoGS()
  });
  if (!ok) return jsonError('NOT_FOUND', 'Konfigurasi tidak ditemukan.');

  addAuditLog('UPDATE_CONFIG', 'CONFIG', payload.key, null, { key: payload.key, value: payload.value }, null, actor.user_id);
  return jsonResponse({ success: true });
}

function handleSaveEvent(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var eventObj = Object.assign({}, payload.event || {});
  if (!cleanStringGS(eventObj.event_id)) return jsonError('VALIDATION_ERROR', 'event_id wajib diisi.');

  upsertObject('07_EVENTS', ['event_id'], eventObj, 'event_id');
  addAuditLog('SAVE_EVENT', 'EVENT', eventObj.event_id, null, eventObj, null, actor.user_id, eventObj.event_id);
  return jsonResponse(eventObj);
}

function handleSaveEventDay(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var eventDay = Object.assign({}, payload.eventDay || {});
  if (!cleanStringGS(eventDay.event_day_id)) return jsonError('VALIDATION_ERROR', 'event_day_id wajib diisi.');

  upsertObject('07A_EVENT_DAYS', ['event_day_id'], eventDay, 'event_day_id');
  addAuditLog('SAVE_EVENT_DAY', 'EVENT_DAY', eventDay.event_day_id, null, eventDay, null, actor.user_id, eventDay.event_id);
  return jsonResponse(eventDay);
}

function handleSaveSessionGroup(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var group = Object.assign({}, payload.sessionGroup || {});
  if (!cleanStringGS(group.session_group_id)) return jsonError('VALIDATION_ERROR', 'session_group_id wajib diisi.');

  upsertObject('08_SESSION_GROUPS', ['session_group_id'], group, 'session_group_id');
  addAuditLog('SAVE_SESSION_GROUP', 'SESSION_GROUP', group.session_group_id, null, group, null, actor.user_id, group.event_id);
  return jsonResponse(group);
}

function handleSaveSessionConfig(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var sc = Object.assign({}, payload.sessionConfig || {});
  if (!cleanStringGS(sc.session_config_id)) return jsonError('VALIDATION_ERROR', 'Data konfigurasi sesi dan session_config_id wajib diisi.');

  var rawStart = sc.start_time !== undefined && sc.start_time !== null ? sc.start_time : sc.startTime;
  var rawEnd = sc.end_time !== undefined && sc.end_time !== null ? sc.end_time : sc.endTime;
  var start = normalizeClockTime(rawStart);
  var end = normalizeClockTime(rawEnd);

  if (!start) return jsonError('VALIDATION_ERROR', 'Jam Mulai tidak valid. Gunakan format HH:mm.');
  if (!end) return jsonError('VALIDATION_ERROR', 'Jam Selesai tidak valid. Gunakan format HH:mm.');
  if (start >= end) return jsonError('VALIDATION_ERROR', 'Jam Mulai (' + start + ') harus lebih awal dari Jam Selesai (' + end + ').');

  sc.start_time = start;
  sc.end_time = end;
  delete sc.startTime;
  delete sc.endTime;

  upsertObject('09_SESSION_CONFIG', ['session_config_id'], sc, 'session_config_id');
  addAuditLog('SAVE_SESSION_CONFIG', 'SESSION_CONFIG', sc.session_config_id, null, sc, null, actor.user_id, sc.event_id);
  return jsonResponse(sc);
}

function handleSaveTeacher(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var teacher = Object.assign({}, payload.teacher || {});
  if (!cleanStringGS(teacher.teacher_id)) return jsonError('VALIDATION_ERROR', 'teacher_id wajib diisi.');

  upsertObject('04_MASTER_TEACHERS', ['teacher_id'], teacher, 'teacher_id');
  addAuditLog('SAVE_TEACHER', 'TEACHER', teacher.teacher_id, null, teacher, null, actor.user_id);
  return jsonResponse(teacher);
}

function handleSaveHalaqah(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var halaqah = Object.assign({}, payload.halaqah || {});
  if (!cleanStringGS(halaqah.halaqah_id)) return jsonError('VALIDATION_ERROR', 'halaqah_id wajib diisi.');

  upsertObject('10_HALAQAH', ['halaqah_id'], halaqah, 'halaqah_id');
  addAuditLog('SAVE_HALAQAH', 'HALAQAH', halaqah.halaqah_id, null, halaqah, null, actor.user_id, halaqah.event_id);
  return jsonResponse(halaqah);
}

// ====================================================
// 11. STUDENT / ACCESS CODE
// ====================================================

function handleGetStudents(payload, authToken) {
  var session = requireAuth(authToken);
  var students = readSheetObjects('03_MASTER_STUDENTS');

  if (session.role === ROLES.ADMIN) return jsonResponse(students);

  if (session.role === ROLES.TEACHER) {
    if (!cleanStringGS(session.teacher_id)) return jsonError('FORBIDDEN', 'Akun Guru Anda belum terhubung dengan Master Data Guru.');

    var eventId = resolveRequestedEventId(payload.eventId);
    var halaqahIds = getTeacherAuthorizedHalaqahIds(session.teacher_id, eventId);
    var allowedStudentIds = {};

    readSheetObjects('12_EVENT_PARTICIPANTS').forEach(function(p) {
      if (cleanStringGS(p.event_id) === eventId && halaqahIds.indexOf(cleanStringGS(p.halaqah_id)) !== -1) {
        allowedStudentIds[cleanStringGS(p.student_id)] = true;
      }
    });

    students = students.filter(function(s) { return Boolean(allowedStudentIds[cleanStringGS(s.student_id)]); });
  }

  return jsonResponse(students.map(function(s) {
    var safe = Object.assign({}, s);
    safe.access_code = '';
    return safe;
  }));
}

function handleSaveStudent(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var student = Object.assign({}, payload.student || {});
  if (!cleanStringGS(student.student_id)) return jsonError('VALIDATION_ERROR', 'Data siswa dan student_id wajib diisi.');

  var allStudents = readSheetObjects('03_MASTER_STUDENTS');
  var requestedCode = cleanStringGS(student.access_code);

  if (requestedCode) {
    var duplicate = allStudents.find(function(s) {
      return cleanStringGS(s.student_id) !== cleanStringGS(student.student_id) && cleanStringGS(s.access_code).toLowerCase() === requestedCode.toLowerCase();
    });
    if (duplicate) return jsonError('VALIDATION_ERROR', 'Kode Akses "' + requestedCode + '" sudah digunakan oleh siswa lain (' + duplicate.full_name + ').');
    student.access_code = requestedCode;
  } else {
    var existing = allStudents.find(function(s) { return cleanStringGS(s.student_id) === cleanStringGS(student.student_id); });
    if (existing && cleanStringGS(existing.access_code)) student.access_code = existing.access_code;
    else student.access_code = generateRandomAccessCodeGS(allStudents.map(function(s) { return s.access_code; }));
  }

  if (!student.created_at) student.created_at = nowIsoGS();
  student.updated_at = nowIsoGS();
  upsertObject('03_MASTER_STUDENTS', ['student_id'], student, 'student_id');
  addAuditLog('SAVE_STUDENT', 'STUDENT', student.student_id, null, student, null, actor.user_id);
  return jsonResponse(student);
}

function handleRegenerateAccessCode(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var studentId = cleanStringGS(payload.studentId);
  if (!studentId) return jsonError('VALIDATION_ERROR', 'studentId wajib diisi.');

  var allStudents = readSheetObjects('03_MASTER_STUDENTS');
  var student = allStudents.find(function(s) { return cleanStringGS(s.student_id) === studentId; });
  if (!student) return jsonError('NOT_FOUND', 'Siswa tidak ditemukan.');

  var newCode = generateRandomAccessCodeGS(allStudents.map(function(s) { return s.access_code; }));
  var oldCode = student.access_code;
  updateObject('03_MASTER_STUDENTS', 'student_id', studentId, { access_code: newCode, updated_at: nowIsoGS() });
  addAuditLog('REGENERATE_ACCESS_CODE', 'STUDENT', studentId, { access_code: oldCode }, { access_code: newCode }, null, actor.user_id);
  return jsonResponse({ newAccessCode: newCode });
}

function generateRandomAccessCodeGS(existingCodes) {
  var chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var normalizedExisting = {};
  (existingCodes || []).forEach(function(c) { normalizedExisting[cleanStringGS(c).toUpperCase()] = true; });

  var code = '';
  do {
    var random = '';
    for (var i = 0; i < 6; i++) random += chars.charAt(Math.floor(Math.random() * chars.length));
    code = 'RT-' + random;
  } while (normalizedExisting[code]);
  return code;
}

// ====================================================
// 12. HALAQAH + TEACHER ASSIGNMENT
// ====================================================

function handleGetHalaqahList(payload, authToken) {
  var session = requireAuth(authToken);
  var eventId = resolveRequestedEventId(payload.eventId);
  var list = readSheetObjects('10_HALAQAH');

  if (eventId) list = list.filter(function(h) { return cleanStringGS(h.event_id) === eventId; });

  if (session.role === ROLES.TEACHER) {
    var allowedIds = getTeacherAuthorizedHalaqahIds(session.teacher_id, eventId);
    list = list.filter(function(h) { return allowedIds.indexOf(cleanStringGS(h.halaqah_id)) !== -1; });
  }

  return jsonResponse(list);
}

function handleGetHalaqahTeachers(payload, authToken) {
  var session = requireAuth(authToken);
  var eventId = resolveRequestedEventId(payload.eventId);
  var assignments = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) { return isActiveRecordGS(ht); });

  if (eventId) assignments = assignments.filter(function(ht) { return cleanStringGS(ht.event_id) === eventId; });
  if (session.role === ROLES.TEACHER) assignments = assignments.filter(function(ht) { return cleanStringGS(ht.teacher_id) === cleanStringGS(session.teacher_id); });

  return jsonResponse(assignments);
}

function handleSaveHalaqahTeacher(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var ht = Object.assign({}, payload.halaqahTeacher || {});
  if (!cleanStringGS(ht.event_id) || !cleanStringGS(ht.halaqah_id) || !cleanStringGS(ht.teacher_id)) {
    return jsonError('VALIDATION_ERROR', 'Data penugasan guru tidak lengkap.');
  }

  var allAssignments = readSheetObjects('11_HALAQAH_TEACHERS');
  var now = nowIsoGS();
  var matches = allAssignments.filter(function(item) {
    return cleanStringGS(item.event_id) === cleanStringGS(ht.event_id) && cleanStringGS(item.halaqah_id) === cleanStringGS(ht.halaqah_id) && cleanStringGS(item.teacher_id) === cleanStringGS(ht.teacher_id);
  });

  var activeMatch = matches.find(function(item) { return isActiveRecordGS(item); });
  if (activeMatch) {
    if (cleanStringGS(ht.teacher_role) && upperGS(activeMatch.teacher_role) !== upperGS(ht.teacher_role)) {
      updateObject('11_HALAQAH_TEACHERS', 'assignment_id', activeMatch.assignment_id, {
        teacher_role: upperGS(ht.teacher_role),
        updated_at: now
      });
      activeMatch.teacher_role = upperGS(ht.teacher_role);
      activeMatch.updated_at = now;
      addAuditLog('UPDATE_HALAQAH_TEACHER_ROLE', 'HALAQAH_TEACHER', activeMatch.assignment_id, null, activeMatch, null, actor.user_id, activeMatch.event_id);
    }
    return jsonResponse(activeMatch);
  }

  var inactiveMatch = matches[0];
  if (inactiveMatch) {
    var reactivated = Object.assign({}, inactiveMatch, {
      active: true,
      teacher_role: upperGS(ht.teacher_role || inactiveMatch.teacher_role || 'PRIMARY'),
      updated_at: now
    });
    updateObject('11_HALAQAH_TEACHERS', 'assignment_id', inactiveMatch.assignment_id, {
      active: true,
      teacher_role: reactivated.teacher_role,
      updated_at: now
    });
    addAuditLog('REACTIVATE_HALAQAH_TEACHER', 'HALAQAH_TEACHER', reactivated.assignment_id, null, reactivated, null, actor.user_id, reactivated.event_id);
    return jsonResponse(reactivated);
  }

  var newAssignment = {
    assignment_id: cleanStringGS(ht.assignment_id) || makeIdGS('HT_', 16),
    event_id: cleanStringGS(ht.event_id),
    halaqah_id: cleanStringGS(ht.halaqah_id),
    teacher_id: cleanStringGS(ht.teacher_id),
    teacher_role: upperGS(ht.teacher_role || 'PRIMARY'),
    active: true,
    created_at: now,
    updated_at: now
  };

  upsertObject('11_HALAQAH_TEACHERS', ['assignment_id'], newAssignment, 'assignment_id');
  addAuditLog('ASSIGN_HALAQAH_TEACHER', 'HALAQAH_TEACHER', newAssignment.assignment_id, null, newAssignment, null, actor.user_id, newAssignment.event_id);
  return jsonResponse(newAssignment);
}

function handleDeleteHalaqahTeacher(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var assignmentId = cleanStringGS(payload.assignmentId);
  if (!assignmentId) return jsonError('VALIDATION_ERROR', 'assignmentId wajib diisi.');

  var deleted = deleteRowByField('11_HALAQAH_TEACHERS', 'assignment_id', assignmentId);
  if (!deleted) return jsonError('NOT_FOUND', 'Penugasan guru tidak ditemukan.');

  addAuditLog('DELETE_HALAQAH_TEACHER', 'HALAQAH_TEACHER', assignmentId, deleted, { deleted: true, deleted_at: nowIsoGS() }, null, actor.user_id, deleted.event_id);
  return jsonResponse({
    deleted: true,
    assignmentId: assignmentId,
    teacherId: deleted.teacher_id,
    halaqahId: deleted.halaqah_id
  });
}

// ====================================================
// 13. SESSION CONFIG READ WITH TEACHER SCOPE
// ====================================================

function handleGetSessionConfigs(payload, authToken) {
  var session = requireAuth(authToken);
  var eventId = resolveRequestedEventId(payload.eventId);
  var configs = readSheetObjects('09_SESSION_CONFIG');

  if (eventId) configs = configs.filter(function(sc) { return cleanStringGS(sc.event_id) === eventId; });

  if (session.role === ROLES.TEACHER) {
    var allowedHalaqahs = getTeacherAuthorizedHalaqahIds(session.teacher_id, eventId);
    var groupIds = {};
    readSheetObjects('10_HALAQAH').forEach(function(h) {
      if (cleanStringGS(h.event_id) === eventId && allowedHalaqahs.indexOf(cleanStringGS(h.halaqah_id)) !== -1 && cleanStringGS(h.session_group_id)) {
        groupIds[cleanStringGS(h.session_group_id)] = true;
      }
    });
    configs = configs.filter(function(sc) { return Boolean(groupIds[cleanStringGS(sc.session_group_id)]); });
  }

  configs = configs.map(function(sc) {
    var copy = Object.assign({}, sc);
    copy.start_time = normalizeClockTime(sc.start_time);
    copy.end_time = normalizeClockTime(sc.end_time);
    return copy;
  });
  configs.sort(function(a, b) { return (Number(a.session_no) || 0) - (Number(b.session_no) || 0); });
  return jsonResponse(configs);
}

// ====================================================
// 14. PARTICIPANTS + PLACEMENT
// ====================================================

function handleGetEventParticipants(payload, authToken) {
  var session = requireAuth(authToken);
  var eventId = resolveRequestedEventId(payload.eventId);
  var participants = readSheetObjects('12_EVENT_PARTICIPANTS');

  if (eventId) participants = participants.filter(function(p) { return cleanStringGS(p.event_id) === eventId; });

  if (session.role === ROLES.TEACHER) {
    var halaqahIds = getTeacherAuthorizedHalaqahIds(session.teacher_id, eventId);
    participants = participants.filter(function(p) { return halaqahIds.indexOf(cleanStringGS(p.halaqah_id)) !== -1; });
  }

  return jsonResponse(participants);
}

function handleGetStudentPlacementBootstrap(payload, authToken) {
  requireRole(authToken, [ROLES.ADMIN, ROLES.COORDINATOR]);

  var eventObj = resolveEventObjectGS(payload.eventId);
  var eventId = eventObj ? cleanStringGS(eventObj.event_id) : cleanStringGS(payload.eventId);

  var students = readSheetObjects('03_MASTER_STUDENTS').map(function(s) {
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

  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return cleanStringGS(p.event_id) === eventId; });
  var halaqahs = readSheetObjects('10_HALAQAH').filter(function(h) {
    return cleanStringGS(h.event_id) === eventId && isActiveRecordGS(h);
  });

  return jsonResponse({ event: eventObj, students: students, participants: participants, halaqahs: halaqahs });
}

function handleBulkRegisterAndAssignStudentsToHalaqah(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var eventId = cleanStringGS(payload.eventId);
  var studentIds = Array.isArray(payload.studentIds) ? uniqueStringsGS(payload.studentIds) : [];
  var targetHalaqahId = cleanStringGS(payload.targetHalaqahId);

  if (!eventId) return jsonError('VALIDATION_ERROR', 'eventId wajib diisi.');
  if (studentIds.length === 0) return jsonError('VALIDATION_ERROR', 'Pilih minimal satu siswa.');

  var eventObj = readSheetObjects('07_EVENTS').find(function(e) { return cleanStringGS(e.event_id) === eventId; });
  if (!eventObj) return jsonError('NOT_FOUND', 'Kegiatan tidak ditemukan.');

  var halaqahs = readSheetObjects('10_HALAQAH');
  var targetHalaqah = targetHalaqahId ? halaqahs.find(function(h) { return cleanStringGS(h.halaqah_id) === targetHalaqahId; }) : null;
  if (targetHalaqahId && !targetHalaqah) return jsonError('NOT_FOUND', 'Halaqah tujuan tidak ditemukan.');
  if (targetHalaqah && cleanStringGS(targetHalaqah.event_id) !== eventId) return jsonError('VALIDATION_ERROR', 'Halaqah tujuan tidak terdaftar pada kegiatan ini.');

  var allStudents = readSheetObjects('03_MASTER_STUDENTS');
  var studentMap = {};
  allStudents.forEach(function(s) { studentMap[cleanStringGS(s.student_id)] = s; });

  var allParticipants = readSheetObjects('12_EVENT_PARTICIPANTS');
  var participantMap = {};
  allParticipants.forEach(function(p) {
    if (cleanStringGS(p.event_id) === eventId) participantMap[cleanStringGS(p.student_id)] = p;
  });

  var now = nowIsoGS();
  var toUpsert = [];
  var createdCount = 0;
  var updatedCount = 0;
  var skippedRecords = [];

  studentIds.forEach(function(studentId) {
    var student = studentMap[studentId];
    if (!student) {
      skippedRecords.push({ studentId: studentId, reason: 'Data siswa tidak ditemukan di Master Siswa.' });
      return;
    }
    if (!isActiveRecordGS(student)) {
      skippedRecords.push({ studentId: studentId, studentName: student.full_name, reason: 'Status siswa tidak aktif di Master Siswa.' });
      return;
    }
    if (targetHalaqah && cleanStringGS(targetHalaqah.gender) && cleanStringGS(student.gender) && upperGS(targetHalaqah.gender) !== upperGS(student.gender)) {
      skippedRecords.push({
        studentId: studentId,
        studentName: student.full_name,
        reason: 'Gender siswa (' + student.gender + ') tidak sesuai dengan gender halaqah (' + targetHalaqah.gender + ').'
      });
      return;
    }

    var existing = participantMap[studentId];
    if (existing) {
      toUpsert.push(Object.assign({}, existing, {
        halaqah_id: targetHalaqahId,
        session_group_id: targetHalaqah ? cleanStringGS(targetHalaqah.session_group_id) : cleanStringGS(existing.session_group_id),
        updated_at: now
      }));
      updatedCount++;
      return;
    }

    var created = {
      participant_id: makeIdGS('PART_', 16),
      event_id: eventId,
      student_id: student.student_id,
      class_snapshot: student.class_name || '',
      grade_snapshot: student.grade_level || '',
      skill_status_start: '',
      halaqah_id: targetHalaqahId,
      session_group_id: targetHalaqah ? cleanStringGS(targetHalaqah.session_group_id) : '',
      baseline_surah: '',
      baseline_ayah: '',
      baseline_note: '',
      baseline_date: '',
      target_surah_start: '',
      target_ayah_start: '',
      target_surah_end: '',
      target_ayah_end: '',
      target_lines: '',
      target_nuroniyyah_lines: '',
      target_iqra_pages: '',
      target_source: 'HALAQAH',
      target_note: '',
      assignment_note: '',
      participant_status: 'ACTIVE',
      created_at: now,
      updated_at: now
    };
    toUpsert.push(created);
    participantMap[studentId] = created;
    createdCount++;
  });

  batchUpsertObjectsGS('12_EVENT_PARTICIPANTS', ['participant_id'], toUpsert, 'participant_id');
  addAuditLog('BULK_REGISTER_ASSIGN_HALAQAH', 'PARTICIPANT', targetHalaqahId || eventId, null, {
    createdCount: createdCount,
    updatedCount: updatedCount,
    skippedCount: skippedRecords.length,
    targetHalaqahId: targetHalaqahId
  }, null, actor.user_id, eventId);

  return jsonResponse({
    createdCount: createdCount,
    updatedCount: updatedCount,
    skippedCount: skippedRecords.length,
    skippedStudentIds: skippedRecords.map(function(r) { return r.studentId; }),
    skippedRecords: skippedRecords
  });
}

function handleUpdateParticipantTarget(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.ADMIN]);
  var incoming = Object.assign({}, payload.participant || {});
  var participantId = cleanStringGS(incoming.participant_id || payload.participantId);
  if (!participantId) return jsonError('VALIDATION_ERROR', 'participant_id wajib diisi.');

  var existing = readSheetObjects('12_EVENT_PARTICIPANTS').find(function(p) { return cleanStringGS(p.participant_id) === participantId; });
  if (!existing) return jsonError('NOT_FOUND', 'Data peserta tidak ditemukan.');

  var allowedFields = [
    'skill_status_start',
    'baseline_surah',
    'baseline_ayah',
    'baseline_note',
    'baseline_date',
    'target_surah_start',
    'target_ayah_start',
    'target_surah_end',
    'target_ayah_end',
    'target_lines',
    'target_nuroniyyah_lines',
    'target_iqra_pages',
    'target_source',
    'target_note',
    'assignment_note'
  ];

  var updates = { updated_at: nowIsoGS() };
  allowedFields.forEach(function(field) {
    if (incoming[field] !== undefined) updates[field] = incoming[field];
  });

  if (updates.skill_status_start !== undefined) updates.skill_status_start = sanitizeSkillStatusGS(updates.skill_status_start);
  if (updates.target_source !== undefined) updates.target_source = upperGS(updates.target_source) === 'MANUAL' ? 'MANUAL' : 'HALAQAH';

  updateObject('12_EVENT_PARTICIPANTS', 'participant_id', participantId, updates);
  addAuditLog('UPDATE_BASELINE_TARGET', 'PARTICIPANT', participantId, existing, updates, null, actor.user_id, existing.event_id);
  return jsonResponse(Object.assign({}, existing, updates));
}

// ====================================================
// 15. SHARED WORKSPACE BUILDER
// ====================================================

function buildTeacherWorkspaceDataGS(session, payload) {
  payload = payload || {};

  var eventObj = resolveEventObjectGS(payload.eventId);
  var eventId = eventObj ? cleanStringGS(eventObj.event_id) : cleanStringGS(payload.eventId);

  var empty = {
    event: eventObj || null,
    halaqah: null,
    availableHalaqahs: [],
    students: [],
    sessionConfigs: [],
    assessments: [],
    finalEvaluations: [],
    assignedTeachers: [],
    teacherFilterId: '',
    serverTimestamp: nowIsoGS()
  };

  if (!eventId) return empty;

  var allHalaqahs = readSheetObjects('10_HALAQAH').filter(function(h) {
    return cleanStringGS(h.event_id) === eventId && isActiveRecordGS(h);
  });

  var allAssignments = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    return cleanStringGS(ht.event_id) === eventId && isActiveRecordGS(ht);
  });

  var allTeachers = readSheetObjects('04_MASTER_TEACHERS');
  var teacherMap = {};
  allTeachers.forEach(function(t) { teacherMap[cleanStringGS(t.teacher_id)] = t; });

  var teacherFilterId = resolveWorkspaceTeacherFilterGS(session, payload);
  var availableHalaqahs = allHalaqahs;

  if (teacherFilterId) {
    var allowedIds = {};
    allAssignments.forEach(function(ht) {
      if (cleanStringGS(ht.teacher_id) === teacherFilterId) allowedIds[cleanStringGS(ht.halaqah_id)] = true;
    });
    availableHalaqahs = allHalaqahs.filter(function(h) { return Boolean(allowedIds[cleanStringGS(h.halaqah_id)]); });
  }

  if (availableHalaqahs.length === 0) {
    empty.teacherFilterId = teacherFilterId;
    return empty;
  }

  var requestedHalaqahId = cleanStringGS(payload.halaqahId || payload.selectedHalaqahId);
  var selectedHalaqah = availableHalaqahs.find(function(h) {
    return cleanStringGS(h.halaqah_id) === requestedHalaqahId;
  }) || availableHalaqahs[0];

  var selectedId = cleanStringGS(selectedHalaqah.halaqah_id);
  var halaqahAssignments = allAssignments.filter(function(ht) { return cleanStringGS(ht.halaqah_id) === selectedId; });

  var assignedTeachers = halaqahAssignments.map(function(ht) {
    var teacher = teacherMap[cleanStringGS(ht.teacher_id)];
    return {
      teacher_id: cleanStringGS(ht.teacher_id),
      full_name: teacher ? teacher.full_name : 'Guru Tahfidz',
      short_name: teacher ? teacher.short_name || '' : '',
      teacher_role: upperGS(ht.teacher_role || 'PRIMARY')
    };
  });

  var primaryAssignment = halaqahAssignments.find(function(ht) { return upperGS(ht.teacher_role) === 'PRIMARY'; }) || halaqahAssignments[0] || null;
  var primaryTeacher = primaryAssignment ? teacherMap[cleanStringGS(primaryAssignment.teacher_id)] : null;
  var effectiveHalaqahTarget = getEffectiveParticipantTargetsGS(null, selectedHalaqah);

  var halaqahSummary = {
    halaqah_id: selectedHalaqah.halaqah_id,
    event_id: eventId,
    halaqah_name: selectedHalaqah.halaqah_name,
    group_name: selectedHalaqah.halaqah_name,
    teacher_name: primaryTeacher ? primaryTeacher.full_name : (assignedTeachers.length ? assignedTeachers[0].full_name : 'Belum Ditugaskan'),
    gender: selectedHalaqah.gender || '',
    grade_group: selectedHalaqah.grade_group || '',
    session_group_id: selectedHalaqah.session_group_id || '',
    location: selectedHalaqah.location || '',
    target_ziyadah_lines: effectiveHalaqahTarget.ziyadahLines !== null ? effectiveHalaqahTarget.ziyadahLines : undefined,
    target_nuroniyyah_lines: effectiveHalaqahTarget.nuroniyyahLines !== null ? effectiveHalaqahTarget.nuroniyyahLines : undefined,
    target_iqra_pages: toNumberOrUndefinedGS(selectedHalaqah.target_iqra_pages),
    active: true
  };

  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) {
    return cleanStringGS(p.event_id) === eventId && cleanStringGS(p.halaqah_id) === selectedId;
  });

  var studentIdSet = {};
  var participantIdSet = {};
  participants.forEach(function(p) {
    studentIdSet[cleanStringGS(p.student_id)] = true;
    participantIdSet[cleanStringGS(p.participant_id)] = true;
  });

  var studentMap = {};
  readSheetObjects('03_MASTER_STUDENTS').forEach(function(s) {
    var sid = cleanStringGS(s.student_id);
    if (studentIdSet[sid]) studentMap[sid] = s;
  });

  var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
    return !isDeletedRecordGS(a) && cleanStringGS(a.event_id) === eventId && (
      cleanStringGS(a.halaqah_id) === selectedId || Boolean(studentIdSet[cleanStringGS(a.student_id)])
    );
  });

  var assessmentsByStudent = {};
  assessments.forEach(function(a) {
    var sid = cleanStringGS(a.student_id);
    if (!assessmentsByStudent[sid]) assessmentsByStudent[sid] = [];
    assessmentsByStudent[sid].push(a);
  });

  var finalEvaluations = readSheetObjects('14_FINAL_EVALUATIONS').filter(function(e) {
    return cleanStringGS(e.event_id) === eventId && (
      Boolean(studentIdSet[cleanStringGS(e.student_id)]) || Boolean(participantIdSet[cleanStringGS(e.participant_id)])
    );
  });

  var evaluationMap = {};
  finalEvaluations.forEach(function(e) {
    if (cleanStringGS(e.participant_id)) evaluationMap[cleanStringGS(e.participant_id)] = e;
    if (cleanStringGS(e.student_id)) evaluationMap[cleanStringGS(e.student_id)] = e;
  });

  var sessionConfigs = readSheetObjects('09_SESSION_CONFIG').filter(function(sc) { return cleanStringGS(sc.event_id) === eventId; });
  var sessionGroupId = cleanStringGS(selectedHalaqah.session_group_id);
  if (sessionGroupId) sessionConfigs = sessionConfigs.filter(function(sc) { return cleanStringGS(sc.session_group_id) === sessionGroupId; });
  sessionConfigs.sort(function(a, b) { return (Number(a.session_no) || 0) - (Number(b.session_no) || 0); });

  var mappedStudents = participants.map(function(p) {
    var sid = cleanStringGS(p.student_id);
    var student = studentMap[sid];
    var evaluation = evaluationMap[cleanStringGS(p.participant_id)] || evaluationMap[sid] || null;
    var progress = summarizeAssessmentsByModeGS(assessmentsByStudent[sid] || []);
    var effectiveTarget = getEffectiveParticipantTargetsGS(p, selectedHalaqah);

    return {
      student_id: p.student_id,
      participant_id: p.participant_id,
      nis: student ? student.nis : '',
      full_name: student ? student.full_name : 'Siswa',
      access_code: session.role === ROLES.ADMIN && student ? student.access_code || '' : '',
      grade_snapshot: p.grade_snapshot || '',
      class_snapshot: p.class_snapshot || '',
      grade_class: (p.grade_snapshot || '') + ' (' + (p.class_snapshot || '') + ')',
      gender: student ? student.gender : selectedHalaqah.gender || '',
      skill_status_start: p.skill_status_start
        ? String(p.skill_status_start).toUpperCase().trim()
        : '',
      baseline_surah: toNumberOrUndefinedGS(p.baseline_surah),
      baseline_ayah: toNumberOrUndefinedGS(p.baseline_ayah),
      target_surah_start: toNumberOrUndefinedGS(p.target_surah_start),
      target_ayah_start: toNumberOrUndefinedGS(p.target_ayah_start),
      target_surah_end: toNumberOrUndefinedGS(p.target_surah_end),
      target_ayah_end: toNumberOrUndefinedGS(p.target_ayah_end),
      target_lines: toNumberOrUndefinedGS(p.target_lines),
      target_nuroniyyah_lines: toNumberOrUndefinedGS(p.target_nuroniyyah_lines),
      target_iqra_pages: toNumberOrUndefinedGS(p.target_iqra_pages),
      effective_target_ziyadah_lines: effectiveTarget.ziyadahLines !== null ? effectiveTarget.ziyadahLines : undefined,
      effective_target_nuroniyyah_lines: effectiveTarget.nuroniyyahLines !== null ? effectiveTarget.nuroniyyahLines : undefined,
      target_source: upperGS(p.target_source) === 'MANUAL' ? 'MANUAL' : 'HALAQAH',
      targetText: formatParticipantTargetGS(p, selectedHalaqah),
      totalLinesAdded: progress.ziyadahLines + progress.nuroniyyahLines,
      totalZiyadahLinesAdded: progress.ziyadahLines,
      totalNuroniyyahLinesAdded: progress.nuroniyyahLines,
      completionStatus: evaluation ? evaluation.completion_status : 'NOT_EVALUATED',
      session_group_id: p.session_group_id || selectedHalaqah.session_group_id || ''
    };
  });

  return {
    event: eventObj,
    halaqah: halaqahSummary,
    availableHalaqahs: availableHalaqahs,
    students: mappedStudents,
    sessionConfigs: sessionConfigs,
    assessments: assessments,
    finalEvaluations: finalEvaluations,
    assignedTeachers: assignedTeachers,
    teacherFilterId: teacherFilterId,
    serverTimestamp: nowIsoGS()
  };
}

function handleGetTeacherWorkspaceBootstrap(payload, authToken) {
  var session = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN, ROLES.COORDINATOR]);
  return jsonResponse(buildTeacherWorkspaceDataGS(session, payload));
}

function handleGetMyHalaqahData(payload, authToken) {
  var session = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN, ROLES.COORDINATOR]);
  var data = buildTeacherWorkspaceDataGS(session, payload);

  return jsonResponse({
    halaqah: data.halaqah,
    students: data.students,
    sessions: data.assessments,
    assessments: data.assessments,
    sessionConfigs: data.sessionConfigs,
    availableHalaqahs: data.availableHalaqahs,
    finalEvaluations: data.finalEvaluations,
    assignedTeachers: data.assignedTeachers,
    teacherFilterId: data.teacherFilterId,
    event: data.event,
    serverTimestamp: data.serverTimestamp
  });
}

// ====================================================
// 16. ASSESSMENT READS
// ====================================================

function handleGetSessionAssessments(payload, authToken) {
  var session = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN, ROLES.COORDINATOR]);
  var eventId = resolveRequestedEventId(payload.eventId);
  var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) { return !isDeletedRecordGS(a); });

  if (eventId) assessments = assessments.filter(function(a) { return cleanStringGS(a.event_id) === eventId; });

  if (session.role === ROLES.TEACHER) {
    var allowedHalaqahs = getTeacherAuthorizedHalaqahIds(session.teacher_id, eventId);
    assessments = assessments.filter(function(a) { return allowedHalaqahs.indexOf(cleanStringGS(a.halaqah_id)) !== -1; });
  }

  return jsonResponse(assessments);
}

function handleGetFinalEvaluations(payload, authToken) {
  var session = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN, ROLES.COORDINATOR]);
  var eventId = resolveRequestedEventId(payload.eventId);
  var evaluations = readSheetObjects('14_FINAL_EVALUATIONS');

  if (eventId) evaluations = evaluations.filter(function(e) { return cleanStringGS(e.event_id) === eventId; });

  if (session.role === ROLES.TEACHER) {
    var halaqahIds = getTeacherAuthorizedHalaqahIds(session.teacher_id, eventId);
    var allowed = {};
    readSheetObjects('12_EVENT_PARTICIPANTS').forEach(function(p) {
      if (cleanStringGS(p.event_id) === eventId && halaqahIds.indexOf(cleanStringGS(p.halaqah_id)) !== -1) {
        allowed[cleanStringGS(p.participant_id)] = true;
        allowed[cleanStringGS(p.student_id)] = true;
      }
    });

    evaluations = evaluations.filter(function(e) {
      return Boolean(allowed[cleanStringGS(e.participant_id)]) || Boolean(allowed[cleanStringGS(e.student_id)]);
    });
  }

  return jsonResponse(evaluations);
}

// ====================================================
// 17. ASSESSMENT WRITES
// ====================================================

function handleSaveSessionAssessment(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN]);
  var assessment = Object.assign({}, payload.assessment || {});

  if (!cleanStringGS(assessment.participant_id)) return jsonError('VALIDATION_ERROR', 'participant_id wajib diisi.');

  var participant = readSheetObjects('12_EVENT_PARTICIPANTS').find(function(p) {
    return cleanStringGS(p.participant_id) === cleanStringGS(assessment.participant_id);
  });
  if (!participant) return jsonError('NOT_FOUND', 'Data peserta tidak ditemukan.');

  assessment.student_id = participant.student_id;
  assessment.halaqah_id = participant.halaqah_id;
  assessment.event_id = participant.event_id;

  if (actor.role === ROLES.TEACHER) {
    var allowedHalaqahs = getTeacherAuthorizedHalaqahIds(actor.teacher_id, participant.event_id);
    if (allowedHalaqahs.indexOf(cleanStringGS(participant.halaqah_id)) === -1) {
      return jsonError('FORBIDDEN', 'Anda tidak berwenang mengedit penilaian siswa ini.');
    }
    assessment.teacher_id = actor.teacher_id;
  } else {
    var preferredTeacherId = cleanStringGS(payload.teacherId) || cleanStringGS(assessment.teacher_id);
    var responsibleTeacherId = resolveResponsibleHalaqahTeacherId(participant.halaqah_id, participant.event_id, preferredTeacherId);
    if (!responsibleTeacherId) return jsonError('VALIDATION_ERROR', 'Tidak ada guru penanggung jawab yang aktif untuk halaqah ini.');
    assessment.teacher_id = responsibleTeacherId;
  }

  var sessionConfigId = cleanStringGS(assessment.session_config_id);
  if (!sessionConfigId) return jsonError('VALIDATION_ERROR', 'session_config_id wajib diisi.');

  var sessionConfig = readSheetObjects('09_SESSION_CONFIG').find(function(sc) {
    return cleanStringGS(sc.session_config_id) === sessionConfigId;
  });
  if (!sessionConfig) return jsonError('NOT_FOUND', 'Konfigurasi sesi tidak ditemukan.');
  if (cleanStringGS(sessionConfig.event_id) !== cleanStringGS(participant.event_id)) {
    return jsonError('VALIDATION_ERROR', 'Sesi penilaian tidak sesuai dengan event siswa.');
  }

  var participantGroupId = cleanStringGS(participant.session_group_id);
  if (participantGroupId && cleanStringGS(sessionConfig.session_group_id) !== participantGroupId) {
    return jsonError('VALIDATION_ERROR', 'Sesi penilaian tidak sesuai dengan kelompok sesi siswa.');
  }

  assessment.event_day_id = sessionConfig.event_day_id;
  assessment.session_no = sessionConfig.session_no;

  var attendance = upperGS(assessment.attendance_status || 'UNASSESSED');
  if (ATTENDANCE_STATUSES.indexOf(attendance) === -1) {
    return jsonError('VALIDATION_ERROR', 'Status kehadiran "' + assessment.attendance_status + '" tidak valid.');
  }
  assessment.attendance_status = attendance;

  if (attendance === 'PRESENT') {
    var requestedRawMode = upperGS(assessment.assessment_mode || defaultAssessmentModeForParticipantGS(participant) || ASSESSMENT_MODES.ZIYADAH);
    if ([ASSESSMENT_MODES.ZIYADAH, ASSESSMENT_MODES.NURONIYYAH, ASSESSMENT_MODES.IQRA].indexOf(requestedRawMode) === -1) {
      return jsonError('VALIDATION_ERROR', 'Mode penilaian "' + requestedRawMode + '" tidak valid.');
    }

    if (requestedRawMode === ASSESSMENT_MODES.NURONIYYAH) {
      if (!cleanStringGS(assessment.nuroniyyah_dars) || !hasValueGS(assessment.lines_added)) {
        return jsonError('VALIDATION_ERROR', 'Pada mode Nuroniyyah, Ad-Dars dan jumlah penambahan baris wajib diisi.');
      }

      var nuroniyyahLines = Number(assessment.lines_added);
      if (!isFinite(nuroniyyahLines) || isNaN(nuroniyyahLines) || nuroniyyahLines < 0) {
        return jsonError('VALIDATION_ERROR', 'Jumlah baris Nuroniyyah harus berupa angka 0 atau lebih.');
      }

      assessment.assessment_mode = ASSESSMENT_MODES.NURONIYYAH;
      assessment.nuroniyyah_dars = cleanStringGS(assessment.nuroniyyah_dars);
      assessment.lines_added = nuroniyyahLines;
      clearQuranProgressFieldsGS(assessment);
      clearLegacyIqraFieldsGS(assessment);
      assessment.assessment_status = 'COMPLETED';
    } else if (requestedRawMode === ASSESSMENT_MODES.IQRA) {
      if (!hasValueGS(assessment.iqra_level) || !hasValueGS(assessment.iqra_page_start)) {
        return jsonError('VALIDATION_ERROR', 'Data Iqra legacy belum lengkap.');
      }

      assessment.assessment_mode = ASSESSMENT_MODES.IQRA;
      assessment.lines_added = hasValueGS(assessment.lines_added) ? Number(assessment.lines_added) : 0;
      clearQuranProgressFieldsGS(assessment);
      clearNuroniyyahProgressFieldsGS(assessment);
      assessment.assessment_status = 'COMPLETED';
    } else {
      if (!hasValueGS(assessment.surah_start) || !hasValueGS(assessment.ayah_start) || !hasValueGS(assessment.surah_end) || !hasValueGS(assessment.ayah_end) || !hasValueGS(assessment.lines_added)) {
        return jsonError('VALIDATION_ERROR', 'Pada mode Hafalan Al-Qur\'an, surah/ayat awal & akhir serta jumlah baris wajib diisi.');
      }

      var quranFields = ['surah_start', 'ayah_start', 'surah_end', 'ayah_end', 'lines_added'];
      for (var i = 0; i < quranFields.length; i++) {
        var numberValue = Number(assessment[quranFields[i]]);
        if (!isFinite(numberValue) || isNaN(numberValue) || numberValue < 0) {
          return jsonError('VALIDATION_ERROR', 'Data Hafalan Al-Qur\'an mengandung angka yang tidak valid.');
        }
        assessment[quranFields[i]] = numberValue;
      }

      assessment.assessment_mode = ASSESSMENT_MODES.ZIYADAH;
      clearNuroniyyahProgressFieldsGS(assessment);
      clearLegacyIqraFieldsGS(assessment);
      assessment.assessment_status = 'COMPLETED';
    }
  } else if (attendance === 'UNASSESSED') {
    assessment.assessment_status = 'PENDING';
    clearAllProgressFieldsGS(assessment);
  } else {
    assessment.assessment_status = 'COMPLETED';
    clearAllProgressFieldsGS(assessment);
  }

  assessment.updated_at = nowIsoGS();
  if (!assessment.created_at) assessment.created_at = nowIsoGS();
  if (!cleanStringGS(assessment.assessment_id)) assessment.assessment_id = makeIdGS('ASM_', 16);
  assessment.is_deleted = false;
  assessment.deleted_at = '';
  assessment.deleted_by = '';

  var status = upsertObject('13_SESSION_ASSESSMENTS', ['event_id', 'participant_id', 'session_config_id'], assessment, 'assessment_id');
  addAuditLog(status === 'INSERTED' ? 'CREATE_ASSESSMENT' : 'UPDATE_ASSESSMENT', 'SESSION_ASSESSMENT', assessment.assessment_id, null, assessment, null, actor.user_id, assessment.event_id);
  return jsonResponse(assessment);
}

function handleBulkSaveSessionAttendance(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN]);
  var sessionConfigId = cleanStringGS(payload.sessionConfigId);
  var studentIds = Array.isArray(payload.studentIds) ? uniqueStringsGS(payload.studentIds) : [];
  var attendance = upperGS(payload.attendanceStatus || payload.status);

  if (!sessionConfigId) return jsonError('VALIDATION_ERROR', 'sessionConfigId wajib diisi.');
  if (studentIds.length === 0) return jsonError('VALIDATION_ERROR', 'Pilih minimal satu siswa.');
  if (['PRESENT', 'SICK', 'PERMISSION', 'ABSENT'].indexOf(attendance) === -1) return jsonError('VALIDATION_ERROR', 'Status presensi tidak valid.');

  var sessionConfig = readSheetObjects('09_SESSION_CONFIG').find(function(sc) {
    return cleanStringGS(sc.session_config_id) === sessionConfigId;
  });
  if (!sessionConfig) return jsonError('NOT_FOUND', 'Konfigurasi sesi tidak ditemukan.');

  var eventId = cleanStringGS(sessionConfig.event_id);
  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) { return cleanStringGS(p.event_id) === eventId; });
  var participantByStudent = {};
  participants.forEach(function(p) { participantByStudent[cleanStringGS(p.student_id)] = p; });

  var teacherHalaqahIds = actor.role === ROLES.TEACHER ? getTeacherAuthorizedHalaqahIds(actor.teacher_id, eventId) : null;

  var existingAssessments = readSheetObjects('13_SESSION_ASSESSMENTS');
  var existingByKey = {};
  existingAssessments.forEach(function(a) {
    if (isDeletedRecordGS(a)) return;
    var key = cleanStringGS(a.event_id) + '|||' + cleanStringGS(a.participant_id) + '|||' + cleanStringGS(a.session_config_id);
    existingByKey[key] = a;
  });

  var now = nowIsoGS();
  var toUpsert = [];
  var skipped = [];

  studentIds.forEach(function(studentId) {
    var participant = participantByStudent[studentId];
    if (!participant) {
      skipped.push({ studentId: studentId, reason: 'Siswa tidak terdaftar pada event ini.' });
      return;
    }

    if (actor.role === ROLES.TEACHER && teacherHalaqahIds.indexOf(cleanStringGS(participant.halaqah_id)) === -1) {
      skipped.push({ studentId: studentId, reason: 'Guru tidak memiliki akses ke halaqah siswa.' });
      return;
    }

    var key = eventId + '|||' + cleanStringGS(participant.participant_id) + '|||' + sessionConfigId;
    var existing = existingByKey[key];
    var assessment = existing ? Object.assign({}, existing) : {
      assessment_id: makeIdGS('ASM_', 16),
      event_id: eventId,
      participant_id: participant.participant_id,
      student_id: participant.student_id,
      halaqah_id: participant.halaqah_id,
      session_config_id: sessionConfigId,
      created_at: now
    };

    assessment.event_day_id = sessionConfig.event_day_id;
    assessment.session_no = sessionConfig.session_no;
    assessment.student_id = participant.student_id;
    assessment.halaqah_id = participant.halaqah_id;
    assessment.attendance_status = attendance;
    assessment.updated_at = now;
    assessment.is_deleted = false;
    assessment.deleted_at = '';
    assessment.deleted_by = '';

    if (actor.role === ROLES.TEACHER) {
      assessment.teacher_id = actor.teacher_id;
    } else {
      var preferredTeacherId = cleanStringGS(payload.teacherId) || cleanStringGS(assessment.teacher_id);
      assessment.teacher_id = resolveResponsibleHalaqahTeacherId(participant.halaqah_id, eventId, preferredTeacherId);
      if (!assessment.teacher_id) {
        skipped.push({ studentId: studentId, reason: 'Tidak ada guru penanggung jawab aktif pada halaqah.' });
        return;
      }
    }

    if (attendance === 'PRESENT') {
      if (!cleanStringGS(assessment.assessment_mode)) assessment.assessment_mode = defaultAssessmentModeForParticipantGS(participant);
      assessment.assessment_status = hasCompletedPresentProgressGS(assessment) ? 'COMPLETED' : 'PENDING';
    } else {
      assessment.assessment_status = 'COMPLETED';
      clearAllProgressFieldsGS(assessment);
    }

    toUpsert.push(assessment);
  });

  batchUpsertObjectsGS('13_SESSION_ASSESSMENTS', ['event_id', 'participant_id', 'session_config_id'], toUpsert, 'assessment_id');

  addAuditLog('BULK_ATTENDANCE', 'SESSION_ASSESSMENT', sessionConfigId, null, {
    sessionConfigId: sessionConfigId,
    studentCount: toUpsert.length,
    skippedCount: skipped.length,
    status: attendance
  }, 'Presensi massal ' + toUpsert.length + ' siswa (' + attendance + ')', actor.user_id, eventId);

  return jsonResponse({
    updatedCount: toUpsert.length,
    skippedCount: skipped.length,
    skippedRecords: skipped,
    updatedAssessments: toUpsert
  });
}

function handleDeleteSessionAssessment(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN]);
  var assessmentId = cleanStringGS(payload.assessmentId);
  if (!assessmentId) return jsonError('VALIDATION_ERROR', 'assessmentId wajib diisi.');

  var assessment = readSheetObjects('13_SESSION_ASSESSMENTS').find(function(a) { return cleanStringGS(a.assessment_id) === assessmentId; });
  if (!assessment) return jsonError('NOT_FOUND', 'Penilaian tidak ditemukan.');

  if (actor.role === ROLES.TEACHER) {
    var allowed = getTeacherAuthorizedHalaqahIds(actor.teacher_id, assessment.event_id);
    if (allowed.indexOf(cleanStringGS(assessment.halaqah_id)) === -1) return jsonError('FORBIDDEN', 'Anda tidak berwenang menghapus penilaian ini.');
  }

  updateObject('13_SESSION_ASSESSMENTS', 'assessment_id', assessmentId, {
    is_deleted: true,
    deleted_at: nowIsoGS(),
    deleted_by: actor.user_id
  });
  addAuditLog('SOFT_DELETE_ASSESSMENT', 'SESSION_ASSESSMENT', assessmentId, assessment, { is_deleted: true }, null, actor.user_id, assessment.event_id);
  return jsonResponse({ success: true });
}

// ====================================================
// 18. FINAL EVALUATION
// ====================================================

function handleSaveFinalEvaluation(payload, authToken) {
  var actor = requireRole(authToken, [ROLES.TEACHER, ROLES.ADMIN]);
  var evaluation = Object.assign({}, payload.finalEvaluation || {});
  if (!cleanStringGS(evaluation.participant_id)) return jsonError('VALIDATION_ERROR', 'participant_id wajib diisi.');

  var participant = readSheetObjects('12_EVENT_PARTICIPANTS').find(function(p) {
    return cleanStringGS(p.participant_id) === cleanStringGS(evaluation.participant_id);
  });
  if (!participant) return jsonError('NOT_FOUND', 'Data peserta tidak ditemukan.');

  evaluation.student_id = participant.student_id;
  evaluation.event_id = participant.event_id;

  if (actor.role === ROLES.TEACHER) {
    var allowed = getTeacherAuthorizedHalaqahIds(actor.teacher_id, participant.event_id);
    if (allowed.indexOf(cleanStringGS(participant.halaqah_id)) === -1) return jsonError('FORBIDDEN', 'Anda tidak berwenang mengedit evaluasi akhir siswa ini.');
    evaluation.evaluator_teacher_id = actor.teacher_id;
  } else {
    var preferred = cleanStringGS(payload.teacherId) || cleanStringGS(evaluation.evaluator_teacher_id) || cleanStringGS(evaluation.teacher_id);
    var responsible = resolveResponsibleHalaqahTeacherId(participant.halaqah_id, participant.event_id, preferred);
    if (!responsible) return jsonError('VALIDATION_ERROR', 'Tidak ada guru evaluator aktif untuk halaqah ini.');
    evaluation.evaluator_teacher_id = responsible;
  }
  delete evaluation.teacher_id;

  var completion = upperGS(evaluation.completion_status);
  if (COMPLETION_STATUSES.indexOf(completion) === -1) return jsonError('VALIDATION_ERROR', 'completion_status harus COMPLETE atau INCOMPLETE.');
  evaluation.completion_status = completion;

  var skillEnd = sanitizeSkillStatusGS(evaluation.skill_status_end);
  if (!skillEnd) return jsonError('VALIDATION_ERROR', 'skill_status_end harus NON_BBL, BBL, atau BBLS.');
  evaluation.skill_status_end = skillEnd;

  var affective = upperGS(evaluation.affective_rating);
  delete evaluation.affective_grade;
  if (affective && ['A', 'B', 'C', 'D'].indexOf(affective) === -1) return jsonError('VALIDATION_ERROR', 'affective_rating harus A, B, C, D, atau kosong.');
  evaluation.affective_rating = affective;

  var requiresQuranRange = skillEnd === 'BBL' || skillEnd === 'BBLS';
  var hasAnyQuranRange = hasValueGS(evaluation.evaluation_surah_start) || hasValueGS(evaluation.evaluation_ayah_start) || hasValueGS(evaluation.evaluation_surah_end) || hasValueGS(evaluation.evaluation_ayah_end);

  if (requiresQuranRange && !(
    hasValueGS(evaluation.evaluation_surah_start) &&
    hasValueGS(evaluation.evaluation_ayah_start) &&
    hasValueGS(evaluation.evaluation_surah_end) &&
    hasValueGS(evaluation.evaluation_ayah_end)
  )) {
    return jsonError('VALIDATION_ERROR', 'Jangkauan surah dan ayat evaluasi akhir wajib diisi untuk status akhir BBL/BBLS.');
  }

  if (hasAnyQuranRange) {
    var fields = ['evaluation_surah_start', 'evaluation_ayah_start', 'evaluation_surah_end', 'evaluation_ayah_end'];
    for (var i = 0; i < fields.length; i++) {
      if (!hasValueGS(evaluation[fields[i]])) return jsonError('VALIDATION_ERROR', 'Jangkauan evaluasi Al-Qur\'an harus diisi lengkap.');
      var n = Number(evaluation[fields[i]]);
      if (!isFinite(n) || isNaN(n) || n < 0) return jsonError('VALIDATION_ERROR', 'Jangkauan evaluasi Al-Qur\'an mengandung angka tidak valid.');
      evaluation[fields[i]] = n;
    }
  } else {
    evaluation.evaluation_surah_start = '';
    evaluation.evaluation_ayah_start = '';
    evaluation.evaluation_surah_end = '';
    evaluation.evaluation_ayah_end = '';
  }

  if (!cleanStringGS(evaluation.final_evaluation_id)) evaluation.final_evaluation_id = makeIdGS('FE_', 16);
  evaluation.updated_at = nowIsoGS();
  if (!evaluation.created_at) evaluation.created_at = nowIsoGS();

  var status = upsertObject('14_FINAL_EVALUATIONS', ['event_id', 'participant_id'], evaluation, 'final_evaluation_id');
  addAuditLog(status === 'INSERTED' ? 'SAVE_FINAL_EVALUATION' : 'UPDATE_FINAL_EVALUATION', 'FINAL_EVALUATION', evaluation.final_evaluation_id, null, evaluation, null, actor.user_id, evaluation.event_id);
  return jsonResponse(evaluation);
}

// ====================================================
// 19. ADMIN OVERVIEW
// ====================================================

function handleGetAdminOverview(eventId, authToken) {
  requireRole(authToken, [ROLES.ADMIN, ROLES.COORDINATOR]);

  var eventObj = resolveEventObjectGS(eventId);
  if (!eventObj) {
    return jsonResponse({
      activeEvent: null,
      metrics: { totalStudents: 0, totalHalaqahs: 0, inputCompletionRate: 0 },
      teachersProgress: [],
      anomalies: []
    });
  }

  var resolvedEventId = cleanStringGS(eventObj.event_id);
  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) {
    return cleanStringGS(p.event_id) === resolvedEventId;
  });
  var halaqahs = readSheetObjects('10_HALAQAH').filter(function(h) {
    return cleanStringGS(h.event_id) === resolvedEventId && isActiveRecordGS(h);
  });
  var sessionConfigs = readSheetObjects('09_SESSION_CONFIG').filter(function(sc) {
    return cleanStringGS(sc.event_id) === resolvedEventId && isActiveRecordGS(sc);
  });
  var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
    return cleanStringGS(a.event_id) === resolvedEventId && !isDeletedRecordGS(a);
  });
  var assignments = readSheetObjects('11_HALAQAH_TEACHERS').filter(function(ht) {
    return cleanStringGS(ht.event_id) === resolvedEventId && isActiveRecordGS(ht);
  });
  var teachers = readSheetObjects('04_MASTER_TEACHERS');
  var students = readSheetObjects('03_MASTER_STUDENTS');

  var teacherMap = {};
  teachers.forEach(function(t) { teacherMap[cleanStringGS(t.teacher_id)] = t; });
  var halaqahMap = {};
  halaqahs.forEach(function(h) { halaqahMap[cleanStringGS(h.halaqah_id)] = h; });
  var studentMap = {};
  students.forEach(function(s) { studentMap[cleanStringGS(s.student_id)] = s; });

  var expectedTotal = 0;
  participants.forEach(function(p) {
    var groupId = cleanStringGS(p.session_group_id);
    if (!groupId) return;
    expectedTotal += sessionConfigs.filter(function(sc) {
      return cleanStringGS(sc.session_group_id) === groupId;
    }).length;
  });

  var actualTotal = assessments.length;
  var completionRate = expectedTotal > 0
    ? Math.min(100, Number(((actualTotal / expectedTotal) * 100).toFixed(1)))
    : 0;

  var teachersProgress = assignments.map(function(ht) {
    var halaqahId = cleanStringGS(ht.halaqah_id);
    var teacher = teacherMap[cleanStringGS(ht.teacher_id)];
    var halaqah = halaqahMap[halaqahId];

    var groupParticipants = participants.filter(function(p) {
      return cleanStringGS(p.halaqah_id) === halaqahId;
    });

    var expected = 0;
    groupParticipants.forEach(function(p) {
      var groupId = cleanStringGS(p.session_group_id);
      if (!groupId) return;
      expected += sessionConfigs.filter(function(sc) {
        return cleanStringGS(sc.session_group_id) === groupId;
      }).length;
    });

    var actual = assessments.filter(function(a) {
      return cleanStringGS(a.halaqah_id) === halaqahId;
    }).length;

    return {
      teacherName: teacher ? teacher.full_name : 'Guru Tahfidz',
      groupName: halaqah ? halaqah.halaqah_name : 'Halaqah',
      completedSessions: actual,
      totalSessions: expected,
      percentage: expected > 0 ? Math.min(100, Math.round((actual / expected) * 100)) : 100
    };
  });

  var anomalies = [];
  assessments.forEach(function(a) {
    if (upperGS(a.attendance_status) !== 'PRESENT') return;
    var lines = Number(a.lines_added);
    if (!isFinite(lines) || isNaN(lines)) lines = 0;

    if (lines > 40) {
      var student = studentMap[cleanStringGS(a.student_id)];
      var mode = normalizeAssessmentModeGS(a);
      anomalies.push({
        studentName: student ? student.full_name : 'Siswa',
        sessionNo: a.session_no,
        mode: mode,
        description: (mode === ASSESSMENT_MODES.NURONIYYAH ? 'Nuroniyyah' : 'Ziyadah') + ' melampaui ' + lines + ' baris dalam 1 sesi (perlu verifikasi)'
      });
    }
  });

  return jsonResponse({
    activeEvent: eventObj,
    metrics: {
      totalStudents: participants.length,
      totalHalaqahs: halaqahs.length,
      inputCompletionRate: completionRate
    },
    teachersProgress: teachersProgress,
    anomalies: anomalies
  });
}

// ====================================================
// 20. COMPLETENESS REPORT
// ====================================================

function handleGetCompletenessReport(eventId, authToken) {
  requireRole(authToken, [ROLES.ADMIN, ROLES.COORDINATOR]);

  var eventObj = resolveEventObjectGS(eventId);
  if (!eventObj) {
    return jsonResponse({
      event: null,
      counts: {
        totalParticipants: 0,
        withoutHalaqahCount: 0,
        withoutSessionGroupCount: 0,
        withoutBaselineCount: 0,
        withoutTargetCount: 0,
        withoutFinalEvalCount: 0
      },
      issues: {
        withoutHalaqah: [],
        withoutSessionGroup: [],
        withoutBaseline: [],
        withoutTarget: [],
        withoutFinalEval: []
      },
      halaqahReports: []
    });
  }

  var resolvedEventId = cleanStringGS(eventObj.event_id);
  var participants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) {
    return cleanStringGS(p.event_id) === resolvedEventId;
  });
  var students = readSheetObjects('03_MASTER_STUDENTS');
  var halaqahs = readSheetObjects('10_HALAQAH').filter(function(h) {
    return cleanStringGS(h.event_id) === resolvedEventId;
  });
  var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
    return cleanStringGS(a.event_id) === resolvedEventId && !isDeletedRecordGS(a);
  });
  var evaluations = readSheetObjects('14_FINAL_EVALUATIONS').filter(function(e) {
    return cleanStringGS(e.event_id) === resolvedEventId;
  });
  var sessionConfigs = readSheetObjects('09_SESSION_CONFIG').filter(function(sc) {
    return cleanStringGS(sc.event_id) === resolvedEventId && isActiveRecordGS(sc);
  });

  var studentMap = {};
  students.forEach(function(s) { studentMap[cleanStringGS(s.student_id)] = s; });
  var halaqahMap = {};
  halaqahs.forEach(function(h) { halaqahMap[cleanStringGS(h.halaqah_id)] = h; });

  var withoutHalaqah = participants.filter(function(p) { return !cleanStringGS(p.halaqah_id); });
  var withoutSessionGroup = participants.filter(function(p) { return !cleanStringGS(p.session_group_id); });

  var withoutBaseline = participants.filter(function(p) {
    var skill = sanitizeSkillStatusGS(p.skill_status_start);
    if (skill !== 'BBL' && skill !== 'BBLS') return false;
    return !hasValueGS(p.baseline_surah) || !hasValueGS(p.baseline_ayah);
  });

  var withoutTarget = participants.filter(function(p) {
    var halaqah = halaqahMap[cleanStringGS(p.halaqah_id)] || null;
    var effective = getEffectiveParticipantTargetsGS(p, halaqah);
    return effective.ziyadahLines === null && effective.nuroniyyahLines === null;
  });

  var withoutFinalEval = participants.filter(function(p) {
    return !evaluations.some(function(e) {
      return cleanStringGS(e.participant_id) === cleanStringGS(p.participant_id) || cleanStringGS(e.student_id) === cleanStringGS(p.student_id);
    });
  });

  var halaqahReports = halaqahs.map(function(h) {
    var halaqahId = cleanStringGS(h.halaqah_id);
    var groupParticipants = participants.filter(function(p) {
      return cleanStringGS(p.halaqah_id) === halaqahId;
    });

    var expected = 0;
    groupParticipants.forEach(function(p) {
      var groupId = cleanStringGS(p.session_group_id);
      if (!groupId) return;
      expected += sessionConfigs.filter(function(sc) {
        return cleanStringGS(sc.session_group_id) === groupId;
      }).length;
    });

    var actual = assessments.filter(function(a) {
      return cleanStringGS(a.halaqah_id) === halaqahId;
    }).length;

    return {
      halaqah_id: h.halaqah_id,
      halaqah_name: h.halaqah_name,
      studentCount: groupParticipants.length,
      submittedSessions: actual,
      expectedSessions: expected,
      missingCount: Math.max(0, expected - actual),
      percentage: expected > 0 ? Math.min(100, Math.round((actual / expected) * 100)) : 0
    };
  });

  function mapStudentIssue(p) {
    var student = studentMap[cleanStringGS(p.student_id)];
    return {
      student_id: p.student_id,
      name: student ? student.full_name : 'Siswa',
      class: (p.grade_snapshot || '') + ' (' + (p.class_snapshot || '') + ')'
    };
  }

  return jsonResponse({
    event: eventObj,
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

// ====================================================
// 21. ANALYTICS UTILITIES
// ====================================================

function calculateStatsGS(values) {
  var sanitized = (values || []).filter(function(v) {
    return typeof v === 'number' && isFinite(v) && !isNaN(v) && v >= 0;
  });

  if (sanitized.length === 0) {
    return {
      count: 0,
      totalLines: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      cv: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      lowerWhisker: 0,
      upperWhisker: 0,
      bottom25Avg: 0,
      completionRate: 0,
      outliers: []
    };
  }

  var sorted = sanitized.slice().sort(function(a, b) { return a - b; });
  var count = sorted.length;
  var total = sorted.reduce(function(sum, v) { return sum + v; }, 0);
  var mean = total / count;
  var mid = Math.floor(count / 2);
  var median = count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  var variance = sorted.reduce(function(sum, v) { return sum + Math.pow(v - mean, 2); }, 0) / count;
  var stdDev = Math.sqrt(variance);
  var cv = mean > 0 ? stdDev / mean : 0;

  function percentile(arr, p) {
    if (arr.length === 0) return 0;
    if (arr.length === 1) return arr[0];
    var idx = (p / 100) * (arr.length - 1);
    var lower = Math.floor(idx);
    var upper = Math.ceil(idx);
    var weight = idx - lower;
    if (upper >= arr.length) return arr[arr.length - 1];
    return arr[lower] * (1 - weight) + arr[upper] * weight;
  }

  var q1 = percentile(sorted, 25);
  var q3 = percentile(sorted, 75);
  var iqr = q3 - q1;
  var lowerBound = q1 - 1.5 * iqr;
  var upperBound = q3 + 1.5 * iqr;
  var outliers = sorted.filter(function(v) { return v < lowerBound || v > upperBound; });
  var inBounds = sorted.filter(function(v) { return v >= lowerBound && v <= upperBound; });
  var bottom25Count = Math.max(1, Math.ceil(count * 0.25));
  var bottom25 = sorted.slice(0, bottom25Count);

  return {
    count: count,
    totalLines: total,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    cv: Number(cv.toFixed(3)),
    min: sorted[0],
    max: sorted[count - 1],
    q1: Number(q1.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    iqr: Number(iqr.toFixed(2)),
    lowerWhisker: inBounds.length ? inBounds[0] : sorted[0],
    upperWhisker: inBounds.length ? inBounds[inBounds.length - 1] : sorted[count - 1],
    bottom25Avg: Number((bottom25.reduce(function(sum, v) { return sum + v; }, 0) / bottom25.length).toFixed(2)),
    completionRate: 0,
    outliers: outliers
  };
}

function getDistributionBucketsGS(values) {
  var sanitized = (values || []).filter(function(v) {
    return typeof v === 'number' && isFinite(v) && !isNaN(v) && v >= 0;
  });

  var denominator = sanitized.length || 1;
  var buckets = [0, 0, 0, 0];
  sanitized.forEach(function(v) {
    if (v <= 10) buckets[0]++;
    else if (v <= 20) buckets[1]++;
    else if (v <= 30) buckets[2]++;
    else buckets[3]++;
  });

  var labels = ['0–10 Baris', '11–20 Baris', '21–30 Baris', '> 30 Baris'];
  return labels.map(function(label, idx) {
    return {
      range: label,
      count: buckets[idx],
      percentage: Number(((buckets[idx] / denominator) * 100).toFixed(1))
    };
  });
}

function calculateSkillTransitionsGS(participants, evaluationSkillMap) {
  var counts = {};
  var notEvaluatedSkillCount = 0;
  var missingSkillStartCount = 0;

  (participants || []).forEach(function(p) {
    var endSkill = evaluationSkillMap[cleanStringGS(p.student_id)] || evaluationSkillMap[cleanStringGS(p.participant_id)];
    if (!endSkill) {
      notEvaluatedSkillCount++;
      return;
    }

    var from = sanitizeSkillStatusGS(p.skill_status_start);
    if (!from) {
      missingSkillStartCount++;
      return;
    }

    var key = from + '->' + endSkill;
    counts[key] = (counts[key] || 0) + 1;
  });

  var transitions = [];
  SKILL_STATUSES.forEach(function(from) {
    SKILL_STATUSES.forEach(function(to) {
      transitions.push({ from: from, to: to, count: counts[from + '->' + to] || 0 });
    });
  });

  return {
    transitions: transitions,
    notEvaluatedSkillCount: notEvaluatedSkillCount,
    missingSkillStartCount: missingSkillStartCount
  };
}

// ====================================================
// 22. EXECUTIVE ANALYTICS
// ====================================================

function handleGetExecutiveAnalytics(params, authToken) {
  requireRole(authToken, [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.VIEWER]);
  params = params || {};

  var allEvents = readSheetObjects('07_EVENTS');
  var filteredEvents = allEvents;
  if (cleanStringGS(params.academicYearFilter) && params.academicYearFilter !== 'ALL') {
    filteredEvents = filteredEvents.filter(function(e) {
      return cleanStringGS(e.academic_year) === cleanStringGS(params.academicYearFilter);
    });
  }

  var students = readSheetObjects('03_MASTER_STUDENTS');
  var studentMap = {};
  students.forEach(function(s) { studentMap[cleanStringGS(s.student_id)] = s; });

  function filterParticipants(parts) {
    return parts.filter(function(p) {
      var student = studentMap[cleanStringGS(p.student_id)];
      if (!student) return false;

      if (params.gradeFilter && params.gradeFilter !== 'ALL' && cleanStringGS(p.grade_snapshot) !== cleanStringGS(params.gradeFilter) && cleanStringGS(student.grade_level) !== cleanStringGS(params.gradeFilter)) return false;
      if (params.genderFilter && params.genderFilter !== 'ALL' && upperGS(student.gender) !== upperGS(params.genderFilter)) return false;
      if (params.halaqahFilter && params.halaqahFilter !== 'ALL' && cleanStringGS(p.halaqah_id) !== cleanStringGS(params.halaqahFilter)) return false;
      return true;
    });
  }

  var cohortStudentIds = null;
  if (upperGS(params.analyticsMode) === 'COHORT') {
    var eventSets = filteredEvents.map(function(eventObj) {
      var eventParts = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) {
        return cleanStringGS(p.event_id) === cleanStringGS(eventObj.event_id);
      });
      var filteredParts = filterParticipants(eventParts);
      var set = {};
      filteredParts.forEach(function(p) { set[cleanStringGS(p.student_id)] = true; });
      return set;
    });

    cohortStudentIds = {};
    if (eventSets.length > 0) {
      Object.keys(eventSets[0]).forEach(function(studentId) {
        if (eventSets.every(function(set) { return Boolean(set[studentId]); })) cohortStudentIds[studentId] = true;
      });
    }
  }

  var targetEvent = null;
  if (cleanStringGS(params.eventId)) {
    targetEvent = filteredEvents.find(function(e) { return cleanStringGS(e.event_id) === cleanStringGS(params.eventId); }) ||
                  allEvents.find(function(e) { return cleanStringGS(e.event_id) === cleanStringGS(params.eventId); });
  }
  if (!targetEvent) targetEvent = resolveEventObjectGS('');
  var targetEventId = targetEvent ? cleanStringGS(targetEvent.event_id) : '';

  function computeEventMetrics(eventId) {
    var rawParticipants = readSheetObjects('12_EVENT_PARTICIPANTS').filter(function(p) {
      return cleanStringGS(p.event_id) === eventId;
    });
    var participants = filterParticipants(rawParticipants);
    if (cohortStudentIds) participants = participants.filter(function(p) { return Boolean(cohortStudentIds[cleanStringGS(p.student_id)]); });

    var participantStudentSet = {};
    participants.forEach(function(p) { participantStudentSet[cleanStringGS(p.student_id)] = true; });

    var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
      return cleanStringGS(a.event_id) === eventId && !isDeletedRecordGS(a) && Boolean(participantStudentSet[cleanStringGS(a.student_id)]);
    });
    var evaluations = readSheetObjects('14_FINAL_EVALUATIONS').filter(function(e) {
      return cleanStringGS(e.event_id) === eventId;
    });

    var assessmentsByStudent = {};
    assessments.forEach(function(a) {
      var sid = cleanStringGS(a.student_id);
      if (!assessmentsByStudent[sid]) assessmentsByStudent[sid] = [];
      assessmentsByStudent[sid].push(a);
    });

    var ziyadahTotals = [];
    var nuroniyyahTotals = [];
    var noAnyProgressCount = 0;

    participants.forEach(function(p) {
      var sid = cleanStringGS(p.student_id);
      var summary = summarizeAssessmentsByModeGS(assessmentsByStudent[sid] || []);
      if (summary.ziyadahPresentCount > 0) ziyadahTotals.push(summary.ziyadahLines);
      if (summary.nuroniyyahPresentCount > 0) nuroniyyahTotals.push(summary.nuroniyyahLines);
      if (summary.ziyadahPresentCount === 0 && summary.nuroniyyahPresentCount === 0) noAnyProgressCount++;
    });

    var ziyadahStats = calculateStatsGS(ziyadahTotals);
    var nuroniyyahStats = calculateStatsGS(nuroniyyahTotals);
    var skillEndMap = {};
    var completionMap = {};

    evaluations.forEach(function(e) {
      var skillEnd = sanitizeSkillStatusGS(e.skill_status_end);
      if (cleanStringGS(e.student_id)) {
        skillEndMap[cleanStringGS(e.student_id)] = skillEnd;
        completionMap[cleanStringGS(e.student_id)] = upperGS(e.completion_status);
      }
      if (cleanStringGS(e.participant_id)) {
        skillEndMap[cleanStringGS(e.participant_id)] = skillEnd;
        completionMap[cleanStringGS(e.participant_id)] = upperGS(e.completion_status);
      }
    });

    var evaluatedCount = 0;
    var notEvaluatedCount = 0;
    var completedCount = 0;
    var incompleteCount = 0;

    participants.forEach(function(p) {
      var status = completionMap[cleanStringGS(p.participant_id)] || completionMap[cleanStringGS(p.student_id)];
      if (!status) {
        notEvaluatedCount++;
        return;
      }
      evaluatedCount++;
      if (status === 'COMPLETE') completedCount++;
      else if (status === 'INCOMPLETE') incompleteCount++;
    });

    var evaluationCoverage = participants.length > 0 ? Number(((evaluatedCount / participants.length) * 100).toFixed(1)) : 0;
    var completionRateAmongEvaluated = evaluatedCount > 0 ? Number(((completedCount / evaluatedCount) * 100).toFixed(1)) : 0;

    ziyadahStats.completionRate = completionRateAmongEvaluated;
    nuroniyyahStats.completionRate = completionRateAmongEvaluated;
    var transitionResult = calculateSkillTransitionsGS(participants, skillEndMap);

    return {
      participantCount: participants.length,
      validProgressCount: ziyadahTotals.length,
      missingProgressCount: participants.length - ziyadahTotals.length,
      stats: ziyadahStats,
      distributionBuckets: getDistributionBucketsGS(ziyadahTotals),

      ziyadahProgressCount: ziyadahTotals.length,
      ziyadahMissingCount: participants.length - ziyadahTotals.length,
      ziyadahStats: ziyadahStats,
      ziyadahDistributionBuckets: getDistributionBucketsGS(ziyadahTotals),

      nuroniyyahProgressCount: nuroniyyahTotals.length,
      nuroniyyahMissingCount: participants.length - nuroniyyahTotals.length,
      nuroniyyahStats: nuroniyyahStats,
      nuroniyyahDistributionBuckets: getDistributionBucketsGS(nuroniyyahTotals),

      noAnyProgressCount: noAnyProgressCount,
      evaluatedCount: evaluatedCount,
      notEvaluatedCount: notEvaluatedCount,
      evaluationCoverage: evaluationCoverage,
      completedCount: completedCount,
      incompleteCount: incompleteCount,
      completionRateAmongEvaluated: completionRateAmongEvaluated,
      skillTransitions: transitionResult.transitions,
      notEvaluatedSkillCount: transitionResult.notEvaluatedSkillCount,
      missingSkillStartCount: transitionResult.missingSkillStartCount,
      participants: participants
    };
  }

  var mode = upperGS(params.analyticsMode || 'SINGLE');

  if (mode === 'ANNUAL' || mode === 'COHORT') {
    var sortedEvents = filteredEvents.slice().sort(function(a, b) {
      return (Number(a.sequence_no) || 0) - (Number(b.sequence_no) || 0);
    });

    var series = sortedEvents.map(function(eventObj) {
      var metrics = computeEventMetrics(cleanStringGS(eventObj.event_id));
      return {
        eventId: eventObj.event_id,
        eventName: eventObj.event_name,
        academicYear: eventObj.academic_year,
        sequenceNo: eventObj.sequence_no,
        participantCount: metrics.participantCount,
        validProgressCount: metrics.validProgressCount,
        missingProgressCount: metrics.missingProgressCount,
        stats: metrics.stats,
        totalLines: metrics.ziyadahStats.totalLines,
        meanLines: metrics.ziyadahStats.mean,
        medianLines: metrics.ziyadahStats.median,
        stdDev: metrics.ziyadahStats.stdDev,
        cv: metrics.ziyadahStats.cv,
        ziyadahProgressCount: metrics.ziyadahProgressCount,
        ziyadahStats: metrics.ziyadahStats,
        nuroniyyahProgressCount: metrics.nuroniyyahProgressCount,
        nuroniyyahStats: metrics.nuroniyyahStats,
        evaluatedCount: metrics.evaluatedCount,
        completedCount: metrics.completedCount,
        incompleteCount: metrics.incompleteCount,
        evaluationCoverage: metrics.evaluationCoverage,
        completionRateAmongEvaluated: metrics.completionRateAmongEvaluated
      };
    });

    if (mode === 'ANNUAL') {
      return jsonResponse({ mode: 'ANNUAL', eventsCount: sortedEvents.length, annualData: series });
    }

    var targetMetrics = targetEventId ? computeEventMetrics(targetEventId) : {};
    return jsonResponse(Object.assign({
      mode: 'COHORT',
      eventsCount: sortedEvents.length,
      cohortSize: cohortStudentIds ? Object.keys(cohortStudentIds).length : 0,
      cohortData: series,
      event: targetEvent
    }, targetMetrics));
  }

  if (!targetEventId) {
    return jsonResponse({
      mode: 'SINGLE',
      event: null,
      participantCount: 0,
      validProgressCount: 0,
      missingProgressCount: 0,
      stats: calculateStatsGS([]),
      distributionBuckets: [],
      ziyadahProgressCount: 0,
      ziyadahStats: calculateStatsGS([]),
      nuroniyyahProgressCount: 0,
      nuroniyyahStats: calculateStatsGS([]),
      evaluatedCount: 0,
      notEvaluatedCount: 0,
      evaluationCoverage: 0,
      completedCount: 0,
      incompleteCount: 0,
      completionRateAmongEvaluated: 0,
      skillTransitions: [],
      notEvaluatedSkillCount: 0,
      missingSkillStartCount: 0,
      cohortSize: 0
    });
  }

  var metrics = computeEventMetrics(targetEventId);
  return jsonResponse(Object.assign({
    mode: 'SINGLE',
    event: targetEvent,
    cohortSize: cohortStudentIds ? Object.keys(cohortStudentIds).length : 0
  }, metrics));
}

// ====================================================
// 23. PUBLIC STUDENT PROGRESS
// ====================================================

function handlePublicStudentProgress(payload) {
  var accessCode = cleanStringGS(payload.accessCode);
  if (!accessCode) {
    return jsonError('VALIDATION_ERROR', 'Kode Akses wajib diisi untuk melihat perkembangan siswa.');
  }

  var student = readSheetObjects('03_MASTER_STUDENTS').find(function(s) {
    return cleanStringGS(s.access_code).toLowerCase() === accessCode.toLowerCase() && isActiveRecordGS(s);
  });

  if (!student) {
    return jsonError('NOT_FOUND', 'Kode Akses siswa tidak ditemukan atau data siswa tidak aktif.');
  }

  var eventObj = resolveEventObjectGS('');
  if (!eventObj) return jsonError('NOT_FOUND', 'Kegiatan aktif tidak ditemukan.');

  var eventId = cleanStringGS(eventObj.event_id);
  var participant = readSheetObjects('12_EVENT_PARTICIPANTS').find(function(p) {
    return cleanStringGS(p.event_id) === eventId && cleanStringGS(p.student_id) === cleanStringGS(student.student_id);
  });

  if (!participant) {
    return jsonError('NOT_FOUND', 'Siswa tidak terdaftar sebagai peserta pada kegiatan aktif.');
  }

  var surahs = readSheetObjects('05_MASTER_SURAHS');
  var assessments = readSheetObjects('13_SESSION_ASSESSMENTS').filter(function(a) {
    return cleanStringGS(a.event_id) === eventId && cleanStringGS(a.student_id) === cleanStringGS(student.student_id) && !isDeletedRecordGS(a);
  });

  var evaluation = readSheetObjects('14_FINAL_EVALUATIONS').find(function(e) {
    return cleanStringGS(e.event_id) === eventId && (
      cleanStringGS(e.student_id) === cleanStringGS(student.student_id) ||
      cleanStringGS(e.participant_id) === cleanStringGS(participant.participant_id)
    );
  });

  var progress = summarizeAssessmentsByModeGS(assessments);
  var gradeClass = participant.grade_snapshot && participant.class_snapshot
    ? participant.grade_snapshot + ' (' + participant.class_snapshot + ')'
    : participant.grade_snapshot || participant.class_snapshot || 'Belum tersedia';

  var baselineText = hasValueGS(participant.baseline_surah)
    ? getSurahNameFromListGS(surahs, participant.baseline_surah) + (hasValueGS(participant.baseline_ayah) ? ' Ayat ' + participant.baseline_ayah : '')
    : 'Belum diisi';

  var sessionsList = assessments.map(function(a) {
    var attendance = upperGS(a.attendance_status);
    var present = attendance === 'PRESENT';
    var mode = normalizeAssessmentModeGS(a);
    var rawMode = getRawAssessmentModeGS(a);

    var item = {
      sessionNo: Number(a.session_no) || 0,
      attendance: attendance,
      mode: present ? mode : null,
      surahName: null,
      ayahRange: null,
      nuroniyyahDars: null,
      linesAdded: present ? Number(a.lines_added) || 0 : null
    };

    if (!present) return item;

    if (mode === ASSESSMENT_MODES.NURONIYYAH) {
      item.nuroniyyahDars = rawMode === ASSESSMENT_MODES.IQRA
        ? buildLegacyIqraLabelGS(a)
        : cleanStringGS(a.nuroniyyah_dars) || null;
      return item;
    }

    item.surahName = getSurahNameFromListGS(surahs, a.surah_start);
    item.ayahRange = hasValueGS(a.ayah_start) && hasValueGS(a.ayah_end)
      ? a.ayah_start + '–' + a.ayah_end
      : null;
    return item;
  });

  sessionsList.sort(function(a, b) { return a.sessionNo - b.sessionNo; });

  var halaqah = readSheetObjects('10_HALAQAH').find(function(h) {
    return cleanStringGS(h.halaqah_id) === cleanStringGS(participant.halaqah_id);
  });

  var targetText = formatParticipantTargetGS(participant, halaqah);
  if (targetText === 'Belum ditentukan') {
    if (hasValueGS(participant.target_surah_start)) {
      targetText = getSurahNameFromListGS(surahs, participant.target_surah_start) + ' s/d ' +
        getSurahNameFromListGS(surahs, participant.target_surah_end || participant.target_surah_start);
    } else {
      targetText = 'Belum diisi';
    }
  }

  return jsonResponse({
    studentName: student.full_name,
    nis: student.nis || '',
    gradeClass: gradeClass,
    eventName: eventObj.event_name || 'Rumah Tahfidz',
    baselineText: baselineText,
    targetText: targetText,
    targetLines: toNumberOrUndefinedGS(participant.target_lines) || null,
    totalLinesAdded: progress.ziyadahLines,
    totalZiyadahLinesAdded: progress.ziyadahLines,
    totalNuroniyyahLinesAdded: progress.nuroniyyahLines,
    completionStatus: evaluation ? evaluation.completion_status : 'NOT_EVALUATED',
    sessions: sessionsList
  });
}

// ====================================================
// 24. DUPLICATE CLEANUP UTILITY
// ====================================================

function cleanupDuplicateHalaqahTeacherAssignments() {
  var allAssignments = readSheetObjects('11_HALAQAH_TEACHERS');
  var active = allAssignments.filter(function(item) { return isActiveRecordGS(item); });
  var groups = {};

  active.forEach(function(item) {
    var key = cleanStringGS(item.event_id) + '|||' + cleanStringGS(item.halaqah_id) + '|||' + cleanStringGS(item.teacher_id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  var duplicateGroupsCount = 0;
  var deactivatedCount = 0;
  var retainedCount = 0;
  var now = nowIsoGS();

  Object.keys(groups).forEach(function(key) {
    var list = groups[key];
    if (list.length <= 1) {
      retainedCount += list.length;
      return;
    }

    duplicateGroupsCount++;
    list.sort(function(a, b) {
      var aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      var bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });

    retainedCount++;
    for (var i = 1; i < list.length; i++) {
      if (updateObject('11_HALAQAH_TEACHERS', 'assignment_id', list[i].assignment_id, {
        active: false,
        updated_at: now
      })) deactivatedCount++;
    }
  });

  Logger.log(JSON.stringify({
    duplicateGroupsCount: duplicateGroupsCount,
    deactivatedCount: deactivatedCount,
    retainedCount: retainedCount
  }));
}

// ====================================================
// 25. TIME NORMALIZATION
// ====================================================

function normalizeClockTime(value) {
  if (value === undefined || value === null) return '';

  if (value instanceof Date) {
    return ('0' + value.getHours()).slice(-2) + ':' + ('0' + value.getMinutes()).slice(-2);
  }

  var str = cleanStringGS(value);
  if (!str) return '';

  var match24 = str.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (match24) return ('0' + match24[1]).slice(-2) + ':' + match24[2];

  var match12 = str.match(/^([0]?[1-9]|1[0-2]):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)$/i);
  if (match12) {
    var hour = parseInt(match12[1], 10);
    var isPM = upperGS(match12[3]) === 'PM';
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    return ('0' + hour).slice(-2) + ':' + match12[2];
  }

  var matchIso = str.match(/T([01]?\d|2[0-3]):([0-5]\d)/);
  if (matchIso) return ('0' + matchIso[1]).slice(-2) + ':' + matchIso[2];

  return '';
}

function normalizeTimeFormatGS(timeVal) {
  return normalizeClockTime(timeVal);
}

// ====================================================
// 26. MANUAL BACKEND SELF-CHECK
// ====================================================

/**
 * Run manually from Apps Script editor after deploying this rewrite.
 * It does NOT change data. It only logs missing sheets/headers.
 */
function backendSelfCheckGS() {
  var required = {
    '01_APP_CONFIG': ['config_key', 'config_value'],
    '03_MASTER_STUDENTS': ['student_id', 'full_name', 'access_code', 'active'],
    '04_MASTER_TEACHERS': ['teacher_id', 'full_name', 'active'],
    '05_MASTER_SURAHS': ['surah_no', 'surah_name'],
    '06_USERS': ['user_id', 'username', 'password_hash', 'display_name', 'role', 'teacher_id', 'active'],
    '07_EVENTS': ['event_id', 'event_name', 'status'],
    '07A_EVENT_DAYS': ['event_day_id', 'event_id'],
    '08_SESSION_GROUPS': ['session_group_id', 'event_id'],
    '09_SESSION_CONFIG': ['session_config_id', 'event_id', 'session_group_id', 'session_no', 'start_time', 'end_time'],
    '10_HALAQAH': ['halaqah_id', 'event_id', 'halaqah_name', 'session_group_id', 'active'],
    '11_HALAQAH_TEACHERS': ['assignment_id', 'event_id', 'halaqah_id', 'teacher_id', 'teacher_role', 'active'],
    '12_EVENT_PARTICIPANTS': ['participant_id', 'event_id', 'student_id', 'halaqah_id', 'session_group_id', 'skill_status_start', 'target_lines', 'target_source'],
    '13_SESSION_ASSESSMENTS': ['assessment_id', 'event_id', 'session_config_id', 'participant_id', 'student_id', 'halaqah_id', 'attendance_status', 'assessment_mode', 'lines_added', 'nuroniyyah_dars', 'teacher_id', 'is_deleted'],
    '14_FINAL_EVALUATIONS': ['final_evaluation_id', 'event_id', 'participant_id', 'student_id', 'completion_status', 'skill_status_end', 'evaluator_teacher_id'],
    '15_AUDIT_LOG': ['log_id', 'timestamp', 'user_id', 'action', 'entity_type', 'entity_id'],
    '16_SESSIONS': ['session_token', 'user_id', 'role', 'teacher_id', 'created_at', 'last_seen_at', 'revoked', 'revoked_at']
  };

  var recommended = {
    '10_HALAQAH': ['target_ziyadah_lines', 'target_nuroniyyah_lines'],
    '12_EVENT_PARTICIPANTS': ['target_nuroniyyah_lines', 'target_iqra_pages', 'assignment_note'],
    '13_SESSION_ASSESSMENTS': ['iqra_level', 'iqra_page_start', 'iqra_page_end']
  };

  var report = {
    ok: true,
    missingSheets: [],
    missingRequiredHeaders: {},
    missingRecommendedHeaders: {}
  };

  Object.keys(required).forEach(function(sheetName) {
    var sheet = getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      report.ok = false;
      report.missingSheets.push(sheetName);
      return;
    }

    var headers = getHeadersGS(sheet);
    var missing = required[sheetName].filter(function(header) { return headers.indexOf(header) === -1; });
    if (missing.length) {
      report.ok = false;
      report.missingRequiredHeaders[sheetName] = missing;
    }
  });

  Object.keys(recommended).forEach(function(sheetName) {
    var sheet = getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return;
    var headers = getHeadersGS(sheet);
    var missing = recommended[sheetName].filter(function(header) { return headers.indexOf(header) === -1; });
    if (missing.length) report.missingRecommendedHeaders[sheetName] = missing;
  });

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
