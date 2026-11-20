/**
 * WATERGUARD // INDUSTRIAL SCADA CORE CONTROLLER
 * Real-Time Hardware Telemetry & Command Center
 * 
 * 100% Focused on Live Physical Arduino Hardware Stream
 * Connects directly to local WebSocket Serial Bridge (ws://127.0.0.1:8080)
 */

'use strict';

// =============================================================================
// Application State
// =============================================================================

const AppState = {
  // Operating Mode: Pure Live Hardware
  mode: 'live',

  // Audio System
  audioEnabled: true,
  audioCtx: null,
  alarmOscillator: null,

  // Live WebSocket Bridge Connection State
  ws: null,
  wsUrl: 'ws://127.0.0.1:8080',
  wsConnected: false,
  wsReconnectTimer: null,
  staleCheckTimer: null,
  lastLivePacketTimestamp: 0,
  bridgeStatus: {
    connected: false,
    isStale: false,
    port: null,
    baudRate: 9600,
    error: null
  },

  // Telemetry Cache
  telemetry: {
    type: 'status',
    state: 'NORMAL',
    sensor: 1,
    uptime: 0,
    heartbeat: 0,
    timestamp: null
  },

  // Operational Metrics
  stats: {
    totalPackets: 0,
    totalLeaks: 0,
    sessionStartTime: Date.now(),
    lastIncidentTime: null,
    previousState: 'NORMAL'
  },

  // Timeline Buffer for High-DPI Oscilloscope (max 35 data points)
  timelineBuffer: [],
  MAX_TIMELINE_POINTS: 35,

  // Event Chronology
  eventHistory: [],
  MAX_HISTORY_ENTRIES: 50,

  // Configuration Constants
  STALE_DATA_THRESHOLD_MS: 3500,
  WS_RECONNECT_INTERVAL_MS: 2500
};

// =============================================================================
// DOM Elements Cache
// =============================================================================

const DOM = {
  // Header & Audio
  liveTime: document.getElementById('liveTime'),
  liveMs: document.getElementById('liveMs'),
  liveDate: document.getElementById('liveDate'),
  systemStatusPill: document.getElementById('systemStatusPill'),
  systemStatusLabel: document.getElementById('systemStatusLabel'),
  systemStatusDot: document.getElementById('systemStatusDot'),
  liveUplinkText: document.getElementById('liveUplinkText'),
  btnAudioToggle: document.getElementById('btnAudioToggle'),
  audioStatusText: document.getElementById('audioStatusText'),

  // Alarms & Banners
  perimeterHazardStrobe: document.getElementById('perimeterHazardStrobe'),
  leakAlertMarquee: document.getElementById('leakAlertMarquee'),
  liveModeNotice: document.getElementById('liveModeNotice'),
  noticeTitle: document.getElementById('noticeTitle'),
  noticeDesc: document.getElementById('noticeDesc'),
  btnRetryConnection: document.getElementById('btnRetryConnection'),

  // Annunciator Hero Panel
  mainStatusCard: document.getElementById('mainStatusCard'),
  statusHeroTitle: document.getElementById('statusHeroTitle'),
  statusHeroAction: document.getElementById('statusHeroAction'),
  statusHeroIcon: document.getElementById('statusHeroIcon'),
  severityLevelVal: document.getElementById('severityLevelVal'),
  lastReadTimeLabel: document.getElementById('lastReadTimeLabel'),
  operatingStateVal: document.getElementById('operatingStateVal'),
  interventionVal: document.getElementById('interventionVal'),
  polarityVal: document.getElementById('polarityVal'),
  filterConfidenceVal: document.getElementById('filterConfidenceVal'),

  // Digital Twin Probe & Diagnostics
  probeTwinSvg: document.getElementById('probeTwinSvg'),
  twinWaterDroplets: document.getElementById('twinWaterDroplets'),
  twinStatusTag: document.getElementById('twinStatusTag'),
  sensorDiagSourceBadge: document.getElementById('sensorDiagSourceBadge'),
  valDigitalReading: document.getElementById('valDigitalReading'),
  badgeDigitalLogic: document.getElementById('badgeDigitalLogic'),
  valUptime: document.getElementById('valUptime'),
  valRawUptime: document.getElementById('valRawUptime'),
  valHeartbeat: document.getElementById('valHeartbeat'),

  // Oscilloscope
  timelineChart: document.getElementById('timelineChart'),
  chartContainer: document.getElementById('chartContainer'),
  chartSimulatedBadge: document.getElementById('chartSimulatedBadge'),
  chartDataCount: document.getElementById('chartDataCount'),

  // Mission Metrics
  statTotalLeaks: document.getElementById('statTotalLeaks'),
  statSessionDuration: document.getElementById('statSessionDuration'),
  statTotalPackets: document.getElementById('statTotalPackets'),
  statLastIncidentTime: document.getElementById('statLastIncidentTime'),
  btnExportLogs: document.getElementById('btnExportLogs'),

  // Hardware Controls
  btnReconnectBridge: document.getElementById('btnReconnectBridge'),
  btnToggleAudioAction: document.getElementById('btnToggleAudioAction'),
  btnFullscreenAction: document.getElementById('btnFullscreenAction'),

  // Event Table & Modal
  eventTableBody: document.getElementById('eventTableBody'),
  eventCountBadge: document.getElementById('eventCountBadge'),
  btnClearHistory: document.getElementById('btnClearHistory'),
  confirmClearModal: document.getElementById('confirmClearModal'),
  btnModalCancel: document.getElementById('btnModalCancel'),
  btnModalConfirm: document.getElementById('btnModalConfirm')
};

// =============================================================================
// Web Audio API Synthetic Sound Engine (Zero MP3s / Offline-Ready)
// =============================================================================

function getAudioContext() {
  if (!AppState.audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      AppState.audioCtx = new AudioCtxClass();
    }
  }
  if (AppState.audioCtx && AppState.audioCtx.state === 'suspended') {
    AppState.audioCtx.resume();
  }
  return AppState.audioCtx;
}

/**
 * Subtle telemetry heartbeat tick
 */
function playTelemetryBlip() {
  if (!AppState.audioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch (e) {}
}

/**
 * Industrial emergency warble siren
 */
function startAlarmSiren() {
  if (!AppState.audioEnabled || AppState.alarmOscillator) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(3, now);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(200, now);

    lfo.connect(osc.frequency);
    osc.connect(gain);

    gain.gain.setValueAtTime(0.07, now);
    gain.connect(ctx.destination);

    osc.start();
    lfo.start();

    AppState.alarmOscillator = { osc, lfo, gain };
  } catch (e) {}
}

function stopAlarmSiren() {
  if (AppState.alarmOscillator) {
    try {
      AppState.alarmOscillator.osc.stop();
      AppState.alarmOscillator.lfo.stop();
    } catch (e) {}
    AppState.alarmOscillator = null;
  }
}

function toggleAudio() {
  AppState.audioEnabled = !AppState.audioEnabled;
  if (!AppState.audioEnabled) {
    stopAlarmSiren();
    if (DOM.btnAudioToggle) {
      DOM.btnAudioToggle.classList.add('muted');
      const iconOn = DOM.btnAudioToggle.querySelector('.icon-audio-on');
      const iconOff = DOM.btnAudioToggle.querySelector('.icon-audio-off');
      if (iconOn) iconOn.classList.add('hidden');
      if (iconOff) iconOff.classList.remove('hidden');
    }
    if (DOM.audioStatusText) DOM.audioStatusText.textContent = 'AUDIO: MUTED';
    if (DOM.btnToggleAudioAction) DOM.btnToggleAudioAction.innerHTML = '<span class="btn-sym">&#128263;</span> UNMUTE SIREN';
  } else {
    if (DOM.btnAudioToggle) {
      DOM.btnAudioToggle.classList.remove('muted');
      const iconOn = DOM.btnAudioToggle.querySelector('.icon-audio-on');
      const iconOff = DOM.btnAudioToggle.querySelector('.icon-audio-off');
      if (iconOn) iconOn.classList.remove('hidden');
      if (iconOff) iconOff.classList.add('hidden');
    }
    if (DOM.audioStatusText) DOM.audioStatusText.textContent = 'AUDIO: ON';
    if (DOM.btnToggleAudioAction) DOM.btnToggleAudioAction.innerHTML = '<span class="btn-sym">&#128266;</span> MUTE SIREN';

    if (AppState.telemetry.state === 'LEAK') {
      startAlarmSiren();
    } else {
      playTelemetryBlip();
    }
  }
}

// =============================================================================
// Telemetry Ingestion Contract: handleTelemetry
// =============================================================================

function handleTelemetry(message) {
  if (!message || typeof message !== 'object') {
    console.warn('[WaterGuard] Rejected invalid payload:', message);
    return false;
  }

  if (message.type !== 'status') return false;
  if (message.state !== 'NORMAL' && message.state !== 'LEAK') return false;
  if (typeof message.sensor !== 'number' || (message.sensor !== 0 && message.sensor !== 1)) return false;
  if (typeof message.uptime !== 'number' || message.uptime < 0) return false;
  if (typeof message.heartbeat !== 'number' || message.heartbeat < 0) return false;

  AppState.lastLivePacketTimestamp = Date.now();

  if (DOM.liveModeNotice && !DOM.liveModeNotice.classList.contains('hidden') && AppState.bridgeStatus.connected) {
    DOM.liveModeNotice.classList.add('hidden');
  }

  processTelemetryData(message);
  return true;
}

window.handleTelemetry = handleTelemetry;

/**
 * Updates internal state and UI with a validated live telemetry object
 */
function processTelemetryData(data) {
  const now = Date.now();
  const isLeak = data.state === 'LEAK';
  const previousState = AppState.telemetry.state;

  AppState.telemetry = {
    type: data.type,
    state: data.state,
    sensor: data.sensor,
    uptime: data.uptime,
    heartbeat: data.heartbeat,
    timestamp: now
  };

  AppState.stats.totalPackets++;

  // Handle State Transitions & Siren Alerts
  if (previousState !== data.state) {
    if (isLeak) {
      AppState.stats.totalLeaks++;
      AppState.stats.lastIncidentTime = now;
      startAlarmSiren();
      logEvent('LEAK', data.sensor, 'CRITICAL: Liquid bridge detected across probe tracks (D2=0V)');
    } else {
      stopAlarmSiren();
      logEvent('NORMAL', data.sensor, 'NOMINAL: Probe circuit dried, nominal impedance restored');
    }
  } else {
    playTelemetryBlip();
  }

  // Push to high-speed timeline buffer
  AppState.timelineBuffer.push({
    time: now,
    state: data.state,
    sensor: data.sensor
  });

  if (AppState.timelineBuffer.length > AppState.MAX_TIMELINE_POINTS) {
    AppState.timelineBuffer.shift();
  }

  renderTelemetryUI();
  renderOscilloscope();
}

// =============================================================================
// UI Rendering Engine
// =============================================================================

function renderTelemetryUI() {
  const { state, sensor, uptime, heartbeat } = AppState.telemetry;
  const isLeak = state === 'LEAK';

  // 1. Annunciator & Hazard Alarms
  if (isLeak) {
    DOM.mainStatusCard.classList.remove('state-nominal');
    DOM.mainStatusCard.classList.add('state-hazard');
    DOM.statusHeroTitle.textContent = 'CRITICAL LEAK DETECTED';
    DOM.statusHeroAction.textContent = 'EMERGENCY PROTOCOL ACTIVATED: Liquid intrusion detected at Zone-01! Isolate main water valve immediately.';
    DOM.severityLevelVal.textContent = 'DEFCON 1 // IMMEDIATE HAZARD';
    DOM.severityLevelVal.style.color = 'var(--scada-hazard)';
    DOM.operatingStateVal.textContent = 'HAZARD ALARM ACTIVE';
    DOM.operatingStateVal.style.color = 'var(--scada-hazard)';
    DOM.interventionVal.textContent = 'VALVE ISOLATION REQ.';
    DOM.interventionVal.style.color = 'var(--scada-hazard)';

    // Icons
    DOM.statusHeroIcon.querySelector('.icon-nominal').classList.add('hidden');
    DOM.statusHeroIcon.querySelector('.icon-hazard').classList.remove('hidden');

    // Perimeter Hazard Flash & Marquee
    DOM.perimeterHazardStrobe.classList.remove('hidden');
    DOM.leakAlertMarquee.classList.remove('hidden');

    // Digital Twin Probe Visualizer
    DOM.twinWaterDroplets.classList.remove('hidden');
    DOM.twinStatusTag.textContent = 'WET // SHORT CIRCUIT [0V]';
    DOM.twinStatusTag.style.color = 'var(--scada-hazard)';
  } else {
    DOM.mainStatusCard.classList.remove('state-hazard');
    DOM.mainStatusCard.classList.add('state-nominal');
    DOM.statusHeroTitle.textContent = 'SYSTEM NOMINAL';
    DOM.statusHeroAction.textContent = 'Zero moisture detected across probe array. Environmental conditions within nominal thresholds.';
    DOM.severityLevelVal.textContent = 'DEFCON 5 // ALL CLEAR';
    DOM.severityLevelVal.style.color = 'var(--scada-nominal)';
    DOM.operatingStateVal.textContent = 'ACTIVE SURVEILLANCE';
    DOM.operatingStateVal.style.color = '#ffffff';
    DOM.interventionVal.textContent = 'AUTOMATED LOGGING';
    DOM.interventionVal.style.color = '#ffffff';

    // Icons
    DOM.statusHeroIcon.querySelector('.icon-nominal').classList.remove('hidden');
    DOM.statusHeroIcon.querySelector('.icon-hazard').classList.add('hidden');

    // Perimeter Hazard Flash & Marquee
    DOM.perimeterHazardStrobe.classList.add('hidden');
    DOM.leakAlertMarquee.classList.add('hidden');

    // Digital Twin Probe Visualizer
    DOM.twinWaterDroplets.classList.add('hidden');
    DOM.twinStatusTag.textContent = 'DRY AIR // OPEN CKT [5V]';
    DOM.twinStatusTag.style.color = 'var(--scada-nominal)';
  }

  DOM.lastReadTimeLabel.textContent = `REC: ${formatTime(new Date())} [NOMINAL]`;

  // 2. Hardware Diagnostics
  DOM.valDigitalReading.textContent = String(sensor);
  if (sensor === 1) {
    DOM.badgeDigitalLogic.textContent = 'HIGH // DRY';
    DOM.badgeDigitalLogic.className = 'logic-tag logic-high';
  } else {
    DOM.badgeDigitalLogic.textContent = 'LOW // WET';
    DOM.badgeDigitalLogic.className = 'logic-tag logic-low';
  }

  DOM.valUptime.textContent = formatDuration(uptime);
  DOM.valRawUptime.textContent = `${uptime} ms elapsed`;
  DOM.valHeartbeat.textContent = `#${String(heartbeat).padStart(5, '0')}`;

  // 3. Hardware Badges
  if (DOM.sensorDiagSourceBadge) {
    DOM.sensorDiagSourceBadge.textContent = 'HARDWARE STREAM';
    DOM.sensorDiagSourceBadge.style.color = 'var(--laser-cyan)';
  }
  if (DOM.chartSimulatedBadge) {
    const port = AppState.bridgeStatus.port || 'COM3';
    DOM.chartSimulatedBadge.textContent = `PHOSPHOR: LIVE [${port}]`;
  }

  // 4. Session Metrics
  DOM.statTotalLeaks.textContent = String(AppState.stats.totalLeaks);
  DOM.statTotalPackets.textContent = String(AppState.stats.totalPackets);
  DOM.statLastIncidentTime.textContent = AppState.stats.lastIncidentTime
    ? formatTime(AppState.stats.lastIncidentTime)
    : 'NONE RECORDED';
}

function renderUnconnectedLiveUI(customTitle = 'AWAITING ARDUINO UPLINK') {
  DOM.mainStatusCard.classList.remove('state-hazard');
  DOM.mainStatusCard.classList.add('state-nominal');
  DOM.statusHeroTitle.textContent = customTitle;
  DOM.statusHeroAction.textContent = 'Listening on ws://127.0.0.1:8080. Connect Arduino UNO via USB or start serial bridge.';
  DOM.severityLevelVal.textContent = 'STANDBY // DISCONNECTED';
  DOM.severityLevelVal.style.color = 'var(--text-muted)';
  DOM.operatingStateVal.textContent = 'OFFLINE STANDBY';
  DOM.interventionVal.textContent = 'START BRIDGE';

  DOM.valDigitalReading.textContent = '--';
  DOM.badgeDigitalLogic.textContent = 'STANDBY';
  DOM.badgeDigitalLogic.className = 'logic-tag';

  DOM.valUptime.textContent = '--:--:--';
  DOM.valRawUptime.textContent = 'No hardware feed';
  DOM.valHeartbeat.textContent = '#-----';

  DOM.twinWaterDroplets.classList.add('hidden');
  DOM.twinStatusTag.textContent = 'NO TELEMETRY STREAM';
  DOM.twinStatusTag.style.color = 'var(--text-muted)';

  renderOscilloscope();
}

// =============================================================================
// Digital Storage Oscilloscope (HTML5 Canvas)
// =============================================================================

function renderOscilloscope() {
  const canvas = DOM.timelineChart;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const yHigh = padTop + 15;
  const yLow = padTop + chartH - 15;

  // Reference Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(padLeft, yHigh);
  ctx.lineTo(width - padRight, yHigh);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padLeft, yLow);
  ctx.lineTo(width - padRight, yLow);
  ctx.stroke();

  // Voltage / Logic Labels
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('1 [5.0V]', padLeft - 8, yHigh);
  ctx.fillText('0 [0.0V]', padLeft - 8, yLow);

  ctx.textAlign = 'center';
  ctx.fillText('PHOSPHOR BEAM // HARDWARE LOGIC PIN D2', padLeft + chartW / 2, height - 12);

  const buffer = AppState.timelineBuffer;
  DOM.chartDataCount.textContent = `RING BUFFER: ${buffer.length} / ${AppState.MAX_TIMELINE_POINTS}`;

  if (buffer.length === 0) {
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.fillText('STANDBY: WAITING FOR HARDWARE TELEMETRY...', width / 2, height / 2);
    ctx.restore();
    return;
  }

  // High-Precision Digital Step Waveform
  const stepX = chartW / (AppState.MAX_TIMELINE_POINTS - 1);
  const startOffset = (AppState.MAX_TIMELINE_POINTS - buffer.length) * stepX;

  const isLeakNow = AppState.telemetry.state === 'LEAK';
  const beamColor = isLeakNow ? '#ff204e' : '#00f090';
  const glowColor = isLeakNow ? 'rgba(255, 32, 78, 0.6)' : 'rgba(0, 240, 144, 0.6)';

  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = beamColor;

  let currentY = buffer[0].sensor === 1 ? yHigh : yLow;
  let currentX = padLeft + startOffset;
  ctx.moveTo(currentX, currentY);

  for (let i = 0; i < buffer.length; i++) {
    const pt = buffer[i];
    const nextY = pt.sensor === 1 ? yHigh : yLow;
    const nextX = padLeft + startOffset + (i * stepX);

    ctx.lineTo(nextX, currentY);
    if (nextY !== currentY) {
      ctx.lineTo(nextX, nextY);
      currentY = nextY;
    }
  }

  ctx.stroke();
  ctx.shadowBlur = 0;

  // Nodes
  for (let i = 0; i < buffer.length; i++) {
    const pt = buffer[i];
    const nodeX = padLeft + startOffset + (i * stepX);
    const nodeY = pt.sensor === 1 ? yHigh : yLow;

    ctx.beginPath();
    ctx.arc(nodeX, nodeY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = pt.sensor === 1 ? '#00f090' : '#ff204e';
    ctx.fill();
  }

  ctx.restore();
}

// =============================================================================
// Live WebSocket Bridge Client
// =============================================================================

function connectWebSocket() {
  if (AppState.wsReconnectTimer) {
    clearTimeout(AppState.wsReconnectTimer);
    AppState.wsReconnectTimer = null;
  }

  if (AppState.ws && (AppState.ws.readyState === WebSocket.OPEN || AppState.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updateLiveStatusUI('connecting');

  try {
    const ws = new WebSocket(AppState.wsUrl);
    AppState.ws = ws;

    ws.onopen = () => {
      AppState.wsConnected = true;
      logEvent('SYSTEM', '--', `UPLINK ESTABLISHED: Serial Bridge at ${AppState.wsUrl}`);
      updateLiveStatusUI('bridge_connected_waiting_arduino');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'bridge_status') {
          handleBridgeStatus(payload);
        } else if (payload.type === 'status') {
          handleTelemetry(payload);
        }
      } catch (err) {
        console.warn('[WaterGuard] Malformed WebSocket frame:', err.message);
      }
    };

    ws.onclose = () => {
      AppState.wsConnected = false;
      AppState.ws = null;
      updateLiveStatusUI('bridge_disconnected');
      scheduleWsReconnect();
    };

    ws.onerror = () => {};

  } catch (err) {
    updateLiveStatusUI('bridge_disconnected');
    scheduleWsReconnect();
  }
}

function scheduleWsReconnect() {
  if (AppState.wsReconnectTimer) return;
  AppState.wsReconnectTimer = setTimeout(() => {
    AppState.wsReconnectTimer = null;
    connectWebSocket();
  }, AppState.WS_RECONNECT_INTERVAL_MS);
}

function handleBridgeStatus(status) {
  const previousConnection = AppState.bridgeStatus.connected;
  AppState.bridgeStatus = status;

  if (status.connected) {
    if (!previousConnection) {
      logEvent('SYSTEM', '--', `HARDWARE LINK ACTIVE: Arduino UNO on ${status.port} @ ${status.baudRate} 8N1`);
    }
    updateLiveStatusUI('live_hardware_ready');
  } else {
    if (previousConnection) {
      logEvent('SYSTEM', '--', `HARDWARE LINK SEVERED: Port ${status.port || 'COM'} closed`);
    }
    updateLiveStatusUI('bridge_connected_waiting_arduino');
  }
}

function updateLiveStatusUI(stage) {
  const portName = AppState.bridgeStatus.port || 'COM3';

  switch (stage) {
    case 'connecting':
      DOM.systemStatusPill.className = 'scada-status-pill pill-connecting';
      DOM.systemStatusLabel.textContent = 'CONNECTING UPLINK...';
      if (DOM.chartSimulatedBadge) DOM.chartSimulatedBadge.textContent = 'CONNECTING...';

      DOM.liveModeNotice.className = 'scada-banner notice-info';
      DOM.noticeTitle.textContent = 'Establishing WebSocket Uplink';
      DOM.noticeDesc.textContent = `Attempting local socket connection to ${AppState.wsUrl}...`;
      break;

    case 'bridge_connected_waiting_arduino':
      DOM.systemStatusPill.className = 'scada-status-pill pill-disconnected';
      DOM.systemStatusLabel.textContent = 'BRIDGE UP // NO ARDUINO';
      if (DOM.chartSimulatedBadge) DOM.chartSimulatedBadge.textContent = 'AWAITING ARDUINO';

      DOM.liveModeNotice.className = 'scada-banner';
      DOM.noticeTitle.textContent = 'Bridge Active: Awaiting Arduino UNO';
      DOM.noticeDesc.textContent = AppState.bridgeStatus.error ||
        'Local server is listening, but no Arduino UNO was detected on USB ports. Plug in Arduino and verify PlatformIO Serial Monitor is closed.';
      renderUnconnectedLiveUI('AWAITING ARDUINO');
      break;

    case 'live_hardware_ready':
      DOM.systemStatusPill.className = 'scada-status-pill pill-live-connected';
      DOM.systemStatusLabel.textContent = `LIVE LINK: ${portName}`;
      if (DOM.chartSimulatedBadge) DOM.chartSimulatedBadge.textContent = `PHOSPHOR: LIVE [${portName}]`;
      if (DOM.liveUplinkText) DOM.liveUplinkText.textContent = `LIVE HARDWARE LINK [${portName}]`;
      DOM.liveModeNotice.className = 'scada-banner hidden';
      break;

    case 'bridge_disconnected':
      DOM.systemStatusPill.className = 'scada-status-pill pill-disconnected';
      DOM.systemStatusLabel.textContent = 'BRIDGE OFFLINE';
      if (DOM.chartSimulatedBadge) DOM.chartSimulatedBadge.textContent = 'BRIDGE OFFLINE';

      DOM.liveModeNotice.className = 'scada-banner notice-danger';
      DOM.noticeTitle.textContent = 'Local Serial Bridge Offline';
      DOM.noticeDesc.textContent = `Cannot reach ${AppState.wsUrl}. Start bridge by running run-system.bat or: cd serial-bridge; npm start`;
      renderUnconnectedLiveUI('BRIDGE OFFLINE');
      break;

    case 'stale':
      DOM.systemStatusPill.className = 'scada-status-pill pill-stale';
      DOM.systemStatusLabel.textContent = `STREAM STALLED [${portName}]`;
      DOM.liveModeNotice.className = 'scada-banner notice-danger';
      DOM.noticeTitle.textContent = 'Telemetry Stream Stalled';
      DOM.noticeDesc.textContent = `No packets received in past ${Math.round((Date.now() - AppState.lastLivePacketTimestamp)/1000)}s. Check physical USB connection.`;
      break;
  }
}

function checkStaleData() {
  if (!AppState.bridgeStatus.connected) return;
  if (AppState.lastLivePacketTimestamp > 0) {
    const elapsed = Date.now() - AppState.lastLivePacketTimestamp;
    if (elapsed > AppState.STALE_DATA_THRESHOLD_MS) {
      updateLiveStatusUI('stale');
    }
  }
}

// =============================================================================
// Event Chronology & Exporting
// =============================================================================

function logEvent(state, sensorVal, description) {
  const event = {
    id: `EVT-${Math.floor(1000 + Math.random() * 9000)}`,
    time: formatTime(new Date()),
    state,
    sensor: sensorVal,
    source: 'HARDWARE_LINK',
    description
  };

  AppState.eventHistory.unshift(event);
  if (AppState.eventHistory.length > AppState.MAX_HISTORY_ENTRIES) {
    AppState.eventHistory.pop();
  }

  renderEventTable();
}

function renderEventTable() {
  const tbody = DOM.eventTableBody;
  if (!tbody) return;
  tbody.textContent = '';

  if (AppState.eventHistory.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'AWAITING HARDWARE TELEMETRY... CONNECT ARDUINO UNO VIA USB.';
    emptyRow.appendChild(td);
    tbody.appendChild(emptyRow);
    if (DOM.eventCountBadge) DOM.eventCountBadge.textContent = '0 LOGS';
    return;
  }

  if (DOM.eventCountBadge) DOM.eventCountBadge.textContent = `${AppState.eventHistory.length} LOGS`;

  AppState.eventHistory.forEach(item => {
    const tr = document.createElement('tr');
    if (item.state === 'LEAK') tr.classList.add('row-hazard');

    const tdTime = document.createElement('td');
    tdTime.textContent = item.time;
    tr.appendChild(tdTime);

    const tdState = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = item.state === 'LEAK'
      ? 'logic-tag logic-low'
      : item.state === 'NORMAL'
        ? 'logic-tag logic-high'
        : 'logic-tag';
    badge.textContent = item.state;
    tdState.appendChild(badge);
    tr.appendChild(tdState);

    const tdSensor = document.createElement('td');
    tdSensor.textContent = String(item.sensor);
    tr.appendChild(tdSensor);

    const tdSource = document.createElement('td');
    tdSource.textContent = item.source;
    tr.appendChild(tdSource);

    const tdDesc = document.createElement('td');
    tdDesc.textContent = item.description;
    tr.appendChild(tdDesc);

    tbody.appendChild(tr);
  });
}

function exportAuditLog() {
  if (AppState.eventHistory.length === 0) {
    alert('No telemetry records available to export.');
    return;
  }

  const exportData = {
    system: 'WaterGuard Industrial SCADA v3.4 [LIVE HARDWARE]',
    exportedAt: new Date().toISOString(),
    metrics: AppState.stats,
    events: AppState.eventHistory
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `waterguard_scada_audit_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// =============================================================================
// Time & Millisecond Clock Engine
// =============================================================================

function updateClocks() {
  const now = new Date();
  if (DOM.liveTime) DOM.liveTime.textContent = formatTime(now);
  if (DOM.liveMs) {
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    DOM.liveMs.textContent = `.${ms}`;
  }
  if (DOM.liveDate) {
    const isoDate = now.toISOString().split('T')[0];
    DOM.liveDate.textContent = `${isoDate} UTC+05:30`;
  }
  if (DOM.statSessionDuration) {
    const elapsed = Date.now() - AppState.stats.sessionStartTime;
    DOM.statSessionDuration.textContent = formatDuration(elapsed);
  }
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toTimeString().split(' ')[0];
}

function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return [hours, minutes, seconds]
    .map(val => String(val).padStart(2, '0'))
    .join(':');
}

// =============================================================================
// Event Listeners & Keyboard Shortcuts
// =============================================================================

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function bindEventListeners() {
  if (DOM.btnAudioToggle) DOM.btnAudioToggle.addEventListener('click', toggleAudio);
  if (DOM.btnToggleAudioAction) DOM.btnToggleAudioAction.addEventListener('click', toggleAudio);
  if (DOM.btnFullscreenAction) DOM.btnFullscreenAction.addEventListener('click', toggleFullscreen);

  if (DOM.btnReconnectBridge) {
    DOM.btnReconnectBridge.addEventListener('click', () => {
      connectWebSocket();
    });
  }

  if (DOM.btnRetryConnection) {
    DOM.btnRetryConnection.addEventListener('click', () => {
      connectWebSocket();
    });
  }

  if (DOM.btnExportLogs) DOM.btnExportLogs.addEventListener('click', exportAuditLog);

  if (DOM.btnClearHistory) {
    DOM.btnClearHistory.addEventListener('click', () => {
      if (typeof DOM.confirmClearModal.showModal === 'function') {
        DOM.confirmClearModal.showModal();
      } else {
        if (window.confirm('Confirm purge of all volatile event telemetry?')) {
          AppState.eventHistory = [];
          renderEventTable();
        }
      }
    });
  }

  if (DOM.btnModalCancel) DOM.btnModalCancel.addEventListener('click', () => DOM.confirmClearModal.close());
  if (DOM.btnModalConfirm) {
    DOM.btnModalConfirm.addEventListener('click', () => {
      AppState.eventHistory = [];
      renderEventTable();
      DOM.confirmClearModal.close();
    });
  }

  window.addEventListener('resize', () => renderOscilloscope());

  // Tactical Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // M: Toggle Mute
    if (e.key === 'm' || e.key === 'M') {
      toggleAudio();
    }
    // F: Toggle Fullscreen
    if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
    // R: Reconnect
    if (e.key === 'r' || e.key === 'R') {
      connectWebSocket();
    }
  });
}

function initDashboard() {
  bindEventListeners();
  updateClocks();
  setInterval(updateClocks, 100);

  renderOscilloscope();
  renderEventTable();
  renderTelemetryUI();

  // Directly connect to real Arduino hardware WebSocket bridge
  connectWebSocket();

  // Monitor stale telemetry
  AppState.staleCheckTimer = setInterval(checkStaleData, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
