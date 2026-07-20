// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { PageStylePatch, PageStyleTemplate } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import { usePageStyleSaveActions } from './actions';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  savePageStyleTemplateAndCleanupAssets: vi.fn(),
  savePageStyleTemplate: vi.fn(),
}));

vi.mock('../../../../composition/persistence/page-style/storage', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/page-style/storage')
  >()),
  savePageStyleTemplate: mocks.savePageStyleTemplate,
}));

vi.mock('../../../../composition/persistence/page-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/page-style')>()),
  savePageStyleTemplateAndCleanupAssets: mocks.savePageStyleTemplateAndCleanupAssets,
}));

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof usePageStyleSaveActions> | null = null;

const draftPatch: PageStylePatch = {
  assets: [],
  declarations: [{ property: 'width', value: '120px' }],
};

const template: PageStyleTemplate = {
  createdAt: 1,
  id: 'template-1',
  name: 'Template',
  patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
  propertySummary: ['color'],
  updatedAt: 1,
};

function createSelection(): PageStyleSelectionSnapshot {
  return {
    domPath: '#target',
    element: document.createElement('div'),
    kind: 'block',
    patch: { assets: [], declarations: [] },
    selector: { locator: '#target' },
    selectorLabel: '#target',
    tagName: 'div',
    textPreview: '',
  };
}

function Harness() {
  latest = usePageStyleSaveActions({
    draftPatch,
    includeComputedInTemplate: false,
    refresh: mocks.refresh,
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    selection: createSelection(),
    templateName: 'Template',
    values: {},
  });
  return null;
}

async function renderHarness() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(<Harness />);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  latest = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

function setupTemplateCleanupSave(cleanupFailedAssetIds: string[] = []) {
  mocks.savePageStyleTemplateAndCleanupAssets.mockResolvedValueOnce({
    cleanupFailedAssetIds,
    template,
  });
}

it('renames existing templates without changing their patch', async () => {
  await renderHarness();

  await act(async () => {
    await latest?.renameTemplate(template, 'Renamed');
  });

  expect(mocks.savePageStyleTemplate).toHaveBeenCalledWith({
    id: 'template-1',
    name: 'Renamed',
    patch: template.patch,
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it('updates existing templates from the current draft patch', async () => {
  setupTemplateCleanupSave();
  await renderHarness();

  await act(async () => {
    await latest?.updateTemplate(template);
  });

  expect(mocks.savePageStyleTemplateAndCleanupAssets).toHaveBeenCalledWith({
    id: 'template-1',
    name: 'Template',
    patch: draftPatch,
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it('returns a warning when template update cannot clean removed assets', async () => {
  setupTemplateCleanupSave(['asset-orphan']);
  await renderHarness();

  let outcome: Awaited<ReturnType<NonNullable<typeof latest>['updateTemplate']>> | undefined;
  await act(async () => {
    outcome = await latest?.updateTemplate(template);
  });

  expect(outcome).toEqual({
    message: 'Действие выполнено, но часть файлов не удалось очистить',
    state: 'warning',
  });
});
