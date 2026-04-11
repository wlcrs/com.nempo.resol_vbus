"use strict";

function addDevice() {
  const deviceName = document.getElementById("deviceName").value.trim();
  const host = document.getElementById("host").value.trim();
  const port = parseInt(document.getElementById("port").value, 10) || 7053;
  const password = document.getElementById("password").value;

  if (!deviceName) {
    document.getElementById("status").textContent = __("pair.errorNoName");
    return;
  }

  if (!host) {
    document.getElementById("status").textContent = __("pair.errorNoHost");
    return;
  }

  document.getElementById("status").textContent = "";
  Homey.showLoadingOverlay();

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

  Homey.createDevice(device, (err) => {
    Homey.hideLoadingOverlay();
    if (err) {
      document.getElementById("status").textContent =
        err.message || String(err);
    } else {
      Homey.done();
    }
  });
}
