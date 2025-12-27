// ========== Storage Module ==========
// Handles encrypted storage and user data persistence

// Load encrypted data
async function loadEncryptedData(key, defaultValue = []) {
  try {
    const encrypted = localStorage.getItem(`encrypted_${key}`);
    if (!encrypted) return defaultValue;
    if (typeof window.decryptData === 'function') {
      const decrypted = await window.decryptData(encrypted);
      return decrypted || defaultValue;
    }
    // Fallback if security.js not loaded
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
    return defaultValue;
  }
}

async function saveEncryptedData(key, data) {
  try {
    if (typeof window.encryptData === 'function') {
      const encrypted = await window.encryptData(data);
      if (encrypted) {
        localStorage.setItem(`encrypted_${key}`, encrypted);
        return;
      }
    }
    // Fallback if security.js not loaded
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
    // Fallback to unencrypted storage
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }
}

// User data storage
class UserDataStorage {
  constructor() {
    this.favorites = new Set();
    this.recentSearches = [];
    this.callHistory = [];
    this.customLists = {};
    this.programNotes = {};
    this.programTags = {};
    this.userPreferences = {
      defaultSort: 'relevance',
      defaultView: 'grid',
      showCrisisByDefault: false,
      itemsPerPage: 20
    };
    this.comparisonSet = new Set();
  }

  async initialize() {
    this.favorites = new Set(await loadEncryptedData('favorites', []));
    this.recentSearches = await loadEncryptedData('recentSearches', []);
    this.callHistory = await loadEncryptedData('callHistory', []);
    this.customLists = await loadEncryptedData('customLists', {});
    this.programNotes = await loadEncryptedData('programNotes', {});
    this.programTags = await loadEncryptedData('programTags', {});
    const prefs = await loadEncryptedData('userPreferences', {});
    this.userPreferences = { ...this.userPreferences, ...prefs };
    this.comparisonSet = new Set(JSON.parse(localStorage.getItem('comparison') || '[]'));
  }

  async saveFavorites() {
    await saveEncryptedData('favorites', Array.from(this.favorites));
  }

  async saveRecentSearches() {
    await saveEncryptedData('recentSearches', this.recentSearches);
  }

  async saveCallHistory() {
    await saveEncryptedData('callHistory', this.callHistory);
  }

  async saveCustomLists() {
    await saveEncryptedData('customLists', this.customLists);
  }

  async saveProgramNotes() {
    await saveEncryptedData('programNotes', this.programNotes);
  }

  async saveProgramTags() {
    await saveEncryptedData('programTags', this.programTags);
  }

  async saveUserPreferences() {
    await saveEncryptedData('userPreferences', this.userPreferences);
  }

  saveComparison() {
    localStorage.setItem('comparison', JSON.stringify(Array.from(this.comparisonSet)));
  }
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.loadEncryptedData = loadEncryptedData;
  window.saveEncryptedData = saveEncryptedData;
  window.UserDataStorage = UserDataStorage;
}


