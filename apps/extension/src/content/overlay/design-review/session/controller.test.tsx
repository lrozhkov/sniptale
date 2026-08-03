// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';

const controllerMocks = vi.hoisted(() => ({
  closeComment: vi.fn(() => true),
  dismissSelection: vi.fn(),
  dismissRequestHandler: null as (() => boolean) | null,
  registerDismissRequestHandler: vi.fn((handler: () => boolean) => {
    controllerMocks.dismissRequestHandler = handler;
    return () => {
      if (controllerMocks.dismissRequestHandler === handler) {
        controllerMocks.dismissRequestHandler = null;
      }
    };
  }),
  stopVoiceInput: vi.fn(),
  voiceActive: false,
}));

const target = document.createElement('button');
const selection: PageStyleSelectionSnapshot = {
  domPath: 'html > body > button',
  element: target,
  kind: 'text',
  patch: { declarations: [] },
  selectorLabel: 'button',
  tagName: 'button',
  textPreview: 'Save',
};
const designReviewModeState = {
  enabled: true,
  selection: { anchor: { x: 20, y: 30 }, snapshot: selection },
};

vi.mock('../../../selection/design-review', () => ({
  DesignReviewModeState: undefined,
  disableDesignReviewMode: vi.fn(),
  dismissDesignReviewSelection: controllerMocks.dismissSelection,
  enableDesignReviewMode: vi.fn(),
  getDesignReviewModeState: () => designReviewModeState,
  openDesignReviewTarget: vi.fn(() => true),
  registerDesignReviewInspectorDismissRequestHandler: controllerMocks.registerDismissRequestHandler,
  subscribeToDesignReviewMode: () => () => undefined,
}));

vi.mock('./comment-draft', () => ({
  usePageStyleCommentDraft: () => ({
    closeComment: controllerMocks.closeComment,
    commentCommitFailed: false,
    commentDraft: '',
    commitComment: vi.fn(() => true),
    endCommentComposition: vi.fn(),
    markerNumber: null,
    startCommentComposition: vi.fn(),
    updateCommentDraft: vi.fn(),
  }),
}));

vi.mock('./comment-voice-input', () => ({
  useDesignReviewCommentVoiceInput: () => ({
    actions: { start: vi.fn(), stop: controllerMocks.stopVoiceInput },
    state: {
      active: controllerMocks.voiceActive,
      audioLevel: 0,
      caretPosition: null,
      errorCode: null,
      phase: 'idle',
    },
  }),
}));

vi.mock('./draft', () => ({
  usePageStyleDraftState: () => ({
    defaultValues: {},
    draftPatch: { declarations: [] },
    modifiedProperties: [],
    setSideFieldLinked: vi.fn(),
    setValues: vi.fn(),
    sideFieldLinks: {},
    values: {},
  }),
}));

vi.mock('../value-editing/actions', () => ({
  usePageStyleValueActions: () => ({
    resetValue: vi.fn(),
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  }),
}));

vi.mock('../runtime/record', () => ({
  commitDesignReviewAction: vi.fn(),
  createDesignReviewResetBatch: vi.fn(),
  deleteDesignReviewRecord: vi.fn(),
  readDesignReviewRecord: vi.fn(() => null),
  retainDesignReviewRecovery: vi.fn(),
  serializeDesignReviewRecord: vi.fn(() => ''),
}));

vi.mock('./clipboard', () => ({
  copyDesignReviewText: vi.fn(async () => undefined),
}));

import { useDesignReviewController } from './controller';

let host: HTMLDivElement;
let latest: ReturnType<typeof useDesignReviewController> | null = null;
let root: Root | null = null;

function Harness() {
  latest = useDesignReviewController({ enabled: true });
  return null;
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controllerMocks.closeComment.mockReturnValue(true);
  controllerMocks.voiceActive = false;
  host = document.createElement('div');
  document.body.append(host, target);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  latest = null;
  controllerMocks.dismissRequestHandler = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('autosaves and closes the inspector through the picker outside-dismiss request', () => {
  expect(latest?.inspectorOpen).toBe(true);

  act(() => expect(controllerMocks.dismissRequestHandler?.()).toBe(true));

  expect(controllerMocks.closeComment).toHaveBeenCalledOnce();
  expect(controllerMocks.stopVoiceInput).toHaveBeenCalledTimes(2);
  expect(controllerMocks.dismissSelection).toHaveBeenCalledOnce();
  expect(latest?.inspectorOpen).toBe(false);
});

it('keeps the inspector open and selected when automatic save fails', () => {
  controllerMocks.closeComment.mockReturnValue(false);

  act(() => expect(controllerMocks.dismissRequestHandler?.()).toBe(false));

  expect(controllerMocks.dismissSelection).not.toHaveBeenCalled();
  expect(latest?.inspectorOpen).toBe(true);
});

it('stops voice on the first dismissal request and closes only on the second', async () => {
  controllerMocks.voiceActive = true;
  await act(async () => root?.render(<Harness />));
  controllerMocks.stopVoiceInput.mockClear();
  controllerMocks.closeComment.mockClear();
  controllerMocks.dismissSelection.mockClear();

  act(() => expect(controllerMocks.dismissRequestHandler?.()).toBe(true));
  expect(controllerMocks.stopVoiceInput).toHaveBeenCalledOnce();
  expect(controllerMocks.closeComment).not.toHaveBeenCalled();
  expect(controllerMocks.dismissSelection).not.toHaveBeenCalled();
  expect(latest?.inspectorOpen).toBe(true);

  controllerMocks.voiceActive = false;
  await act(async () => root?.render(<Harness />));
  act(() => expect(controllerMocks.dismissRequestHandler?.()).toBe(true));

  expect(controllerMocks.stopVoiceInput).toHaveBeenCalledTimes(2);
  expect(controllerMocks.closeComment).toHaveBeenCalledOnce();
  expect(controllerMocks.dismissSelection).toHaveBeenCalledOnce();
  expect(latest?.inspectorOpen).toBe(false);
});
