"use strict";

const Homey = require("homey");
const VbusReader = require("../../lib/vbus-reader");

const RECONNECT_DELAY_MS = 30000;

class ResolVbusDevice extends Homey.Device {
  async onInit() {
    this.log("Resol VBus device initializing...");

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

    this._reader.on("data", (readings) => this._handleReadings(readings));

    this._reader.on("error", (err) => {
      this.error("VBus reader error:", err.message);
      this._scheduleReconnect();
    });

    this._reader.on("disconnect", () => {
      this.log("VBus disconnected");
      this._scheduleReconnect();
    });

    try {
      await this._reader.connect();
      this.log(
        `Connected to VBus at ${settings.host}:${settings.port || 7053}`,
      );
    } catch (err) {
      this.error("Failed to connect to VBus:", err.message);
      this._scheduleReconnect();
    }
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
        this.setCapabilityValue("alarm_generic.pump", readings.pumpActive),
      );
    }

    if (readings.pumpHours != null) {
      promises.push(
        this.setCapabilityValue("meter_pump_hours", readings.pumpHours),
      );
    }

    await Promise.all(promises);

    await this.setSettings({ last_seen: new Date().toLocaleString() });
  }
}

module.exports = ResolVbusDevice;
