"use strict";

const Homey = require("homey");
const { NetLiveTransceiver } = require("resol-vbus-core-nodejs");

class ResolVbusDriver extends Homey.Driver {
  async onInit() {
    this.log("Resol VBus driver initialized");
  }

  async onPairListDevices() {
    // Devices are added manually (no auto-discovery), so return an empty list.
    return [];
  }

  async onPair(session) {
    session.setHandler("testConnection", async ({ host, port, password }) => {
      const tx = new NetLiveTransceiver({
        socketOptions: { host, port: Number(port) || 7053 },
        password: password || "vbus",
        liveTransceiverOptions: {},
      });
      // connect() throws on TCP failure or wrong password; disconnect() cleans up
      await tx.connect();
      await tx.disconnect();
      return true;
    });
  }
}

module.exports = ResolVbusDriver;
