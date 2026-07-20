import { describe, expect, it } from 'vitest';
import { createManualViewportPreviewPatch, createResetDocumentState } from './helpers';
import { useEditorStore } from './useEditorStore';
import type { EditorState } from './types';

const RESET_DEFAULTS = {
  initialSelection: {
    hasSelection: false,
    selectedObjectCount: 0,
    selectedObjectType: null,
    selectedObjectId: null,
    selectedObjectIds: [] as string[],
    selectedObjectWidth: null,
    selectedObjectHeight: null,
  },
  initialHistory: {
    canUndo: false,
    canRedo: false,
    index: 0,
    size: 1,
  },
  initialViewport: {
    zoomPercent: 100,
    canvasWidth: 0,
    canvasHeight: 0,
    sourceWidth: 0,
    sourceHeight: 0,
    sourceName: null,
    viewportWidth: 0,
    viewportHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
    scaledCanvasWidth: 0,
    scaledCanvasHeight: 0,
    canvasOffsetLeft: 0,
    canvasOffsetTop: 0,
  },
};

function createPreviewState(): EditorState {
  return {
    ...useEditorStore.getState(),
    viewportPreviewOpen: true,
    viewportPreviewAutomationBlockedInSession: true,
  };
}

describe('editor store viewport preview helpers', () => {
  it('blocks future automation after a manual close without clearing on manual reopen', () => {
    const state = createPreviewState();
    const manualClosePatch = createManualViewportPreviewPatch(state, false);

    expect(manualClosePatch).toEqual({
      viewportPreviewOpen: false,
      viewportPreviewAutomationBlockedInSession: true,
    });

    expect(
      createManualViewportPreviewPatch(
        {
          ...state,
          viewportPreviewOpen: false,
          viewportPreviewAutomationBlockedInSession: true,
        },
        true
      )
    ).toEqual({
      viewportPreviewOpen: true,
      viewportPreviewAutomationBlockedInSession: true,
    });
  });
});

describe('editor store viewport preview reset helpers', () => {
  it('latches the session block on the first manual enable and preserves manual preview on reset', () => {
    const state = {
      ...createPreviewState(),
      viewportPreviewOpen: false,
      viewportPreviewAutomationBlockedInSession: false,
    };

    expect(createManualViewportPreviewPatch(state, true)).toEqual({
      viewportPreviewOpen: true,
      viewportPreviewAutomationBlockedInSession: true,
    });

    expect(
      createResetDocumentState(
        {
          ...state,
          viewportPreviewOpen: true,
          viewportPreviewAutomationBlockedInSession: true,
        },
        RESET_DEFAULTS
      )
    ).toEqual(
      expect.objectContaining({
        viewportPreviewOpen: true,
      })
    );
  });
});
