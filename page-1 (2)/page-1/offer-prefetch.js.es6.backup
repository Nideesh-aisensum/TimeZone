/**
 * Offer Prefetch Module
 * Prefetches offer data before navigation to eliminate loading latency
 * Uses sessionStorage for fast retrieval on next page
 */

(function () {
    'use strict';

    const CACHE_KEY = 'offersCache';
    const LAYOUT_CACHE_KEY = 'layoutConfigCache';
    const CACHE_TTL = 60000; // 1 minute TTL

    /**
     * Get cached offers for a card type
     * @param {string} cardType - The card type to get offers for
     * @returns {Object|null} - Cached offers data or null if not cached/expired
     */
    function getCachedOffers(cardType) {
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (!cached) return null;

            const data = JSON.parse(cached);
            if (data.cardType !== cardType) return null;
            if (Date.now() - data.timestamp > CACHE_TTL) {
                sessionStorage.removeItem(CACHE_KEY);
                return null;
            }

            console.log('[OfferPrefetch] Using cached offers for:', cardType);
            return data;
        } catch (e) {
            console.warn('[OfferPrefetch] Cache read error:', e);
            return null;
        }
    }

    /**
     * Get cached layout config for a card type
     * @param {string} cardType - The card type to get layout for
     * @returns {Object|null} - Cached layout data or null if not cached/expired
     */
    function getCachedLayout(cardType) {
        try {
            const cached = sessionStorage.getItem(LAYOUT_CACHE_KEY);
            if (!cached) return null;

            const data = JSON.parse(cached);
            if (data.cardType !== cardType) return null;
            if (Date.now() - data.timestamp > CACHE_TTL) {
                sessionStorage.removeItem(LAYOUT_CACHE_KEY);
                return null;
            }

            console.log('[OfferPrefetch] Using cached layout for:', cardType);
            return data;
        } catch (e) {
            console.warn('[OfferPrefetch] Layout cache read error:', e);
            return null;
        }
    }

    /**
     * Prefetch offers and layout config for a card type
     * @param {string} cardType - The card type to prefetch offers for
     * @returns {Promise<void>}
     */
    async function prefetchOffers(cardType) {
        console.log('[OfferPrefetch] Prefetching offers for:', cardType);

        const apiUrl = typeof getApiUrl === 'function'
            ? getApiUrl
            : (path) => path;

        try {
            // Fetch both offers and layout config in parallel
            const [offersResponse, layoutResponse] = await Promise.all([
                fetch(apiUrl(`/api/offers?cardType=${cardType}`)),
                fetch(apiUrl(`/api/layout-config?cardType=${cardType}`))
            ]);

            // Process offers
            if (offersResponse.ok) {
                const offersData = await offersResponse.json();
                if (offersData.success) {
                    const cacheData = {
                        cardType: cardType,
                        offers: offersData.offers || [],
                        timestamp: Date.now()
                    };
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
                    console.log('[OfferPrefetch] Cached', cacheData.offers.length, 'offers for:', cardType);
                }
            }

            // Process layout config
            if (layoutResponse.ok) {
                const layoutData = await layoutResponse.json();
                if (layoutData.success) {
                    const layoutCacheData = {
                        cardType: cardType,
                        layout: layoutData.layout,
                        message: layoutData.message,
                        timestamp: Date.now()
                    };
                    sessionStorage.setItem(LAYOUT_CACHE_KEY, JSON.stringify(layoutCacheData));
                    console.log('[OfferPrefetch] Cached layout:', layoutData.layout, 'for:', cardType);
                }
            }
        } catch (error) {
            console.warn('[OfferPrefetch] Prefetch error:', error);
            // Don't throw - prefetch is best-effort
        }
    }

    /**
     * Navigate to offers page with prefetched data
     * @param {string} cardType - The card type
     * @param {string} targetUrl - The URL to navigate to (default: offers-selection.html)
     */
    async function navigateWithPrefetch(cardType, targetUrl = 'offers-selection.html') {
        // Start prefetch immediately
        await prefetchOffers(cardType);
        // Navigate after prefetch completes
        window.location.href = targetUrl;
    }

    /**
     * Clear all cached offer data
     */
    function clearCache() {
        sessionStorage.removeItem(CACHE_KEY);
        sessionStorage.removeItem(LAYOUT_CACHE_KEY);
        console.log('[OfferPrefetch] Cache cleared');
    }

    // Expose API globally
    window.OfferPrefetch = {
        prefetchOffers,
        getCachedOffers,
        getCachedLayout,
        navigateWithPrefetch,
        clearCache,
        CACHE_KEY,
        LAYOUT_CACHE_KEY
    };

})();
