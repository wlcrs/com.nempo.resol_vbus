"use strict";

const Homey = require("homey");
const VbusReader = require("../../lib/vbus-reader");

const RECONNECT_DELAY_MS = 30000;

class ResolVbusDevice extends Homey.Device {
  async onInit() {
    this.log("Resol VBus device initializing...");

    // Migrate devices paired before alarm_generic.pump was replaced by pump_active
    if (!this.hasCapability("pump_active")) {
      await this.addCapability("pump_active");
    }

    this._reader = null;
    this._reconnectTimer = null;

    await this._startReader();
  }

  async onSettings({ newSettings }) {
    this.log("Settings changed, reconnecting...");
    await this._stopReader();
    await this._startReader();
  }

  async onDeleted() {
    await this._stopReader();
  }

  // ---------------------------------------------------------------------------
  // Reader lifecycle
  // ---------------------------------------------------------------------------

  async _startReader() {
    const settings = this.getSettings();

    if (!settings.host) {
      this.log("No host configured, skipping connection");
      return;
    }

    const readerOptions = {
      host: settings.host,
      port: settings.port || 7053,
      password: settings.password || "vbus",
      fieldNames: {
        solarTemp: settings.solar_temp_field || "Temperature sensor 1",
        tankTemp: settings.tank_temp_field || "Temperature sensor 2",
        pumpSpeed: settings.pump_speed_field || "Pump speed relay 1",
        pumpHours: settings.pump_hours_field || "Operating hours relay 1",
      },
    };

    this._reader = new VbusReader(readerOptions);
    const reader = this._reader;

    this._reader.on("data", (readings) => this._handleReadings(readings));

    this._reader.on("connect", () => {
      this.log(
        `Connected to VBus at ${settings.host}:${settings.port || 7053}`,
      );
      this.setAvailable().catch((err) =>
        this.error("setAvailable failed:", err),
      );
    });

    this._reader.on("unavailable", () => {
      this.log("VBus connection lost, auto-reconnecting...");
      this.setUnavailable(
        this.homey.__("device.disconnected"),
      ).catch(() => {});
    });

    // Mark unavailable immediately while the initial connection is in progress
    await this.setUnavailable(this.homey.__("device.connecting")).catch(
      () => {},
    );

    // Start connecting without awaiting, so onInit doesn't block.
    // Initial connect failures are retried via _scheduleReconnect.
    // Mid-stream drops are retried automatically by NetLiveTransceiver.
    reader.connect().catch((err) => {
      if (this._reader !== reader) return; // reader was replaced (settings change)
      this.error("Failed to connect to VBus:", err.message);
      this._scheduleReconnect();
    });
  }

  async _stopReader() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._reader) {
      this._reader.removeAllListeners();
      try {
        await this._reader.disconnect();
      } catch (_) {
        // ignore errors on disconnect
      }
      this._reader = null;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this.log(`Scheduling reconnect in ${RECONNECT_DELAY_MS / 1000}s`);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      await this._stopReader();
      await this._startReader();
    }, RECONNECT_DELAY_MS);
  }

  // ---------------------------------------------------------------------------
  // Data handling
  // ---------------------------------------------------------------------------

  async _handleReadings(readings) {
    const promises = [];

    if (readings.solarTemperature != null) {
      promises.push(
        this.setCapabilityValue(
          "measure_temperature.solar",
          readings.solarTemperature,
        ),
      );
    }

    if (readings.tankTemperature != null) {
      promises.push(
        this.setCapabilityValue(
          "measure_temperature.tank",
          readings.tankTemperature,
        ),
      );
    }

    if (readings.pumpActive != null) {
      promises.push(
        this.setCapabilityValue("pump_active", readings.pumpActive),
      );
    }

    if (readings.pumpHours != null) {
      if (!this.hasCapability("meter_pump_hours")) {
        await this.addCapability("meter_pump_hours");
      }
      promises.push(
        this.setCapabilityValue("meter_pump_hours", readings.pumpHours),
      );
    }

    await Promise.all(promises);

    await this.setSettings({ last_seen: new Date().toLocaleString() });
  }
}

module.exports = ResolVbusDevice;
