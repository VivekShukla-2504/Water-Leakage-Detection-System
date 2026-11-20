/**
 * @file main.cpp
 * @brief WaterGuard - Smart Water Leakage Detection System
 * @target Arduino UNO (ATmega328P) via PlatformIO
 *
 * HARDWARE SETUP & WIRING:
 * - Sensor VCC  --> Arduino 5V
 * - Sensor GND  --> Arduino GND
 * - Sensor DO   --> Arduino Digital Pin D2
 * - Sensor AO   --> Leave disconnected (not used for digital threshold detection)
 * - Probe       --> Connected to the two screw/header terminals of the LM393 module
 * - Onboard LED --> Arduino Pin 13 (LED_BUILTIN): Lit when LEAK is detected
 *
 * SENSOR POLARITY CONFIGURATION:
 * - Most common LM393 comparator modules pull the DO pin LOW (0) when water completes
 *   the circuit on the probe, and maintain HIGH (1) when dry due to the onboard pull-up.
 * - If your sensor module behaves inversely (DO goes HIGH when wet), change
 *   `WET_STATE_POLARITY` below from LOW to HIGH.
 *
 * SENSOR DISCONNECTION LIMITATION:
 * - IMPORTANT: Standard 3-wire digital comparator modules (VCC, GND, DO) do NOT provide
 *   a loop-back or impedance-sensing mechanism. An unplugged or broken DO wire floats or
 *   gets pulled high/low, indistinguishable from a steady state. Therefore, physical
 *   disconnection CANNOT be detected with this hardware configuration alone.
 */

#include <Arduino.h>

// =============================================================================
// Configuration Constants
// =============================================================================

// Pin assignments
constexpr uint8_t SENSOR_PIN = 2;              // Digital input from LM393 comparator (DO)
constexpr uint8_t STATUS_LED_PIN = LED_BUILTIN; // Pin 13 onboard LED for visual leak alert

// Serial communication baud rate
constexpr unsigned long SERIAL_BAUD_RATE = 9600;

// Status reporting interval (milliseconds) - approximately once per second
constexpr unsigned long STATUS_INTERVAL_MS = 1000;

// Debounce / filter stabilization window (milliseconds)
// Helps prevent false triggers caused by water ripples, splashing, or mechanical contact bounce.
constexpr unsigned long DEBOUNCE_DELAY_MS = 50;

/**
 * Active wet-state polarity:
 * - Set to LOW  if your LM393 module pulls DO to 0V (LOW) when wet (most common).
 * - Set to HIGH if your module outputs 5V (HIGH) when wet.
 */
constexpr uint8_t WET_STATE_POLARITY = LOW;

// =============================================================================
// State Tracking Variables
// =============================================================================

// Debounce state tracking
uint8_t lastRawReading = HIGH;        // Previous raw sample from SENSOR_PIN
uint8_t debouncedSensorState = HIGH;  // Filtered digital state after debounce period
unsigned long lastDebounceTime = 0;   // Timestamp of last observed raw transition

// Periodic telemetry timing and heartbeat counter
unsigned long lastReportTime = 0;     // Timestamp of last transmitted JSON telemetry
uint32_t heartbeatCounter = 0;        // Incremental packet counter

// =============================================================================
// Setup
// =============================================================================

void setup() {
  // Initialize Serial interface
  Serial.begin(SERIAL_BAUD_RATE);

  // Configure digital inputs and outputs
  pinMode(SENSOR_PIN, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Sample initial state
  const uint8_t initialReading = digitalRead(SENSOR_PIN);
  lastRawReading = initialReading;
  debouncedSensorState = initialReading;
}

// =============================================================================
// Main Loop
// =============================================================================

void loop() {
  const unsigned long currentMillis = millis();

  // ---------------------------------------------------------------------------
  // 1. Digital Sensor Reading with Debounce Filtering
  // ---------------------------------------------------------------------------
  const uint8_t rawReading = digitalRead(SENSOR_PIN);

  // If the raw input toggled, reset the debounce qualification timer
  if (rawReading != lastRawReading) {
    lastDebounceTime = currentMillis;
    lastRawReading = rawReading;
  }

  // Once the raw reading has remained steady for at least DEBOUNCE_DELAY_MS,
  // accept it as the genuine debounced sensor state.
  if ((currentMillis - lastDebounceTime) >= DEBOUNCE_DELAY_MS) {
    debouncedSensorState = rawReading;
  }

  // Determine logical state based on configured polarity
  const bool isLeak = (debouncedSensorState == WET_STATE_POLARITY);

  // Visual indication using Arduino Uno's onboard LED (pin 13)
  digitalWrite(STATUS_LED_PIN, isLeak ? HIGH : LOW);

  // ---------------------------------------------------------------------------
  // 2. Periodic JSON Telemetry Transmission (NDJSON at ~1 Hz)
  // ---------------------------------------------------------------------------
  if (currentMillis - lastReportTime >= STATUS_INTERVAL_MS) {
    lastReportTime = currentMillis;
    heartbeatCounter++;

    // Stream newline-delimited JSON using Flash-stored strings to preserve SRAM.
    // Schema: {"type":"status","state":"NORMAL"|"LEAK","sensor":<0|1>,"uptime":<ms>,"heartbeat":<cnt>}
    Serial.print(F("{\"type\":\"status\",\"state\":\""));
    Serial.print(isLeak ? F("LEAK") : F("NORMAL"));
    Serial.print(F("\",\"sensor\":"));
    Serial.print(rawReading);
    Serial.print(F(",\"uptime\":"));
    Serial.print(currentMillis);
    Serial.print(F(",\"heartbeat\":"));
    Serial.print(heartbeatCounter);
    Serial.println(F("}"));
  }
}