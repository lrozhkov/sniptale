import { expect, it } from 'vitest';

import {
  collectBackupImportAtomicityViolations,
  collectContractOptionalityDriftViolations,
  collectMessagingSchemaCastViolations,
  collectNetworkFetchPolicyViolations,
  collectPersistenceAuthorityViolations,
  collectRuntimeProtocolContractViolations,
  collectRuntimeResponsePrivacyViolations,
  collectStateManagerDefaultImportViolations,
  collectZipPackageProfileViolations,
} from './audit-guardrail-core.mjs';
import { createTempRoot, writeFile } from './test-helpers';

function rules(violations: { rule: string }[]) {
  return violations.map((violation) => violation.rule);
}

it('rejects success-only lifecycle runtime responses and accepts authoritative results', () => {
  const root = createTempRoot('audit-runtime-protocol-');
  const bad = writeFile(
    root,
    'apps/extension/src/background/media/video/runtime/handlers/export-start.ts',
    'export function startExport(sendResponse) { sendResponse({ success: true }); }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/background/media/video/runtime/handlers/export-cancel.ts',
    "export function cancelExport(sendResponse) { sendResponse({ success: true, result: 'accepted' }); }\n"
  );

  expect(rules(collectRuntimeProtocolContractViolations([bad]))).toContain(
    'runtime-success-only-response'
  );
  expect(collectRuntimeProtocolContractViolations([good])).toEqual([]);
});

it('rejects ad hoc popup URL authority predicates and accepts canonical predicates', () => {
  const root = createTempRoot('audit-runtime-authority-');
  const bad = writeFile(
    root,
    'apps/extension/src/background/runtime/routing/popup.ts',
    "export function route(sender, runtimeInfo) { return sender.url === runtimeInfo.getURL('popup.html'); }\n"
  );
  const good = writeFile(
    root,
    'apps/extension/src/background/runtime/routing/popup-canonical.ts',
    'export function route(sender) { return isPopupSender(sender) && consumePopupCapability(sender); }\n'
  );

  expect(rules(collectRuntimeProtocolContractViolations([bad]))).toContain(
    'runtime-authority-predicate-drift'
  );
  expect(collectRuntimeProtocolContractViolations([good])).toEqual([]);
});

it('keeps raw runtime response payload fields behind explicit transfer/debug gates', () => {
  const root = createTempRoot('audit-response-privacy-');
  const bad = writeFile(
    root,
    'apps/extension/src/contracts/messaging/contracts/runtime-message/result-response.ts',
    'export interface ResultResponse { success: true; rawDiagnostics: string; }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/contracts/messaging/contracts/runtime-message/debug-response.ts',
    'export interface DebugResponse { capabilityToken: string; rawDiagnosticsEnabled: true; rawDiagnostics: string; }\n'
  );

  expect(rules(collectRuntimeResponsePrivacyViolations([bad]))).toContain(
    'runtime-response-sensitive-payload'
  );
  expect(collectRuntimeResponsePrivacyViolations([good])).toEqual([]);
});

it('requires ZIP/package profiles for untrusted package owners', () => {
  const root = createTempRoot('audit-zip-profile-');
  const bad = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/import/index-package.ts',
    "import JSZip from 'jszip'; export async function load(file) { return JSZip.loadAsync(file); }\n"
  );
  const good = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/import/index-profiled.ts',
    [
      "import JSZip from 'jszip';",
      'const MAX_ZIP_FILE_COUNT = 100;',
      'function normalizeSafePath(path: string) { return path; }',
      'export async function load(file) { const manifest = {}; cleanup(file); return JSZip.loadAsync(file); }',
    ].join('\n')
  );

  expect(rules(collectZipPackageProfileViolations([bad]))).toContain('zip-package-profile-missing');
  expect(collectZipPackageProfileViolations([good])).toEqual([]);
});

it('detects local TS/schema optionality drift in messaging contracts', () => {
  const root = createTempRoot('audit-optionality-');
  const bad = writeFile(
    root,
    'apps/extension/src/contracts/messaging/runtime-message/save.ts',
    [
      'import { z } from "zod";',
      'export interface SaveMessage { filename?: string; }',
      'export const SaveMessageSchema = z.object({ filename: z.string() });',
    ].join('\n')
  );
  const good = writeFile(
    root,
    'apps/extension/src/contracts/messaging/runtime-message/save-ok.ts',
    [
      'import { z } from "zod";',
      'export interface SaveMessage { filename?: string; }',
      'export const SaveMessageSchema = z.object({ filename: z.string().optional() });',
    ].join('\n')
  );

  expect(rules(collectContractOptionalityDriftViolations([bad]))).toContain(
    'contract-optionality-drift'
  );
  expect(collectContractOptionalityDriftViolations([good])).toEqual([]);
});

it('blocks messaging and manifest schema escape casts', () => {
  const root = createTempRoot('audit-schema-casts-');
  const bad = writeFile(
    root,
    'apps/extension/src/contracts/messaging/core.ts',
    'const schema = z.object({}) as z.ZodType<RuntimeMessage>;\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/contracts/messaging/core-ok.ts',
    'const schema = defineZodSchema<RuntimeMessage>()(z.object({ type: z.string() }));\n'
  );

  expect(rules(collectMessagingSchemaCastViolations([bad]))).toContain(
    'messaging-schema-boundary-cast'
  );
  expect(collectMessagingSchemaCastViolations([good])).toEqual([]);
});

it('requires privileged web snapshot fetch policy helpers', () => {
  const root = createTempRoot('audit-network-fetch-');
  const bad = writeFile(
    root,
    'apps/extension/src/background/capture/routing/web-snapshot/fetch.ts',
    'export async function load(url) { return fetch(url); }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/background/capture/routing/web-snapshot/fetch-ok.ts',
    'export async function load(url) { validateFetchUrl(url); return fetch(url); }\n'
  );

  expect(rules(collectNetworkFetchPolicyViolations([bad]))).toContain(
    'network-fetch-policy-missing'
  );
  expect(collectNetworkFetchPolicyViolations([good])).toEqual([]);
});

it('requires backup imports to preflight before multi-store writes', () => {
  const root = createTempRoot('audit-backup-atomicity-');
  const bad = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/import/index-assets.ts',
    'export async function importBackup(assets, projects) { await saveAsset(assets[0]); }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/import/index-assets-ok.ts',
    'export async function importBackup(assets, projects) { validate(assets, projects); await saveAsset(assets[0]); }\n'
  );

  expect(rules(collectBackupImportAtomicityViolations([bad]))).toContain(
    'backup-import-preflight-before-write'
  );
  expect(collectBackupImportAtomicityViolations([good])).toEqual([]);
});

it('blocks default stateManager imports outside approved owners', () => {
  const root = createTempRoot('audit-state-manager-default-');
  const bad = writeFile(
    root,
    'apps/extension/src/background/feature/state.ts',
    "import { stateManager } from '../../shared/state-manager';\n"
  );
  const typeOnly = writeFile(
    root,
    'apps/extension/src/background/feature/types.ts',
    "import type { StateManager } from '../../shared/state-manager/types';\n"
  );
  const allowed = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    "import { stateManager } from '../state-manager';\n"
  );

  expect(rules(collectStateManagerDefaultImportViolations([bad]))).toContain(
    'state-manager-default-singleton-import'
  );
  expect(collectStateManagerDefaultImportViolations([typeOnly, allowed])).toEqual([]);
});

it('keeps IndexedDB entrypoints behind explicit persistence authorities', () => {
  const root = createTempRoot('audit-state-authority-');
  const bad = writeFile(
    root,
    'apps/extension/src/background/session/cache.ts',
    "import { openDB } from 'idb'; export async function load() { return openDB('session-cache', 1); }\n"
  );
  const good = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    "import { openDB } from 'idb'; export async function initDB() { return openDB('sniptale', 1); }\n"
  );

  expect(rules(collectPersistenceAuthorityViolations([bad]))).toContain(
    'persistence-authority-owner-bypass'
  );
  expect(collectPersistenceAuthorityViolations([good])).toEqual([]);
});
