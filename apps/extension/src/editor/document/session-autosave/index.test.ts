// @vitest-environment jsdom

/* eslint-disable max-lines-per-function -- autosave regression scenarios share one debounced lifecycle fixture */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDocument } from '../../../features/editor/document/types';

const { deleteEditorSessionDraftMock, getEditorSessionDraftMock, saveEditorSessionDraftMock } =
  vi.hoisted(() => ({
    deleteEditorSessionDraftMock: vi.fn(),
    getEditorSessionDraftMock: vi.fn(),
    saveEditorSessionDraftMock: vi.fn(),
  }));

vi.mock('../../../composition/persistence/editor-sessions/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/editor-sessions/index')
  >()),
  deleteEditorSessionDraft: deleteEditorSessionDraftMock,
  getEditorSessionDraft: getEditorSessionDraftMock,
  saveEditorSessionDraft: saveEditorSessionDraftMock,
}));

function createEditorDocumentFixture(sourceImageData: string): EditorDocument {
  return {
    version: 1,
    sourceImageData,
    sourceName: 'capture.png',
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 80,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#000000',
      backgroundGradientAngle: 90,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: '{"objects":[]}',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  const { useEditorStore } = await import('../../state/useEditorStore');
  useEditorStore.getState().setSaveState('idle');
  useEditorStore.getState().setSaveErrorMessage(null);
  useEditorStore.getState().setSessionId(null);
  vi.useRealTimers();
  vi.resetModules();
});

describe('editor session autosave persistence', () => {
  it('debounces autosave and persists only the latest snapshot', async () => {
    saveEditorSessionDraftMock.mockResolvedValue(undefined);
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const firstDocument = createEditorDocumentFixture('first');
    const secondDocument = createEditorDocumentFixture('second');
    const autosave = createEditorSessionAutosaveService();

    autosave.activate({
      sessionId: 'session-1',
      assetId: 'asset-1',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example',
    });

    autosave.scheduleAutosave(firstDocument);
    autosave.scheduleAutosave(secondDocument);

    expect(useEditorStore.getState().saveState).toBe('saving');
    expect(saveEditorSessionDraftMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    expect(saveEditorSessionDraftMock).toHaveBeenCalledTimes(1);
    expect(saveEditorSessionDraftMock).toHaveBeenCalledWith({
      sessionId: 'session-1',
      document: secondDocument,
      assetId: 'asset-1',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example',
      dirty: true,
    });
    expect(useEditorStore.getState().saveErrorMessage).toBeNull();
    expect(useEditorStore.getState().saveState).toBe('saved');
  }, 20000);

  it('ignores autosave requests until a session is activated', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();

    autosave.scheduleAutosave(createEditorDocumentFixture('scheduled'));
    await autosave.flushAutosave(() => createEditorDocumentFixture('flushed'));
    await autosave.persistSnapshot(() => createEditorDocumentFixture('persisted'));

    expect(saveEditorSessionDraftMock).not.toHaveBeenCalled();
  });
});

describe('editor session autosave restore', () => {
  it('restores the persisted session state into the editor store', async () => {
    getEditorSessionDraftMock.mockResolvedValue({
      sessionId: 'session-2',
      document: createEditorDocumentFixture('restored'),
      assetId: 'asset-2',
      sourceUrl: 'https://draft.example',
      sourceTitle: 'Draft title',
      createdAt: 1,
      updatedAt: 2,
      dirty: true,
    });
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const autosave = createEditorSessionAutosaveService();

    const result = await autosave.restoreDraft('session-2');

    expect(result?.sessionId).toBe('session-2');
    expect(useEditorStore.getState().sessionId).toBe('session-2');
    expect(useEditorStore.getState().saveState).toBe('saved');
  });

  it('returns undefined when there is no persisted draft for the session', async () => {
    getEditorSessionDraftMock.mockResolvedValue(undefined);
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();

    const result = await autosave.restoreDraft('missing-session');

    expect(result).toBeUndefined();
  });
});

describe('editor session autosave cleanup', () => {
  it('flushes immediately and deletes the draft on discard', async () => {
    saveEditorSessionDraftMock.mockResolvedValue(undefined);
    deleteEditorSessionDraftMock.mockResolvedValue(undefined);
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const queuedDocument = createEditorDocumentFixture('queued');
    const flushedDocument = createEditorDocumentFixture('flushed');
    const autosave = createEditorSessionAutosaveService();

    autosave.activate({
      sessionId: 'session-3',
      assetId: null,
      sourceUrl: null,
      sourceTitle: null,
    });

    autosave.scheduleAutosave(queuedDocument);
    await autosave.flushAutosave(() => flushedDocument);

    expect(saveEditorSessionDraftMock).toHaveBeenCalledTimes(1);
    expect(saveEditorSessionDraftMock).toHaveBeenCalledWith({
      sessionId: 'session-3',
      document: queuedDocument,
      assetId: null,
      sourceUrl: null,
      sourceTitle: null,
      dirty: true,
    });

    await autosave.discardDraft();

    expect(deleteEditorSessionDraftMock).toHaveBeenCalledWith('session-3');
    expect(useEditorStore.getState().saveState).toBe('idle');
  });

  it('updates active session metadata and allows explicit discard ids', async () => {
    deleteEditorSessionDraftMock.mockResolvedValue(undefined);
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();

    autosave.activate({
      sessionId: 'session-4',
      assetId: 'asset-4',
      sourceUrl: 'https://before.example',
      sourceTitle: 'Before',
    });
    autosave.updateContext({
      assetId: 'asset-5',
      sourceUrl: 'https://after.example',
      sourceTitle: 'After',
    });
    const persistedDocument = createEditorDocumentFixture('persisted');
    await autosave.persistSnapshot(() => persistedDocument);
    await autosave.discardDraft('session-explicit');

    expect(saveEditorSessionDraftMock).toHaveBeenCalledWith({
      assetId: 'asset-5',
      dirty: true,
      document: persistedDocument,
      sessionId: 'session-4',
      sourceTitle: 'After',
      sourceUrl: 'https://after.example',
    });
    expect(deleteEditorSessionDraftMock).toHaveBeenCalledWith('session-explicit');
  });

  it('disposes pending timers without persisting stale drafts', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();

    autosave.activate({
      sessionId: 'session-5',
      assetId: null,
      sourceUrl: null,
      sourceTitle: null,
    });
    autosave.scheduleAutosave(createEditorDocumentFixture('queued'));
    autosave.dispose();

    await vi.advanceTimersByTimeAsync(500);

    expect(saveEditorSessionDraftMock).not.toHaveBeenCalled();
  });

  it('marks the session as error when draft persistence fails', async () => {
    saveEditorSessionDraftMock.mockRejectedValueOnce(new Error('write failed'));
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const autosave = createEditorSessionAutosaveService();

    autosave.activate({
      sessionId: 'session-6',
      assetId: null,
      sourceTitle: null,
      sourceUrl: null,
    });
    autosave.scheduleAutosave(createEditorDocumentFixture('queued'));

    await vi.advanceTimersByTimeAsync(400);

    expect(useEditorStore.getState().saveErrorMessage).toBe('write failed');
    expect(useEditorStore.getState().saveState).toBe('error');
  });

  it('ignores context patches and discard cleanup when no session is active', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();

    autosave.updateContext({ sourceTitle: 'Ignored' });
    await autosave.discardDraft();

    expect(deleteEditorSessionDraftMock).not.toHaveBeenCalled();
  });
});
