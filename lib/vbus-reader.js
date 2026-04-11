"use strict";

const { NetLiveTransceiver } = require("resol-vbus-core-nodejs");
const { specification } = require("resol-vbus-core-vsf");
const EventEmitter = require("events");

// Throttle interval in ms: only emit data events at most once per this interval
const THROTTLE_MS = 10000;

/**
 * VbusReader connects to a Resol VBus device via TCP (VBus/LAN or similar
 * adapter) and emits a 'data' event whenever new readings are available.
 *
 * It is intentionally agnostic of Homey; all Homey-specific code lives in
 * the driver/device layer.
 *
 * NetLiveTransceiver handles auto-reconnect internally on connection drops.
 *
 * Emitted events:
 *   'data'       – { solarTemperature, tankTemperature, pumpActive, pumpSpeed, pumpHours }
 *   'connect'    – when the TCP connection is established (including after auto-reconnect)
 *   'disconnect' – when explicitly disconnected via disconnect()
 */
class VbusReader extends EventEmitter {
  /**
   * @param {object} options
   * @param {string}   options.host               – hostname / IP of the VBus/LAN adapter
   * @param {number}  [options.port=7053]          – TCP port (default 7053)
   * @param {string}  [options.password='vbus']    – password for VBus-over-TCP
   * @param {object}  [options.fieldNames]         – override resolved VBus field names
   * @param {string}  [options.fieldNames.solarTemp='Temperature sensor 1']
   * @param {string}  [options.fieldNames.tankTemp='Temperature sensor 2']
   * @param {string}  [options.fieldNames.pumpSpeed='Pump speed relay 1']
   * @param {string}  [options.fieldNames.pumpHours='Operating hours relay 1']
   */
  constructor(options) {
    super();

    this._options = Object.assign({ port: 7053, password: "vbus" }, options);

    const fieldNames = options.fieldNames || {};
    this._fields = {
      solarTemp: fieldNames.solarTemp || "Temperature sensor 1",
      tankTemp: fieldNames.tankTemp || "Temperature sensor 2",
      pumpSpeed: fieldNames.pumpSpeed || "Pump speed relay 1",
      pumpHours: fieldNames.pumpHours || "Operating hours relay 1",
    };

    this._lastEmitTs = 0;
    this._transceiver = null;
    this._hasConnected = false;
  }

  /**
   * Start reading. Returns a Promise that resolves once the TCP handshake
   * is complete and data is flowing. Rejects on initial connection failure.
   * After the initial connection succeeds, NetLiveTransceiver handles
   * auto-reconnect internally.
   */
  connect() {
    const { host, port, password } = this._options;

    this._transceiver = new NetLiveTransceiver({
      socketOptions: { host, port },
      password,
      liveTransceiverOptions: {
        onPacket: (packet) => this._onPacket(packet),
      },
      onConnectionStateChange: (state) => {
        if (state === "connected") {
          this._hasConnected = true;
          this.emit("connect");
        } else if (state === "disconnected" && this._hasConnected) {
          this.emit("disconnect");
        }
      },
    });

    return this._transceiver.connect();
  }

  /** Disconnect from the VBus adapter. */
  disconnect() {
    if (this._transceiver) {
      return this._transceiver.disconnect();
    }
    return Promise.resolve();
  }

  _onPacket(packet) {
    const now = Date.now();
    if (now - this._lastEmitTs < THROTTLE_MS) {
      return;
    }

    const whitelist = Object.values(this._fields);
    const packetFields = specification.getPacketFieldsForHeaders([packet]);
    const rawValues = {};

    for (const field of packetFields) {
      const name = field.fieldSpec?.packetTemplateField?.name?.textEn;
      if (name && whitelist.includes(name)) {
        const value = field.getFloatRawValue();
        if (value != null) {
          rawValues[name] = value;
        }
      }
    }

    if (Object.keys(rawValues).length === 0) {
      return;
    }

    this._lastEmitTs = now;
    this.emit("data", this._mapReadings(rawValues));
  }

  _mapReadings(rawValues) {
    const readings = {};

    const solarTemp = rawValues[this._fields.solarTemp];
    if (solarTemp != null) {
      readings.solarTemperature = Math.round(solarTemp * 10) / 10;
    }

    const tankTemp = rawValues[this._fields.tankTemp];
    if (tankTemp != null) {
      readings.tankTemperature = Math.round(tankTemp * 10) / 10;
    }

    const pumpSpeed = rawValues[this._fields.pumpSpeed];
    if (pumpSpeed != null) {
      readings.pumpSpeed = pumpSpeed;
      readings.pumpActive = pumpSpeed > 0;
    }

    const pumpHours = rawValues[this._fields.pumpHours];
    if (pumpHours != null) {
      readings.pumpHours = Math.round(pumpHours);
    }

    return readings;
  }
}

module.exports = VbusReader;
