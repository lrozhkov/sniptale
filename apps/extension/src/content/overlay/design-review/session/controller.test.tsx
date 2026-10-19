// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';

const controllerMocks = vi.hoisted(() => ({
  closeComment: vi.fn(() => true),
  canEditText: vi.fn(() => true),
  canResetText: vi.fn(() => false),
  editText: vi.fn(() => true),
  resetText: vi.fn(() => true),
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
  editingText: false,
  selection: { anchor: { x: 20, y: 30 }, snapshot: selection },
};

vi.mock('../../../selection/design-review', () => ({
  canEditDesignReviewText: controllerMocks.canEditText,
  canResetDesignReviewText: controllerMocks.canResetText,
  startDesignReviewTextEditing: controllerMocks.editText,
  resetDesignReviewText: controllerMocks.resetText,
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
  copyDesignReviewText: vi.fn(async () => true),
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
  designReviewModeState.editingText = false;
  target.textContent = 'Save';
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

it('finishes the comment before text editing and hides only the inspector during input', async () => {
  act(() => latest?.actions.text.edit());
  expect(controllerMocks.editText).toHaveBeenCalledOnce();
  expect(controllerMocks.dismissSelection).not.toHaveBeenCalled();
  designReviewModeState.editingText = true;
  await act(async () => root?.render(<Harness />));
  expect(latest?.inspectorOpen).toBe(false);
  expect(latest?.enabled).toBe(true);
  target.textContent = 'Changed';
  designReviewModeState.editingText = false;
  await act(async () => root?.render(<Harness />));
  expect(latest?.inspectorOpen).toBe(true);
  expect(latest?.viewState.text.preview).toBe('Changed');
});

it('preserves a failed comment draft before either text action', () => {
  controllerMocks.closeComment.mockReturnValue(false);
  act(() => {
    latest?.actions.text.edit();
    latest?.actions.text.reset();
  });
  expect(controllerMocks.editText).not.toHaveBeenCalled();
  expect(controllerMocks.resetText).not.toHaveBeenCalled();
  expect(latest?.inspectorOpen).toBe(true);
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
