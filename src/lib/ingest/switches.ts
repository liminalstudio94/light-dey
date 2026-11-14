/**
 * Kill switches. Setting SOURCE_*_ENABLED=0 stops fetching AND immediately removes that
 * source's already-stored evidence from every read, so a bad feed can be silenced at once.
 */
export const SOURCE_SWITCHES: Record<string, string> = {
  niso_niggrid: "SOURCE_NISO_ENABLED",
  ikeja_electric_notices: "SOURCE_IKEJA_NOTICES_ENABLED",
  ioda: "SOURCE_IODA_ENABLED",
};
/** Sources that stay OFF unless explicitly enabled (e.g. awaiting permission). */
const OPT_IN = new Set(["ioda"]);

export function isSourceEnabled(sourceId: string): boolean {
  const env = SOURCE_SWITCHES[sourceId];
  if (!env) return true;
  return OPT_IN.has(sourceId) ? process.env[env] === "1" : process.env[env] !== "0";
}
