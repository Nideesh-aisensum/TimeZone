/**
 * Icon Handler - Converts base64 icons to filename-based URLs
 * This script handles icon loading from the corner-icons folder instead of base64 strings
 */

(function() {
    'use strict';

    // Base path for corner icons
    const CORNER_ICONS_PATH = '/corner-icons/';

    /**
     * Check if a string is a base64 image
     */
    function isBase64Image(str) {
        if (!str || typeof str !== 'string') return false;
        return str.startsWith('data:image/');
    }

    /**
     * Check if a string is already a valid icon URL (not base64)
     */
    function isValidIconUrl(str) {
        if (!str || typeof str !== 'string') return false;
        // Check if it's a corner-icons path or a regular image file
        return str.includes('/corner-icons/') || 
               (str.endsWith('.gif') && !str.startsWith('data:')) ||
               (str.endsWith('.png') && !str.startsWith('data:'));
    }

    /**
     * Normalize icon filename by removing spaces, hyphens, underscores and special characters
     * to match the new filename format (e.g., "hot choice.gif" -> "hotchoice.gif")
     */
    function normalizeIconFilename(filename) {
        if (!filename || typeof filename !== 'string') return '';
        // Remove spaces, hyphens, underscores, % characters
        return filename
            .replace(/ /g, '')       // Remove spaces
            .replace(/-/g, '')       // Remove hyphens
            .replace(/_/g, '')       // Remove underscores
            .replace(/%/g, '')       // Remove % characters
            .replace(/\s+/g, '');    // Remove any remaining whitespace
    }

    /**
     * Convert icon data to a proper URL
     * If it's a filename, return the full path
     * If it's base64, return empty (will hide the icon)
     * If it's already a valid URL, return as-is
     */
    function getIconUrl(iconData) {
        if (!iconData || iconData.trim() === '') {
            return '';
        }

        // If it's already a valid URL, normalize the filename part and return
        if (isValidIconUrl(iconData)) {
            // Extract and normalize the filename if it contains corner-icons path
            if (iconData.includes('/corner-icons/')) {
                const parts = iconData.split('/corner-icons/');
                const normalizedFilename = normalizeIconFilename(decodeURIComponent(parts[1]));
                return '/corner-icons/' + encodeURIComponent(normalizedFilename);
            }
            return iconData;
        }

        // If it's just a filename (no path), normalize and add the corner-icons path
        if (!iconData.includes('/') && !isBase64Image(iconData)) {
            const normalizedFilename = normalizeIconFilename(iconData);
            return CORNER_ICONS_PATH + encodeURIComponent(normalizedFilename);
        }

        // If it's base64, return empty to hide the icon
        if (isBase64Image(iconData)) {
            console.log('IconHandler: Skipping base64 image, returning empty');
            return '';
        }

        return iconData;
    }

    /**
     * Update badge icon element with proper URL
     */
    function updateBadgeIcon(element, iconData) {
        if (!element) return;

        const iconUrl = getIconUrl(iconData);
        
        if (iconUrl && iconUrl.trim() !== '') {
            element.src = iconUrl;
            element.style.display = '';
            element.classList.remove('badge-hidden');
        } else {
            // Hide the element if no valid icon
            element.style.display = 'none';
            element.classList.add('badge-hidden');
            element.src = '';
        }
    }

    /**
     * Clean up all base64 badge images on the page
     * Removes or hides any img elements with base64 src that are badge icons
     */
    function cleanupBase64Badges() {
        const badgeSelectors = [
            '.badge-icon',
            '.badge-top-left',
            '.badge-top-right', 
            '.badge-bottom-left',
            '.badge-bottom-right',
            '[class*="badge"]'
        ];

        badgeSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(img => {
                if (img.tagName === 'IMG' && isBase64Image(img.src)) {
                    console.log('IconHandler: Removing base64 badge image');
                    img.src = '';
                    img.style.display = 'none';
                    img.classList.add('badge-hidden');
                }
            });
        });
    }

    /**
     * Process offer data and update badge icons
     * @param {HTMLElement} cardElement - The card element to update
     * @param {Object} offer - The offer data from API
     */
    function updateOfferBadges(cardElement, offer) {
        if (!cardElement || !offer) return;

        // Remove existing badge icons first
        cardElement.querySelectorAll('.badge-icon').forEach(el => el.remove());

        const badgePositions = [
            { key: 'top_left_icon', className: 'badge-top-left' },
            { key: 'top_right_icon', className: 'badge-top-right' },
            { key: 'bottom_left_icon', className: 'badge-bottom-left' },
            { key: 'bottom_right_icon', className: 'badge-bottom-right' }
        ];

        badgePositions.forEach(({ key, className }) => {
            const iconData = offer[key];
            const iconUrl = getIconUrl(iconData);

            if (iconUrl && iconUrl.trim() !== '') {
                const badgeImg = document.createElement('img');
                badgeImg.src = iconUrl;
                badgeImg.alt = 'Badge';
                badgeImg.className = `badge-icon ${className}`;
                badgeImg.style.pointerEvents = 'none';
                cardElement.appendChild(badgeImg);
            }
        });
    }

    /**
     * Initialize icon handler - clean up any existing base64 images
     */
    function init() {
        // Clean up base64 badges on page load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', cleanupBase64Badges);
        } else {
            cleanupBase64Badges();
        }

        // Also clean up after a short delay to catch dynamically loaded content
        setTimeout(cleanupBase64Badges, 1000);
        setTimeout(cleanupBase64Badges, 3000);
    }

    // Expose functions globally
    window.IconHandler = {
        getIconUrl: getIconUrl,
        updateBadgeIcon: updateBadgeIcon,
        updateOfferBadges: updateOfferBadges,
        cleanupBase64Badges: cleanupBase64Badges,
        isBase64Image: isBase64Image,
        isValidIconUrl: isValidIconUrl,
        AVAILABLE_ICONS: AVAILABLE_ICONS,
        CORNER_ICONS_PATH: CORNER_ICONS_PATH
    };

    // Initialize
    init();

    console.log('IconHandler: Initialized - base64 icons will be converted to filename URLs');
})();
