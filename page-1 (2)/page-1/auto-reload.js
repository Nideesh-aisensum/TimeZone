/**
 * Auto-reload script for TIZO Kiosk
 * Polls the server every 5 seconds to check if a database sync has occurred.
 * If a sync occurred, reloads the page to show latest data.
 */

(function () {
    // Poll interval in milliseconds
    const POLL_INTERVAL = 5000;

    // Store the initial sync time
    let localLastSyncTime = null;

    async function checkSyncStatus() {
        try {
            // Use getApiUrl if available, otherwise fallback based on protocol
            let url;
            if (typeof getApiUrl === 'function') {
                url = getApiUrl('/api/last-sync-time');
            } else {
                const apiBase = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                url = `${apiBase}/api/last-sync-time`;
            }
            const response = await fetch(url);
            if (!response.ok) return;

            const data = await response.json();
            if (data.success && data.lastSyncTime) {
                // First check: initialize local state
                if (localLastSyncTime === null) {
                    localLastSyncTime = data.lastSyncTime;
                    console.log('✅ Auto-reload active. Initial sync time:', localLastSyncTime);
                    return;
                }

                // Subsequent checks: if server time is newer, reload
                if (data.lastSyncTime > localLastSyncTime) {
                    console.log('🔄 New data detected! Reloading page...');
                    // Update session storage to indicate a deliberate reload
                    sessionStorage.setItem('last_reload_reason', 'db_sync');
                    window.location.reload();
                }
            }
        } catch (err) {
            console.warn('Auto-reload poll failed:', err);
        }
    }

    // Start polling
    console.log('⏳ Starting auto-reload polling service...');
    setInterval(checkSyncStatus, POLL_INTERVAL);

    // Initial check immediately
    checkSyncStatus();
})();
