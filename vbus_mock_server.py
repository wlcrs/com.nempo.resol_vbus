#!/usr/bin/env python3
"""
VBus-over-TCP mock server for testing the Resol VBus Homey driver.

Protocol summary (from RESOL VBus-over-TCP specification):
  1. Server sends:  +HELLO\\r\\n
  2. Client sends:  PASS <password>\\r\\n
  3. Server sends:  +OK\\r\\n
  4. Client sends:  DATA\\r\\n
  5. Server sends:  +OK\\r\\n
  6. Server streams binary VBus Protocol V1.0 packets continuously.

VBus Protocol V1.0 packet layout
─────────────────────────────────
  Byte  0     : 0xAA  (sync byte)
  Bytes 1–2   : destination address LE
  Bytes 3–4   : source address LE
  Byte  5     : protocol version (0x10)
  Bytes 6–7   : command LE  (0x0100 = regular data telegram)
  Byte  8     : number of frames
  Byte  9     : header checksum

  Per frame (6 bytes):
    Bytes 0–3 : data bytes with high bit cleared
    Byte  4   : septett  (collections of stripped high bits)
    Byte  5   : frame checksum

Device: Resol DeltaSol M (source address 0x7311, destination 0x0010, command 0x0100)
Byte layout (from resol-vbus specification database):
  Bytes  0– 1 : Temperature sensor 1  (int16 LE, factor 0.1 °C)
  Bytes  2– 3 : Temperature sensor 2  (int16 LE, factor 0.1 °C)
  Bytes  4– 5 : Temperature sensor 3  (int16 LE, factor 0.1 °C)
  Bytes  6– 7 : Temperature sensor 4  (int16 LE, factor 0.1 °C)
  Bytes  8– 9 : Temperature sensor 5  (int16 LE, factor 0.1 °C)
  Bytes 10–11 : Temperature sensor 6  (int16 LE, factor 0.1 °C)
  Bytes 12–13 : Temperature sensor 7  (int16 LE, factor 0.1 °C)
  Bytes 14–15 : Temperature sensor 8  (int16 LE, factor 0.1 °C)
  Bytes 16–17 : Temperature sensor 9  (int16 LE, factor 0.1 °C)
  Bytes 18–19 : Temperature sensor 10 (int16 LE, factor 0.1 °C)
  Bytes 20–21 : Temperature sensor 11 (int16 LE, factor 0.1 °C)
  Bytes 22–23 : Temperature sensor 12 (int16 LE, factor 0.1 °C)
  Bytes 24–25 : Irradiation
  Bytes 28–31 : Impulse input 1
  Bytes 32–35 : Impulse input 2
  Bytes 36–37 : Sensor line break mask
  Bytes 38–39 : Sensor short-circuit mask
  Bytes 40–41 : Sensor usage mask
  Byte  44    : Pump speed relay 1    (uint8, %)
  Bytes 45–52 : Pump speeds relay 2–9
  Bytes 58–59 : Relay usage mask
  Bytes 60–61 : Error mask
  Bytes 62–63 : Warning mask
  Bytes 64–65 : Controller version
  Bytes 66–67 : System time

  Total: 17 frames (68 bytes of decoded data)

NOTE: "Operating hours relay 1" does not exist in the DeltaSol M packet; it is
available on other controller models.  The Homey driver's field names are
configurable, so users can adapt them to their specific hardware.
"""

import socket
import struct
import threading
import time

HOST = "0.0.0.0"
PORT = 7053
PASSWORD = "vbus"
SEND_INTERVAL = 5  # seconds between packets

# Source / destination addresses for DeltaSol BS Plus
DEST_ADDR = 0x0010  # master station
SRC_ADDR = 0x7311  # DeltaSol BS Plus


def vbus_checksum(data: bytes) -> int:
    """Calculate VBus section checksum.

    The checksum byte is chosen so that (sum of all bytes in the section
    *including* the checksum) & 0x7F == 0x7F.
    Equivalently: checksum = (0x7F - (sum_of_data & 0x7F)) & 0x7F
    """
    total = sum(data) & 0x7F
    return (0x7F - total) & 0x7F


def encode_frame(b0: int, b1: int, b2: int, b3: int) -> bytes:
    """Encode four raw data bytes into a 6-byte VBus frame (data + septett + checksum)."""
    # Collect and strip high bits
    septett = (
        ((b0 >> 7) & 1)
        | (((b1 >> 7) & 1) << 1)
        | (((b2 >> 7) & 1) << 2)
        | (((b3 >> 7) & 1) << 3)
    )
    d = bytes([b0 & 0x7F, b1 & 0x7F, b2 & 0x7F, b3 & 0x7F, septett & 0x7F])
    return d + bytes([vbus_checksum(d)])


def build_packet(
    solar_temp_c: float,
    tank_temp_c: float,
    pump_speed_pct: int,
) -> bytes:
    """Build a 17-frame VBus packet for DeltaSol M (source 0x7311).

    Byte layout verified against the resol-vbus specification database:
      Bytes  0– 1 : Temperature sensor 1 (solar)
      Bytes  2– 3 : Temperature sensor 2 (tank)
      Bytes  4–43 : Other temperature sensors / irradiation / impulse inputs / masks (zeroed)
      Byte  44    : Pump speed relay 1
      Bytes 45–67 : Remaining relay/mask/version/time fields (zeroed)
    """
    # 17 frames × 4 decoded bytes = 68 bytes
    data = bytearray(17 * 4)  # all zeros initially

    def write_int16(offset: int, celsius: float):
        raw = int(round(celsius * 10)) & 0xFFFF
        data[offset] = raw & 0xFF
        data[offset + 1] = (raw >> 8) & 0xFF

    write_int16(0, solar_temp_c)
    write_int16(2, tank_temp_c)

    # Pump speed relay 1 at byte 44 (single byte, unsigned %)
    data[44] = max(0, min(100, int(round(pump_speed_pct)))) & 0xFF

    # Encode 17 frames
    frames = b"".join(
        encode_frame(data[i], data[i + 1], data[i + 2], data[i + 3])
        for i in range(0, 17 * 4, 4)
    )

    frame_count = 17
    header_payload = struct.pack(
        "<HHBHB",
        DEST_ADDR,
        SRC_ADDR,
        0x10,
        0x0100,
        frame_count,
    )
    checksum_byte = vbus_checksum(header_payload)
    header = b"\xaa" + header_payload + bytes([checksum_byte])

    return header + frames


def handle_client(conn: socket.socket, addr):
    print(f"[mock] Connection from {addr}")
    try:
        # Step 1: Send greeting
        conn.sendall(b"+HELLO\r\n")

        authenticated = False
        data_mode = False

        # Command loop
        buf = b""
        while not data_mode:
            chunk = conn.recv(256)
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip().decode("ascii", errors="replace")
                print(f"[mock] << {line!r}")

                if line.upper().startswith("PASS "):
                    pw = line[5:].strip()
                    if pw == PASSWORD:
                        authenticated = True
                        conn.sendall(b"+OK: Password accepted\r\n")
                        print("[mock] >> +OK: Password accepted")
                    else:
                        conn.sendall(b"-ERROR: Password rejected\r\n")
                        print("[mock] >> -ERROR: Password rejected")

                elif line.upper() == "DATA":
                    if not authenticated:
                        conn.sendall(b"-ERROR: Not authenticated\r\n")
                    else:
                        conn.sendall(b"+OK: Data incoming...\r\n")
                        print("[mock] >> +OK: Data incoming...")
                        data_mode = True

                elif line.upper() == "QUIT":
                    conn.sendall(b"+OK: Bye\r\n")
                    return

                else:
                    # Unknown command – acknowledge politely
                    conn.sendall(b"+OK\r\n")

        # Data streaming loop
        tick = 0
        while True:
            # Generate some varying test values
            solar_temp = 55.0 + (tick % 20)  # 55–74 °C
            tank_temp = 40.0 + (tick % 15)  # 40–54 °C
            # Pump off every 4th tick so the inactive state is exercised
            pump_speed = (
                0 if (tick % 4 == 3) else (100 if solar_temp > tank_temp + 5 else 0)
            )

            packet = build_packet(solar_temp, tank_temp, pump_speed)
            print(
                f"[mock] Sending packet: solar={solar_temp}°C  "
                f"tank={tank_temp}°C  pump={pump_speed}%"
            )
            conn.sendall(packet)
            tick += 1
            time.sleep(SEND_INTERVAL)

    except (BrokenPipeError, ConnectionResetError):
        print(f"[mock] Client {addr} disconnected")
    except Exception as exc:
        print(f"[mock] Error with {addr}: {exc}")
    finally:
        conn.close()


def main():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as srv:
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind((HOST, PORT))
        srv.listen(5)
        print(f"[mock] VBus mock server listening on {HOST}:{PORT}")
        print(
            f"[mock] Password: '{PASSWORD}'  –  sending packets every {SEND_INTERVAL}s"
        )
        while True:
            conn, addr = srv.accept()
            t = threading.Thread(target=handle_client, args=(conn, addr), daemon=True)
            t.start()


if __name__ == "__main__":
    main()
