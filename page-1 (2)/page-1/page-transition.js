/**
 * Page Transition Handler - INSTANT VERSION
 * Eliminates black screen flash by:
 * 1. Immediately injecting a black overlay before body renders
 * 2. Fading out once page is ready
 * 
 * MUST BE LOADED IN <head> FOR INSTANT EFFECT
 */

(function () {
    'use strict';

    const FADE_TIME = 150; // ms - faster transition

    // IMMEDIATELY inject overlay CSS before DOM is ready
    // This ensures the overlay exists before any body content renders
    const style = document.createElement('style');
    style.id = 'page-transition-styles';
    style.textContent = `
        #page-transition-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000;
            z-index: 999999;
            pointer-events: none;
            transition: opacity ${FADE_TIME}ms ease;
        }
        #page-transition-overlay.fade-out {
            opacity: 0;
        }
        /* Hide body until transition is ready */
        html.page-transitioning body {
            visibility: hidden;
        }
    `;

    // Inject style into head immediately
    if (document.head) {
        document.head.appendChild(style);
    } else {
        document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style), { once: true });
    }

    // Check if we're coming from a transition
    const isFromTransition = sessionStorage.getItem('page_transitioning') === 'true';

    if (isFromTransition) {
        // Mark HTML to hide body initially
        document.documentElement.classList.add('page-transitioning');
    }

    // Create and inject overlay as soon as possible
    function injectOverlay() {
        if (document.getElementById('page-transition-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'page-transition-overlay';

        // Start visible if coming from transition
        if (isFromTransition) {
            overlay.style.opacity = '1';
        } else {
            overlay.style.opacity = '0';
        }

        // Inject immediately - even before body exists, append to documentElement
        if (document.body) {
            document.body.appendChild(overlay);
        } else {
            document.documentElement.appendChild(overlay);
        }

        return overlay;
    }

    // Try to inject overlay immediately
    injectOverlay();

    // Store original href setter
    let originalHrefSetter = null;
    let isNavigating = false;

    /**
     * Navigate with smooth fade
     */
    function navigateTo(url, fadeTime = FADE_TIME) {
        if (isNavigating) return;
        isNavigating = true;

        const overlay = document.getElementById('page-transition-overlay') || injectOverlay();

        // Fade to black
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'all';
        overlay.classList.remove('fade-out');

        // Mark that we're transitioning
        sessionStorage.setItem('page_transitioning', 'true');

        // Navigate after fade
        setTimeout(() => {
            if (originalHrefSetter) {
                originalHrefSetter.call(window.location, url);
            } else {
                window.location.assign(url);
            }
        }, fadeTime);
    }

    /**
     * Initialize - fade out overlay when page is ready
     */
    function initPageTransition() {
        const overlay = document.getElementById('page-transition-overlay') || injectOverlay();

        if (isFromTransition) {
            // Clear flag
            sessionStorage.removeItem('page_transitioning');

            // Remove the body-hiding class
            document.documentElement.classList.remove('page-transitioning');

            // Wait for everything to render, then fade out
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    overlay.classList.add('fade-out');
                    overlay.style.opacity = '0';

                    // Remove overlay after fade completes
                    setTimeout(() => {
                        overlay.style.pointerEvents = 'none';
                    }, FADE_TIME);
                });
            });
        }

        isNavigating = false;
    }

    /**
     * Intercept window.location.href
     */
    function interceptNavigation() {
        try {
            const locationProto = Object.getPrototypeOf(window.location);
            const descriptor = Object.getOwnPropertyDescriptor(locationProto, 'href');

            if (descriptor && descriptor.set) {
                originalHrefSetter = descriptor.set;

                Object.defineProperty(window.location, 'href', {
                    get: descriptor.get,
                    set: function (value) {
                        if (isNavigating) {
                            return originalHrefSetter.call(this, value);
                        }

                        // Don't intercept external URLs
                        if (value.startsWith('http://') || value.startsWith('https://')) {
                            if (!value.includes(window.location.hostname)) {
                                return originalHrefSetter.call(this, value);
                            }
                        }

                        navigateTo(value);
                    },
                    configurable: true
                });
            }
        } catch (e) {
            console.warn('Could not intercept navigation:', e);
        }
    }

    // Set up navigation interception immediately
    interceptNavigation();

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPageTransition);
    } else {
        initPageTransition();
    }

    // Also try on load for images/videos
    window.addEventListener('load', () => {
        const overlay = document.getElementById('page-transition-overlay');
        if (overlay && overlay.style.opacity !== '0') {
            overlay.classList.add('fade-out');
            overlay.style.opacity = '0';
        }
    });

    // Expose API
    window.PageTransition = {
        navigateTo,
        init: initPageTransition,
        FADE_TIME
    };

})();
