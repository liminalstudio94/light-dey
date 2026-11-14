// Registers a Light Dey Sensor and prints its credentials ONCE.
//   node --env-file=.env.local scripts/sensor-provision.mjs --area yaba --supply grid_direct
//   node --env-file=.env.local scripts/sensor-provision.mjs --revoke ldd_xxx
// --supply: grid_direct (wired to raw grid, before any generator changeover) | after_changeover | unknown
// Privacy: stores an anonymised id + neighbourhood only. Keep owner details OFF this system.
import { createHmac, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import postgres from "postgres";

const { values: a } = parseArgs({ options: { area: { type: "string" }, supply: { type: "string" }, provider: { type: "string" }, revoke: { type: "string" } } });
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL, { ssl: "require", prepare: false, max: 1 });
try {
  if (a.revoke) {
    const r = await sql`update lightdey.devices set revoked_at = now() where id = ${a.revoke} and revoked_at is null returning id`;
    console.log(r.length ? `Revoked ${a.revoke}` : "No active device with that id");
  } else {
    const master = process.env.SENSOR_MASTER_SECRET;
    if (!master || master.length < 32) throw new Error("SENSOR_MASTER_SECRET (min 32 chars) must be set — the same value as on the server");
    if (!["grid_direct", "after_changeover", "unknown"].includes(a.supply ?? "")) throw new Error("--supply must be grid_direct, after_changeover or unknown");
    const [area] = await sql`select id from lightdey.neighbourhoods where id = ${a.area ?? ""}`;
    if (!area) throw new Error("--area must be a known neighbourhood id (e.g. yaba)");
    const id = `ldd_${randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 24).padEnd(16, "0")}`;
    await sql`insert into lightdey.devices (id, neighbourhood_id, provider, supply_point) values (${id}, ${area.id}, ${a.provider ?? "light_dey_v1"}, ${a.supply})`;
    const secret = createHmac("sha256", master).update(`lightdey-device:v1:${id}`).digest("base64url");
    console.log(`Device registered in ${area.id} (${a.supply}).\nLIGHTDEY_DEVICE_ID=${id}\nLIGHTDEY_DEVICE_SECRET=${secret}\nPut these on the device only; they are not stored anywhere.`);
  }
} finally {
  await sql.end();
}
