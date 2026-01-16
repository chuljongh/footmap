const DebugOverlay = {
    element: null,

    init() {
        // Create Overlay Element
        this.element = document.createElement('div');
        this.element.id = 'debug-overlay';
        this.element.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #0f0;
            font-family: monospace;
            font-size: 12px;
            padding: 8px;
            border-radius: 5px;
            z-index: 9999;
            pointer-events: none;
            max-width: 80%;
            word-wrap: break-word;
        `;

        this.element.innerHTML = `
            <div style="font-weight:bold; color:#fff; margin-bottom:4px;">🛠️ Debug Mode</div>
            <div id="debug-gps">GPS: Waiting...</div>
            <div id="debug-dist">Dist: 0.0m</div>
            <div id="debug-status">Status: Init</div>
            <div id="debug-sync">Sync: -</div>
        `;

        document.body.appendChild(this.element);
    },

    update(data) {
        if (!this.element) return;

        if (data.gps) {
            const { lat, lon, acc } = data.gps;
            document.getElementById('debug-gps').innerHTML =
                `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)} <br> (±${Math.round(acc)}m)`;
        }

        if (data.dist !== undefined) {
             document.getElementById('debug-dist').textContent =
                `Dist: ${data.dist.toFixed(1)}m`;
        }

        if (data.status) {
            document.getElementById('debug-status').textContent = `Status: ${data.status}`;
        }

        if (data.sync) {
            const color = data.sync.includes('Fail') ? '#ff5555' : '#55ff55';
            const el = document.getElementById('debug-sync');
            el.textContent = `Sync: ${data.sync}`;
            el.style.color = color;
        }
    },

    log(msg) {
        if (!this.element) return;
        document.getElementById('debug-status').textContent = `Log: ${msg}`;
    }
};

window.DebugOverlay = DebugOverlay;
