/**
 * Asset Preloader Service
 * Loads all heavy assets (images, GIFs, videos) into memory for instant access
 * 
 * Usage:
 *   await AssetPreloader.preloadAll(progress => console.log(progress + '%'));
 *   const blobUrl = AssetPreloader.getCachedUrl('cat-character.gif');
 */

(function () {
    'use strict';

    // Asset manifest - all files that should be preloaded
    const ASSET_MANIFEST = {
        // High priority - used on screensaver and welcome
        critical: [
            'cat-screensaver.gif',
            'cat-character.gif',
            'timezone-branding.png',
            'button.png',
            'ooh-card.png',
            'loading.gif'
        ],
        // Video backgrounds
        videos: [
            'OOD-BACKGROUND.mp4',
            'OOH-BACKGROUND.mp4',
            'free-snacks-bg.mp4',
            'other-bg.mp4',
            'welcome-bg.mp4'
        ],
        // Card images
        cards: [
            'red-card.png',
            'blue-card.png',
            'gold-card.png',
            'silver-card.png',
            'red-card-dark.png',
            'blue-elite-dark.png',
            'gold-dark.png',
            'silver-dark.png'
        ],
        // UI elements
        ui: [
            'back-button.png',
            'home.png',
            'checkbox-icon.png',
            'tick-icon.png',
            'plus-button.png',
            'minus-button.png',
            'plus-minus-bg.png',
            'x-button.png',
            'Amount-bar.png',
            'Number-button.png',
            'Ok-button.png',
            'backspace.png'
        ],
        // Large GIFs (loaded last)
        largeGifs: [
            'hand-gesture.gif',
            'congrates.gif',
            'free-snack-icon.gif',
            'Super-Deal.gif',
            'last-chance.gif',
            'card-gif.gif'
        ],
        // Very large backgrounds (optional, heavy)
        backgrounds: [
            // 'bg-screensaver.gif',  // 52MB - consider converting to video
            // 'bg-welcome.gif'       // 36MB - consider converting to video
        ]
    };

    // In-memory cache for blob URLs
    const blobCache = new Map();
    const videoElements = new Map();
    let isPreloaded = false;
    let preloadPromise = null;

    /**
     * Preload a single image/GIF and return blob URL
     */
    async function preloadImage(filename) {
        if (blobCache.has(filename)) {
            return blobCache.get(filename);
        }

        try {
            const response = await fetch(filename);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobCache.set(filename, blobUrl);
            return blobUrl;
        } catch (err) {
            console.warn(`Failed to preload ${filename}:`, err.message);
            // Return original filename as fallback
            return filename;
        }
    }

    /**
     * Preload a video by creating a hidden video element and loading it
     */
    async function preloadVideo(filename) {
        return new Promise((resolve) => {
            if (videoElements.has(filename)) {
                resolve(filename);
                return;
            }

            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            video.style.display = 'none';

            video.oncanplaythrough = () => {
                videoElements.set(filename, video);
                resolve(filename);
            };

            video.onerror = () => {
                console.warn(`Failed to preload video ${filename}`);
                resolve(filename);
            };

            // Timeout after 30 seconds
            setTimeout(() => {
                if (!videoElements.has(filename)) {
                    resolve(filename);
                }
            }, 30000);

            video.src = filename;
            video.load();
            document.body.appendChild(video);
        });
    }

    /**
     * Get all assets as flat array with priorities
     */
    function getAllAssets() {
        return [
            ...ASSET_MANIFEST.critical,
            ...ASSET_MANIFEST.cards,
            ...ASSET_MANIFEST.ui,
            ...ASSET_MANIFEST.largeGifs,
            ...ASSET_MANIFEST.backgrounds
        ];
    }

    /**
     * Preload all assets with progress callback
     * @param {function} onProgress - Called with percentage (0-100)
     */
    async function preloadAll(onProgress) {
        // Return existing promise if already loading
        if (preloadPromise) {
            return preloadPromise;
        }

        // Skip if already preloaded in this session
        if (sessionStorage.getItem('assets_preloaded') === 'true') {
            isPreloaded = true;
            if (onProgress) onProgress(100);
            return Promise.resolve();
        }

        preloadPromise = (async () => {
            const images = getAllAssets();
            const videos = ASSET_MANIFEST.videos;
            const totalAssets = images.length + videos.length;
            let loadedCount = 0;

            const updateProgress = () => {
                loadedCount++;
                const percent = Math.round((loadedCount / totalAssets) * 100);
                if (onProgress) onProgress(percent);
            };

            // Preload images in parallel batches of 5
            const batchSize = 5;
            for (let i = 0; i < images.length; i += batchSize) {
                const batch = images.slice(i, i + batchSize);
                await Promise.all(batch.map(async (file) => {
                    await preloadImage(file);
                    updateProgress();
                }));
            }

            // Preload videos in parallel batches of 2
            for (let i = 0; i < videos.length; i += 2) {
                const batch = videos.slice(i, i + 2);
                await Promise.all(batch.map(async (file) => {
                    await preloadVideo(file);
                    updateProgress();
                }));
            }

            isPreloaded = true;
            sessionStorage.setItem('assets_preloaded', 'true');
            console.log('✅ All assets preloaded and cached in memory');
        })();

        return preloadPromise;
    }

    /**
     * Get cached blob URL for an asset
     * @param {string} filename - Original filename
     * @returns {string} Blob URL if cached, original filename otherwise
     */
    function getCachedUrl(filename) {
        return blobCache.get(filename) || filename;
    }

    /**
     * Get preloaded video element
     * @param {string} filename - Video filename
     * @returns {HTMLVideoElement|null}
     */
    function getCachedVideo(filename) {
        return videoElements.get(filename) || null;
    }

    /**
     * Check if all assets are preloaded
     */
    function isReady() {
        return isPreloaded;
    }

    /**
     * Clear the preload cache (useful for memory cleanup)
     */
    function clearCache() {
        blobCache.forEach(url => URL.revokeObjectURL(url));
        blobCache.clear();
        videoElements.forEach(video => video.remove());
        videoElements.clear();
        isPreloaded = false;
        preloadPromise = null;
        sessionStorage.removeItem('assets_preloaded');
    }

    /**
     * Prefetch API data for next pages
     */
    async function prefetchApiData() {
        try {
            const apiBase = window.getApiUrl ? '' : '';
            const getUrl = (path) => window.getApiUrl ? window.getApiUrl(path) : path;

            // Prefetch common API data
            const fetches = [
                fetch(getUrl('/api/offers?category=OOD')),
                fetch(getUrl('/api/offers?category=OOH')),
                fetch(getUrl('/api/offers?category=Snacks')),
                fetch(getUrl('/api/card-info')),
                fetch(getUrl('/api/upsell-offers-all'))
            ];

            const results = await Promise.allSettled(fetches);

            // Cache successful responses
            const cache = {};
            const keys = ['ood', 'ooh', 'snacks', 'cardInfo', 'upsellOffers'];

            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'fulfilled' && results[i].value.ok) {
                    try {
                        cache[keys[i]] = await results[i].value.clone().json();
                    } catch (e) {
                        // Ignore JSON parse errors
                    }
                }
            }

            cache.timestamp = Date.now();
            sessionStorage.setItem('api_cache', JSON.stringify(cache));
            console.log('✅ API data prefetched and cached');
        } catch (e) {
            console.warn('API prefetch failed:', e.message);
        }
    }

    /**
     * Get cached API data
     * @param {string} key - Cache key (ood, ooh, snacks, cardInfo, upsellOffers)
     * @param {number} maxAge - Max age in ms (default 60 seconds)
     */
    function getCachedApiData(key, maxAge = 60000) {
        try {
            const cache = JSON.parse(sessionStorage.getItem('api_cache') || '{}');
            if (cache.timestamp && (Date.now() - cache.timestamp < maxAge)) {
                return cache[key] || null;
            }
        } catch (e) {
            // Ignore parse errors
        }
        return null;
    }

    // Expose global API
    window.AssetPreloader = {
        preloadAll,
        getCachedUrl,
        getCachedVideo,
        isReady,
        clearCache,
        prefetchApiData,
        getCachedApiData,
        ASSET_MANIFEST
    };

})();
