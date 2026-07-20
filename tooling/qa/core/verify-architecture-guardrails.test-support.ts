import { writeJson } from './test-helpers';

export function writeRuntimeTopology(root: string) {
  const runtimeDefaults = { docsMarkers: [], entrypointFiles: [] };
  writeJson(root, 'tooling/qa/core/runtime-topology.data.json', [
    { ...runtimeDefaults, id: 'background', root: 'apps/extension/src/background' },
    { ...runtimeDefaults, id: 'content', root: 'apps/extension/src/content' },
    { ...runtimeDefaults, id: 'video-editor', root: 'apps/extension/src/video-editor' },
    {
      ...runtimeDefaults,
      id: 'web-snapshot-viewer',
      root: 'apps/extension/src/web-snapshot-viewer',
    },
  ]);
  writeJson(root, 'package.json', { name: 'architecture-guardrails-temp', type: 'module' });
}
