import path from 'node:path';

import {
  ADAPTER_OWNER_PATTERN,
  ENTRYPOINT_PATTERN,
  ORCHESTRATION_OWNER_PATTERNS,
} from './config.mjs';
import { getRuntimeTopology } from '../runtime-topology.mjs';

const RUNTIME_TOPOLOGY = [...getRuntimeTopology()].sort(
  (left, right) => right.root.length - left.root.length
);

const EFFECT_FAMILIES = [
  [
    'browser-privilege',
    /\b(?:chrome|browser)\.(?:tabs|downloads|scripting|debugger|permissions|identity|management|contextMenus)\b/u,
  ],
  ['messaging', /\b(?:sendMessage|postMessage|onMessage|runtime\.connect|BroadcastChannel)\b/u],
  [
    'persistence',
    /\b(?:indexedDB|localStorage|sessionStorage|storage\.|\.put\(|\.delete\(|\.save\(|\.persist\(|transaction\()\b/u,
  ],
  ['network', /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/u],
  [
    'dom-ui',
    /\b(?:document\.|setState|dispatch\(|classList\.|appendChild|removeChild|createElement|getElementById|querySelector)\b/u,
  ],
  [
    'media',
    /\b(?:MediaRecorder|getUserMedia|getDisplayMedia|AudioContext|HTMLVideoElement|captureStream)\b/u,
  ],
  [
    'timers-lifecycle',
    /\b(?:setTimeout|setInterval|requestAnimationFrame|addEventListener|removeEventListener|onMounted|useEffect)\b/u,
  ],
];

function normalize(value) {
  return value.replaceAll('\\', '/');
}

export function classifyOwnerGroup(relativePath) {
  const file = normalize(relativePath).replace(/^\.\//u, '');
  const parts = file.split('/');
  if (parts[0] === 'apps' && parts[1] === 'extension' && parts[2] === 'src') {
    const runtime = RUNTIME_TOPOLOGY.find(
      ({ root }) => file === root || file.startsWith(`${root}/`)
    );
    if (runtime) {
      const owner = file.slice(runtime.root.length + 1).split('/')[0] || 'root';
      return `extension:${runtime.id}:${owner}`;
    }
    return `extension:app-core:${parts[3] ?? 'root'}`;
  }
  if (parts[0] === 'packages') {
    return `package:${parts[1] ?? 'unknown'}:${parts[3] ?? 'root'}`;
  }
  if (parts[0] === 'tooling') {
    return `tooling:${parts[1] ?? 'root'}:${parts[2] ?? 'root'}`;
  }
  return `${parts[0] ?? 'root'}:${parts[1] ?? 'root'}`;
}

export function classifyImportedOwner(fromFile, moduleSpecifier) {
  if (moduleSpecifier.startsWith('@sniptale/')) {
    const [packageName, owner = 'root'] = moduleSpecifier.slice('@sniptale/'.length).split('/');
    return `package:${packageName}:${owner}`;
  }
  if (!moduleSpecifier.startsWith('.')) {
    return `external:${moduleSpecifier.split('/')[0]}`;
  }
  const resolved = normalize(
    path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), moduleSpecifier))
  );
  return classifyOwnerGroup(resolved);
}

export function isRegisteredOrchestrationOwner(relativePath) {
  const segments = normalize(relativePath).split('/');
  const isApplicationOwner =
    relativePath.startsWith('apps/extension/src/') && segments.includes('application');
  return (
    isApplicationOwner || ORCHESTRATION_OWNER_PATTERNS.some((pattern) => pattern.test(relativePath))
  );
}

export function classifyArchitecturalLayer(relativePath) {
  if (ADAPTER_OWNER_PATTERN.test(relativePath)) return 'adapter';
  if (isRegisteredOrchestrationOwner(relativePath)) return 'orchestration';
  if (
    /\.(?:tsx|jsx)$/u.test(relativePath) ||
    /(?:^|\/)(?:ui|shell|view|components?)\//u.test(relativePath)
  ) {
    return 'ui';
  }
  return 'default';
}

export function isEntrypointOwner(relativePath) {
  return ENTRYPOINT_PATTERN.test(relativePath);
}

export function classifyEffectFamily(text) {
  return EFFECT_FAMILIES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function collectEffectFamilies(text) {
  return [
    ...new Set(EFFECT_FAMILIES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)),
  ];
}
