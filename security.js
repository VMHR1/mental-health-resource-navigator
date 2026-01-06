// ========== Security Module ==========
// Core security utilities for data encryption, validation, and protection

// ========== Encryption ==========
let encryptionKey = null;
let oldEncryptionKey = null; // For migration from old key system

const DEVICE_KEY_STORAGE = 'device_encryption_key';
const OLD_KEY_MIGRATION_FLAG = 'encryption_key_migrated';

async function getEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  
  // Try to load or generate per-device key
  let deviceKeyId = localStorage.getItem(DEVICE_KEY_STORAGE);
  
  if (!deviceKeyId) {
    // Generate new random device key ID
    deviceKeyId = crypto.getRandomValues(new Uint8Array(32));
    const keyIdBase64 = btoa(String.fromCharCode(...deviceKeyId));
    localStorage.setItem(DEVICE_KEY_STORAGE, keyIdBase64);
  } else {
    // Decode existing key ID
    try {
      deviceKeyId = Uint8Array.from(atob(deviceKeyId), c => c.charCodeAt(0));
    } catch (e) {
      // Invalid key ID, generate new one
      deviceKeyId = crypto.getRandomValues(new Uint8Array(32));
      const keyIdBase64 = btoa(String.fromCharCode(...deviceKeyId));
      localStorage.setItem(DEVICE_KEY_STORAGE, keyIdBase64);
    }
  }
  
  // Derive encryption key from device key ID
  const encoder = new TextEncoder();
  const data = encoder.encode(String.fromCharCode(...deviceKeyId));
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  encryptionKey = await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  // Generate old key for migration (only if not already migrated)
  if (!localStorage.getItem(OLD_KEY_MIGRATION_FLAG)) {
    const oldKeyMaterial = `${window.location.origin}${navigator.userAgent}`;
    const oldData = encoder.encode(oldKeyMaterial);
    const oldHashBuffer = await crypto.subtle.digest('SHA-256', oldData);
    oldEncryptionKey = await crypto.subtle.importKey(
      'raw',
      oldHashBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  return encryptionKey;
}

async function getOldEncryptionKey() {
  if (oldEncryptionKey) return oldEncryptionKey;
  if (localStorage.getItem(OLD_KEY_MIGRATION_FLAG)) return null; // Already migrated
  
  // Generate old key for migration
  const oldKeyMaterial = `${window.location.origin}${navigator.userAgent}`;
  const encoder = new TextEncoder();
  const oldData = encoder.encode(oldKeyMaterial);
  const oldHashBuffer = await crypto.subtle.digest('SHA-256', oldData);
  oldEncryptionKey = await crypto.subtle.importKey(
    'raw',
    oldHashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return oldEncryptionKey;
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
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

async function decryptData(encryptedData, keyToUse = null) {
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

async function decryptDataWithMigration(encryptedData) {
  if (!encryptedData) return null;
  
  // Try new key first
  const result = await decryptData(encryptedData);
  if (result !== null) {
    return result;
  }
  
  // If new key failed and not yet migrated, try old key
  if (!localStorage.getItem(OLD_KEY_MIGRATION_FLAG)) {
    const oldKey = await getOldEncryptionKey();
    if (oldKey) {
      const oldResult = await decryptData(encryptedData, oldKey);
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

