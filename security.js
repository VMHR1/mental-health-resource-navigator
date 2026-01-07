// ========== Security Module ==========
// Core security utilities for data encryption, validation, and protection
//
// IMPORTANT SECURITY NOTICE:
// Client-side encryption in this module provides protection against offline storage theft
// (e.g., someone copying localStorage/IndexedDB files). However, it does NOT protect against:
// - XSS (Cross-Site Scripting) attacks
// - Malware or malicious browser extensions
// - Any JavaScript code executing in this origin
// If an attacker can run JavaScript in this origin, they can access all encrypted data.
// This encryption is for privacy, not security against active attackers.

// ========== Encryption ==========
// Client-side encryption provides protection against offline storage theft,
// but does NOT protect against XSS or malware executing in the origin.
// If an attacker can run JavaScript in this origin, they can access all data.

let encryptionKey = null;
let oldEncryptionKey = null; // For migration from old key system

// Legacy constants (for migration only)
const DEVICE_KEY_STORAGE = 'device_encryption_key';
const OLD_KEY_MIGRATION_FLAG = 'encryption_key_migrated';

// IndexedDB configuration
const IDB_DB_NAME = 'app_security';
const IDB_DB_VERSION = 1;
const IDB_STORE_NAME = 'keys';
const IDB_KEY_NAME = 'device_key_v1';

// ========== IndexedDB Helper Functions ==========
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    
    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
  });
}

async function getKeyFromIndexedDB() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([IDB_STORE_NAME], 'readonly');
      const store = transaction.objectStore(IDB_STORE_NAME);
      const request = store.get(IDB_KEY_NAME);
      
      request.onerror = () => reject(new Error('Failed to read key from IndexedDB'));
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error('IndexedDB error:', error);
    return null;
  }
}

async function saveKeyToIndexedDB(key) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([IDB_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(IDB_STORE_NAME);
      const request = store.put(key, IDB_KEY_NAME);
      
      request.onerror = () => reject(new Error('Failed to save key to IndexedDB'));
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('IndexedDB error:', error);
    throw error;
  }
}

// ========== Encryption Key Management ==========
async function getEncryptionKey() {
  // Return cached key if available
  if (encryptionKey) return encryptionKey;
  
  // Try to load from IndexedDB
  let key = await getKeyFromIndexedDB();
  
  if (!key) {
    // Generate new non-extractable key
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );
    
    // Persist to IndexedDB
    try {
      await saveKeyToIndexedDB(key);
    } catch (error) {
      console.error('Failed to persist encryption key to IndexedDB:', error);
      // Continue with in-memory key (will be lost on page reload)
      // This is acceptable degradation - user can still use the app
    }
  }
  
  encryptionKey = key;
  return encryptionKey;
}

// ========== Legacy Key Derivation (for migration only) ==========
async function deriveLegacyKeyFromLocalStorage() {
  const deviceKeyId = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (!deviceKeyId) return null;
  
  try {
    const deviceKeyIdBytes = Uint8Array.from(atob(deviceKeyId), c => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const data = encoder.encode(String.fromCharCode(...deviceKeyIdBytes));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return await crypto.subtle.importKey(
      'raw',
      hashBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.warn('Failed to derive legacy key from localStorage:', error);
    return null;
  }
}

async function deriveLegacyKeyFromOriginUA() {
  const oldKeyMaterial = `${window.location.origin}${navigator.userAgent}`;
  const encoder = new TextEncoder();
  const oldData = encoder.encode(oldKeyMaterial);
  const oldHashBuffer = await crypto.subtle.digest('SHA-256', oldData);
  return await crypto.subtle.importKey(
    'raw',
    oldHashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function getOldEncryptionKey() {
  if (oldEncryptionKey) return oldEncryptionKey;
  if (localStorage.getItem(OLD_KEY_MIGRATION_FLAG)) return null; // Already migrated
  
  // Try localStorage-based key first (newer legacy)
  const legacyKey = await deriveLegacyKeyFromLocalStorage();
  if (legacyKey) {
    oldEncryptionKey = legacyKey;
    return legacyKey;
  }
  
  // Fall back to origin+UA key (oldest legacy)
  const originUAKey = await deriveLegacyKeyFromOriginUA();
  if (originUAKey) {
    oldEncryptionKey = originUAKey;
    return originUAKey;
  }
  
  return null;
}

async function encryptData(data) {
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBuffer
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Convert to base64 for storage
    // Format: base64(IV || ciphertext) - version 2 (implicit, new format)
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

async function decryptDataCore(encryptedData, keyToUse = null) {
  try {
    if (!encryptedData) return null;
    
    // Validate base64 format before attempting decryption
    try {
      atob(encryptedData);
    } catch (e) {
      // Invalid base64 format
      return null;
    }
    
    const key = keyToUse || await getEncryptionKey();
    
    // Convert from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Validate minimum length (IV + at least some encrypted data)
    if (combined.length < 13) {
      return null;
    }
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    const parsed = JSON.parse(decoder.decode(decrypted));
    
    // Validate decrypted data structure (basic integrity check)
    if (parsed === null || (typeof parsed !== 'object' && typeof parsed !== 'string' && !Array.isArray(parsed))) {
      return null;
    }
    
    return parsed;
  } catch (error) {
    // Decryption failed - return null to allow migration attempt
    return null;
  }
}

// ========== Migration Logic ==========
async function migrateEncryptedData(key, oldKey) {
  // Find all encrypted keys in localStorage
  const encryptedKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (storageKey && storageKey.startsWith('encrypted_')) {
      encryptedKeys.push(storageKey);
    }
  }
  
  let migratedCount = 0;
  let failedCount = 0;
  
  for (const storageKey of encryptedKeys) {
    try {
      const oldCiphertext = localStorage.getItem(storageKey);
      if (!oldCiphertext) continue;
      
      // Try to decrypt with old key
      const decrypted = await decryptDataCore(oldCiphertext, oldKey);
      if (decrypted === null) {
        // Failed to decrypt - might already be new format or corrupted
        continue;
      }
      
      // Re-encrypt with new key
      const newCiphertext = await encryptData(decrypted);
      if (newCiphertext) {
        localStorage.setItem(storageKey, newCiphertext);
        migratedCount++;
      } else {
        failedCount++;
        console.warn(`Failed to re-encrypt ${storageKey}`);
      }
    } catch (error) {
      failedCount++;
      console.warn(`Migration error for ${storageKey}:`, error);
    }
  }
  
  if (migratedCount > 0) {
    console.log(`Migration complete: ${migratedCount} items migrated, ${failedCount} failed`);
  }
  
  return { migratedCount, failedCount };
}

async function performMigrationIfNeeded() {
  // Check if already migrated
  if (localStorage.getItem(OLD_KEY_MIGRATION_FLAG)) {
    return; // Already migrated
  }
  
  // Check if legacy key exists or encrypted data exists
  const hasLegacyKey = localStorage.getItem(DEVICE_KEY_STORAGE) !== null;
  const hasEncryptedData = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .some(key => key && key.startsWith('encrypted_'));
  
  if (!hasLegacyKey && !hasEncryptedData) {
    // No legacy data to migrate
    localStorage.setItem(OLD_KEY_MIGRATION_FLAG, 'true');
    return;
  }
  
  // Get new key (will generate if needed)
  const newKey = await getEncryptionKey();
  
  // Try to get old key
  const oldKey = await getOldEncryptionKey();
  if (!oldKey) {
    // No old key available - mark as migrated to avoid repeated attempts
    localStorage.setItem(OLD_KEY_MIGRATION_FLAG, 'true');
    return;
  }
  
  // Perform migration
  try {
    const result = await migrateEncryptedData(newKey, oldKey);
    
    if (result.failedCount === 0 || result.migratedCount > 0) {
      // Migration successful (at least some items migrated)
      // Only delete legacy key if migration was successful
      localStorage.removeItem(DEVICE_KEY_STORAGE);
      localStorage.setItem(OLD_KEY_MIGRATION_FLAG, 'true');
    } else {
      // All migrations failed - keep legacy key for retry
      console.warn('Migration failed for all items - legacy key preserved for retry');
    }
  } catch (error) {
    console.error('Migration error:', error);
    // Don't delete legacy key on error - allow retry
  }
}

async function decryptDataWithMigration(encryptedData) {
  if (!encryptedData) return null;
  
  // Ensure migration has been attempted (idempotent)
  if (!localStorage.getItem(OLD_KEY_MIGRATION_FLAG)) {
    // Perform migration in background (don't block decryption)
    performMigrationIfNeeded().catch(err => {
      console.error('Background migration error:', err);
    });
  }
  
  // Try new key first
  const result = await decryptDataCore(encryptedData);
  if (result !== null) {
    return result;
  }
  
  // If new key failed and not yet migrated, try old key
  if (!localStorage.getItem(OLD_KEY_MIGRATION_FLAG)) {
    const oldKey = await getOldEncryptionKey();
    if (oldKey) {
      const oldResult = await decryptDataCore(encryptedData, oldKey);
      if (oldResult !== null) {
        // Successfully decrypted with old key - return with migration marker
        // Use a Symbol-like approach: add a non-enumerable property
        const migratedData = oldResult;
        Object.defineProperty(migratedData, '__migrated_from_old_key__', {
          value: true,
          enumerable: false,
          writable: false,
          configurable: true
        });
        return migratedData;
      }
    }
  }
  
  // Both keys failed - data is corrupted or invalid
  return null;
}

// ========== Input Validation ==========
function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // US phone: 10 digits, or 11 with country code 1
  return (digits.length === 10 || (digits.length === 11 && digits[0] === '1'));
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // RFC 5322 simplified regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function sanitizeText(text, maxLength = 10000) {
  if (typeof text !== 'string') return '';
  // Remove control characters except newlines and tabs
  let sanitized = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  return sanitized;
}

function sanitizeId(id) {
  if (typeof id !== 'string') return '';
  // Only allow alphanumeric, hyphens, underscores
  return id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);
}

// ========== Enhanced HTML Escaping ==========
function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ========== JSON Validation ==========
function checkPrototypePollution(obj, path = '') {
  if (obj === null || typeof obj !== 'object') {
    return null;
  }
  
  // Check for dangerous properties in current object
  if (Array.isArray(obj)) {
    // Check array elements
    for (let i = 0; i < obj.length; i++) {
      const result = checkPrototypePollution(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
  } else {
    // Check object properties
    const ownProps = Object.keys(obj);
    for (const prop of ownProps) {
      // Check for dangerous property names
      if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
        return { valid: false, error: `Invalid JSON structure: dangerous property "${prop}" detected at ${path || 'root'}` };
      }
      
      // Recursively check nested objects/arrays
      const result = checkPrototypePollution(obj[prop], path ? `${path}.${prop}` : prop);
      if (result) return result;
    }
  }
  
  return null;
}

function validateJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    // Check for prototype pollution in nested structures
    const pollutionCheck = checkPrototypePollution(parsed);
    if (pollutionCheck) {
      return pollutionCheck;
    }
    return { valid: true, data: parsed };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// ========== Rate Limiting ==========
function checkRateLimit(key, maxAttempts = 3, windowMs = 3600000) {
  const storageKey = `rateLimit_${key}`;
  const now = Date.now();
  const record = JSON.parse(localStorage.getItem(storageKey) || '{"attempts":[],"count":0}');
  
  // Remove old attempts outside the window
  record.attempts = record.attempts.filter(timestamp => now - timestamp < windowMs);
  
  if (record.attempts.length >= maxAttempts) {
    const oldestAttempt = Math.min(...record.attempts);
    const waitTime = Math.ceil((windowMs - (now - oldestAttempt)) / 1000 / 60);
    const waitSeconds = Math.ceil((windowMs - (now - oldestAttempt)) / 1000);
    
    // Show user-friendly message
    if (typeof window.showToast === 'function') {
      const message = waitTime < 1 
        ? `Please wait ${waitSeconds} seconds before trying again.`
        : `Please wait ${waitTime} minute${waitTime > 1 ? 's' : ''} before trying again.`;
      window.showToast(message, 'error');
    }
    
    return { 
      allowed: false, 
      waitMinutes: waitTime,
      waitSeconds: waitSeconds,
      remainingAttempts: 0
    };
  }
  
  // Record this attempt
  record.attempts.push(now);
  localStorage.setItem(storageKey, JSON.stringify(record));
  
  const remainingAttempts = maxAttempts - record.attempts.length;
  
  return { 
    allowed: true,
    remainingAttempts: remainingAttempts
  };
}

// ========== Security Event Logging ==========
const securityLog = [];

function logSecurityEvent(type, details) {
  try {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      details: typeof details === 'string' ? details : (details ? JSON.stringify(details) : ''),
      userAgent: navigator.userAgent ? navigator.userAgent.substring(0, 100) : '',
      url: window.location ? window.location.href : ''
    };
    
    securityLog.push(event);
    
    // Keep only last 50 events
    if (securityLog.length > 50) {
      securityLog.shift();
    }
    
    // Store in localStorage (encrypted if sensitive)
    try {
      localStorage.setItem('securityLog', JSON.stringify(securityLog.slice(-20)));
    } catch (e) {
      // Ignore quota exceeded
    }
    
    // Console warning for suspicious events
    if (type.includes('suspicious') || type.includes('failed')) {
      console.warn('Security event:', type, details);
    }
  } catch (e) {
    // Prevent recursion - if logging fails, just ignore it
    console.error('Failed to log security event:', e);
  }
}

function getSecurityLog() {
  return [...securityLog];
}

// ========== Data Integrity ==========
function validateProgramStructure(program) {
  const required = ['program_id', 'organization', 'program_name', 'level_of_care'];
  const missing = required.filter(field => !program[field]);
  
  if (missing.length > 0) {
    logSecurityEvent('data_integrity_failed', { missing, programId: program.program_id });
    return { valid: false, errors: [`Missing required fields: ${missing.join(', ')}`] };
  }
  
  // Validate program_id format
  if (!/^[a-z0-9_-]+$/.test(program.program_id)) {
    logSecurityEvent('data_integrity_failed', { reason: 'invalid_program_id', programId: program.program_id });
    return { valid: false, errors: ['Invalid program_id format'] };
  }
  
  // Validate URLs if present
  if (program.website_url && !validateUrl(program.website_url)) {
    return { valid: false, errors: ['Invalid website_url'] };
  }
  
  // verification_source may contain descriptive text with embedded URLs
  // Extract URL from text if present, or validate if it's a pure URL
  if (program.verification_source) {
    const verificationText = String(program.verification_source);
    // Try to extract URL from text (look for http:// or https://)
    const urlMatch = verificationText.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      // Found a URL in the text, validate it
      if (!validateUrl(urlMatch[0])) {
        return { valid: false, errors: ['Invalid URL in verification_source'] };
      }
    } else if (verificationText.trim().startsWith('http://') || verificationText.trim().startsWith('https://')) {
      // It's a pure URL, validate it
      if (!validateUrl(verificationText.trim())) {
        return { valid: false, errors: ['Invalid verification_source URL'] };
      }
    }
    // If no URL found and doesn't start with http, it's just descriptive text - allow it
  }
  
  return { valid: true };
}

// ========== Export to Window ==========
// Make functions available globally for use in app.js
if (typeof window !== 'undefined') {
  window.encryptData = encryptData;
  window.decryptData = decryptDataWithMigration;
  window.validateUrl = validateUrl;
  window.validatePhone = validatePhone;
  window.validateEmail = validateEmail;
  window.sanitizeText = sanitizeText;
  window.sanitizeId = sanitizeId;
  window.escapeHtml = escapeHtml;
  window.validateJSON = validateJSON;
  window.checkRateLimit = checkRateLimit;
  window.logSecurityEvent = logSecurityEvent;
  window.getSecurityLog = getSecurityLog;
  window.validateProgramStructure = validateProgramStructure;
  
  // Initialize migration on module load (idempotent, safe to call multiple times)
  // This runs in the background and doesn't block other operations
  if (typeof indexedDB !== 'undefined') {
    performMigrationIfNeeded().catch(err => {
      console.error('Initial migration error:', err);
    });
  }
}

// ========== Node.js Export ==========
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    encryptData,
    decryptData: decryptDataWithMigration,
    validateUrl,
    validatePhone,
    validateEmail,
    sanitizeText,
    sanitizeId,
    escapeHtml,
    validateJSON,
    checkRateLimit,
    logSecurityEvent,
    getSecurityLog,
    validateProgramStructure
  };
}


