"use strict";

function addDevice() {
  const deviceName = document.getElementById("deviceName").value.trim();
  const host = document.getElementById("host").value.trim();
  const port = parseInt(document.getElementById("port").value, 10) || 7053;
  const password = document.getElementById("password").value;

  const statusEl = document.getElementById("status");

  if (!deviceName) {
    statusEl.style.color = "#c00";
    statusEl.textContent = __("pair.errorNoName");
    return;
  }

  if (!host) {
    statusEl.style.color = "#c00";
    statusEl.textContent = __("pair.errorNoHost");
    return;
  }

  statusEl.style.color = "#555";
  statusEl.textContent = __("pair.testingConnection");
  Homey.showLoadingOverlay();

  Homey.emit("testConnection", { host, port, password }, (err) => {
    if (err) {
      Homey.hideLoadingOverlay();
      statusEl.style.color = "#c00";
      statusEl.textContent = err.message || String(err);
      return;
    }

    const device = {
      name: deviceName,
      data: { id: `resol-vbus-${host}:${port}` },
      settings: {
        host,
        port,
        password,
        solar_temp_field: "Temperature sensor 1",
        tank_temp_field: "Temperature sensor 2",
        pump_speed_field: "Pump speed relay 1",
        pump_hours_field: "Operating hours relay 1",
      },
    };

    Homey.createDevice(device, (createErr) => {
      Homey.hideLoadingOverlay();
      if (createErr) {
        statusEl.style.color = "#c00";
        statusEl.textContent = createErr.message || String(createErr);
      } else {
        Homey.done();
      }
    });
  });
}
