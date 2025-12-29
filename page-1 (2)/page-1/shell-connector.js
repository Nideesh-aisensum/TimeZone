/**
 * Shell Connector
 * 
 * Add this script to any page to enable communication with kiosk-shell.html
 * This script:
 * 1. Detects if running inside the shell iframe
 * 2. Intercepts navigation to use shell routing
 * 3. Makes backgrounds transparent
 * 4. Hides local video backgrounds
 */

(function () {
    'use strict';

    const ShellConnector = {
        isInShell: false,

        init: function () {
            // Check if we're inside the shell iframe
            this.isInShell = window.parent !== window && window.parent.KioskShell;

            if (this.isInShell) {
                console.log('[ShellConnector] Running inside shell');
                this.setupShellMode();
            } else {
                console.log('[ShellConnector] Running standalone');
            }
        },

        setupShellMode: function () {
            // Make container transparent
            this.makeBackgroundTransparent();

            // Hide local video backgrounds
            this.hideLocalVideos();

            // Override navigation
            this.interceptNavigation();

            // Forward user interactions to parent for audio autoplay
            this.forwardUserInteraction();

            // Apply kiosk security to iframe content
            this.applyKioskSecurity();
        },

        applyKioskSecurity: function () {
            // Block right-click context menu
            document.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                return false;
            }, true);

            // Block multi-touch zoom (2+ fingers)
            document.addEventListener('touchstart', function (e) {
                if (e.touches.length > 1) {
                    e.preventDefault();
                    return false;
                }
            }, { passive: false });

            // Block gesture zoom
            document.addEventListener('gesturestart', function (e) {
                e.preventDefault();
            }, { passive: false });

            // Block Ctrl+scroll zoom
            document.addEventListener('wheel', function (e) {
                if (e.ctrlKey) {
                    e.preventDefault();
                }
            }, { passive: false });

            console.log('[ShellConnector] Kiosk security applied to iframe');
        },

        forwardUserInteraction: function () {
            // Forward clicks/touches to parent so shell can start background music
            // (Browsers require user interaction to play audio)
            let interactionSent = false;

            const sendInteraction = () => {
                if (interactionSent) return;
                interactionSent = true;

                try {
                    window.parent.postMessage({ type: 'userInteraction' }, '*');
                    console.log('[ShellConnector] User interaction forwarded to shell');
                } catch (e) {
                    // Ignore cross-origin errors
                }
            };

            document.addEventListener('click', sendInteraction, { once: true });
            document.addEventListener('touchstart', sendInteraction, { once: true });
        },

        makeBackgroundTransparent: function () {
            // Make body transparent
            document.body.style.background = 'transparent';
            document.body.style.backgroundColor = 'transparent';

            // Make container transparent
            const container = document.querySelector('.container');
            if (container) {
                container.style.background = 'transparent';
                container.style.backgroundColor = 'transparent';
            }

            // Make screensaver container transparent
            const screensaverContainer = document.querySelector('.screensaver-container');
            if (screensaverContainer) {
                screensaverContainer.style.background = 'transparent';
                screensaverContainer.style.backgroundColor = 'transparent';
            }
        },

        hideLocalVideos: function () {
            // Hide all video backgrounds
            const videos = document.querySelectorAll('.video-bg, video.hero-background, #bg-ood, #bg-ooh, #bg-snacks');
            videos.forEach(v => {
                v.style.opacity = '0';
                v.style.display = 'none';
                v.pause();
            });
        },

        interceptNavigation: function () {
            // Override location.href assignments
            const self = this;

            // Only intercept if not already done (prevents 'Cannot redefine property' error)
            if (!window._locationIntercepted) {
                try {
                    // Store original location reference before overriding
                    window._originalLocation = document.location;

                    // Intercept window.location.href
                    Object.defineProperty(window, 'location', {
                        get: function () {
                            return window._originalLocation || document.location;
                        },
                        set: function (url) {
                            self.navigate(url);
                        },
                        configurable: true
                    });

                    window._locationIntercepted = true;
                } catch (e) {
                    // If already defined or cannot redefine, just log and continue
                    console.log('[ShellConnector] Location already intercepted or cannot redefine');
                }
            }

            // Intercept link clicks
            document.addEventListener('click', (e) => {
                const link = e.target.closest('a');
                if (link && link.href && link.href.includes('.html')) {
                    e.preventDefault();
                    const url = link.href.split('/').pop();
                    this.navigate(url);
                }
            });
        },

        // Navigation lock to prevent rapid navigation
        _navigating: false,

        navigate: function (url) {
            // Prevent rapid navigation
            if (this._navigating) {
                console.log('[ShellConnector] Navigation locked, ignoring:', url);
                return;
            }
            this._navigating = true;

            // Clear lock after 2 seconds (safety fallback)
            setTimeout(() => { this._navigating = false; }, 2000);

            // Extract filename from URL
            if (url.includes('/')) {
                url = url.split('/').pop();
            }

            console.log('[ShellConnector] Navigating to:', url);

            // Send message to parent shell
            window.parent.postMessage({
                type: 'navigate',
                url: url
            }, '*');
        },

        switchBackground: function (bgType) {
            console.log('[ShellConnector] Switching background:', bgType);
            window.parent.postMessage({
                type: 'switchBackground',
                background: bgType
            }, '*');
        }
    };

    // Global function for pages to use
    window.shellNavigate = function (url) {
        if (ShellConnector.isInShell) {
            ShellConnector.navigate(url);
        } else {
            window.location.href = url;
        }
    };

    window.shellSwitchBackground = function (bgType) {
        if (ShellConnector.isInShell) {
            ShellConnector.switchBackground(bgType);
        }
    };

    // Also override common navigation patterns
    window.navigateTo = window.shellNavigate;

    // Override PageTransition if it exists
    if (typeof PageTransition !== 'undefined') {
        PageTransition.navigateTo = window.shellNavigate;
    } else {
        window.PageTransition = {
            navigateTo: window.shellNavigate,
            init: function () { }
        };
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ShellConnector.init());
    } else {
        ShellConnector.init();
    }

    // Expose for debugging
    window.ShellConnector = ShellConnector;
})();
