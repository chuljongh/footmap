alert("DEBUG SYSTEM LOADED - If you see this, code is running!");

const DebugOverlay = {
    element: null,

    init() {
        if (this.element) return; // Prevention
        console.log("DebugOverlay init called");

        // Create Overlay Element
        this.element = document.createElement('div');
        this.element.id = 'debug-overlay';
        this.element.style.cssText = `
            position: fixed;
            top: 70px; /* Safe from status bar */
            left: 10px;
            background: rgba(0, 0, 0, 0.85);
            border: 3px solid #00ff00; /* High visibility border */
            color: #0f0;
            font-family: monospace;
            font-size: 14px; /* Larger font */
            padding: 10px;
            border-radius: 8px;
            z-index: 2147483647; /* Max Z-Index */
            pointer-events: none;
            max-width: 90%;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        `;

        this.element.innerHTML = `
            <div style="font-weight:bold; color:#fff; border-bottom:1px solid #555; padding-bottom:4px; margin-bottom:4px;">🛠️ SYSTEM MONITOR</div>
            <div id="debug-gps" style="color:#ffff00; margin-bottom: 2px;">GPS: Waiting...</div>
            <div id="debug-dist" style="font-size:16px; font-weight:bold; color:#fff; margin-bottom: 2px;">Dist: 0.0m</div>
            <div id="debug-status" style="margin-bottom: 2px;">Status: Ready</div>
            <div id="debug-sync" style="font-weight:bold">Sync: Idle</div>
        `;

        document.body.appendChild(this.element);
        console.log('Debug Overlay Injected into DOM');
    },

    update(data) {
        if (!this.element) this.init(); // Auto-recovery for late calls

        if (data.gps) {
            const { lat, lon, acc } = data.gps;
            const el = document.getElementById('debug-gps');
            if (el) el.innerHTML = `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)} <br> (±${Math.round(acc)}m)`;
        }

        if (data.dist !== undefined) {
             const el = document.getElementById('debug-dist');
             if (el) el.textContent = `Dist: ${data.dist.toFixed(1)}m`;
        }

        if (data.status) {
            const el = document.getElementById('debug-status');
            if (el) el.textContent = `Status: ${data.status}`;
        }

        if (data.sync) {
            const color = data.sync.includes('Fail') ? '#ff5555' : '#55ff55';
            const el = document.getElementById('debug-sync');
            if (el) {
                el.textContent = `Sync: ${data.sync}`;
                el.style.color = color;
            }
        }
    },

    log(msg) {
        if (!this.element) this.init();
        const el = document.getElementById('debug-status');
        if (el) el.textContent = `Log: ${msg}`;
    }
};

window.DebugOverlay = DebugOverlay;

// [Auto-Init] Ensure it runs even if App.js fails or loads late
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DebugOverlay.init());
} else {
    // If already loaded
    DebugOverlay.init();
}
