// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../runtime/settings-transfer-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/settings-transfer-client')>()),
  createSettingsTransferClient: () => mocks.send,
}));

import { SettingsTransferSection } from './index';
import { SETTINGS_TRANSFER_MAX_BYTES } from '../../../../contracts/settings-transfer';
import { SettingsNavigationLockProvider } from '../../../section-surface';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:settings'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  Object.defineProperty(File.prototype, 'text', {
    configurable: true,
    value: vi.fn(async () => '{}'),
  });
  mocks.send.mockImplementation(async (message: { operation: string }) => {
    if (message.operation === 'read-export-tree') {
      return { operation: 'read-export-tree', tree: transferTree() };
    }
    if (message.operation === 'build-export-package') {
      return {
        operation: 'build-export-package',
        filename: 'settings.sniptale-settings.json',
        fileText: '{}',
      };
    }
    if (message.operation === 'inspect-import') {
      return {
        operation: 'inspect-import',
        inspection: inspectionFixture(),
      };
    }
    return { operation: 'commit-import', report: reportFixture() };
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('loads the export catalog, supports selective choice, and downloads the package', async () => {
  await renderSection();
  expect(mocks.send).toHaveBeenCalledWith({ operation: 'read-export-tree' });

  await clickLabel('settings.settingsTransfer.selectivePackage');
  expect(container.querySelector('[role="tree"]')).not.toBeNull();
  await clickLabel('settings.settingsTransfer.download');
  expect(mocks.send).toHaveBeenLastCalledWith(
    expect.objectContaining({ operation: 'build-export-package', exportKind: 'selective' })
  );
  expect(URL.createObjectURL).toHaveBeenCalled();
});

it('previews an import, confirms exact restore, commits, and exposes the report actions', async () => {
  await renderSection();
  await clickLabel('settings.settingsTransfer.importTab');
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['{}'], 'a.json')],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(container.textContent).toContain('settings.settingsTransfer.compatibleFile');

  const strategy = container.querySelector('select') as HTMLSelectElement;
  await act(async () => {
    strategy.value = 'overwrite-matching';
    strategy.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((container.querySelectorAll('select')[1] as HTMLSelectElement).value).toBe('use-imported');
  await act(async () => {
    strategy.value = 'exact-restore';
    strategy.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const confirmation = [
    ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ].at(-1)!;
  await act(async () => confirmation.click());
  const conflictDecision = container.querySelectorAll('select')[1]!;
  await act(async () => {
    conflictDecision.value = 'keep-local';
    conflictDecision.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await clickLabel('settings.settingsTransfer.apply');

  expect(mocks.send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'commit-import',
      strategy: 'exact-restore',
      destructiveConfirmed: true,
    })
  );
  expect(container.textContent).toContain('settings.settingsTransfer.reportTitle');
  await clickLabel('settings.settingsTransfer.copyReport');
  expect(navigator.clipboard.writeText).toHaveBeenCalled();
  await clickLabel('settings.settingsTransfer.downloadReport');
  await clickLabel('settings.settingsTransfer.done');
  expect(container.textContent).toContain('settings.settingsTransfer.importTitle');
  expect(document.activeElement?.textContent?.trim()).toBe('settings.settingsTransfer.chooseFile');
});

it('recovers from a file error and surfaces stale review without committing', async () => {
  await renderSection();
  await clickLabel('settings.settingsTransfer.importTab');
  const picker = container.querySelector('div[class*="border-dashed"]')!;
  const emptyDrop = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(emptyDrop, 'dataTransfer', { value: { files: [] } });
  await act(async () => picker.dispatchEvent(emptyDrop));

  mocks.send.mockRejectedValueOnce(new Error('invalid file'));
  await selectFile();
  expect(container.textContent).toContain('settings.settingsTransfer.fileError');

  await selectFile();
  mocks.send.mockRejectedValueOnce({ code: 'stale-plan' });
  await clickLabel('settings.settingsTransfer.apply');
  expect(container.textContent).toContain('settings.settingsTransfer.staleError');
});

it('surfaces a clipboard adapter failure when the import report cannot be copied', async () => {
  await renderSection();
  await clickLabel('settings.settingsTransfer.importTab');
  await selectFile();
  await clickLabel('settings.settingsTransfer.apply');
  vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new DOMException('Denied'));

  await clickLabel('settings.settingsTransfer.copyReport');
  await act(async () => Promise.resolve());

  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'settings.settingsTransfer.copyReportError'
  );
});

it('rejects an oversized file before reading or sending it', async () => {
  await renderSection();
  await clickLabel('settings.settingsTransfer.importTab');
  const readText = vi.fn<() => Promise<string>>();
  const oversizedFile = new File([], 'oversized.sniptale-settings.json');
  Object.defineProperty(oversizedFile, 'size', { value: SETTINGS_TRANSFER_MAX_BYTES + 1 });
  Object.defineProperty(oversizedFile, 'text', { value: readText });

  await selectFile(oversizedFile);

  expect(readText).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'inspect-import' })
  );
  expect(container.textContent).toContain('settings.settingsTransfer.fileError');
});

it('keeps the newest file preview when inspections resolve out of order', async () => {
  await renderSection();
  await clickLabel('settings.settingsTransfer.importTab');
  const first = deferred<ReturnType<typeof inspectResponse>>();
  const second = deferred<ReturnType<typeof inspectResponse>>();
  const inspections = [first, second];
  mocks.send.mockImplementation((message: { operation: string }) => {
    if (message.operation === 'inspect-import') return inspections.shift()!.promise;
    if (message.operation === 'commit-import') {
      return Promise.resolve({ operation: 'commit-import', report: reportFixture() });
    }
    throw new Error(`Unexpected operation: ${message.operation}`);
  });
  const fileA = new File(['A'], 'a.json');
  const fileB = new File(['B'], 'b.json');
  Object.defineProperty(fileA, 'text', { value: vi.fn(async () => 'file-a') });
  Object.defineProperty(fileB, 'text', { value: vi.fn(async () => 'file-b') });

  await selectFile(fileA);
  await act(async () => Promise.resolve());
  await selectFile(fileB);
  await act(async () => Promise.resolve());
  await act(async () => second.resolve(inspectResponse('b'.repeat(64))));
  await act(async () => first.resolve(inspectResponse('a'.repeat(64))));
  await clickLabel('settings.settingsTransfer.apply');

  expect(mocks.send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'commit-import',
      fileText: 'file-b',
      fingerprint: 'b'.repeat(64),
    })
  );
});

it('invalidates a previous preview when the next file is rejected', async () => {
  await renderSection();
  await clickLabel('settings.settingsTransfer.importTab');
  await selectFile();
  expect(container.textContent).toContain('settings.settingsTransfer.compatibleFile');
  const oversizedFile = new File([], 'oversized.sniptale-settings.json');
  Object.defineProperty(oversizedFile, 'size', { value: SETTINGS_TRANSFER_MAX_BYTES + 1 });

  await selectFile(oversizedFile);

  expect(container.textContent).toContain('settings.settingsTransfer.fileError');
  expect(container.textContent).not.toContain('settings.settingsTransfer.compatibleFile');
  expect(
    [...container.querySelectorAll('button')].some(
      (button) => button.textContent?.trim() === 'settings.settingsTransfer.apply'
    )
  ).toBe(false);
});

it('blocks file and tab changes until a pending commit publishes its report', async () => {
  await renderSection();
  await clickLabel('settings.settingsTransfer.importTab');
  await selectFile();
  const commit = deferred<{
    operation: 'commit-import';
    report: ReturnType<typeof reportFixture>;
  }>();
  mocks.send.mockImplementation((message: { operation: string }) => {
    if (message.operation === 'commit-import') return commit.promise;
    throw new Error(`Unexpected operation: ${message.operation}`);
  });

  await clickLabel('settings.settingsTransfer.apply');
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const exportTab = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'settings.settingsTransfer.exportTab'
  )!;
  expect(input.disabled).toBe(true);
  expect(exportTab.disabled).toBe(true);
  await act(async () => exportTab.click());
  expect(container.textContent).toContain('settings.settingsTransfer.importTitle');

  await act(async () => commit.resolve({ operation: 'commit-import', report: reportFixture() }));
  expect(container.textContent).toContain('settings.settingsTransfer.reportTitle');
});

async function renderSection() {
  await act(async () =>
    root.render(
      <SettingsNavigationLockProvider>
        <SettingsTransferSection />
      </SettingsNavigationLockProvider>
    )
  );
  await act(async () => Promise.resolve());
}

async function clickLabel(label: string) {
  const element = [...container.querySelectorAll('button, label')].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!element) throw new Error(`Missing control: ${label}`);
  await act(async () => (element as HTMLElement).click());
}

async function selectFile(file: File = new File(['{}'], 'a.json')) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

function transferTree() {
  return [
    {
      id: 'capture',
      parentId: null,
      domainId: 'capture',
      labelKey: 'capture',
      descriptionKey: 'capture',
      kind: 'collection' as const,
      classification: 'transferable' as const,
      selectable: true,
      requiredBy: [],
      children: [
        {
          id: 'capture.image',
          parentId: 'capture',
          domainId: 'capture.image',
          labelKey: 'image',
          descriptionKey: 'image',
          kind: 'collection' as const,
          classification: 'transferable' as const,
          selectable: true,
          requiredBy: [],
          children: [],
        },
      ],
    },
  ];
}

function inspectionFixture() {
  return {
    fingerprint: 'a'.repeat(64),
    package: {
      format: 'sniptale-settings' as const,
      formatVersion: 1 as const,
      exportKind: 'backup' as const,
      exportedAt: '2026-08-16T12:00:00.000Z',
      source: { appVersion: '1.0.0' },
      domains: {},
    },
    tree: transferTree(),
    conflicts: [
      {
        id: 'capture.image.format',
        nodeId: 'capture.image.format',
        kind: 'item' as const,
        allowedDecisions: [
          'keep-local' as const,
          'use-imported' as const,
          'import-as-copy' as const,
        ],
        defaultDecision: 'import-as-copy' as const,
      },
    ],
    summary: {
      added: 0,
      updated: 0,
      copiedRemapped: 0,
      unchanged: 0,
      skipped: 0,
      warnings: [],
      clearedAiSecretBindings: [],
      missingAiSecretBindings: [],
    },
    exactRestoreAvailable: true,
  };
}

function inspectResponse(fingerprint: string) {
  return {
    operation: 'inspect-import' as const,
    inspection: { ...inspectionFixture(), fingerprint },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function reportFixture() {
  return {
    ...inspectionFixture().summary,
    status: 'committed' as const,
    strategy: 'exact-restore' as const,
    appliedNodeIds: ['capture.image'],
  };
}
