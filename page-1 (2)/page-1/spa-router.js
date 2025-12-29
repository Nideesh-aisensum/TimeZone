/**
 * SPA Router - Ported & Optimized for Page-1
 * Features:
 * - Instant Navigation (no reload)
 * - Double Buffering (prevents black flash)
 * - Script Execution Support
 */

(function () {
    'use strict';

    // PageTransition compatibility shim
    window.PageTransition = {
        navigateTo: function (url) { SpaRouter.navigate(url); },
        init: function () { }
    };

    const contentContainer = document.getElementById('page-content');
    const persistentVideo = document.getElementById('persistent-video-bg');

    let currentPage = null;
    let isNavigating = false;
    const pageCache = new Map();
    const BASE_PATH = ''; // Flat structure in page-1

    // Video backgrounds mapping
    const BACKGROUNDS = {
        main: 'other-bg.mp4',
        ood: 'OOD-BACKGROUND.mp4',
        ooh: 'OOH-BACKGROUND.mp4',
        snacks: 'Snacks-BACKGROUND.mp4'
    };

    const PAGE_BACKGROUNDS = {
        'screensaver.html': 'ood',
        'screensaver-ood.html': 'ood',
        'screensaver-ooh.html': 'ooh',
        'screensaver-snacks.html': 'snacks',
        'welcome.html': 'main',
        'welcome-newuser.html': 'main'
    };

    // Functions to expose from page scripts to global scope
    const ALL_FUNCTIONS = [
        'goBack', 'goHome', 'handleBack', 'handleStart', 'handleContinue',
        'handleNewPlayer', 'handleExistingPlayer', 'handleNext', 'handlePrev',
        'handleGrabOffer', 'handleSkip', 'handleClick', 'handleAccept', 'handleReject',
        'selectCard', 'flipCard', 'toggleCardFlip', 'flipIconAndCard', 'changeCardQuantity',
        'handleCardSelect', 'initCards', 'loadCardInfo',
        'selectOffer', 'handleOfferClick', 'confirmSelection', 'loadOffers', 'fetchOffers',
        'fetchAdditionalOffers', 'updateOffersDisplay',
        'startScratch', 'revealPrize', 'handleReveal', 'handleScratch', 'loadScratchCardData',
        'toggleScratchCard', 'toggleOOD', 'toggleOOH', 'toggleSnacks',
        'handlePrint', 'confirmPrint', 'showPrintPreview', 'closePrintPreview',
        'hidePrinterError', 'showPrinterError',
        'toggleLanguage', 'setLanguage', 'applyLanguage',
        'updateSession', 'getSession', 'clearSession', 'setCurrentPage',
        'handleCustomAmount', 'updateCustomAmount', 'handleNumberInput',
        'handleBackspace', 'handleClear', 'submitCustomAmount', 'loadUpsellData',
        'handleRating', 'submitFeedback', 'handleStarClick',
        'initSlideshow', 'startSlideshow', 'stopSlideshow', 'nextSlide', 'prevSlide',
        'loadSlideData', 'fetchOODOffers', 'fetchOOHOffers', 'fetchSnacksOffers', 'initializeSlides',
        'selectUpsell', 'handleUpsellClick', 'confirmUpsell', 'skipUpsell',
        'init', 'initPage', 'loadData', 'initialize', 'initializeApp',
        'showPopup', 'hidePopup', 'showModal', 'hideModal', 'closeModal'
    ];

    function fixPaths(html) {
        // Since we are in the same dir, we might not need to prefix much, 
        // but let's ensure we don't break existing relative paths.
        // If paths are like "style.css", they stay "style.css" because index.html is in the same dir.
        return html;
    }

    function fixNavigationCalls(code) {
        // Intercept window.location.href assignments
        code = code.replace(
            /window\.location\.href\s*=\s*['"]([^'"]+\.html)['"]\s*;?/g,
            "SpaRouter.navigate('$1');"
        );
        // Intercept PageTransition calls
        code = code.replace(
            /PageTransition\s*\.\s*navigateTo\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            "SpaRouter.navigate('$1')"
        );
        return code;
    }

    function extractPageContent(html, pageName) {
        html = fixPaths(html);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove heavy elements we don't want to duplicate
        // BUT preserve screensaver-specific video backgrounds (bg-ood, bg-ooh, bg-snacks)
        doc.querySelectorAll('video').forEach(el => {
            const id = el.getAttribute('id') || '';
            // Keep screensaver slide backgrounds
            if (id.startsWith('bg-')) {
                return; // Don't remove screensaver background videos
            }
            // Remove generic video-bg elements
            el.remove();
        });
        doc.querySelectorAll('#loading-overlay, .loading-overlay, .page-loading-overlay').forEach(el => el.remove());
        doc.querySelectorAll('script[src="spa-router.js"]').forEach(el => el.remove());

        // Get main content
        let content = doc.querySelector('.container, .screensaver-container') || doc.body;

        // Extract scripts
        let combinedScript = '';
        doc.querySelectorAll('script').forEach(script => {
            const src = script.getAttribute('src');
            if (src) {
                // We might need to handle external scripts if they aren't loaded yet?
                // For now, assume global scripts (jquery etc) are in index.html, 
                // and page specific ones we might ignore or reload? 
                // In page-1, mostly scripts are at the bottom.
                // Let's rely on index.html loading common libs.
                return;
            }
            if (!script.textContent || !script.textContent.trim()) return;
            if (script.textContent.includes('initEditMode')) return;

            let code = script.textContent;
            code = fixNavigationCalls(code);
            combinedScript += code + '\n';
        });

        // Extract styles
        const styles = [];
        doc.querySelectorAll('style').forEach(style => {
            styles.push(style.textContent);
        });

        return { content: content, combinedScript, styles, pageName };
    }

    function executePageScript(code, pageName) {
        if (!code || !code.trim()) return;

        let exposeCode = '';
        ALL_FUNCTIONS.forEach(fn => {
            exposeCode += `if(typeof ${fn}==='function')window.${fn}=${fn};`;
        });

        const wrappedCode = `
(function() {
    // Override addEventListener to immediately run DOMContentLoaded callbacks
    var _origAdd = document.addEventListener.bind(document);
    document.addEventListener = function(t, fn, o) {
        if (t === 'DOMContentLoaded') { setTimeout(fn, 0); }
        else { _origAdd(t, fn, o); }
    };
    
    // === Page: ${pageName} ===
    ${code}
    
    // Restore
    document.addEventListener = _origAdd;
    
    // Expose functions
    try { ${exposeCode} } catch(e) {}
})();
`;
        try {
            const script = document.createElement('script');
            script.textContent = wrappedCode;
            document.body.appendChild(script);
            // Optional: remove script tag after execution to keep DOM clean?
            // script.remove(); 
        } catch (e) {
            console.error('Script error for ' + pageName + ':', e);
        }
    }

    function switchBackground(bgType) {
        // PERMANENT BACKGROUND MODE
        // We do NOT switch the background video. It stays constant.
        // The persistent-video-bg in index.html will play continuously.
        console.log('Keeping persistent background (no switch)');
        return;
    }

    async function prefetch(pageName) {
        if (pageCache.has(pageName)) return;
        try {
            const resp = await fetch(BASE_PATH + pageName);
            if (resp.ok) {
                pageCache.set(pageName, extractPageContent(await resp.text(), pageName));
            }
        } catch (e) { }
    }

    async function navigate(pageName) {
        if (typeof pageName !== 'string') pageName = String(pageName);
        pageName = pageName.split('/').pop().trim();

        if (!pageName || !pageName.endsWith('.html')) return;
        if (isNavigating || currentPage === pageName) return;
        isNavigating = true;

        console.log('SPA →', pageName);

        try {
            let pageData = pageCache.get(pageName);
            if (!pageData) {
                const resp = await fetch(BASE_PATH + pageName);
                if (!resp.ok) throw new Error('404: ' + pageName);
                pageData = extractPageContent(await resp.text(), pageName);
                pageCache.set(pageName, pageData);
            }

            // DO NOT SWITCH BACKGROUND
            // switchBackground(PAGE_BACKGROUNDS[pageName] || 'main');

            // --- DOUBLE BUFFERING / OVERLAY LOGIC ---

            // 1. Create wrapper for NEW content
            const newWrapper = document.createElement('div');
            newWrapper.className = 'spa-page-wrapper';
            newWrapper.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10;
                background: transparent !important;
            `;

            // 2. Inject styles
            pageData.styles.forEach(css => {
                const s = document.createElement('style');
                s.textContent = css;
                newWrapper.appendChild(s);
            });

            // 3. Inject HTML content
            if (pageData.content) {
                newWrapper.appendChild(pageData.content.cloneNode(true));
            }

            // 4. Force transparent background consistently
            newWrapper.style.background = 'transparent';
            newWrapper.style.backgroundColor = 'transparent';

            // Aggressively clear backgrounds from common containers
            const elementsToClear = newWrapper.querySelectorAll('.container, .screensaver-container, .content, body, html, .main-container');
            elementsToClear.forEach(el => {
                el.style.setProperty('background', 'transparent', 'important');
                el.style.setProperty('background-color', 'transparent', 'important');
                el.style.setProperty('background-image', 'none', 'important');
            });

            // 5. Append NEW wrapper contentContainer
            contentContainer.appendChild(newWrapper);

            // 6. Execute scripts
            executePageScript(pageData.combinedScript, pageName);

            // 7. Instant Swap with Double Buffering Safety
            // We keep the old page for a tiny bit (50ms) to ensure the browser has fully painted the new page.
            // Since the new page is on top (appended last), this is invisible to the user but prevents the "black flash" gap.
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const oldWrappers = Array.from(contentContainer.children).filter(el => el !== newWrapper);
                    oldWrappers.forEach(el => el.remove());
                }, 50);
            });

            history.replaceState(null, '', '#' + pageName);
            currentPage = pageName;

        } catch (error) {
            console.error('Navigation error:', error);
            isNavigating = false;
        }

        // Reset flag after a safety timeout (nav usually immediate)
        setTimeout(() => { isNavigating = false; }, 500);
    }

    async function prefetchAll(pages, onProgress) {
        pageCache.clear();
        let done = 0;
        for (const page of pages) {
            await prefetch(page);
            done++;
            if (onProgress) onProgress(Math.round((done / pages.length) * 100));
        }
    }

    function interceptNavigation() {
        document.addEventListener('click', e => {
            const link = e.target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href');
                if (href && href.endsWith('.html') && !href.startsWith('http')) {
                    e.preventDefault();
                    navigate(href);
                }
            }
        }, true);
    }

    interceptNavigation();

    window.SpaRouter = {
        navigate,
        prefetch,
        prefetchAll,
        switchBackground,
        getCurrentPage: () => currentPage,
        clearCache: () => pageCache.clear()
    };

})();
