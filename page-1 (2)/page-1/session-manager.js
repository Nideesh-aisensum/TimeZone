/**
 * Session Manager for Tizo Kiosk
 * Maintains unified session state from welcome page through print page
 * Session is stored in localStorage and persists across page navigations
 */

const SESSION_STORAGE_KEY = 'tizo_session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout

/**
 * Default session structure
 */
const DEFAULT_SESSION = {
    sessionId: null,
    createdAt: null,
    lastActivity: null,

    // User flow state
    currentPage: 'welcome',
    language: 'id',

    // User type
    isNewPlayer: null, // true = new player, false = existing player

    // Card selection
    selectedCard: null, // 'red', 'blue', 'gold', 'platinum'
    cardQuantity: 1,

    // Offer selection
    selectedOffer: null,
    offerCost: 0,
    offerTizo: 0,
    customAmount: null,

    // Split top-up (when user enters custom amount and accepts card upgrade)
    splitTopup: {
        hasCardUpgrade: false,
        cardType: null,         // 'blue', 'gold', 'platinum'
        cardOfferCost: 0,       // Card offer cost (600k, 1200k, 2000k)
        cardOfferTizo: 0,       // Card offer Tizo (1350, 2500, 5000)
        customCost: 0,          // Remaining custom cost
        customTizo: 0           // Remaining custom Tizo
    },

    // Scratch card
    scratchCardRevealed: false,
    scratchPrize: 0,

    // Prize/Bonus
    bonusAccepted: null, // true = accepted, false = rejected
    bonusCost: 0,
    bonusTizo: 0,
    bonusFreeGames: null, // Free games from scratch card
    bonusGift: null, // Gift label (e.g., "FREE GAMES", "HADIAH TAMBAHAN")
    bonusGiftDetails: null, // Gift details (e.g., "5 Games", "1 Keychain")

    // Totals
    totalCost: 0,
    totalTizo: 0,

    // Transaction
    orderNumber: null,
    transactionComplete: false,

    // Dashboard Analytics - Offer acceptance tracking
    topupAccepted: false,          // Whether user accepted topup offer
    oodAccepted: false,            // Offer of Day accepted
    oohAccepted: false,            // Offer of Hour accepted  
    snacksAccepted: false,         // Snacks offer accepted

    // Dashboard Analytics - OOD/OOH/Snacks costs and tizo (for Overall revenue chart)
    oodCost: 0,
    oodTizo: 0,
    oohCost: 0,
    oohTizo: 0,
    snacksCost: 0,
    snacksTizo: 0,

    // Dashboard Analytics - Final payment tracking
    finalPayment: 0,
    finalTizo: 0
};

/**
 * Generate a unique session ID
 */
function generateSessionId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `TZ${timestamp}${randomPart}`.toUpperCase();
}

/**
 * Generate order number for receipt
 */
function generateOrderNumber() {
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
    const timePart = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${datePart}TZ${timePart}${randomPart}`;
}

/**
 * Get current session from localStorage
 * @returns {Object} Current session or null if no valid session
 */
function getSession() {
    try {
        const sessionData = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!sessionData) return null;

        const session = JSON.parse(sessionData);

        // Check if session has expired
        if (session.lastActivity) {
            const elapsed = Date.now() - session.lastActivity;
            if (elapsed > SESSION_TIMEOUT_MS) {
                console.log('Session expired, clearing...');
                clearSession();
                return null;
            }
        }

        return session;
    } catch (e) {
        console.error('Error reading session:', e);
        return null;
    }
}

/**
 * Save session to localStorage
 * @param {Object} session Session object to save
 */
function saveSession(session) {
    try {
        session.lastActivity = Date.now();
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
        console.error('Error saving session:', e);
    }
}

/**
 * Start a new session (called on welcome page)
 * @param {boolean} forceNew Force create new session even if one exists
 * @returns {Object} New session object
 */
function startNewSession(forceNew = false) {
    // Check for existing session
    const existingSession = getSession();

    // If we have a valid session and not forcing new, return it
    if (existingSession && !forceNew && !existingSession.transactionComplete) {
        console.log('Resuming existing session:', existingSession.sessionId);
        return existingSession;
    }

    // Create new session
    const newSession = {
        ...DEFAULT_SESSION,
        sessionId: generateSessionId(),
        createdAt: Date.now(),
        lastActivity: Date.now(),
        language: localStorage.getItem('tizo_language') || 'id'
    };

    saveSession(newSession);
    console.log('New session started:', newSession.sessionId);
    return newSession;
}

/**
 * Update session with new data
 * @param {Object} updates Object with properties to update
 * @returns {Object} Updated session
 */
function updateSession(updates) {
    let session = getSession();

    if (!session) {
        console.warn('No active session, creating new one');
        session = startNewSession(true);
    }

    // Merge updates
    Object.assign(session, updates);

    // Recalculate totals if relevant fields changed - use parseInt to prevent string concatenation
    if ('offerCost' in updates || 'bonusCost' in updates || 'bonusAccepted' in updates) {
        session.totalCost = parseInt(session.offerCost || 0) + (session.bonusAccepted ? parseInt(session.bonusCost || 0) : 0);
    }
    if ('offerTizo' in updates || 'bonusTizo' in updates || 'bonusAccepted' in updates) {
        session.totalTizo = parseInt(session.offerTizo || 0) + (session.bonusAccepted ? parseInt(session.bonusTizo || 0) : 0);
    }

    saveSession(session);
    return session;
}

/**
 * Get a specific session value
 * @param {string} key Session property name
 * @param {*} defaultValue Default value if not found
 * @returns {*} Session value or default
 */
function getSessionValue(key, defaultValue = null) {
    const session = getSession();
    if (!session) return defaultValue;
    return session[key] !== undefined ? session[key] : defaultValue;
}

/**
 * Set a specific session value
 * @param {string} key Session property name
 * @param {*} value Value to set
 */
function setSessionValue(key, value) {
    updateSession({ [key]: value });
}

/**
 * Clear the current session
 */
function clearSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('Session cleared');
}

/**
 * Go to welcome page with a fresh session
 * Use this for home buttons - it sets a flag so welcome.html knows to start fresh
 * Includes navigation lock to prevent rapid clicks from causing race conditions
 */
let _navigationLock = false;
function goHome() {
    // Prevent rapid navigation
    if (_navigationLock) {
        console.log('[SessionManager] Navigation locked, ignoring goHome()');
        return;
    }
    _navigationLock = true;
    
    // Safety timeout to clear lock after 3 seconds in case navigation fails
    setTimeout(() => { _navigationLock = false; }, 3000);
    
    localStorage.setItem('tizo_restart', 'true');
    window.location.href = 'welcome.html';
}

/**
 * Mark current page in session
 * @param {string} pageName Name of current page
 */
function setCurrentPage(pageName) {
    updateSession({ currentPage: pageName });
}

/**
 * Complete the transaction and generate order number
 * @returns {string} Order number
 */
function completeTransaction() {
    const orderNumber = generateOrderNumber();
    updateSession({
        orderNumber: orderNumber,
        transactionComplete: true
    });
    return orderNumber;
}

/**
 * Check if there's an active (non-completed) session
 * @returns {boolean}
 */
function hasActiveSession() {
    const session = getSession();
    return session !== null && !session.transactionComplete;
}

/**
 * Get session summary for display/printing
 * @returns {Object} Summary object with formatted values
 */
function getSessionSummary() {
    const session = getSession();
    if (!session) return null;

    return {
        sessionId: session.sessionId,
        orderNumber: session.orderNumber || generateOrderNumber(),
        cardType: session.selectedCard,
        cardQuantity: session.cardQuantity,

        // Top-up details
        topupAmount: session.offerCost,
        topupAmountFormatted: formatCurrency(session.offerCost),
        topupTizo: session.offerTizo,

        // Bonus/Scratch card details
        bonusAccepted: session.bonusAccepted,
        bonusAmount: session.bonusCost,
        bonusAmountFormatted: formatCurrency(session.bonusCost),
        bonusTizo: session.bonusTizo,

        // Totals
        totalCost: session.totalCost,
        totalCostFormatted: formatCurrency(session.totalCost),
        totalTizo: session.totalTizo,

        // Metadata
        language: session.language,
        createdAt: new Date(session.createdAt).toLocaleString()
    };
}

/**
 * Format currency in Indonesian Rupiah
 * @param {number} amount Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
    return 'Rp' + parseInt(amount).toLocaleString('id-ID');
}

/**
 * Migrate existing localStorage values to session (for backward compatibility)
 */
function migrateOldData() {
    const session = getSession();
    if (!session) return;

    // Check for old localStorage keys and migrate
    const oldKeys = {
        'selectedCard': 'selectedCard',
        'cardQuantity': 'cardQuantity',
        'topupAmount': 'offerCost',
        'topupTizo': 'offerTizo',
        'scratchAmount': 'bonusCost',
        'scratchTizo': 'bonusTizo',
        'cardType': 'selectedCard'
    };

    let updates = {};
    let hasUpdates = false;

    for (const [oldKey, newKey] of Object.entries(oldKeys)) {
        const oldValue = localStorage.getItem(oldKey);
        if (oldValue !== null && session[newKey] === null) {
            updates[newKey] = isNaN(oldValue) ? oldValue : parseInt(oldValue);
            hasUpdates = true;
        }
    }

    if (hasUpdates) {
        updateSession(updates);
        console.log('Migrated old data to session');
    }
}

// Auto-inject background music
(function () {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        if (!document.querySelector('script[src*="background-music.js"]')) {
            const script = document.createElement('script');
            script.src = 'background-music.js';
            script.async = true;
            document.head.appendChild(script);
        }
    }
})();

// Export for use in other scripts (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getSession,
        saveSession,
        startNewSession,
        updateSession,
        getSessionValue,
        setSessionValue,
        clearSession,
        goHome,
        setCurrentPage,
        completeTransaction,
        hasActiveSession,
        getSessionSummary,
        formatCurrency,
        migrateOldData,
        generateOrderNumber
    };
}
