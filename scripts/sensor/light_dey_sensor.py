#!/usr/bin/env python3
"""Light Dey Sensor — reference client for protocol v1 (see SENSORS.md).

Runs on a Raspberry Pi (or any Linux box) that can sense GRID mains, e.g. through an
opto-isolated mains-presence module on a GPIO pin, or a USB charger plugged into a raw grid
socket (not a generator/inverter output). Sends a signed heartbeat every --interval seconds.

Standard library only. Usage:
  LIGHTDEY_DEVICE_ID=ldd_... LIGHTDEY_DEVICE_SECRET=... \\
    python3 light_dey_sensor.py --url https://light-dey-pink.vercel.app --gpio 17 [--active-low]
  # or any command that prints on/off:
    python3 light_dey_sensor.py --url ... --mains-cmd "/usr/local/bin/read_mains"

Bench testing only: --test-mains on|off sends a fixed reading and is REFUSED unless --url is
localhost, so it can never put made-up readings on the live map.
"""
import argparse, hashlib, hmac, json, os, secrets, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

FIRMWARE = "ref-py-1.0"


def read_gpio(pin: int, active_low: bool) -> str:
    path = f"/sys/class/gpio/gpio{pin}/value"
    try:
        if not os.path.exists(path):
            with open("/sys/class/gpio/export", "w") as f:
                f.write(str(pin))
        with open(path) as f:
            high = f.read().strip() == "1"
        return "on" if (high != active_low) else "off"
    except OSError:
        return "unknown"


def read_cmd(cmd: str) -> str:
    try:
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10).stdout.strip().lower()
        return out if out in ("on", "off") else "unknown"
    except Exception:
        return "unknown"


def send(url: str, device_id: str, secret: str, mains: str, device_supply: str) -> int:
    """Returns the HTTP status, or 0 for a network/DNS/timeout failure (retried with backoff)."""
    body = json.dumps({
        "v": 1, "deviceId": device_id, "ts": int(time.time()), "nonce": secrets.token_urlsafe(18),
        # powerSource is what the Pi itself runs on — configured, never inferred from the mains reading.
        "mains": mains, "powerSource": device_supply, "firmware": FIRMWARE, "selfTest": "pass",
    }, separators=(",", ":"))
    sig = "v1=" + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(url.rstrip("/") + "/api/sensors/heartbeat", data=body.encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-LightDey-Signature": sig, "User-Agent": f"LightDeySensor/{FIRMWARE}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        print(f"{time.strftime('%H:%M:%S')} network error: {e}", file=sys.stderr, flush=True)
        return 0


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", required=True)
    p.add_argument("--interval", type=int, default=60)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--gpio", type=int)
    g.add_argument("--mains-cmd")
    g.add_argument("--test-mains", choices=["on", "off"], help="bench testing against localhost only")
    p.add_argument("--active-low", action="store_true")
    p.add_argument("--device-supply", choices=["ups", "battery", "grid", "unknown"], default="unknown",
                   help="what powers the Pi itself (e.g. 'ups' for the documented UPS build); never inferred from mains")
    p.add_argument("--once", action="store_true")
    a = p.parse_args()
    device_id, secret = os.environ.get("LIGHTDEY_DEVICE_ID"), os.environ.get("LIGHTDEY_DEVICE_SECRET")
    if not device_id or not secret:
        sys.exit("Set LIGHTDEY_DEVICE_ID and LIGHTDEY_DEVICE_SECRET")
    if a.test_mains and urllib.parse.urlparse(a.url).hostname not in ("localhost", "127.0.0.1"):
        sys.exit("--test-mains only works against localhost; real deployments must read real mains")
    delay = a.interval
    while True:
        mains = a.test_mains or (read_gpio(a.gpio, a.active_low) if a.gpio is not None else read_cmd(a.mains_cmd))
        status = send(a.url, device_id, secret, mains, a.device_supply)
        print(f"{time.strftime('%H:%M:%S')} mains={mains} -> HTTP {status}", flush=True)
        if a.once:
            sys.exit(0 if status == 202 else 1)
        # Back off on network errors (0), server errors and rate limiting; never send faster than allowed.
        delay = a.interval if status in (202, 409) else min(max(delay, a.interval) * 2, 600)
        time.sleep(max(delay, 20))


if __name__ == "__main__":
    main()
