# WaterGuard — Industrial IoT Dashboard (Phase 2)

A zero-dependency, modern industrial monitoring web dashboard for the **WaterGuard Smart Water Leakage Detection System**. Built with vanilla HTML5, CSS3, and JavaScript with HTML5 Canvas logic-level timeline visualization.

---

## 1. Features

- **Industrial Dark Navy Theme:** High-contrast design tailored for laboratory and industrial IoT monitoring.
- **Real-Time Digital Logic Timeline:** Custom HTML5 Canvas timing chart plotting pin D2 transitions (`1` = HIGH / Dry, `0` = LOW / Wet) over time.
- **Interactive Demonstration Mode:** Built-in simulation generator to demonstrate normal steady states, simulated leak events, debounce behavior, and real-time statistics without requiring physical hardware connected.
- **Telemetry Contract (`handleTelemetry`):** Fully prepared hook for Phase 3 serial integration with schema validation (`type`, `state`, `sensor`, `uptime`, `heartbeat`).
- **Safe DOM Operations:** Event logging and telemetry updates avoid unsafe `innerHTML` injection.
- **Strict Data Integrity:** Distinct separation between simulated demo data and live hardware feeds. When Live Mode is selected before Phase 3 is implemented, the dashboard displays an explicit `LIVE HARDWARE: NOT CONFIGURED` status.

---

## 2. File Structure

```text
dashboard/
├── index.html     # Semantic, accessible HTML structure
├── style.css      # Dark industrial IoT stylesheet with responsive grid & animations
├── script.js      # Vanilla ES6+ controller, canvas renderer, demo engine & validation
└── README.md      # Frontend documentation and testing instructions
```

---

## 3. How to Launch and View the Dashboard

Because the dashboard uses standard, vanilla web technologies with no build steps or bundlers, you can open it directly in any modern web browser (Chrome, Edge, Firefox, Safari):

### Option A: Direct File Launch
Double-click `dashboard/index.html` in your file explorer, or open it from PowerShell:
```powershell
Start-Process "c:\Users\HP\OneDrive\Documents\PlatformIO\Projects\WaterLeakageDetection\dashboard\index.html"
```

### Option B: Local Static Server (Node.js)
If you prefer running via a local HTTP server:
```powershell
npx --yes serve dashboard
```
Then navigate to `http://localhost:3000`.

---

## 4. Using Demo Mode

When opened, the dashboard initializes in **Demo Mode**:
1. **Periodic Telemetry:** Automatically produces 1 Hz simulated telemetry packets.
2. **Trigger Simulated Leak:** Click the red **"Trigger Simulated Leak"** button. The dashboard immediately:
   - Changes the hero status banner from green `NORMAL` to glowing pulsing red `SIMULATED LEAK DETECTED`.
   - Steps the digital logic line on the canvas chart from `1 (DRY)` down to `0 (WET)`.
   - Increments the total leak incidents counter.
   - Logs a timestamped `LEAK` incident entry into the scrollable Event History table.
3. **Restore Normal State:** Click the button again (**"Clear Simulated Leak"**) to restore the dry probe state.
4. **Pause / Resume:** Use **"Stop Demo"** to pause the simulation timer, and **"Start Demo"** to resume.
5. **Reset:** Click **"Reset Demo"** to clear the buffer, timers, and telemetry back to defaults.
6. **Clear Event History:** Click **"Clear History"** and confirm in the accessible modal dialog.

---

## 5. Live Mode & Phase 3 Integration

Clicking the **"Live Hardware Mode"** tab in the header:
- Automatically stops the demo generator and clears all simulation timers.
- Shows an informative warning banner: `Live Hardware Mode: Bridge Not Configured`.
- Sets the status indicator to `LIVE HARDWARE: NOT CONFIGURED`.
- Prevents fabricated or simulated data from ever being displayed as real sensor readings.

### Telemetry Ingestion Contract
In Phase 3, the Node.js serial bridge will deliver Arduino UNO JSON frames directly to:
```javascript
window.handleTelemetry({
  type: "status",
  state: "NORMAL", // or "LEAK"
  sensor: 1,       // 1 or 0
  uptime: 4500,    // ms
  heartbeat: 45    // packet count
});
```
The function rigorously verifies types and ranges before updating the UI.

