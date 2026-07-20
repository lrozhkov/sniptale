import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

const STRUCTURAL_SERVICE_SOURCE = [
  'const defaultExampleService = createExampleService();',
  'const defaultLazyExampleService = createLazyDefaultOwner(createExampleService);',
  'const activeSessions = new Map();',
  'const SESSION_LABELS = new Map();',
  'const STATIC_REGISTRY = { alpha: true };',
  'const mutableQueue = [];',
  'export function createExampleService() {',
  '  return {',
  "    mode: 'ok',",
  '  };',
  '}',
  '',
  'export function setSessionLabel(key, value) {',
  '  SESSION_LABELS.set(key, value);',
  '}',
  '',
  'export function pushQueuedValue(value) {',
  '  mutableQueue.push(value);',
  '}',
  '',
].join('\n');

const STRUCTURAL_PANEL_SOURCE = [
  'export function usePanelControllerState() {',
  '  return {',
  ...Array.from({ length: 20 }, (_, index) => `    field${index}: '${index}',`),
  '  };',
  '}',
  '',
  'const layout = {',
  '  ...buildAlphaProps(),',
  '  ...buildBetaProps(),',
  '  ...buildGammaProps(),',
  '};',
  '',
  'export function buildAlphaProps() { return {}; }',
  'export function buildBetaProps() { return {}; }',
  'export function buildGammaProps() { return {}; }',
  'export function readLayout() { return layout; }',
  '',
].join('\n');

const RUNTIME_CONTROLLER_SOURCE = [
  'export async function runExampleController(setOpen) {',
  "  await sendRuntimeMessage({ type: 'ONE' });",
  '  await saveSessionStorage();',
  '  setOpen(true);',
  '  chrome.runtime.sendMessage({ type: "TWO" });',
  '  navigateToView();',
  '  setTimeout(() => {}, 0);',
  '}',
  '',
].join('\n');

const RUNTIME_STORAGE_SOURCE = [
  'export function loadExampleSettings() {',
  '  const normalized = normalizeLegacySettings(readSettings());',
  "  localStorage.setItem('normalized', JSON.stringify(normalized));",
  '  return normalized;',
  '}',
  '',
].join('\n');

const RUNTIME_TRANSPORT_SOURCE = [
  "export function sendOne() { return sendRuntimeMessage({ type: 'ONE' }); }",
  "export function sendTwo() { return sendRuntimeMessage({ type: 'TWO' }); }",
  "export function sendThree() { return sendRuntimeMessage({ type: 'THREE' }); }",
  "export function sendFour() { return sendRuntimeMessage({ type: 'FOUR' }); }",
  "export function sendFive() { return sendRuntimeMessage({ type: 'FIVE' }); }",
  "export function sendSix() { return sendRuntimeMessage({ type: 'SIX' }); }",
  "export function sendSeven() { return sendRuntimeMessage({ type: 'SEVEN' }); }",
  "export function sendEight() { return sendRuntimeMessage({ type: 'EIGHT' }); }",
  '',
].join('\n');

const STATEFUL_FLOW_SOURCE = [
  'export async function prepareSettingsState(setReady) {',
  '  setReady(true);',
  '  await browserStorage.local.set({ ready: true });',
  '}',
  '',
  'export async function finalizeAfterPersistence(setReady) {',
  '  await persistReadyState();',
  '  setReady(true);',
  '}',
  '',
  'export function reconnectPreviewTransport() {',
  '  setTimeout(() => retryConnection(), 100);',
  '}',
  '',
  'export async function replacePreviewShell(closeShell, openShell) {',
  '  closeShell();',
  '  await loadPreviewShell();',
  '  openShell();',
  '}',
  '',
  'export async function replacePreviewShellSafely(closeShell, openShell, restoreShell) {',
  '  closeShell();',
  '  try {',
  '    await loadPreviewShell();',
  '    openShell();',
  '  } catch (error) {',
  '    restoreShell();',
  '    throw error;',
  '  }',
  '}',
  '',
  'export async function restartRecording(clearStartError, startRecording, setStartError) {',
  '  clearStartError();',
  '  try {',
  '    await startRecording();',
  '  } catch (error) {',
  "    setStartError('failed');",
  '    throw error;',
  '  }',
  '}',
  '',
  'export function usePromptState(persist, setSaving) {',
  '  return {',
  '    handleSave: async () => {',
  '      setSaving(true);',
  '      try {',
  '        await persist();',
  '      } finally {',
  '        setSaving(false);',
  '      }',
  '    },',
  '  };',
  '}',
  '',
].join('\n');

export async function collectAdvisoryFindings(
  root: string,
  codeFiles: string[],
  targetFiles = codeFiles
) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-advisory.collectors.helpers.mjs')>(
      './verify-advisory.collectors.helpers.mjs'
    );
    return module.collectAdvisoryFindings({ codeFiles, targetFiles });
  });
}

export function createStructuralAdvisoryFixtureRoot() {
  const root = createTempRoot('verify-advisory-structural-');
  writeFile(root, 'src/shared/example-service.ts', STRUCTURAL_SERVICE_SOURCE);
  writeFile(
    root,
    'apps/extension/src/editor/workspace/panel/controller.tsx',
    STRUCTURAL_PANEL_SOURCE
  );
  return root;
}

export function createRuntimeAdvisoryFixtureRoot() {
  const root = createTempRoot('verify-advisory-runtime-');
  writeFile(
    root,
    'apps/extension/src/content/hooks/example-controller.ts',
    RUNTIME_CONTROLLER_SOURCE
  );
  writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/example.ts',
    RUNTIME_STORAGE_SOURCE
  );
  writeFile(root, 'apps/extension/src/content/runtime/transport.ts', RUNTIME_TRANSPORT_SOURCE);
  writeFile(root, 'apps/extension/src/popup/shell/runtime/state.ts', STATEFUL_FLOW_SOURCE);
  return root;
}

export function createDetachedThisAdvisoryFixtureRoot() {
  const root = createTempRoot('verify-advisory-detached-this-');
  writeFile(
    root,
    'apps/extension/src/foundation/example-service.ts',
    [
      'export class ExampleService {',
      '  private count = 0;',
      '  flush() {',
      '    this.count += 1;',
      '  }',
      '}',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/popup/use-service.ts',
    [
      "import { ExampleService } from '../foundation/example-service';",
      'export function buildActions(service: ExampleService) {',
      '  return { onFlush: service.flush };',
      '}',
    ].join('\n')
  );
  return root;
}
