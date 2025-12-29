/**
 * Kiosk Router - Unified View Manager
 * 
 * Handles navigation between views in the unified kiosk shell.
 * All views are pre-loaded divs that are shown/hidden instantly.
 * Background videos are persistent and never reload.
 */

const KioskRouter = (function () {
    'use strict';

    // Private state
    let currentView = null;
    let currentBackground = 'main';
    const registeredViews = {};
    const viewHistory = [];

    // Background video mapping
    const BACKGROUNDS = {
        'main': 'bg-main',
        'ood': 'bg-ood',
        'ooh': 'bg-ooh',
        'snacks': 'bg-snacks'
    };

    // View to background mapping (which bg to show for each view)
    const VIEW_BACKGROUNDS = {
        'screensaver': 'ood',
        'screensaver-ood': 'ood',
        'free-snacks': 'snacks'
        // All other views default to 'main'
    };

    /**
     * Initialize the router
     */
    function init() {
        console.log('[KioskRouter] Initializing...');

        // Wait for main video to be ready
        const mainVideo = document.getElementById('bg-main');
        const loading = document.getElementById('loading-overlay');

        const startApp = () => {
            console.log('[KioskRouter] Starting app...');

            // Check for hash in URL or default to welcome
            const hash = window.location.hash.slice(1);
            const initialView = hash || 'welcome';

            navigate(initialView);

            // Hide loading screen
            if (loading) {
                setTimeout(() => {
                    loading.classList.add('hidden');
                }, 300);
            }
        };

        if (mainVideo && mainVideo.readyState >= 3) {
            startApp();
        } else if (mainVideo) {
            mainVideo.addEventListener('canplay', startApp, { once: true });
            mainVideo.addEventListener('error', startApp, { once: true });
            setTimeout(startApp, 2000); // Fallback
        } else {
            startApp();
        }
    }

    /**
     * Register a view controller
     * @param {string} viewId - View identifier (e.g., 'welcome', 'card-selection')
     * @param {object} controller - Object with init() and optionally destroy() methods
     */
    function registerView(viewId, controller) {
        registeredViews[viewId] = controller;
        console.log('[KioskRouter] Registered view:', viewId);
    }

    /**
     * Navigate to a view
     * @param {string} viewId - Target view ID
     * @param {object} options - Navigation options
     */
    function navigate(viewId, options = {}) {
        // Normalize viewId (remove .html extension if present)
        viewId = viewId.replace('.html', '').replace(/\s+/g, '-').toLowerCase();

        console.log('[KioskRouter] Navigating to:', viewId);

        // Don't navigate to same view unless forced
        if (currentView === viewId && !options.force) {
            console.log('[KioskRouter] Already on view:', viewId);
            return;
        }

        // Get view element
        const targetViewEl = document.getElementById('view-' + viewId);
        if (!targetViewEl) {
            console.error('[KioskRouter] View not found:', viewId);
            return;
        }

        // Cleanup current view
        if (currentView && registeredViews[currentView]) {
            const currentController = registeredViews[currentView];
            if (currentController.destroy) {
                try {
                    currentController.destroy();
                } catch (e) {
                    console.error('[KioskRouter] Error in destroy():', e);
                }
            }
        }

        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

        // Show target view
        targetViewEl.style.display = 'block';
        // Force reflow for transition
        targetViewEl.offsetHeight;
        targetViewEl.classList.add('active');

        // Switch background
        const bgType = VIEW_BACKGROUNDS[viewId] || 'main';
        switchBackground(bgType);

        // Update history
        if (currentView) {
            viewHistory.push(currentView);
        }
        currentView = viewId;

        // Update URL hash
        window.location.hash = viewId;

        // Initialize target view controller
        if (registeredViews[viewId]) {
            const controller = registeredViews[viewId];
            if (controller.init) {
                try {
                    controller.init(options.data || {});
                } catch (e) {
                    console.error('[KioskRouter] Error in init():', e);
                }
            }
        }

        console.log('[KioskRouter] Navigation complete:', viewId);
    }

    /**
     * Switch background video
     * @param {string} bgType - Background type ('main', 'ood', 'ooh', 'snacks')
     */
    function switchBackground(bgType) {
        if (bgType === currentBackground) return;

        console.log('[KioskRouter] Switching background:', currentBackground, '->', bgType);

        // Hide all backgrounds
        Object.values(BACKGROUNDS).forEach(bgId => {
            const el = document.getElementById(bgId);
            if (el) el.classList.remove('active');
        });

        // Show target background
        const targetBgId = BACKGROUNDS[bgType] || BACKGROUNDS['main'];
        const targetEl = document.getElementById(targetBgId);
        if (targetEl) {
            targetEl.classList.add('active');
        }

        currentBackground = bgType;
    }

    /**
     * Go back to previous view
     */
    function goBack() {
        if (viewHistory.length > 0) {
            const previousView = viewHistory.pop();
            navigate(previousView);
        } else {
            navigate('welcome');
        }
    }

    /**
     * Go to home (welcome page with fresh session)
     */
    function goHome() {
        if (typeof startNewSession === 'function') {
            localStorage.setItem('tizo_restart', 'true');
        }
        navigate('welcome', { force: true });
    }

    /**
     * Get current view ID
     */
    function getCurrentView() {
        return currentView;
    }

    /**
     * Get a view element by ID
     * @param {string} viewId - View identifier
     */
    function getViewElement(viewId) {
        return document.getElementById('view-' + viewId);
    }

    /**
     * Query within a specific view
     * @param {string} viewId - View identifier  
     * @param {string} selector - CSS selector
     */
    function queryInView(viewId, selector) {
        const view = getViewElement(viewId);
        return view ? view.querySelector(selector) : null;
    }

    /**
     * Query all within a specific view
     * @param {string} viewId - View identifier
     * @param {string} selector - CSS selector
     */
    function queryAllInView(viewId, selector) {
        const view = getViewElement(viewId);
        return view ? view.querySelectorAll(selector) : [];
    }

    // Public API
    return {
        init: init,
        navigate: navigate,
        registerView: registerView,
        switchBackground: switchBackground,
        goBack: goBack,
        goHome: goHome,
        getCurrentView: getCurrentView,
        getViewElement: getViewElement,
        queryInView: queryInView,
        queryAllInView: queryAllInView
    };
})();

// Backward compatibility shims
window.PageTransition = {
    navigateTo: function (url) {
        KioskRouter.navigate(url);
    },
    init: function () { }
};

// Override goHome and goBack globally
window.goHome = function () {
    KioskRouter.goHome();
};

window.goBack = function () {
    KioskRouter.goBack();
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    KioskRouter.init();
});
