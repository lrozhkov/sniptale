// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import { InspectorLayout } from '../../../../ui/compact-inspector-controls/layout';

const mocks = vi.hoisted(() => ({ send: vi.fn(), download: vi.fn() }));

vi.mock('./client', () => ({ sendSettingsTransferOperation: mocks.send }));
vi.mock('./ui-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ui-helpers')>()),
  downloadSettingsTransferText: mocks.download,
}));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { SettingsTransferExportFlow } from './export-flow';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.send.mockResolvedValue({ operation: 'read-export-tree', tree: transferTree() });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('reports a catalog load failure without downloading a package', async () => {
  mocks.send.mockRejectedValueOnce(new Error('Catalog unavailable'));

  await renderFlow();

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.settingsTransfer.loadError'
  );
  expect(mocks.download).not.toHaveBeenCalled();
  await clickButton('selectivePackage');
  expect(button('download').disabled).toBe(true);
});

it('downloads a complete backup using the loaded catalog selection', async () => {
  await renderFlow();
  expect(mocks.send).toHaveBeenCalledWith({ operation: 'read-export-tree' });
  mocks.send.mockResolvedValueOnce(exportResponse());

  await clickButton('download');

  expect(mocks.send).toHaveBeenLastCalledWith({
    operation: 'build-export-package',
    exportKind: 'backup',
    selectedNodeIds: ['capture', 'capture.image'],
  });
  expect(mocks.download).toHaveBeenCalledWith('settings.sniptale-settings.json', '{"settings":1}');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(button('download').disabled).toBe(false);
});

it('disables the download action until a pending export finishes', async () => {
  await renderFlow();
  let finishExport!: (value: ReturnType<typeof exportResponse>) => void;
  mocks.send.mockReturnValueOnce(
    new Promise<ReturnType<typeof exportResponse>>((resolve) => {
      finishExport = resolve;
    })
  );

  await clickButton('download');
  expect(button('working').disabled).toBe(true);
  await clickButton('working');
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(mocks.download).not.toHaveBeenCalled();

  await act(async () => finishExport(exportResponse()));

  expect(button('download').disabled).toBe(false);
  expect(mocks.download).toHaveBeenCalledTimes(1);
});

it('reports an export failure and clears the error when the user retries', async () => {
  await renderFlow();
  mocks.send.mockRejectedValueOnce(new Error('Export unavailable'));

  await clickButton('download');

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.settingsTransfer.exportError'
  );
  expect(button('download').disabled).toBe(false);
  expect(mocks.download).not.toHaveBeenCalled();
  mocks.send.mockResolvedValueOnce(exportResponse());

  await clickButton('download');

  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(mocks.download).toHaveBeenCalledTimes(1);
});

it('disables empty selective exports and exports the selection restored by tree controls', async () => {
  await renderFlow();
  await clickButton('selectivePackage');
  expect(container.querySelector('[role="tree"]')).not.toBeNull();
  expect(button('download').disabled).toBe(false);

  await clickButton('clearAll');
  expect(button('download').disabled).toBe(true);
  await clickButton('download');
  expect(mocks.send).toHaveBeenCalledTimes(1);

  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) throw new Error('Missing catalog checkbox');
  await act(async () => checkbox.click());
  expect(button('download').disabled).toBe(false);
  await clickButton('clearAll');
  expect(button('download').disabled).toBe(true);
  await clickButton('selectAll');
  expect(button('download').disabled).toBe(false);
  mocks.send.mockResolvedValueOnce(exportResponse());

  await clickButton('download');

  expect(mocks.send).toHaveBeenLastCalledWith({
    operation: 'build-export-package',
    exportKind: 'selective',
    selectedNodeIds: ['capture', 'capture.image'],
  });
  expect(mocks.download).toHaveBeenCalledTimes(1);
});

async function renderFlow() {
  await act(async () =>
    root.render(
      <InspectorLayout>
        <SettingsTransferExportFlow />
      </InspectorLayout>
    )
  );
}

function button(label: string): HTMLButtonElement {
  const control = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === `settings.settingsTransfer.${label}`
  );
  if (!control) throw new Error(`Missing control: ${label}`);
  return control;
}

async function clickButton(label: string) {
  await act(async () => button(label).click());
}

function exportResponse() {
  return {
    operation: 'build-export-package' as const,
    filename: 'settings.sniptale-settings.json',
    fileText: '{"settings":1}',
  };
}

function transferTree(): SettingsTransferTreeNode[] {
  return [
    {
      id: 'capture',
      parentId: null,
      domainId: 'capture',
      labelKey: 'capture',
      descriptionKey: 'capture',
      kind: 'collection',
      classification: 'transferable',
      selectable: true,
      requiredBy: [],
      children: [
        {
          id: 'capture.image',
          parentId: 'capture',
          domainId: 'capture.image',
          labelKey: 'image',
          descriptionKey: 'image',
          kind: 'scalar',
          classification: 'transferable',
          selectable: true,
          requiredBy: [],
          children: [],
        },
      ],
    },
  ];
}
