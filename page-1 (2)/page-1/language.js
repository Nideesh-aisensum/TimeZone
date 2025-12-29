/**
 * Universal Language Selection
 * This script provides shared language functionality across all pages.
 * Language preference is stored in localStorage and persists across all pages.
 */

const LANG_STORAGE_KEY = 'tizo_language';
const DEFAULT_LANGUAGE = 'id'; // Default to Bahasa Indonesia

/**
 * Get the current language from localStorage
 * @returns {string} Current language code ('en' or 'id')
 */
function getCurrentLanguage() {
    return localStorage.getItem(LANG_STORAGE_KEY) || DEFAULT_LANGUAGE;
}

/**
 * Save the language preference to localStorage
 * @param {string} lang Language code ('en' or 'id')
 */
function saveLanguage(lang) {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
}

/**
 * Initialize language on page load
 * Call this in the page's onload/DOMContentLoaded event
 * @param {Function} applyLanguageCallback Function that applies translations for the current page
 */
function initLanguage(applyLanguageCallback) {
    const savedLang = getCurrentLanguage();
    if (applyLanguageCallback) {
        applyLanguageCallback(savedLang);
    }
    return savedLang;
}

/**
 * Set and apply a new language
 * @param {string} lang Language code ('en' or 'id')
 * @param {Function} applyLanguageCallback Function that applies translations for the current page
 */
function setGlobalLanguage(lang, applyLanguageCallback) {
    saveLanguage(lang);
    if (applyLanguageCallback) {
        applyLanguageCallback(lang);
    }
}
