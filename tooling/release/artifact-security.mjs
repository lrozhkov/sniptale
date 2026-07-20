import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { verifyDynamicCodeUsage } from './artifact-security-dynamic.mjs';
import { verifyArtifactIdentityFile } from './artifact-security-identity.mjs';
import { assertReleaseLegalPayload } from './oss-release-policy.mjs';
import {
  verifyRetiredEffectArtifactPath,
  verifyRetiredEffectArtifactText,
} from './artifact-security-retired-effect.mjs';
import {
  EXPECTED_SANDBOX_CSP,
  EXPECTED_SANDBOX_PAGES,
  assertSandboxScriptsDoNotReferenceLocalWorkers,
  assertSandboxScriptsAreExclusive,
  collectExtensionPageScriptPaths,
  collectScriptWorkerPaths,
  collectSandboxScriptPaths,
} from './artifact-security-sandbox.mjs';

export { EXPECTED_SANDBOX_CSP, EXPECTED_SANDBOX_PAGES } from './artifact-security-sandbox.mjs';
const TEXT_FILE_PATTERN = /\.(?:css|html|js|json|mjs)$/u;
const FORBIDDEN_FILE_PATTERNS = [
  { message: 'sourcemap file', pattern: /\.map$/u },
  { message: 'environment file', pattern: /(?:^|\/)\.env(?:\.|$)/u },
  {
    message: 'test or development artifact',
    pattern: /(?:^|\/)(?:src\/test-harness|testHarness|designSystem)(?:\/|\.|-|$)/u,
  },
  {
    message: 'secret-like artifact',
    pattern: /(?:^|\/)(?:raw-diagnostics|raw-history|secret|private-key|token)[^/]*$/iu,
  },
];
const FORBIDDEN_TEXT_PATTERNS = [
  { message: 'sourcemap reference', pattern: /sourceMappingURL=/u },
  { message: 'trace-enabled release marker', pattern: /__TRACE_MESSAGES__|VITE_TRACE_MESSAGES/u },
  { message: 'development websocket endpoint', pattern: /wss?:\/\/(?:localhost|127\.0\.0\.1)/u },
  {
    message: 'development server endpoint',
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}/u,
  },
  { message: 'Vite development client', pattern: /@vite\/client|vite\/client/u },
  { message: 'dynamic code execution', pattern: /\beval\s*\(/u },
  { message: 'debugger statement', pattern: /\bdebugger\s*;/u },
];
const REQUIRED_CSP_TOKENS = ["script-src 'self'", "object-src 'self'"];
const FORBIDDEN_CSP_TOKENS = [
  "'unsafe-eval'",
  "'unsafe-inline'",
  'http:',
  'https:',
  'data:',
  'blob:',
  'filesystem:',
];
const FORBIDDEN_WAR_PATTERNS = [
  /\*/u,
  /\.map$/u,
  /\.js$/u,
  /\.html?$/u,
  /^assets\//u,
  /contentRuntime|webSnapshotInjectedRunner/iu,
];
function normalizeRelativePath(relativePath) {
  return relativePath.replaceAll(path.sep, '/');
}
function parseJson(contents, label) {
  try {
    return JSON.parse(contents.toString('utf8'));
  } catch {
    throw new Error(`Release artifact ${label} is not valid JSON.`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Release artifact ${label} must be an object.`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Release artifact ${label} must be a string array.`);
  }
}

async function readPolicyJson(repoRoot) {
  const policyPath = path.join(repoRoot, 'tooling/configs/qa/manifest-permissions.data.json');
  try {
    return JSON.parse(await fs.readFile(policyPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('Release artifact verifier is missing manifest permissions policy data.');
    }
    throw error;
  }
}

function collectPolicyNames(policy, key) {
  return new Set((policy?.[key] ?? []).map((entry) => entry.name));
}

function assertSetEquals(actual, expected, label) {
  const unexpected = [...actual].filter((name) => !expected.has(name));
  const missing = [...expected].filter((name) => !actual.has(name));

  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Release artifact manifest ${label} drift: unexpected=[${unexpected.join(', ')}] missing=[${missing.join(', ')}]`
    );
  }
}

function stableWarPolicyName(entry) {
  return `web_accessible_resources:${JSON.stringify({
    resources: entry.resources ?? [],
    matches: entry.matches ?? [],
    extensionIds: entry.extension_ids ?? [],
    useDynamicUrl: entry.use_dynamic_url === true,
  })}`;
}

function assertManifestPermissionPolicy(manifest, policy) {
  assertSetEquals(
    new Set(manifest.permissions ?? []),
    collectPolicyNames(policy, 'permissions'),
    'permissions'
  );
  assertSetEquals(
    new Set(manifest.host_permissions ?? []),
    collectPolicyNames(policy, 'hostPermissions'),
    'host_permissions'
  );
  assertSetEquals(
    new Set(manifest.optional_host_permissions ?? []),
    collectPolicyNames(policy, 'optionalHostPermissions'),
    'optional_host_permissions'
  );
  assertSetEquals(
    new Set((manifest.web_accessible_resources ?? []).map(stableWarPolicyName)),
    collectPolicyNames(policy, 'webAccessibleResources'),
    'web_accessible_resources'
  );
}

function assertManifestCsp(manifest) {
  const csp = manifest.content_security_policy?.extension_pages;
  if (typeof csp !== 'string') {
    throw new Error('Release artifact manifest is missing extension_pages CSP.');
  }

  for (const token of REQUIRED_CSP_TOKENS) {
    if (!csp.includes(token)) {
      throw new Error(`Release artifact manifest CSP is missing ${token}.`);
    }
  }
  for (const token of FORBIDDEN_CSP_TOKENS) {
    if (csp.includes(token)) {
      throw new Error(`Release artifact manifest CSP contains forbidden token ${token}.`);
    }
  }
}

function assertManifestSandboxPolicy(manifest, artifactPaths) {
  const sandboxPages = manifest.sandbox?.pages;
  if (
    !Array.isArray(sandboxPages) ||
    sandboxPages.length !== EXPECTED_SANDBOX_PAGES.length ||
    sandboxPages.some((page, index) => page !== EXPECTED_SANDBOX_PAGES[index])
  ) {
    throw new Error('Release artifact manifest effect runtime sandbox page drift.');
  }

  if (manifest.content_security_policy?.sandbox !== EXPECTED_SANDBOX_CSP) {
    throw new Error('Release artifact manifest effect runtime sandbox CSP drift.');
  }
  for (const page of EXPECTED_SANDBOX_PAGES) {
    if (!artifactPaths.has(page)) {
      throw new Error(`Release artifact manifest references missing sandbox page: ${page}`);
    }
  }
}

function assertManifestWar(manifest) {
  const resources = manifest.web_accessible_resources ?? [];
  if (!Array.isArray(resources)) {
    throw new Error('Release artifact web_accessible_resources must be an array.');
  }

  for (const entry of resources) {
    assertObject(entry, 'web_accessible_resources entry');
    assertStringArray(entry.resources, 'web_accessible_resources.resources');
    for (const resource of entry.resources) {
      if (FORBIDDEN_WAR_PATTERNS.some((pattern) => pattern.test(resource))) {
        throw new Error(`Release artifact exposes unsafe web-accessible resource: ${resource}`);
      }
    }
  }
}

async function verifyManifest(manifestContents, repoRoot, artifactPaths) {
  const manifest = parseJson(manifestContents, 'manifest.json');
  assertObject(manifest, 'manifest.json');

  if (manifest.manifest_version !== 3) {
    throw new Error('Release artifact manifest must be Manifest V3.');
  }
  if (manifest.externally_connectable !== undefined) {
    throw new Error('Release artifact manifest must not declare externally_connectable.');
  }
  if ((manifest.content_scripts ?? []).length > 0) {
    throw new Error('Release artifact manifest must not declare static content_scripts.');
  }

  assertManifestCsp(manifest);
  assertManifestSandboxPolicy(manifest, artifactPaths);
  assertManifestWar(manifest);
  assertManifestPermissionPolicy(manifest, await readPolicyJson(repoRoot));
}

function verifyFilePath(relativePath) {
  verifyRetiredEffectArtifactPath(relativePath);
  for (const { message, pattern } of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(relativePath)) {
      throw new Error(`Release artifact contains forbidden ${message}: ${relativePath}`);
    }
  }
}

function verifyTextContents(relativePath, contents) {
  if (!TEXT_FILE_PATTERN.test(relativePath)) {
    return;
  }

  const text = contents.toString('utf8');
  verifyRetiredEffectArtifactText(relativePath, text);
  for (const { message, pattern } of FORBIDDEN_TEXT_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`Release artifact ${relativePath} contains forbidden ${message}.`);
    }
  }

  verifyDynamicCodeUsage(relativePath, text);
}

export async function verifyReleaseArtifactFiles({ files, repoRoot = process.cwd() }) {
  const normalizedFiles = files.map((file) => ({
    contents: file.contents,
    relativePath: normalizeRelativePath(file.relativePath),
  }));
  const filesByPath = new Map(normalizedFiles.map((file) => [file.relativePath, file]));
  assertReleaseLegalPayload(normalizedFiles, repoRoot);
  const manifestFile = normalizedFiles.find((file) => file.relativePath === 'manifest.json');
  if (!manifestFile) {
    throw new Error('Release artifact is missing manifest.json.');
  }
  const sandboxScriptPaths = collectSandboxScriptPaths(filesByPath, EXPECTED_SANDBOX_PAGES);
  assertSandboxScriptsDoNotReferenceLocalWorkers(filesByPath, sandboxScriptPaths);
  const sandboxOwnedScriptPaths = new Set([
    ...sandboxScriptPaths,
    ...collectScriptWorkerPaths(filesByPath, sandboxScriptPaths),
  ]);
  const extensionPageScriptPaths = collectExtensionPageScriptPaths(
    filesByPath,
    EXPECTED_SANDBOX_PAGES
  );
  const extensionOwnedScriptPaths = new Set([
    ...extensionPageScriptPaths,
    ...collectScriptWorkerPaths(filesByPath, extensionPageScriptPaths),
  ]);
  assertSandboxScriptsAreExclusive(sandboxOwnedScriptPaths, extensionOwnedScriptPaths);

  for (const file of normalizedFiles) {
    await verifyArtifactIdentityFile(file);
    verifyFilePath(file.relativePath);
    verifyTextContents(file.relativePath, file.contents);
  }

  await verifyManifest(
    manifestFile.contents,
    repoRoot,
    new Set(normalizedFiles.map((file) => file.relativePath))
  );
}

export async function verifyReleaseArchivePath(archivePath, { repoRoot = process.cwd() } = {}) {
  const zip = await JSZip.loadAsync(await fs.readFile(archivePath));
  const files = await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map(async (entry) => ({
        contents: await entry.async('nodebuffer'),
        relativePath: entry.name,
      }))
  );

  await verifyReleaseArtifactFiles({ files, repoRoot });
}
