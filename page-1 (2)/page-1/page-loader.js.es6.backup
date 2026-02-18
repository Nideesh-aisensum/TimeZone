/**
 * Page Loader - Prevents content flash by hiding page until fully loaded
 * Include this script in <head> to ensure it runs before page renders
 */

// Immediately hide body to prevent flash
document.documentElement.style.visibility = 'hidden';
document.documentElement.style.opacity = '0';

// Add loading styles
const loaderStyles = document.createElement('style');
loaderStyles.id = 'page-loader-styles';
loaderStyles.textContent = `
    html {
        visibility: hidden;
        opacity: 0;
    }
    
    html.page-ready {
        visibility: visible !important;
        opacity: 1 !important;
        transition: opacity 0.3s ease-in-out;
    }
    
    .page-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 99999;
        transition: opacity 0.3s ease-out;
    }
    
    .page-loading-overlay.fade-out {
        opacity: 0;
        pointer-events: none;
    }
    
    .page-loading-spinner {
        width: 60px;
        height: 60px;
        border: 4px solid rgba(0, 255, 255, 0.2);
        border-top-color: #00ffff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(loaderStyles);

/**
 * Call this function when page is ready to show
 * @param {number} delay - Optional delay in ms before showing (default: 0)
 */
function showPage(delay = 0) {
    setTimeout(() => {
        document.documentElement.classList.add('page-ready');
        
        // Remove loading overlay if exists
        const overlay = document.querySelector('.page-loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }
    }, delay);
}

/**
 * Wait for all images to load
 * @returns {Promise} Resolves when all images are loaded
 */
function waitForImages() {
    const images = document.querySelectorAll('img');
    const promises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve; // Don't block on failed images
        });
    });
    return Promise.all(promises);
}

/**
 * Wait for background images to load
 * @returns {Promise} Resolves when background images are loaded
 */
function waitForBackgroundImages() {
    const elements = document.querySelectorAll('*');
    const promises = [];
    
    elements.forEach(el => {
        const style = getComputedStyle(el);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
            const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
            if (urlMatch && urlMatch[1]) {
                const img = new Image();
                promises.push(new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                    img.src = urlMatch[1];
                }));
            }
        }
    });
    
    return Promise.all(promises);
}

/**
 * Initialize page with loading - call this after all async data is loaded
 * @param {Object} options - Configuration options
 * @param {Function} options.onDataLoad - Async function that loads data (API calls, etc.)
 * @param {number} options.minLoadTime - Minimum time to show loader (prevents flash)
 */
async function initPageWithLoader(options = {}) {
    const { onDataLoad, minLoadTime = 200 } = options;
    
    const startTime = Date.now();
    
    try {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }
        
        // Load data if provided
        if (typeof onDataLoad === 'function') {
            await onDataLoad();
        }
        
        // Wait for images
        await waitForImages();
        
        // Ensure minimum load time to prevent flash
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadTime) {
            await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
        }
        
        // Show the page
        showPage();
        
    } catch (error) {
        console.error('Page load error:', error);
        // Show page anyway on error
        showPage();
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showPage, waitForImages, waitForBackgroundImages, initPageWithLoader };
}
