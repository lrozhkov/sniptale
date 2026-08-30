import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EXPECTED_SANDBOX_CSP } from '../manifest/manifest-integrity-sandbox.mjs';
import { collectManifestIntegrityViolations } from './check.mjs';

const tempDirs: string[] = [];
const OFFSCREEN_OPTIONS_SOURCE = [
  "const OFFSCREEN_DOCUMENT_REASON = 'USER_MEDIA' satisfies `${chrome.offscreen.Reason}`;",
  "const OFFSCREEN_CLIPBOARD_REASON = 'CLIPBOARD' satisfies `${chrome.offscreen.Reason}`;",
  "const PRIVACY_ERASURE_OFFSCREEN_DOCUMENT_REASON = 'LOCAL_STORAGE' satisfies `${chrome.offscreen.Reason}`;",
  'export function createUserMediaOffscreenDocumentOptions() {',
  '  return { reasons: [OFFSCREEN_DOCUMENT_REASON, OFFSCREEN_CLIPBOARD_REASON] };',
  '}',
  'export function createPrivacyErasureOffscreenDocumentOptions() {',
  '  return { reasons: [PRIVACY_ERASURE_OFFSCREEN_DOCUMENT_REASON] };',
  '}',
  '',
].join('\n');

function writeFile(root: string, relativePath: string, contents = '') {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function writeManifest(root: string, manifest) {
  writeFile(root, 'apps/extension/manifest.json', JSON.stringify(manifest, null, 2));
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-manifest-integrity-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function createBaseManifest() {
  return {
    background: { service_worker: 'apps/extension/src/background/index.ts' },
    action: {
      default_popup: 'apps/extension/src/popup/index.html',
      default_title: 'Open Sniptale',
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
      sandbox: EXPECTED_SANDBOX_CSP,
    },
    icons: {
      16: 'icons/icon-16.png',
    },
    web_accessible_resources: [],
    sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
  };
}

function writeStandardManifestFiles(root: string) {
  writeFile(root, 'apps/extension/src/background/index.ts', 'export {};\n');
  writeFile(root, 'apps/extension/src/popup/index.html', '<!doctype html>\n');
  writeFile(root, 'apps/extension/src/effect-runtime-sandbox/index.html', '<!doctype html>\n');
  writeFile(
    root,
    'apps/extension/src/background/offscreen-document/create-options.ts',
    OFFSCREEN_OPTIONS_SOURCE
  );
  writeFile(root, 'apps/extension/public/icons/icon-16.png', 'png');
}

function verifiesValidManifestPaths() {
  const root = createTempRoot();
  writeManifest(root, createBaseManifest());
  writeStandardManifestFiles(root);

  expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual([]);
}

function verifiesMissingIconViolation() {
  const root = createTempRoot();
  writeManifest(root, createBaseManifest());
  writeFile(root, 'apps/extension/src/background/index.ts', 'export {};\n');
  writeFile(root, 'apps/extension/src/content/index.tsx', 'export {};\n');
  writeFile(root, 'apps/extension/src/popup/index.html', '<!doctype html>\n');
  writeFile(root, 'apps/extension/src/effect-runtime-sandbox/index.html', '<!doctype html>\n');
  writeFile(
    root,
    'apps/extension/src/background/offscreen-document/create-options.ts',
    OFFSCREEN_OPTIONS_SOURCE
  );

  expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'manifest-integrity',
      file: 'apps/extension/manifest.json',
      message: expect.stringContaining('icons.16 points to a missing repo file'),
    }),
  ]);
}

function verifiesRootOnlyIconViolation() {
  const root = createTempRoot();
  writeManifest(root, createBaseManifest());
  writeFile(root, 'apps/extension/src/background/index.ts', 'export {};\n');
  writeFile(root, 'apps/extension/src/content/index.tsx', 'export {};\n');
  writeFile(root, 'apps/extension/src/popup/index.html', '<!doctype html>\n');
  writeFile(root, 'apps/extension/src/effect-runtime-sandbox/index.html', '<!doctype html>\n');
  writeFile(root, 'icons/icon-16.png', 'png');
  writeFile(
    root,
    'apps/extension/src/background/offscreen-document/create-options.ts',
    OFFSCREEN_OPTIONS_SOURCE
  );

  expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'manifest-integrity',
      file: 'apps/extension/manifest.json',
      message: expect.stringContaining('icons.16 points to a missing repo file'),
    }),
  ]);
}

function verifiesMissingEntryViolation() {
  const root = createTempRoot();
  const manifest = createBaseManifest();
  manifest.background.service_worker = 'apps/extension/src/background/missing.ts';
  writeManifest(root, manifest);
  writeFile(root, 'apps/extension/src/popup/index.html', '<!doctype html>\n');
  writeFile(root, 'apps/extension/src/effect-runtime-sandbox/index.html', '<!doctype html>\n');
  writeFile(root, 'apps/extension/public/icons/icon-16.png', 'png');
  writeFile(
    root,
    'apps/extension/src/background/offscreen-document/create-options.ts',
    OFFSCREEN_OPTIONS_SOURCE
  );

  expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('background.service_worker points to a missing repo file'),
    }),
  ]);
}

function verifiesAdditionalPageEntryViolation() {
  const root = createTempRoot();
  const manifest = createBaseManifest();
  manifest.options_ui = { page: 'apps/extension/src/settings/missing.html' };
  writeManifest(root, manifest);
  writeStandardManifestFiles(root);

  expect(collectManifestIntegrityViolations({ rootDir: root })).toContainEqual(
    expect.objectContaining({
      message: expect.stringContaining('options_ui.page points to a missing repo file'),
    })
  );
}

function verifiesActionTitleViolation() {
  const root = createTempRoot();
  const manifest = createBaseManifest();
  manifest.action.default_title = 'Capture';
  writeManifest(root, manifest);
  writeStandardManifestFiles(root);

  expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'manifest-integrity',
      file: 'apps/extension/manifest.json',
      message: expect.stringContaining('action.default_title must be "Open Sniptale"'),
    }),
  ]);
}

function verifiesExtensionCspViolation() {
  const root = createTempRoot();
  const manifest = createBaseManifest();
  manifest.content_security_policy.extension_pages = "script-src 'self' 'unsafe-eval'";
  writeManifest(root, manifest);
  writeStandardManifestFiles(root);

  expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'manifest-integrity',
      file: 'apps/extension/manifest.json',
      message: expect.stringContaining('content_security_policy.extension_pages must be'),
    }),
  ]);
}

function verifiesOffscreenReasonViolation() {
  const root = createTempRoot();
  writeManifest(root, createBaseManifest());
  writeStandardManifestFiles(root);
  writeFile(
    root,
    'apps/extension/src/background/offscreen-document/create-options.ts',
    OFFSCREEN_OPTIONS_SOURCE.replace("'USER_MEDIA'", "'BLOBS'")
  );

  expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'manifest-integrity',
      file: 'apps/extension/src/background/offscreen-document/create-options.ts',
      message: expect.stringContaining('createUserMediaOffscreenDocumentOptions'),
    }),
  ]);
}

describe('collectManifestIntegrityViolations', () => {
  it('passes when manifest repo-owned paths exist', verifiesValidManifestPaths);
  it('flags missing icon files', verifiesMissingIconViolation);
  it('flags icon files that exist only outside public', verifiesRootOnlyIconViolation);
  it('flags missing content or background entries', verifiesMissingEntryViolation);
  it('flags missing additional manifest-owned pages', verifiesAdditionalPageEntryViolation);
  it('flags action title drift', verifiesActionTitleViolation);
  it('flags extension CSP drift', verifiesExtensionCspViolation);
  it('flags offscreen reason drift', verifiesOffscreenReasonViolation);
});
