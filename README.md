# WaterGuard — Smart Water Leakage Detection System

WaterGuard is an industrial IoT water leakage detection solution consisting of an **Arduino UNO (ATmega328P)** embedded firmware running on **PlatformIO** and a modern, zero-dependency **Web Dashboard**. It monitors a digital water/moisture sensor (LM393 comparator probe module), applies configurable software debounce filtering, and streams real-time telemetry over USB Serial as newline-delimited JSON (NDJSON) at 9600 baud.

---

## 1. Hardware Requirements & Wiring

### Hardware Components
* **Arduino UNO** (ATmega328P, 16 MHz)
* **Water / Moisture Sensor Probe** with an **LM393 Blue Comparator Module**
* **Jumper Wires**
* **USB Type-A to Type-B Cable**

### Pinout & Wiring Table

| LM393 Sensor Pin | Arduino UNO Pin | Description |
| :--- | :--- | :--- |
| **VCC** | **5V** | 5V Power supply |
| **GND** | **GND** | Ground reference |
| **DO** | **D2** | Digital threshold output (monitored by firmware) |
| **AO** | *Disconnected* | Analog output (leave disconnected) |
| **Probe Headers** | **Probe Pins** | 2-pin terminal connecting module to the sensing PCB tracks |

> [!NOTE]
> The Arduino UNO's onboard LED on **Pin 13 (`LED_BUILTIN`)** automatically illuminates when a `LEAK` is detected, providing zero-cost visual feedback without extra components.

---

## 2. Software Architecture & Features

* **Configurable Active-State Polarity:** Easily toggle between active-`LOW` and active-`HIGH` logic via `WET_STATE_POLARITY`.
* **Configurable Debounce Filtering:** A non-blocking 50 ms time window (`DEBOUNCE_DELAY_MS`) suppresses false triggers caused by water ripples, splashes, or vibration.
* **Deterministic Memory Footprint:** Streams JSON telemetry directly using Flash strings (`F()` macro) with **zero dynamic heap allocation**, consuming only ~9.9% of SRAM (202 bytes) and ~8.1% of Flash (2602 bytes).
* **Newline-Delimited JSON (NDJSON):** Emits standard single-line JSON messages at ~1 Hz (9600 baud), ideal for serial loggers, Node-RED, Python scripts, or cloud bridges.

---

## 3. Disconnection Limitation Disclaimer

> [!IMPORTANT]
> **Sensor Disconnection Detection Limitation:**
> Standard 3-pin digital comparator modules (VCC, GND, DO) lack loopback diagnostics or impedance-sensing circuitry. If the DO wire is unplugged or severed, the input pin either floats or is held in a steady state, making physical disconnection electronically indistinguishable from a normal dry (or wet) state. Sensor disconnection cannot be reliably detected with this hardware setup alone.

---

## 4. Telemetry Format

Telemetry is published once per second over Serial (`9600` baud, `8N1`):

```json
{"type":"status","state":"NORMAL","sensor":1,"uptime":1000,"heartbeat":1}
{"type":"status","state":"LEAK","sensor":0,"uptime":2000,"heartbeat":2}
```

### JSON Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | string | Constant message type (`"status"`) |
| `state` | string | Detected operational state (`"NORMAL"` or `"LEAK"`) |
| `sensor` | integer | Raw digital reading sampled from pin D2 (`1` or `0`) |
| `uptime` | integer | System uptime in milliseconds (`millis()`) |
| `heartbeat`| integer | Incremental heartbeat message counter |

---

## 5. Sensor Polarity Testing & Sensitivity Tuning

### Testing Polarity
1. Connect the hardware and open the serial monitor.
2. Observe the `sensor` value when the probe is **completely dry**:
   * Most LM393 modules output `1` (HIGH) when dry.
3. Dip the probe tips into a small cup of water or touch them with a damp cloth:
   * The onboard DO indicator LED on the blue LM393 module should illuminate.
   * If the `sensor` value drops to `0` (LOW) when wet, the default polarity (`WET_STATE_POLARITY = LOW`) is correct.
4. **If your module outputs `1` when wet and `0` when dry:**
   * Open [src/main.cpp](file:///c:/Users/HP/OneDrive/Documents/PlatformIO/Projects/WaterLeakageDetection/src/main.cpp#L44-L49)
   * Change:
     ```cpp
     constexpr uint8_t WET_STATE_POLARITY = HIGH;
     ```
   * Recompile and upload.

### Sensitivity Calibration (Potentiometer)
The blue LM393 module contains a blue multi-turn trimmer potentiometer:
* **Clockwise / Counter-Clockwise Adjustment:** Turn the screw until the onboard DO LED just turns **OFF** when dry, and turns **ON** reliably as soon as moisture bridges the probe traces.

---

## 6. Build and Upload Instructions

### Prerequisites
* [PlatformIO IDE](https://platformio.org/) for VS Code **or** PlatformIO Core CLI (`pio`).

### Building Firmware
Open a terminal in the project directory and run:
```bash
pio run
```
*(On Windows PowerShell using PlatformIO penv: `& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run`)*

### Uploading to Arduino UNO
1. Connect the Arduino UNO to your PC with the USB cable.
2. Identify the assigned serial port:
   ```bash
   pio device list
   ```
3. Upload the firmware:
   ```bash
   pio run --target upload
   ```
   *(To target a specific port: `pio run --target upload --upload-port COM3`)*

### Opening Serial Monitor
Monitor output at 9600 baud:
```bash
pio device monitor -b 9600
```

---

## 7. Troubleshooting

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **Garbled text on Serial Monitor** | Baud rate mismatch | Ensure serial monitor is configured to `9600` baud (`monitor_speed = 9600`). |
| **Sensor always reports `LEAK`** | Sensitivity set too high, or inverted polarity | Adjust the blue potentiometer on the LM393 board counter-clockwise until DO LED turns off when dry; check `WET_STATE_POLARITY`. |
| **Sensor does not detect water** | Sensitivity set too low | Turn potentiometer clockwise until DO LED triggers upon water contact. Ensure probe wires are firmly seated in terminals. |
| **Rapid state flickering near water edge** | Contact bounce or ripple noise | Increase `DEBOUNCE_DELAY_MS` in [src/main.cpp](file:///c:/Users/HP/OneDrive/Documents/PlatformIO/Projects/WaterLeakageDetection/src/main.cpp#L39) (e.g., from `50` to `100` or `150`). |
| **Upload failed: `programmer not responding`** | Port in use or wrong port | Close any open serial monitors or terminal windows and verify the COM port in Device Manager. |

---

## 8. Web Dashboard (Phase 2)

The `dashboard/` directory contains a standalone, zero-dependency industrial IoT dashboard built with semantic HTML5, CSS3, and vanilla JavaScript.

### Opening the Dashboard
Open [dashboard/index.html](file:///c:/Users/HP/OneDrive/Documents/PlatformIO/Projects/WaterLeakageDetection/dashboard/index.html) in any modern web browser:
```powershell
Start-Process "c:\Users\HP\OneDrive\Documents\PlatformIO\Projects\WaterLeakageDetection\dashboard\index.html"
```
Or launch a local HTTP server:
```powershell
npx --yes serve dashboard
```

### Demonstration Controls & Features
* **Demo Mode by Default:** The dashboard launches with Demo Mode active, periodically generating simulated telemetry packets at 1 Hz.
* **Simulate Water Intrusion:** Click the **"Trigger Simulated Leak"** button to simulate water touching the probe. The UI transitions to the red pulsing alert state, logs an incident, and steps down the canvas logic timeline. Click **"Clear Simulated Leak"** to restore dry conditions.
* **Start / Stop / Reset:** Use **"Stop Demo"** to pause packet generation and clean up timers, **"Start Demo"** to resume, and **"Reset Demo"** to return to zeroed baseline state.
* **Clear Event History:** Click **"Clear History"** to display the confirmation dialog and clear the log table.

### Distinction: Simulated Demo Data vs. Live Readings
* Simulated data is explicitly tagged throughout the UI with yellow badges (`[SIMULATED DATA]`, `[SIMULATED DEMO DATA]`).
* Switching to the **"Live Hardware Mode"** tab halts the demo simulation and displays `LIVE HARDWARE: NOT CONFIGURED`. Simulated and live data are never mixed.

---

## 9. Serial-to-WebSocket Bridge & Live Hardware Streaming (Phase 3)

Phase 3 introduces a secure, local **Serial-to-WebSocket Bridge** located in [serial-bridge/](file:///c:/Users/HP/OneDrive/Documents/PlatformIO/Projects/WaterLeakageDetection/serial-bridge) to stream real-time JSON telemetry from the physical Arduino UNO to the dashboard.

```
+----------------+  USB Serial (9600)  +------------------------+  WebSocket (8080)  +------------------+
|  Arduino UNO   | ------------------> | Node.js Serial Bridge  | -----------------> | Web Dashboard    |
|  (ATmega328P)  |     (NDJSON)        | (serial-bridge/server) |      (JSON)        | (dashboard/ui)   |
+----------------+                     +------------------------+                    +------------------+
```

### 1. Prerequisites
* **Arduino UNO** connected to your computer via USB.
* **PlatformIO CLI / VS Code PlatformIO extension** installed.
* **Node.js** (v18 or higher; tested on Node.js v24).

### 2. Installing Bridge Dependencies
Open a PowerShell terminal in the project directory:
```powershell
cd serial-bridge
npm install
cd ..
```

### 3. Identifying the Arduino COM Port in Windows
You can identify the assigned COM port using either method:
* **Option A: Bridge Port Scanner**
  ```powershell
  node serial-bridge/server.js --list
  ```
* **Option B: Windows Device Manager**
  Press `Win + X` $\rightarrow$ select **Device Manager** $\rightarrow$ expand **Ports (COM & LPT)**. Look for **Arduino Uno (COMx)** or **USB-SERIAL CH340 (COMx)**. Note the port number (e.g., `COM3`, `COM4`).

### 4. Uploading Firmware to Arduino UNO
Ensure all serial monitors and serial bridge instances are closed before uploading:
```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run --target upload
```
*(If you need to target a specific port: `& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run --target upload --upload-port COM3`)*

### 5. Starting the Serial Bridge
* **Auto-Discovery Mode:**
  ```powershell
  cd serial-bridge
  npm start
  ```
* **Explicit Port Specification:**
  ```powershell
  node serial-bridge/server.js --port COM3
  ```
The bridge binds strictly to `127.0.0.1:8080` (localhost only) and logs incoming packets.

### 6. Opening the Dashboard with a Local HTTP Server
In a separate terminal window, launch a local HTTP server:
```powershell
npx --yes serve dashboard
```
Open your browser at `http://localhost:3000` (or directly double-click [dashboard/index.html](file:///c:/Users/HP/OneDrive/Documents/PlatformIO/Projects/WaterLeakageDetection/dashboard/index.html)).

### 7. Selecting Live Hardware Mode
1. In the dashboard header, click the **"Live Hardware Mode"** button.
2. The dashboard will automatically connect to `ws://127.0.0.1:8080`.
3. When the bridge is connected to your Arduino, the status pill turns green: `LIVE HARDWARE (COMx)`.
4. The timeline chart switches to `[LIVE STREAM (COMx)]`.

### 8. Testing Dry and Wet Sensor Conditions
1. **Dry Condition (Normal):**
   * Keep the probe dry on a non-conductive surface.
   * Observe the dashboard status: **NORMAL** (green).
   * Pin D2 shows `1 (HIGH - DRY)`.
   * Onboard Arduino Pin 13 LED remains OFF.
2. **Wet Condition (Leak Detected):**
   * Dip the sensing tips of the probe into a small cup of water or touch with a damp paper towel.
   * The LM393 module's digital output LED turns ON.
   * Arduino Pin 13 LED illuminates.
   * The dashboard transitions to **LEAK DETECTED** (pulsing red alert) within ~1 second.
   * The canvas chart steps down to `0 (WET)`.
   * An incident log is added to the Event History table.
3. **Recovery:**
   * Wipe the probe dry. The dashboard automatically returns to **NORMAL**.

### 9. Troubleshooting
* **Error `Access denied` or `Port in use`:**
  A COM port cannot be shared by two programs simultaneously. If you previously ran `pio device monitor`, close that monitor window before launching `server.js`.
* **Bridge reports `Bridge Offline` on dashboard:**
  Verify that the Node.js serial bridge process (`node serial-bridge/server.js`) is actively running on port 8080.
* **`STREAM STALLED` Warning:**
  If the Arduino stops transmitting for more than 3.5 seconds, the dashboard alerts that the telemetry stream has stalled. Verify that the Arduino's TX LED blinks once per second.
* **Inverted Reading (reports LEAK when dry):**
  Adjust the blue potentiometer on the LM393 module counter-clockwise. If your module hardware inverts logic, set `constexpr uint8_t WET_STATE_POLARITY = HIGH;` in [src/main.cpp](file:///c:/Users/HP/OneDrive/Documents/PlatformIO/Projects/WaterLeakageDetection/src/main.cpp#L48) and re-upload.
