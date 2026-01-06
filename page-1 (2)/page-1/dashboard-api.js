/**
 * Dashboard API Integration for Kiosk
 * Sends session and transaction data to the dashboard backend
 */

(function () {
    'use strict';

    // Dashboard API configuration
    const DASHBOARD_API_URL = 'http://34.101.58.118/api/kiosk';

    // Get kiosk ID from environment or default
    const KIOSK_ID = (function () {
        // Try to get from localStorage or URL param
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('kioskId') || localStorage.getItem('kioskId') || 'K1';
    })();

    // Generate unique session ID
    function generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 11);
        return `${KIOSK_ID}-${timestamp}-${random}`;
    }

    // Current session tracking
    let currentSessionId = null;
    let sessionStartTime = null;

    /**
     * Send data to dashboard API
     * @param {string} endpoint - API endpoint (e.g., '/session')
     * @param {object} data - Data to send
     * @returns {Promise}
     */
    async function sendToDashboard(endpoint, data) {
        try {
            const url = `${DASHBOARD_API_URL}${endpoint}`;
            console.log(`📤 Sending to dashboard: ${url}`, data);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                console.log(`✅ Dashboard response:`, result);
                return result;
            } else {
                console.error(`❌ Dashboard error:`, result);
                return null;
            }
        } catch (error) {
            console.error(`❌ Failed to send to dashboard:`, error.message);
            // Don't block kiosk operation if dashboard is unavailable
            return null;
        }
    }

    /**
     * Send session_start event
     * Called when user starts a new session (welcome page)
     */
    async function sendSessionStart() {
        currentSessionId = generateSessionId();
        sessionStartTime = Date.now();

        const data = {
            sessionId: currentSessionId,
            kioskId: KIOSK_ID,
            action: 'session_start',
            timestamp: new Date().toISOString(),
        };

        const result = await sendToDashboard('/session', data);

        // Store session ID for later use
        if (result && result.success) {
            localStorage.setItem('currentDashboardSession', currentSessionId);
            console.log(`🎬 Session started: ${currentSessionId}`);
        }

        return result;
    }

    /**
     * Send session_complete event
     * Called when user completes their transaction (enjoy page)
     * @param {object} sessionData - Session data including transaction details
     */
    async function sendSessionComplete(sessionData = {}) {
        // Get session ID from current or stored
        const sessionId = currentSessionId || localStorage.getItem('currentDashboardSession');

        if (!sessionId) {
            console.warn('⚠️ No session ID found, creating new one');
            currentSessionId = generateSessionId();
        }

        // Calculate duration
        const duration = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;

        const data = {
            sessionId: sessionId || currentSessionId,
            kioskId: KIOSK_ID,
            action: 'session_complete',
            timestamp: new Date().toISOString(),

            // User info
            isNewUser: sessionData.isNewUser || false,
            cardType: sessionData.cardType || 'unknown',

            // Transaction info
            amount: sessionData.amount || 0,
            offerId: sessionData.offerId || null,
            offerName: sessionData.offerName || null,
            offerType: sessionData.offerType || 'topup', // 'fixed_offer', 'custom_topup', 'topup'
            offerCost: sessionData.offerCost || 0,
            bonusPercent: sessionData.bonusPercent || 0,

            // Topup details
            topupAccepted: sessionData.topupAccepted !== false,
            offerTizo: sessionData.offerTizo || 0,
            totalTizo: sessionData.totalTizo || 0,

            // Bonus/Promo acceptance
            oodAccepted: sessionData.oodAccepted || false,
            oohAccepted: sessionData.oohAccepted || false,
            snacksAccepted: sessionData.snacksAccepted || false,

            // Scratch card
            scratchCardAccepted: sessionData.scratchCardAccepted || false,
            scratchCardRevealed: sessionData.scratchCardRevealed || false,
            scratchPrize: sessionData.scratchPrize || 0,

            // Bonus details
            bonusAccepted: sessionData.bonusAccepted || false,
            bonusCost: sessionData.bonusCost || 0,
            bonusTizo: sessionData.bonusTizo || 0,
            bonusGift: sessionData.bonusGift || null,
            bonusGiftDetails: sessionData.bonusGiftDetails || null,
            bonusFreeGames: sessionData.bonusFreeGames || 0,

            // Session metadata
            status: 'completed',
            durationSeconds: duration,
        };

        const result = await sendToDashboard('/session', data);

        // Clear session data
        if (result && result.success) {
            localStorage.removeItem('currentDashboardSession');
            currentSessionId = null;
            sessionStartTime = null;
            console.log(`🏁 Session completed: ${sessionId}`);
        }

        return result;
    }

    /**
     * Send scratch card event
     * @param {object} scratchData - Scratch card data
     */
    async function sendScratchCard(scratchData = {}) {
        const sessionId = currentSessionId || localStorage.getItem('currentDashboardSession');

        const data = {
            sessionId: sessionId,
            kioskId: KIOSK_ID,
            action: 'scratch_card',
            timestamp: new Date().toISOString(),
            revealed: scratchData.revealed || false,
            prizeValue: scratchData.prizeValue || 0,
            prizeName: scratchData.prizeName || null,
        };

        return sendToDashboard('/session', data);
    }

    /**
     * Send upgrade offer event
     * @param {object} upgradeData - Upgrade offer data
     */
    async function sendUpgradeOffer(upgradeData = {}) {
        const sessionId = currentSessionId || localStorage.getItem('currentDashboardSession');

        const data = {
            sessionId: sessionId,
            kioskId: KIOSK_ID,
            action: 'upgrade_offer',
            timestamp: new Date().toISOString(),
            fromCardType: upgradeData.fromCardType || 'Red',
            toCardType: upgradeData.toCardType || 'Blue',
            upgradeAccepted: upgradeData.upgradeAccepted || false,
            upgradeAmount: upgradeData.upgradeAmount || 0,
        };

        return sendToDashboard('/session', data);
    }

    /**
     * Send feedback
     * @param {object} feedbackData - User feedback data
     */
    async function sendFeedback(feedbackData = {}) {
        const sessionId = currentSessionId || localStorage.getItem('currentDashboardSession');

        const data = {
            kioskId: KIOSK_ID,
            sessionId: sessionId,
            rating: feedbackData.rating || 3,
            comment: feedbackData.comment || null,
            timestamp: new Date().toISOString(),
        };

        return sendToDashboard('/feedback', data);
    }

    /**
     * Health check - test connection to dashboard
     */
    async function healthCheck() {
        try {
            const response = await fetch(`${DASHBOARD_API_URL}/health`);
            const result = await response.json();
            console.log('🏥 Dashboard health:', result);
            return result.status === 'ok';
        } catch (error) {
            console.error('❌ Dashboard health check failed:', error.message);
            return false;
        }
    }

    // Expose API globally
    window.Dashboard = {
        // Configuration
        KIOSK_ID: KIOSK_ID,
        API_URL: DASHBOARD_API_URL,

        // Session management
        sendSessionStart: sendSessionStart,
        sendSessionComplete: sendSessionComplete,

        // Events
        sendScratchCard: sendScratchCard,
        sendUpgradeOffer: sendUpgradeOffer,
        sendFeedback: sendFeedback,

        // Utilities
        healthCheck: healthCheck,
        getCurrentSessionId: () => currentSessionId || localStorage.getItem('currentDashboardSession'),

        // Set kiosk ID (for configuration)
        setKioskId: (id) => {
            localStorage.setItem('kioskId', id);
            console.log(`🏪 Kiosk ID set to: ${id}`);
        },
    };

    console.log(`📊 Dashboard API initialized for ${KIOSK_ID}`);
    console.log(`   API URL: ${DASHBOARD_API_URL}`);
})();
