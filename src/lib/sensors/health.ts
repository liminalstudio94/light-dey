import { SENSOR_CONFIG } from "../config";
import type { SensorState } from "../types";

export interface DeviceRow {
  deviceId: string;
  areaId: string;
  provider: string;
  supplyPoint: SensorState["supplyPoint"];
  lastHeartbeatAt: string | null;
  mains: SensorState["mains"] | null;
  powerSource: SensorState["powerSource"] | null;
  batteryPct: number | null;
  clockSkewS: number | null;
  selfTest: "pass" | "fail" | null;
  networkHash: string | null;
}

/**
 * Health is about whether we can trust the device's reading, not about electricity.
 * A silent device is "offline" — never an outage (it may have lost Wi-Fi or battery).
 */
export function deviceHealth(d: DeviceRow, now: number, cfg = SENSOR_CONFIG): { health: SensorState["health"]; reasons: string[] } {
  if (!d.lastHeartbeatAt) return { health: "offline", reasons: ["never reported"] };
  const ageMin = (now - Date.parse(d.lastHeartbeatAt)) / 60_000;
  if (ageMin > cfg.offlineMinutes) return { health: "offline", reasons: [`silent for ${Math.round(ageMin)} min`] };
  const reasons: string[] = [];
  if (ageMin > cfg.freshMinutes) reasons.push("heartbeat late");
  if (d.clockSkewS !== null && Math.abs(d.clockSkewS) > cfg.degradedClockSkewSeconds) reasons.push("device clock off");
  if (d.batteryPct !== null && d.batteryPct < cfg.lowBatteryPct && d.powerSource !== "grid") reasons.push("low battery");
  if (d.selfTest === "fail") reasons.push("self-test failed");
  if (d.mains === "unknown" || d.mains === null) reasons.push("mains reading unavailable");
  return { health: reasons.length ? "degraded" : "good", reasons };
}

export function toSensorState(d: DeviceRow, now: number): SensorState | null {
  if (!d.lastHeartbeatAt) return null;
  const h = deviceHealth(d, now);
  return {
    deviceId: d.deviceId,
    areaId: d.areaId,
    provider: d.provider,
    supplyPoint: d.supplyPoint,
    mains: d.mains ?? "unknown",
    powerSource: d.powerSource ?? "unknown",
    observedAt: d.lastHeartbeatAt,
    health: h.health,
    healthReasons: h.reasons,
    networkHash: d.networkHash ?? d.deviceId,
  };
}
