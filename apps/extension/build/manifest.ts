type ExtensionManifest = Record<string, unknown> & {
  host_permissions?: string[];
  optional_host_permissions?: string[];
};

/** Grants all-sites only to the isolated E2E artifact so captureVisibleTab can run without a UI gesture. */
export function buildManifestForMode<TManifest extends ExtensionManifest>(
  source: TManifest,
  mode: string
): TManifest {
  const built = structuredClone(source);
  if (mode === 'test-e2e') {
    built.host_permissions = ['<all_urls>'];
    delete built.optional_host_permissions;
  }
  return built;
}
