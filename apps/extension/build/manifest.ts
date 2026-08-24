type ExtensionManifest = Record<string, unknown> & {
  host_permissions?: string[];
  key?: string;
  optional_host_permissions?: string[];
};

// Public test identity only. Keeping browser-E2E artifacts on one extension ID lets the harness
// address a dormant MV3 worker without making the worker target itself an identity authority.
const BROWSER_E2E_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsONTIernUY+dFQoW8yqnbtFWSSNH9byXSPLoox218XzDXbEq+' +
  'xSE497cum72A4FUCXIw4cWQpl4e20g9+w3M59WKM6nRh68M7FcnjhaDzWyt4FM1odgFT6Ih7/WUYbUkgRXmK+gVx/' +
  'jbPOyUXBhaISs3DLEicEehN1smuKum+hCkKEXhR3wkorgOAC4Kqb5Hg9GUBymqZsGopTZbh9pV0sB/nW9eP+MH3Et' +
  'JPR/nc1a2Ky2r8/2s3JO6tFqblA4kjVH1W9H/lEBH4DZpz9+pzk0Yhq1WIbWhlsvODy3tmdbs/QLGO2WTGmGVn+80' +
  'w0RPYVMxOvVdWaYoREagZKPeZQIDAQAB';

/** Grants all-sites only to the isolated E2E artifact so captureVisibleTab can run without a UI gesture. */
export function buildManifestForMode<TManifest extends ExtensionManifest>(
  source: TManifest,
  mode: string
): TManifest {
  const built = structuredClone(source);
  if (mode === 'test-e2e' || mode === 'security-e2e') {
    built.key = BROWSER_E2E_PUBLIC_KEY;
  }
  if (mode === 'test-e2e') {
    built.host_permissions = ['<all_urls>'];
    delete built.optional_host_permissions;
  }
  return built;
}
