import type { Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  advanceEditorStepValueMock: vi.fn(),
  applyEditorToolModeMock: vi.fn(),
  moveLayerSelectionMock: vi.fn(),
  moveLayerSelectionToEdgeMock: vi.fn(),
  pushEditorSnapshotHistoryMock: vi.fn(),
  scheduleEditorZoomToFitMock: vi.fn(),
  setActiveToolMock: vi.fn(),
  syncEditorRuntimeStateMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      setActiveTool: mocks.setActiveToolMock,
    }),
  },
}));

vi.mock('../history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../history')>()),
  pushEditorSnapshotHistory: mocks.pushEditorSnapshotHistoryMock,
}));

vi.mock('../layer-actions/reorder/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layer-actions/reorder/selection')>()),
  moveLayerSelection: mocks.moveLayerSelectionMock,
  moveLayerSelectionToEdge: mocks.moveLayerSelectionToEdgeMock,
}));

vi.mock('./', () => ({
  scheduleEditorZoomToFit: mocks.scheduleEditorZoomToFitMock,
  syncEditorRuntimeState: mocks.syncEditorRuntimeStateMock,
}));

vi.mock('../tools/tool-mode/application', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/tool-mode/application')>()),
  applyEditorToolMode: mocks.applyEditorToolModeMock,
}));
vi.mock('../tools/tool-mode/step-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/tool-mode/step-value')>()),
  advanceEditorStepValue: mocks.advanceEditorStepValueMock,
}));

import {
  advanceEditorControllerStepValue,
  applyEditorControllerToolMode,
  commitEditorHistory,
  getNextEditorLabelIndex,
  moveEditorSelection,
  moveEditorSelectionToEdge,
  scheduleEditorControllerZoomToFit,
  switchEditorControllerToSelectTool,
  syncEditorControllerRuntimeState,
  withEditorHistoryMuted,
} from './actions';

type RuntimeActionsCanvas = Canvas & {
  getObjects: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
};

function createCanvas(): RuntimeActionsCanvas {
  return {
    getObjects: vi.fn(() => [
      { sniptaleType: 'text' },
      { sniptaleType: 'text' },
      { sniptaleType: 'shape' },
    ]),
    requestRenderAll: vi.fn(),
  } as unknown as RuntimeActionsCanvas;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function runSelectionMovementSuite() {
  it('moves selections only when layer-action seams report a scene change', () => {
    const canvas = createCanvas();
    const sendFrameObjectsToBack = vi.fn();
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    mocks.moveLayerSelectionMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
    mocks.moveLayerSelectionToEdgeMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

    moveEditorSelection({
      canvas,
      direction: 1,
      sendFrameObjectsToBack,
      commitHistory,
      syncRuntimeState,
    });
    moveEditorSelection({
      canvas,
      direction: -1,
      sendFrameObjectsToBack,
      commitHistory,
      syncRuntimeState,
    });
    moveEditorSelectionToEdge({
      canvas,
      edge: 'front',
      sendFrameObjectsToBack,
      commitHistory,
      syncRuntimeState,
    });
    moveEditorSelectionToEdge({
      canvas,
      edge: 'back',
      sendFrameObjectsToBack,
      commitHistory,
      syncRuntimeState,
    });

    expect(sendFrameObjectsToBack).toHaveBeenCalledTimes(2);
    expect(canvas.requestRenderAll).toHaveBeenCalledTimes(2);
    expect(commitHistory).toHaveBeenCalledTimes(2);
    expect(syncRuntimeState).toHaveBeenCalledTimes(2);
  });
}

function runHistorySuite() {
  it('mutes history around a callback and commits snapshots only when push succeeds', () => {
    let historyMuted = 0;
    const syncRuntimeState = vi.fn();
    mocks.pushEditorSnapshotHistoryMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const result = withEditorHistoryMuted({
      getHistoryMuted: () => historyMuted,
      setHistoryMuted: (next) => {
        historyMuted = next;
      },
      callback: () => {
        expect(historyMuted).toBe(1);
        return 'done';
      },
    });
    expect(result).toBe('done');
    expect(historyMuted).toBe(0);

    expect(
      commitEditorHistory({
        history: {} as never,
        historyMuted: false,
        exportDocument: () => ({ id: 'doc' }) as never,
        syncRuntimeState,
      })
    ).toBe(false);
    expect(
      commitEditorHistory({
        history: {} as never,
        historyMuted: false,
        exportDocument: () => ({ id: 'doc' }) as never,
        syncRuntimeState,
      })
    ).toBe(true);
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function runDelegationSuite() {
  it('delegates runtime sync, tool mode, zoom scheduling, and step advance', () => {
    const callback = vi.fn();
    const clearCropSelection = vi.fn();

    scheduleEditorControllerZoomToFit(callback);
    syncEditorControllerRuntimeState({
      canvas: createCanvas(),
      history: {} as never,
      cropGuide: null,
      cropSelection: null,
      viewportState: { zoom: 1 } as never,
    });
    applyEditorControllerToolMode({
      canvas: createCanvas(),
      activeTool: 'text',
      enabled: true,
      hasCropGuide: true,
      clearCropSelection,
    });
    advanceEditorControllerStepValue();

    expect(mocks.scheduleEditorZoomToFitMock).toHaveBeenCalledWith(callback);
    expect(mocks.syncEditorRuntimeStateMock).toHaveBeenCalledOnce();
    expect(mocks.applyEditorToolModeMock).toHaveBeenCalledWith({
      canvas: expect.anything(),
      activeTool: 'text',
      enabled: true,
      hasCropGuide: true,
      clearCropSelection,
    });
    expect(mocks.advanceEditorStepValueMock).toHaveBeenCalledOnce();
  });
}

function runSelectToolAndLabelsSuite() {
  it('switches to the select tool and counts labels from current canvas objects', () => {
    const applyToolMode = vi.fn();
    const setActiveTool = vi.fn();
    const canvas = createCanvas();

    switchEditorControllerToSelectTool({
      setActiveTool,
      applyToolMode,
    });

    expect(setActiveTool).toHaveBeenCalledWith('select');
    expect(mocks.setActiveToolMock).toHaveBeenCalledWith('select');
    expect(applyToolMode).toHaveBeenCalledOnce();
    expect(getNextEditorLabelIndex(canvas, 'text')).toBe(3);
    expect(getNextEditorLabelIndex(null, 'text')).toBe(1);
  });
}

describe('editor-controller-runtime-actions', () => {
  runSelectionMovementSuite();
  runHistorySuite();
  runDelegationSuite();
  runSelectToolAndLabelsSuite();
});
