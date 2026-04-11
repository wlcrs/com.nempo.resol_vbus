"use strict";

const Homey = require("homey");

class ResolVbusDriver extends Homey.Driver {
  async onInit() {
    this.log("Resol VBus driver initialized");
  }

  async onPairListDevices() {
    // Devices are added manually (no auto-discovery), so return an empty list.
    return [];
  }
}

module.exports = ResolVbusDriver;
