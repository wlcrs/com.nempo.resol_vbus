"use strict";

const Homey = require("homey");

class ResolVbusApp extends Homey.App {
  async onInit() {
    this.log("Resol VBus app is starting...");
  }
}

module.exports = ResolVbusApp;
