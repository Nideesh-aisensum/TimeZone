/**
 * Dashboard API Integration for Kiosk
 * Sends session and transaction data to the dashboard backend
 */

(function () {
    'use strict';

    // Dashboard API configuration
    const DASHBOARD_API_URL = 'https://timezone-dashboard.aisensum.com/api/kiosk';

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

    // Kiosk place/venue name from local server .env
    // Use localStorage cache so it's available instantly (async fetch updates it for next time)
    let KIOSK_PLACE = localStorage.getItem('kioskPlace') || '';
    (async function fetchKioskPlace() {
        try {
            const resp = await fetch('/api/kiosk-config');
            const data = await resp.json();
            if (data.success && data.place) {
                KIOSK_PLACE = data.place;
                localStorage.setItem('kioskPlace', data.place);
                console.log('📍 Kiosk place:', KIOSK_PLACE);
            }
        } catch (e) {
            console.warn('⚠️ Could not fetch kiosk config:', e.message);
        }
    })();

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

            // User info - strict boolean check
            isNewUser: sessionData.isNewUser === true,
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

            // OOD/OOH/Snacks costs for revenue tracking
            oodCost: sessionData.oodCost || 0,
            oohCost: sessionData.oohCost || 0,
            snacksCost: sessionData.snacksCost || 0,

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

            // Card details
            cardQuantity: sessionData.cardQuantity || 1,
            selectedCardCount: sessionData.selectedCardCount || 1,

            // 2nd Upsell tracking
            secondUpsellAccepted: sessionData.secondUpsellAccepted || false,
            originalOfferCost: sessionData.originalOfferCost || null,

            // Session metadata
            status: 'completed',
            durationSeconds: duration,

            // Venue/Place from kiosk .env
            place: sessionData.place || KIOSK_PLACE || '',
        };

        // ✅ SAVE TO LOCAL DB FIRST (offline-safe, immediate)
        try {
            const localResp = await fetch('/api/customer-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: data.sessionId,
                    orderNumber: sessionData.orderNumber || null,
                    isNewUser: data.isNewUser,
                    language: sessionData.language || 'id',
                    cardType: data.cardType,
                    cardQuantity: data.cardQuantity,
                    offerId: data.offerId,
                    offerName: data.offerName,
                    offerCost: data.offerCost,
                    offerTizo: data.offerTizo,
                    offerType: data.offerType,
                    customAmount: sessionData.customAmount || null,
                    upsellAccepted: data.topupAccepted,
                    secondUpsellAccepted: data.secondUpsellAccepted,
                    upsellCost: sessionData.upsellCost || 0,
                    upsellTizo: sessionData.upsellTizo || 0,
                    oodAccepted: data.oodAccepted,
                    oodCost: data.oodCost,
                    oodTizo: sessionData.oodTizo || 0,
                    oohAccepted: data.oohAccepted,
                    oohCost: data.oohCost,
                    oohTizo: sessionData.oohTizo || 0,
                    snacksAccepted: data.snacksAccepted,
                    snacksCost: data.snacksCost,
                    snacksTizo: sessionData.snacksTizo || 0,
                    feedbackRating: sessionData.feedbackRating || null,
                    feedbackRating: sessionData.feedbackRating || null,
                    feedbackComment: (sessionData.feedbackComment || '') + ' [DEBUG Session: ' + JSON.stringify({
                        upsellCost: sessionData.upsellCost,
                        offerCost: sessionData.offerCost,
                        scratchPrizeValue: sessionData.scratchPrizeValue,
                        scratchPrize: sessionData.scratchPrize,
                        scratchPrizeType: sessionData.scratchPrizeType,
                        topupAccepted: sessionData.topupAccepted,
                        upsellAccepted: sessionData.upsellAccepted
                    }) + ']',
                    scratchCardRevealed: data.scratchCardRevealed,
                    scratchPrizeType: sessionData.scratchPrizeType || null,
                    scratchPrizeValue: sessionData.scratchPrizeValue || data.scratchPrize || 0,
                    scratchPrizeLabel: sessionData.scratchPrizeLabel || null,
                    bonusAccepted: data.bonusAccepted,
                    bonusCost: data.bonusCost,
                    bonusTizo: data.bonusTizo,
                    bonusGift: data.bonusGift,
                    bonusGiftDetails: data.bonusGiftDetails,
                    bonusFreeGames: data.bonusFreeGames,
                    totalCost: data.totalTizo ? (data.offerCost || 0) + (data.bonusCost || 0) : 0,
                    totalTizo: data.totalTizo,
                    finalPayment: sessionData.finalPayment || data.amount || 0,
                    finalTizo: sessionData.finalTizo || data.totalTizo || 0,
                    durationSeconds: data.durationSeconds,
                    place: data.place
                })
            });
            const localResult = await localResp.json();
            console.log('💾 Transaction saved to local DB:', localResult);
        } catch (localErr) {
            console.error('⚠️ Failed to save transaction locally:', localErr.message);
        }

        // Send to external dashboard in background (fire-and-forget, don't block)
        sendToDashboard('/session', data).then(result => {
            if (result && result.success) {
                localStorage.removeItem('currentDashboardSession');
                currentSessionId = null;
                sessionStartTime = null;
                console.log(`🏁 Session completed: ${sessionId}`);
            }
        }).catch(() => { });

        return { success: true };
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
