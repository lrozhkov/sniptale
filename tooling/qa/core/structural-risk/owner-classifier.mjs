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

const DIRECT_PERSISTENCE_CALLEE_ROOTS = [
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'caches',
  'storage',
  'chrome.storage',
  'browser.storage',
  'window.indexedDB',
  'window.localStorage',
  'window.sessionStorage',
  'window.caches',
  'globalThis.indexedDB',
  'globalThis.localStorage',
  'globalThis.sessionStorage',
  'globalThis.caches',
];
const PERSISTENCE_RECEIVER_TOKEN_PATTERN = /[A-Za-z_$][\w$]*/gu;
const PERSISTENCE_RECEIVER_NAMES = new Set([
  'db',
  'database',
  'objectStore',
  'persistence',
  'repo',
  'repository',
  'store',
]);
const PERSISTENCE_RECEIVER_SUFFIX_PATTERN =
  /(?:DB|Db|Database|ObjectStore|Persistence|Repo|Repository|Storage|Store)$/u;
const PERSISTENCE_MUTATION_METHODS = new Set(['delete', 'persist', 'put', 'save', 'transaction']);

function compactCallText(text) {
  return text.replaceAll(/\s+/gu, '');
}

function persistenceMutationReceiver(text) {
  const compact = compactCallText(text);
  let receiverEnd = -1;
  for (const method of PERSISTENCE_MUTATION_METHODS) {
    receiverEnd = Math.max(
      receiverEnd,
      compact.lastIndexOf(`.${method}(`),
      compact.lastIndexOf(`?.${method}(`)
    );
  }
  return receiverEnd < 0 ? null : compact.slice(0, receiverEnd);
}

function consumeQuotedCharacter(state, character) {
  if (state.quote === null) {
    if (`'"\``.includes(character)) state.quote = character;
    return state.quote !== null;
  }
  if (state.escaped) state.escaped = false;
  else if (character === '\\') state.escaped = true;
  else if (character === state.quote) state.quote = null;
  return true;
}

function sourceWithoutQuotedContents(text) {
  const quoteState = { escaped: false, quote: null };
  let unquoted = '';
  for (const character of text) {
    if (!consumeQuotedCharacter(quoteState, character)) unquoted += character;
  }
  return unquoted;
}

function collectSimpleCallCallees(text) {
  const source = sourceWithoutQuotedContents(text);
  const callees = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '(') continue;
    let cursor = index - 1;
    while (/\s/u.test(source[cursor] ?? '')) cursor -= 1;
    const end = cursor + 1;
    while (/[A-Za-z0-9_$?.]/u.test(source[cursor] ?? '')) cursor -= 1;
    const callee = source.slice(cursor + 1, end);
    if (/^[A-Za-z_$]/u.test(callee)) callees.push(callee.replaceAll('?.', '.'));
  }
  return callees;
}

function hasDirectPersistenceCall(text) {
  return collectSimpleCallCallees(text).some((callee) =>
    DIRECT_PERSISTENCE_CALLEE_ROOTS.some((root) => callee === root || callee.startsWith(`${root}.`))
  );
}

function receiverChainText(receiver) {
  let depth = 0;
  const quoteState = { escaped: false, quote: null };
  let outsideArguments = '';
  for (const character of receiver) {
    if (consumeQuotedCharacter(quoteState, character)) continue;
    if (character === '(' || character === '[') {
      depth += 1;
      continue;
    }
    if (character === ')' || character === ']') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) outsideArguments += character;
  }
  return outsideArguments;
}

function hasPersistenceReceiver(receiver) {
  PERSISTENCE_RECEIVER_TOKEN_PATTERN.lastIndex = 0;
  return Array.from(
    receiverChainText(receiver).matchAll(PERSISTENCE_RECEIVER_TOKEN_PATTERN),
    ([token]) => token
  ).some(
    (token) =>
      PERSISTENCE_RECEIVER_NAMES.has(token) || PERSISTENCE_RECEIVER_SUFFIX_PATTERN.test(token)
  );
}

function hasPersistenceEffect(text) {
  const receiver = persistenceMutationReceiver(text);
  return hasDirectPersistenceCall(text) || (receiver != null && hasPersistenceReceiver(receiver));
}

const EFFECT_FAMILIES = [
  [
    'browser-privilege',
    /\b(?:chrome|browser)\.(?:tabs|downloads|scripting|permissions|identity|management|contextMenus)\b/u,
  ],
  ['messaging', /\b(?:sendMessage|postMessage|onMessage|runtime\.connect|BroadcastChannel)\b/u],
  ['persistence', hasPersistenceEffect],
  ['network', /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/u],
  [
    'dom-ui',
    /\b(?:document\.|setState|dispatch\(|classList\.|appendChild|removeChild|createElement|getElementById|querySelector)\b/u,
  ],
  [
    'dom-ui',
    /\b(?:canvas|fabricCanvas|editorCanvas)(?:\?\.|\.)(?:add|remove|moveObjectTo|bringObjectToFront|setActiveObject|discardActiveObject|requestRenderAll|renderAll|setDimensions)\b/u,
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
  return (
    EFFECT_FAMILIES.find(([, matcher]) =>
      matcher instanceof RegExp ? matcher.test(text) : matcher(text)
    )?.[0] ?? null
  );
}

export function collectEffectFamilies(text) {
  return [
    ...new Set(
      EFFECT_FAMILIES.filter(([, matcher]) =>
        matcher instanceof RegExp ? matcher.test(text) : matcher(text)
      ).map(([name]) => name)
    ),
  ];
}
