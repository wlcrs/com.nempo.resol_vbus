#!/usr/bin/env node
/**
 * Test script: connects VbusReader to the Python mock server and prints readings.
 *
 * Usage:
 *   1. In one terminal:  python3 mock-server/vbus_mock_server.py
 *   2. In another:       node mock-server/test_client.js
 *
 * Prerequisites (run from the com.nempo.resol_vbus directory):
 *   npm install
 */

"use strict";

// Add the Homey app's node_modules to the search path when running standalone
const path = require("path");
const appDir = path.join(__dirname, "..", "com.nempo.resol_vbus");

// Allow require('resol-vbus') to resolve from the app's own node_modules
require("module").globalPaths.push(path.join(appDir, "node_modules"));

const VbusReader = require(path.join(appDir, "lib", "vbus-reader"));

const reader = new VbusReader({
  host: "127.0.0.1",
  port: 7053,
  password: "vbus",
});

reader.on("connect", () => console.log("[test] Connected to mock server"));
reader.on("disconnect", () => console.log("[test] Disconnected"));
reader.on("error", (err) => console.error("[test] Error:", err.message));
reader.on("data", (readings) => {
  console.log("[test] Readings received:");
  console.log(JSON.stringify(readings, null, 2));
});

console.log("[test] Connecting to 127.0.0.1:7053 ...");
reader.connect().catch((err) => {
  console.error("[test] Failed to connect:", err.message);
  process.exit(1);
});

// Keep process alive; Ctrl+C to stop
process.on("SIGINT", async () => {
  console.log("\n[test] Disconnecting...");
  await reader.disconnect();
  process.exit(0);
});
