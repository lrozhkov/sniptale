import { writeJson } from '../../../test-support/test-helpers';

export function writeRuntimeTopology(root: string) {
  const runtimeDefaults = { entrypointFiles: [] };
  writeJson(root, 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json', [
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
