# Resol VBus Solar Controller — Homey App

A read-only Homey SDK 3 integration for **Resol** and **Nau Solar** (Resol OEM) solar thermal controllers connected via a **VBus/LAN** adapter.

## Supported hardware

Any Resol controller that exposes a VBus-over-TCP stream on port 7053 should work. The app has been developed and tested against:

| Controller | Source address |
|---|---|
| Resol DeltaSol M / BS Plus | `0x7311` |

Field names are configurable in the device settings, so other controller models can be adapted without code changes.

## Requirements

- A **VBus/LAN** adapter (or any device that speaks the Resol VBus-over-TCP protocol on port 7053) connected to the same network as your Homey.
- Homey firmware **≥ 5.0.0**.

## Capabilities

| Capability | Description |
|---|---|
| Solar collector temperature | Temperature sensor 1 (°C) |
| Storage tank temperature | Temperature sensor 2 (°C) |
| Pump active | Alarm — true when pump speed > 0 % |
| Pump operating hours | Total pump run-time (h) |

> **Note:** *Pump operating hours* is not present in all controller models. The DeltaSol M (`0x7311`) packet does not include this field. If your controller does not expose it, the capability will simply never update.

## Installation

1. Add the app to Homey via the Homey App Store or the Homey CLI.
2. Open **Devices → Add device → Resol VBus Solar Controller**.
3. Enter the IP address (or hostname) of your VBus/LAN adapter and the password (default: `vbus`).
4. Homey will connect, start receiving data and add the device.

## Device settings

After pairing, the following settings are available under **Device settings**:

### Connection

| Setting | Default | Description |
|---|---|---|
| IP address / hostname | — | Address of the VBus/LAN adapter |
| TCP port | `7053` | VBus-over-TCP port |
| Password | `vbus` | Adapter password |

### Field mapping

The app matches VBus packet fields by their English name as defined in the Resol specification database. If your controller uses different field names, override them here.

| Setting | Default value |
|---|---|
| Solar temperature field name | `Temperature sensor 1` |
| Tank temperature field name | `Temperature sensor 2` |
| Pump speed field name | `Pump speed relay 1` |
| Pump hours field name | `Operating hours relay 1` |

To find the correct field names for your controller, use the `find_fields.js` helper in the `mock-server/` directory or consult the [Resol VBus specification](https://danielwippermann.github.io/resol-vbus/#/vsf).

## Architecture

```
VBus/LAN adapter (TCP :7053)
        │
        ▼
lib/vbus-reader.js          (EventEmitter wrapping NetLiveTransceiver)
        │  emits: data, connect, disconnect
        ▼
drivers/resol-vbus/device.js  (Homey Device — maps readings to capabilities)
```

**Dependencies:**
- [`resol-vbus-core-nodejs`](https://www.npmjs.com/package/resol-vbus-core-nodejs) — TCP live transceiver with built-in auto-reconnect
- [`resol-vbus-core-vsf`](https://www.npmjs.com/package/resol-vbus-core-vsf) — bundled Resol VBus specification (field name / unit database)

## Development

### Run the mock server

A Python mock server that emulates a DeltaSol M is provided for local testing:

```bash
python3 mock-server/vbus_mock_server.py
```

In a second terminal:

```bash
node mock-server/test_client.js
```

Expected output:

```json
{
  "solarTemperature": 55,
  "tankTemperature": 40,
  "pumpSpeed": 100,
  "pumpActive": true
}
```

### Deploy to Homey

```bash
homey app run      # live-reload onto a nearby Homey during development
homey app install  # install as a published app
```
