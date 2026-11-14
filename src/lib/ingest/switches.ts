/**
 * Kill switches. Setting SOURCE_*_ENABLED=0 stops fetching AND immediately removes that
 * source's already-stored evidence from every read, so a bad feed can be silenced at once.
 */
export const SOURCE_SWITCHES: Record<string, string> = {
  niso_niggrid: "SOURCE_NISO_ENABLED",
  ikeja_electric_notices: "SOURCE_IKEJA_NOTICES_ENABLED",
};

export function isSourceEnabled(sourceId: string): boolean {
  const env = SOURCE_SWITCHES[sourceId];
  return !env || process.env[env] !== "0";
}
