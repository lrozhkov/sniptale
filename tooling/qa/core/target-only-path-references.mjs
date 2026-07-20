import { TARGET_ONLY_PATH_POLICY } from './target-only-path-policy.mjs';

const SOURCE_REFERENCES = [
  /\bsrc\/(?:manifest\.json|vite-env\.d\.ts)(?=[/\s'"`)},.:;]|$)/gu,
  /\bsrc\/(?:background|camera-recorder|composition|content|contracts|design-system)(?=[/\s'"`)},.:;]|$)/gu,
  /\bsrc\/(?:editor|features|foundation|gallery|offscreen)(?=[/\s'"`)},.:;]|$)/gu,
  /\bsrc\/(?:effect-runtime-sandbox|package-renderer-sandbox)(?=[/\s'"`)},.:;]|$)/gu,
  /\bapps\/extension\/src\/package-renderer-sandbox(?=[/\s'"`)},.:;]|$)/gu,
  /\bapps\/extension\/src\/features\/video\/project\/video-pack(?=[/\s'"`)},.:;]|$)/gu,
  /\bapps\/extension\/src\/composition\/persistence\/template-packs(?=[/\s'"`)},.:;]|$)/gu,
  /\bfeatures\/video\/composition\/template-instances(?=[/\s'"`)},.:;]|$)/gu,
  /\bfeatures\/video\/composition\/package-renderer(?=[/\s'"`)},.:;]|$)/gu,
  /\boffscreen\/project-export\/package-renderer(?=[/\s'"`)},.:;]|$)/gu,
  /\bvideo-editor\/preview\/stage\/scene\/package-renderer-cache(?=[/\s'"`)},.:;]|$)/gu,
  /\bsrc\/(?:platform|popup|scenario-editor|settings|shared|ui|video-editor)(?=[/\s'"`)},.:;]|$)/gu,
  /\bsrc\/(?:web-snapshot-viewer|workflows)(?=[/\s'"`)},.:;]|$)/gu,
];
const PUBLIC_REFERENCE = /\bpublic\/(?:fonts|icons)(?=[/\s'"`)},.:;]|$)/gu;
const ROOT_CONFIG_REFERENCES = [
  /\b(?:postcss\.config\.js|tailwind\.config\.js|vite\.config\.ts)\b/gu,
  /\bvite\.(?:content-runtime-build-id|injected-build(?:-shim-guard)?)\.ts\b/gu,
];
const REFERENCE_PATTERNS = [...SOURCE_REFERENCES, PUBLIC_REFERENCE, ...ROOT_CONFIG_REFERENCES];
const TRACKED_HISTORICAL_CONTROL_FILES = new Set([
  'tooling/configs/qa/gitleaks-baseline.json',
  'tooling/configs/qa/technical-debt.data.json',
]);

export const TARGET_ONLY_TEXT_FILE = /(?:\.[cm]?[jt]sx?|\.json|\.md|\.css|\.html|\.ya?ml|\.cjs)$/u;

function isQualifiedSourceReference(line, index) {
  const prefix = line.slice(Math.max(0, index - 48), index);
  return /(?:apps\/extension|packages\/[^/]+)\/$/u.test(prefix);
}

function lineReferences(line) {
  const matches = [];
  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (SOURCE_REFERENCES.includes(pattern) && isQualifiedSourceReference(line, index)) continue;
      if (pattern === PUBLIC_REFERENCE && /apps\/extension\/$/u.test(line.slice(0, index)))
        continue;
      if (
        ROOT_CONFIG_REFERENCES.includes(pattern) &&
        /apps\/extension\/$/u.test(line.slice(0, index))
      ) {
        continue;
      }
      matches.push(match[0]);
    }
  }
  return [...new Set(matches)].sort();
}

function controlReferences(line, policy) {
  const references = policy.retiredControls
    .map((entry) => entry.path)
    .filter((path) => line.includes(path));
  for (const prefix of policy.retiredControlPrefixes) {
    let offset = line.indexOf(prefix);
    while (offset >= 0) {
      const rawSuffix = line.slice(offset).match(/^[A-Za-z0-9_./-]+/u)?.[0] ?? prefix;
      const suffix = rawSuffix.replace(/[.,:;]+$/u, '');
      references.push(suffix);
      offset = line.indexOf(prefix, offset + prefix.length);
    }
  }
  return [...new Set(references)].sort();
}

function isTestPath(path) {
  return /(?:\.test\.|\.spec\.|\.test-support\.|\/test-support\/)/u.test(path);
}

export function retiredTargetOnlyControl(path, policy) {
  return (
    policy.retiredControls.find((entry) => entry.path === path) ??
    (policy.effectV1RetiredPaths.includes(path) ? { action: 'remove', path } : null) ??
    (policy.retiredControlPrefixes.some((prefix) => path.startsWith(prefix))
      ? { action: 'remove', path }
      : null)
  );
}

function classifyReference(path, policy) {
  const control = retiredTargetOnlyControl(path, policy);
  if (control) return { classification: 'retired-control', disposition: control.action };
  if (path === TARGET_ONLY_PATH_POLICY || path.includes('target-only-path')) {
    return { classification: 'target-only-guard', disposition: 'retain' };
  }
  if (TRACKED_HISTORICAL_CONTROL_FILES.has(path)) {
    return { classification: 'tracked-historical-control', disposition: 'retain' };
  }
  if (isTestPath(path)) return { classification: 'negative-fixture', disposition: 'retain' };
  if (
    path === 'docs/architecture/shared-topology.md' ||
    path === 'docs/tooling/repo-root-inventory.md'
  ) {
    return { classification: 'target-policy', disposition: 'retain' };
  }
  if (/^packages\/[^/]+\/package\.json$/u.test(path)) {
    return { classification: 'package-relative-export', disposition: 'retain' };
  }
  if (
    path === 'apps/extension/build/layout.data.json' ||
    path === 'apps/extension/package.json' ||
    path === 'apps/extension/postcss.config.js' ||
    path === 'apps/extension/build/injected-build-shim-guard.ts' ||
    path === 'tooling/test/harness/content-runtime-shim-guard.test.ts'
  ) {
    return { classification: 'app-root-build-input', disposition: 'retain' };
  }
  if (
    path === 'tooling/qa/core/extension-build-layout-policy.mjs' ||
    path === 'tooling/qa/core/verify-extension-build-layout.mjs' ||
    path === 'tooling/qa/core/verify-package-boundaries.mjs'
  ) {
    return { classification: 'permanent-negative-guard', disposition: 'retain' };
  }
  return { classification: 'active-stale-reference', disposition: 'rewrite' };
}

export function targetOnlyReferenceRecords(path, text, policy) {
  if (text === null) return [];
  return text.split(/\r?\n/u).flatMap((line, lineIndex) =>
    [...lineReferences(line), ...controlReferences(line, policy)].map((reference) => ({
      ...classifyReference(path, policy),
      kind: 'path-reference',
      line: lineIndex + 1,
      path,
      reference,
    }))
  );
}
