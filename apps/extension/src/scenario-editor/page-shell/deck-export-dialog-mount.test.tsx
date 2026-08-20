// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioV3DeckExportDialogMount } from './deck-export-dialog-mount';
import type { useScenarioV3EditorState } from './state';
import { translate } from '../../platform/i18n';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

const {
  buildScenarioDeckExportMock,
  createDirectFileSinkMock,
  downloadScenarioEditorBlobMock,
  exportDialogPropsMock,
} = vi.hoisted(() => ({
  buildScenarioDeckExportMock: vi.fn(),
  createDirectFileSinkMock: vi.fn(),
  downloadScenarioEditorBlobMock: vi.fn(),
  exportDialogPropsMock: vi.fn(),
}));

vi.mock('../project/export/deck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project/export/deck')>()),
  buildScenarioDeckExport: buildScenarioDeckExportMock,
}));
vi.mock('../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/store/public')>()),
  getScenarioAssetBlob: vi.fn(),
}));
vi.mock('../platform/browser-driver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/browser-driver')>()),
  downloadScenarioEditorBlob: downloadScenarioEditorBlobMock,
}));
vi.mock('../../composition/archive-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/archive-transfer')>()),
  createDirectFileSink: createDirectFileSinkMock,
}));
vi.mock('../export-dialog/deck', () => ({
  ScenarioDeckExportDialog: (props: { onExport: (options: object) => Promise<unknown> }) => {
    exportDialogPropsMock(props);
    return <div data-testid="deck-export-dialog" />;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  buildScenarioDeckExportMock.mockResolvedValue({
    blob: new Blob(['deck']),
    filename: 'deck.zip',
    format: 'html',
    missingAssetIds: [],
  });
  createDirectFileSinkMock.mockResolvedValue({
    abort: vi.fn(),
    close: vi.fn(),
    writable: new WritableStream<Uint8Array>(),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('mounts the page-shell owned export dialog and downloads the generated deck', async () => {
  const project = createScenarioProjectV3('Deck');
  renderDialogMount(project);
  const dialogProps = getLastMockArg<{ onExport: (options: object) => Promise<unknown> }>(
    exportDialogPropsMock
  );

  await act(async () => {
    await dialogProps.onExport({ format: 'html' });
  });

  expect(container?.querySelector('[data-testid="deck-export-dialog"]')).not.toBeNull();
  expect(buildScenarioDeckExportMock).toHaveBeenCalledWith({
    getAssetBlob: expect.any(Function),
    options: { format: 'html' },
    project,
  });
  expect(downloadScenarioEditorBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'deck.zip');
});

it('does not mount the export dialog while closed', () => {
  renderDialogMount(createScenarioProjectV3('Deck'), false);

  expect(container?.querySelector('[data-testid="deck-export-dialog"]')).toBeNull();
  expect(exportDialogPropsMock).not.toHaveBeenCalled();
});

it('opens a localized direct sink for file-backed deck packages', async () => {
  const project = createScenarioProjectV3('Deck');
  renderDialogMount(project);
  const dialogProps = getLastMockArg<{
    onExport: (options: {
      assetMode: 'files';
      format: 'markdown';
      includeMissingPlaceholders: boolean;
      includeNotes: boolean;
      includeSourceJson: boolean;
    }) => Promise<unknown>;
  }>(exportDialogPropsMock);
  const options = {
    assetMode: 'files' as const,
    format: 'markdown' as const,
    includeMissingPlaceholders: true,
    includeNotes: true,
    includeSourceJson: true,
  };

  await act(async () => {
    await dialogProps.onExport(options);
  });

  expect(createDirectFileSinkMock).toHaveBeenCalledWith({
    description: translate('scenario.editor.exportArchiveDescription'),
    extension: '.zip',
    filename: 'deck-markdown.zip',
    mimeType: 'application/zip',
  });
  expect(buildScenarioDeckExportMock).toHaveBeenCalledWith({
    archiveSink: expect.any(Object),
    getAssetBlob: expect.any(Function),
    options,
    project,
  });
});

function renderDialogMount(project: ScenarioProjectV3, open = true) {
  act(() => {
    root?.render(
      <ScenarioV3DeckExportDialogMount
        editor={{ project } as ScenarioV3EditorState}
        onClose={vi.fn()}
        open={open}
      />
    );
  });
}

function getLastMockArg<T>(mock: { mock: { calls: unknown[][] } }): T {
  const lastCall = mock.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error('Expected mock to be called');
  }
  return lastCall[0] as T;
}
