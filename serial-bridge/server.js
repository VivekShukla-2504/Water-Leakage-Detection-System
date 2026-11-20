/**
 * WaterGuard — Smart Water Leakage Detection System
 * Serial-to-WebSocket Local Bridge (Phase 3)
 *
 * Connects the Arduino UNO over USB Serial (9600 baud) and streams validated
 * telemetry frames to the WaterGuard dashboard via a local WebSocket server.
 *
 * Security & Reliability:
 * - Binds strictly to 127.0.0.1 (localhost only).
 * - Validates schema of every incoming JSON telemetry line.
 * - Auto-detects Arduino UNO or accepts explicit --port parameter.
 * - Handles serial port errors, disconnects, and auto-reconnects.
 */

'use strict';

const http = require('http');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { WebSocketServer, WebSocket } = require('ws');

// =============================================================================
// Configuration Constants
// =============================================================================

const DEFAULT_BAUD_RATE = 9600;
const DEFAULT_WS_PORT = 8080;
const BIND_HOST = '127.0.0.1'; // Localhost only - do not expose externally
const RECONNECT_INTERVAL_MS = 3000;
const STALE_DATA_THRESHOLD_MS = 3500; // Expected rate is ~1 Hz; 3.5s indicates stale stream

// Parse Command Line Arguments
const args = process.argv.slice(2);
let configuredPort = process.env.SERIAL_PORT || null;
let configuredBaud = parseInt(process.env.SERIAL_BAUD, 10) || DEFAULT_BAUD_RATE;
let configuredWsPort = parseInt(process.env.WS_PORT, 10) || DEFAULT_WS_PORT;
let shouldListPortsOnly = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' || arg === '-p') {
    configuredPort = args[++i];
  } else if (arg === '--baud' || arg === '-b') {
    configuredBaud = parseInt(args[++i], 10) || DEFAULT_BAUD_RATE;
  } else if (arg === '--ws-port' || arg === '-w') {
    configuredWsPort = parseInt(args[++i], 10) || DEFAULT_WS_PORT;
  } else if (arg === '--list' || arg === '-l') {
    shouldListPortsOnly = true;
  } else if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
}

function printHelp() {
  console.log(`
WaterGuard Serial-to-WebSocket Bridge
=====================================
Usage:
  node server.js [options]

Options:
  --port, -p <PORT>       Specify serial COM port (e.g., COM3, /dev/ttyACM0)
  --baud, -b <BAUD>       Serial baud rate (default: 9600)
  --ws-port, -w <PORT>    WebSocket server port (default: 8080)
  --list, -l              List available serial ports and exit
  --help, -h              Display this help message

Environment Variables:
  SERIAL_PORT             Target serial port name
  SERIAL_BAUD             Baud rate (default: 9600)
  WS_PORT                 WebSocket port (default: 8080)
`);
}

// =============================================================================
// Port Listing Mode
// =============================================================================

if (shouldListPortsOnly) {
  SerialPort.list().then(ports => {
    console.log('\n[WaterGuard] Scanning available serial ports:');
    if (ports.length === 0) {
      console.log('  No serial communication ports detected.');
    } else {
      ports.forEach((p, idx) => {
        console.log(`  [${idx + 1}] ${p.path}`);
        if (p.manufacturer) console.log(`      Manufacturer : ${p.manufacturer}`);
        if (p.vendorId)     console.log(`      USB VID:PID  : ${p.vendorId}:${p.productId}`);
        if (p.friendlyName) console.log(`      Name         : ${p.friendlyName}`);
      });
    }
    console.log('');
    process.exit(0);
  }).catch(err => {
    console.error('[WaterGuard] Error querying serial ports:', err.message);
    process.exit(1);
  });
  return;
}

// =============================================================================
// Application State
// =============================================================================

const state = {
  activePortPath: null,
  serialPort: null,
  parser: null,
  isSerialConnected: false,
  reconnectTimer: null,
  staleCheckTimer: null,
  lastTelemetryTimestamp: 0,
  lastValidTelemetry: null,
  totalPacketsReceived: 0,
  totalPacketsBroadcast: 0
};

// =============================================================================
// WebSocket Server (Bound to 127.0.0.1)
// =============================================================================

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WaterGuard Serial Bridge is active. Connect via WebSocket.');
});

const wss = new WebSocketServer({ server });

server.listen(configuredWsPort, BIND_HOST, () => {
  console.log(`[WaterGuard] WebSocket Bridge listening on ws://${BIND_HOST}:${configuredWsPort}`);
});

wss.on('connection', (ws, req) => {
  const clientAddr = req.socket.remoteAddress;
  console.log(`[WaterGuard] Dashboard client connected from ${clientAddr}`);

  // Send current bridge connection status immediately upon connection
  sendToClient(ws, getBridgeStatusPayload());

  // If we already have a recent valid telemetry packet, send it
  if (state.lastValidTelemetry && (Date.now() - state.lastTelemetryTimestamp < 5000)) {
    sendToClient(ws, state.lastValidTelemetry);
  }

  ws.on('close', () => {
    console.log('[WaterGuard] Dashboard client disconnected');
  });

  ws.on('error', (err) => {
    console.warn('[WaterGuard] Client socket error:', err.message);
  });
});

/**
 * Builds the bridge status JSON object
 */
function getBridgeStatusPayload(errorMessage = null) {
  const isStale = state.isSerialConnected && 
    state.lastTelemetryTimestamp > 0 && 
    (Date.now() - state.lastTelemetryTimestamp > STALE_DATA_THRESHOLD_MS);

  return {
    type: 'bridge_status',
    connected: state.isSerialConnected,
    isStale: isStale,
    port: state.activePortPath,
    baudRate: configuredBaud,
    packetsReceived: state.totalPacketsReceived,
    lastHeartbeat: state.lastValidTelemetry ? state.lastValidTelemetry.heartbeat : null,
    error: errorMessage
  };
}

/**
 * Broadcasts a JSON message to all connected WebSocket clients
 */
function broadcast(data) {
  const messageStr = JSON.stringify(data);
  let recipientCount = 0;

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
      recipientCount++;
    }
  });

  return recipientCount;
}

function sendToClient(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// =============================================================================
// Telemetry Validation
// =============================================================================

/**
 * Strictly verifies schema and datatypes of incoming Arduino telemetry
 * Expected format from src/main.cpp:
 * {"type":"status","state":"NORMAL"|"LEAK","sensor":<0|1>,"uptime":<ms>,"heartbeat":<cnt>}
 */
function validateTelemetry(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.type !== 'status') return false;
  if (obj.state !== 'NORMAL' && obj.state !== 'LEAK') return false;
  if (typeof obj.sensor !== 'number' || (obj.sensor !== 0 && obj.sensor !== 1)) return false;
  if (typeof obj.uptime !== 'number' || obj.uptime < 0) return false;
  if (typeof obj.heartbeat !== 'number' || obj.heartbeat < 0) return false;
  return true;
}

// =============================================================================
// Serial Port Management & Auto-Detection
// =============================================================================

/**
 * Discovers the Arduino port or uses configured port, then establishes connection
 */
async function connectSerial() {
  if (state.serialPort && state.serialPort.isOpen) {
    return;
  }

  // Clear any existing reconnect timer
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  let targetPort = configuredPort;

  // Auto-detect port if none explicitly supplied
  if (!targetPort) {
    try {
      const availablePorts = await SerialPort.list();
      if (availablePorts.length === 0) {
        console.warn('[WaterGuard] No serial COM ports detected on host. Retrying in 3s...');
        broadcast(getBridgeStatusPayload('No serial ports detected on host'));
        scheduleReconnect();
        return;
      }

      // Look for recognizable Arduino / CH340 / FTDI identifiers
      const arduinoPort = availablePorts.find(p => {
        const desc = `${p.manufacturer || ''} ${p.friendlyName || ''} ${p.path || ''}`.toLowerCase();
        return desc.includes('arduino') || desc.includes('ch340') || desc.includes('usb serial') || desc.includes('ftdi');
      });

      if (arduinoPort) {
        targetPort = arduinoPort.path;
        console.log(`[WaterGuard] Auto-detected Arduino device at ${targetPort} (${arduinoPort.manufacturer || 'USB Serial'})`);
      } else if (availablePorts.length === 1) {
        targetPort = availablePorts[0].path;
        console.log(`[WaterGuard] Using single available serial port: ${targetPort}`);
      } else {
        console.warn(`[WaterGuard] Multiple serial ports detected (${availablePorts.map(p => p.path).join(', ')}). Specify target with --port <PORT>`);
        broadcast(getBridgeStatusPayload('Multiple ports found. Specify port with --port <PORT>'));
        scheduleReconnect();
        return;
      }
    } catch (err) {
      console.error('[WaterGuard] Failed to scan serial ports:', err.message);
      scheduleReconnect();
      return;
    }
  }

  state.activePortPath = targetPort;
  console.log(`[WaterGuard] Opening serial port ${targetPort} at ${configuredBaud} baud...`);

  try {
    const port = new SerialPort({
      path: targetPort,
      baudRate: configuredBaud,
      autoOpen: false
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.open((err) => {
      if (err) {
        console.error(`[WaterGuard] Error opening ${targetPort}:`, err.message);
        state.isSerialConnected = false;
        broadcast(getBridgeStatusPayload(err.message));
        scheduleReconnect();
        return;
      }

      console.log(`[WaterGuard] Successfully connected to Arduino UNO on ${targetPort}`);
      state.serialPort = port;
      state.parser = parser;
      state.isSerialConnected = true;
      state.lastTelemetryTimestamp = Date.now();

      broadcast(getBridgeStatusPayload());
    });

    parser.on('data', (rawLine) => {
      handleIncomingLine(rawLine);
    });

    port.on('close', () => {
      console.warn(`[WaterGuard] Serial port ${state.activePortPath} was closed.`);
      state.isSerialConnected = false;
      broadcast(getBridgeStatusPayload('Serial connection closed'));
      scheduleReconnect();
    });

    port.on('error', (err) => {
      console.error(`[WaterGuard] Serial error on ${state.activePortPath}:`, err.message);
      state.isSerialConnected = false;
      broadcast(getBridgeStatusPayload(err.message));
      scheduleReconnect();
    });

  } catch (err) {
    console.error(`[WaterGuard] Exception initializing serial port ${targetPort}:`, err.message);
    state.isSerialConnected = false;
    broadcast(getBridgeStatusPayload(err.message));
    scheduleReconnect();
  }
}

/**
 * Parses and processes a single raw line received over Serial
 */
function handleIncomingLine(rawLine) {
  const line = String(rawLine).trim();
  if (!line) return;

  // Protect against bootloader or non-JSON chatter
  if (!line.startsWith('{') || !line.endsWith('}')) {
    return;
  }

  try {
    const parsed = JSON.parse(line);

    if (!validateTelemetry(parsed)) {
      console.warn('[WaterGuard] Ignored non-compliant telemetry payload:', line);
      return;
    }

    state.lastTelemetryTimestamp = Date.now();
    state.lastValidTelemetry = parsed;
    state.totalPacketsReceived++;

    // Broadcast directly to dashboard clients
    broadcast(parsed);
    state.totalPacketsBroadcast++;

  } catch (err) {
    // Malformed JSON (can occur if Arduino boots mid-sentence) - safely ignore
  }
}

/**
 * Schedules automatic reconnection attempt
 */
function scheduleReconnect() {
  if (state.reconnectTimer) return;

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectSerial();
  }, RECONNECT_INTERVAL_MS);
}

// =============================================================================
// Periodic Stale Data Monitor
// =============================================================================

state.staleCheckTimer = setInterval(() => {
  if (state.isSerialConnected) {
    const elapsed = Date.now() - state.lastTelemetryTimestamp;
    if (elapsed > STALE_DATA_THRESHOLD_MS && state.lastTelemetryTimestamp > 0) {
      // Telemetry stream paused/stalled
      broadcast(getBridgeStatusPayload('Hardware telemetry stream stalled'));
    }
  }
}, 1000);

// =============================================================================
// Graceful Process Termination
// =============================================================================

function shutdown() {
  console.log('\n[WaterGuard] Shutting down serial bridge...');

  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  if (state.staleCheckTimer) clearInterval(state.staleCheckTimer);

  if (state.serialPort && state.serialPort.isOpen) {
    state.serialPort.close(() => {
      console.log('[WaterGuard] Serial port closed.');
      closeServerAndExit();
    });
  } else {
    closeServerAndExit();
  }
}

function closeServerAndExit() {
  wss.close(() => {
    server.close(() => {
      console.log('[WaterGuard] Bridge terminated gracefully.');
      process.exit(0);
    });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Initialize connection
connectSerial();

