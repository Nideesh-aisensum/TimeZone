/**
 * Global API Configuration
 * Handles API base URL resolution for file:// protocol vs server usage
 */
var API_BASE_URL = (window.location.protocol === 'file:')
    ? 'http://localhost:3000'
    : ''; // If served via HTTP, use relative paths (empty base)

/**
 * Get the full API URL for an endpoint
 * @param {string} endpoint - The API endpoint (e.g., '/api/offers')
 * @returns {string} Full URL
 */
function getApiUrl(endpoint) {
    // If it's already a full URL, return it
    if (endpoint.startsWith('http')) return endpoint;

    // Ensure endpoint starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;

    return `${API_BASE_URL}${cleanEndpoint}`;
}

console.log(`🔌 API Config loaded. Base URL: ${API_BASE_URL || 'Derived from Host'}`);
