# WaterGuard — Serial-to-WebSocket Bridge (Phase 3)

A lightweight, secure local bridge that connects the **Arduino UNO** over USB Serial (9600 baud) and streams validated telemetry frames to the **WaterGuard Dashboard** via WebSockets (`ws://127.0.0.1:8080`).

---

## 1. Features

* **Strict Localhost Binding:** Binds strictly to `127.0.0.1` to ensure serial access is never exposed to external network interfaces.
* **Auto-Discovery:** Automatically scans for attached Arduino, CH340, FTDI, or USB-Serial devices, with fallback to an explicit `--port` parameter.
* **Schema Validation:** Verifies that every incoming newline-delimited JSON line contains valid `type`, `state`, `sensor`, `uptime`, and `heartbeat` fields before broadcasting.
* **Bridge Lifecycle Events:** Broadcasts `bridge_status` packets to inform dashboard clients when the serial port connects, closes, errors, or when the data stream becomes stale.
* **Auto-Reconnection:** Continuously monitors the serial link and attempts to reconnect every 3 seconds if the Arduino is unplugged or the port is temporarily unavailable.

---

## 2. Prerequisites

* **Arduino UNO** connected to your computer via USB.
* **PlatformIO CLI / VS Code PlatformIO extension** installed.
* **Node.js** v18+ (tested on Node.js v24 LTS).

---

## 3. Installation

Navigate to the `serial-bridge` directory and install dependencies:

```powershell
cd serial-bridge
npm install
```

Installed dependencies:
* `serialport`: Cross-platform low-level serial access.
* `@serialport/parser-readline`: Newline-delimited stream parser.
* `ws`: Minimal, high-performance WebSocket server.

---

## 4. End-to-End Setup & Usage

### Step 1: Identify Arduino COM Port in Windows
You can identify the assigned COM port using either method:
* **Option A: Bridge Port Scanner**
  ```powershell
  node server.js --list
  ```
* **Option B: Windows Device Manager**
  Press `Win + X` $\rightarrow$ select **Device Manager** $\rightarrow$ expand **Ports (COM & LPT)**. Look for **Arduino Uno (COMx)** or **USB-SERIAL CH340 (COMx)**. Note the port number (e.g., `COM3`, `COM4`).

### Step 2: Upload Firmware Using PlatformIO
Before running the serial bridge, ensure the firmware is uploaded to the board. Close any open serial monitors:
```powershell
cd ..
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run --target upload
```

### Step 3: Start the Serial Bridge
* **Auto-Discovery Mode:**
  ```powershell
  cd serial-bridge
  npm start
  ```
* **Explicit Port Specification:**
  ```powershell
  node server.js --port COM3
  ```
The bridge binds strictly to `127.0.0.1:8080` (localhost only) and logs incoming packets.

### Step 4: Open the Dashboard Using a Local HTTP Server
In a separate terminal window:
```powershell
npx --yes serve dashboard
```
Open `http://localhost:3000` in your web browser (or directly double-click [dashboard/index.html](file:///c:/Users/HP/OneDrive/Documents/PlatformIO/Projects/WaterLeakageDetection/dashboard/index.html)).

### Step 5: Select Live Hardware Mode
1. In the dashboard header, click **"Live Hardware Mode"**.
2. The dashboard connects to `ws://127.0.0.1:8080`.
3. When the bridge is connected to your Arduino, the status pill turns green: `LIVE HARDWARE (COMx)`.
4. The timeline chart switches to `[LIVE STREAM (COMx)]`.

### Step 6: Test Dry and Wet Sensor Conditions Safely
1. **Dry Condition (Normal):**
   * Keep probe dry on a non-conductive surface.
   * Dashboard displays **NORMAL** (green).
   * Pin D2 shows `1 (HIGH - DRY)`.
   * Onboard Arduino Pin 13 LED is OFF.
2. **Wet Condition (Leak Detected):**
   * Dip sensing tips of the probe into a small cup of water or touch with a damp paper towel.
   * The LM393 module's digital output LED turns ON.
   * Arduino Pin 13 LED illuminates.
   * Dashboard transitions to **LEAK DETECTED** (pulsing red alert) within ~1 second.
   * Canvas chart steps down to `0 (WET)`.
   * An incident log is added to the Event History table.
3. **Recovery:**
   * Wipe probe dry. Dashboard returns to **NORMAL**.

---

## 5. Command-Line Options & Environment Variables

| Option | Flag | Environment Variable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Port** | `--port`, `-p` | `SERIAL_PORT` | *Auto-detected* | Serial port name (e.g., `COM3`, `/dev/ttyACM0`) |
| **Baud Rate** | `--baud`, `-b` | `SERIAL_BAUD` | `9600` | Serial transmission speed in baud |
| **WS Port** | `--ws-port`, `-w`| `WS_PORT` | `8080` | WebSocket listener port on `127.0.0.1` |
| **List** | `--list`, `-l` | — | — | Print detected serial devices and exit |
| **Help** | `--help`, `-h` | — | — | Display help information |

---

## 6. Message Protocols

### 1. Telemetry Frame (Arduino -> Bridge -> Dashboard)
Emitted approximately once per second:
```json
{
  "type": "status",
  "state": "NORMAL",
  "sensor": 1,
  "uptime": 12000,
  "heartbeat": 12
}
```

### 2. Bridge Status Frame (Bridge -> Dashboard)
Emitted upon client connection and whenever link states change:
```json
{
  "type": "bridge_status",
  "connected": true,
  "isStale": false,
  "port": "COM3",
  "baudRate": 9600,
  "packetsReceived": 12,
  "lastHeartbeat": 12,
  "error": null
}
```

---

## 7. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `Access denied` or `Port in use` | Another program (e.g. PlatformIO Serial Monitor, Arduino IDE) has the port open. | Close the PlatformIO monitor or other serial tools before launching `server.js`. Only one application can access a COM port at a time. |
| `No serial communication ports detected` | Arduino UNO is not plugged in, or driver is missing. | Verify USB cable connection and check Windows Device Manager under "Ports (COM & LPT)". |
| `Hardware telemetry stream stalled` | Arduino stopped transmitting or power lost. | Check USB cable and ensure firmware is running. Verify TX LED on Arduino blinks once per second. |
| Inverted reading (reports LEAK when dry) | Module potentiometer threshold or polarity inverted. | Adjust blue potentiometer counter-clockwise. If module inverts output, set `WET_STATE_POLARITY = HIGH` in `src/main.cpp`. |

