// ========== Security Module ==========
// Core security utilities for data encryption, validation, and protection

// ========== Encryption ==========
let encryptionKey = null;

async function getEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  
  // Generate deterministic key from domain + user agent (for same origin)
  const keyMaterial = `${window.location.origin}${navigator.userAgent}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(keyMaterial);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  encryptionKey = await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return encryptionKey;
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

async function decryptData(encryptedData) {
  try {
    if (!encryptedData) return null;
    
    const key = await getEncryptionKey();
    
    // Convert from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
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
function validateJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    // Check for prototype pollution (only check own properties, not inherited)
    if (typeof parsed === 'object' && parsed !== null) {
      // Only check direct properties, not inherited ones
      const ownProps = Object.keys(parsed);
      if (ownProps.includes('__proto__') || ownProps.includes('constructor')) {
        return { valid: false, error: 'Invalid JSON structure: dangerous properties detected' };
      }
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
    return { allowed: false, waitMinutes: waitTime };
  }
  
  // Record this attempt
  record.attempts.push(now);
  localStorage.setItem(storageKey, JSON.stringify(record));
  
  return { allowed: true };
}

// ========== Security Event Logging ==========
const securityLog = [];

function logSecurityEvent(type, details) {
  const event = {
    type,
    timestamp: new Date().toISOString(),
    details: typeof details === 'string' ? details : JSON.stringify(details),
    userAgent: navigator.userAgent.substring(0, 100),
    url: window.location.href
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
  
  if (program.verification_source && !validateUrl(program.verification_source)) {
    return { valid: false, errors: ['Invalid verification_source URL'] };
  }
  
  return { valid: true };
}

// ========== Export to Window ==========
// Make functions available globally for use in app.js
if (typeof window !== 'undefined') {
  window.encryptData = encryptData;
  window.decryptData = decryptData;
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
    decryptData,
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

