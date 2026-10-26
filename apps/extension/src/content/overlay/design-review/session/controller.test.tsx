// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import type { DesignReviewTool } from '../../../selection/design-review';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';

const controllerMocks = vi.hoisted(() => ({
  openTarget: vi.fn(() => true),
  flushHistory: vi.fn(),
  showToast: vi.fn(),
  closeComment: vi.fn(() => true),
  canEditText: vi.fn(() => true),
  canResetText: vi.fn(() => false),
  editText: vi.fn(() => true),
  resetText: vi.fn(() => true),
  dismissSelection: vi.fn(),
  dismissRequestHandler: null as ((event?: KeyboardEvent) => boolean) | null,
  registerDismissRequestHandler: vi.fn((handler: (event?: KeyboardEvent) => boolean) => {
    controllerMocks.dismissRequestHandler = handler;
    return () => {
      if (controllerMocks.dismissRequestHandler === handler) {
        controllerMocks.dismissRequestHandler = null;
      }
    };
  }),
  cancelVoiceInput: vi.fn(),
  updateDraft: vi.fn(),
  readComment: vi.fn(() => ({ comment: 'Existing feedback', marker: null })),
  voiceActive: false,
  voicePending: false,
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
  tool: 'comment' as DesignReviewTool,
  checkOpen: false,
  selectionOrigin: 'page' as 'page' | 'finding' | 'tool',
  measure: { a: null, b: null, preview: null, slot: 'a' as const, replacing: false },
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
  closeDesignReviewChecks: vi.fn(() => {
    designReviewModeState.checkOpen = false;
  }),
  enableDesignReviewMode: vi.fn(),
  getDesignReviewModeState: () => designReviewModeState,
  openDesignReviewTarget: controllerMocks.openTarget,
  registerDesignReviewInspectorDismissRequestHandler: controllerMocks.registerDismissRequestHandler,
  setDesignReviewTool: vi.fn(() => {
    designReviewModeState.checkOpen = false;
    designReviewModeState.selectionOrigin = 'tool';
    return true;
  }),
  dismissDesignReviewMeasureLayer: vi.fn(() => false),
  registerDesignReviewToolSwitchRequestHandler: vi.fn(() => () => undefined),
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
    updateCommentDraft: controllerMocks.updateDraft,
  }),
}));

vi.mock('./comment-voice-input', () => ({
  useDesignReviewCommentVoiceInput: () => ({
    actions: { start: vi.fn(), stop: vi.fn(), cancel: controllerMocks.cancelVoiceInput },
    state: {
      active: controllerMocks.voiceActive,
      pending: controllerMocks.voicePending,
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

vi.mock('../runtime/comment', () => ({ readPropertiesComment: controllerMocks.readComment }));

vi.mock('./clipboard', () => ({
  copyDesignReviewText: vi.fn(async () => true),
}));
vi.mock('../runtime/actions', () => ({
  flushPendingPageStyleHistory: controllerMocks.flushHistory,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  showToast: controllerMocks.showToast,
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
  Object.defineProperty(document.body, 'getClientRects', {
    configurable: true,
    value: () => [new DOMRect(0, 0, 1280, 560)],
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controllerMocks.closeComment.mockReturnValue(true);
  controllerMocks.openTarget.mockReturnValue(true);
  controllerMocks.flushHistory.mockReset();
  controllerMocks.voiceActive = false;
  controllerMocks.voicePending = false;
  designReviewModeState.tool = 'comment';
  designReviewModeState.editingText = false;
  designReviewModeState.checkOpen = false;
  designReviewModeState.selectionOrigin = 'page';
  target.textContent = 'Save';
  host = document.createElement('div');
  document.body.append(host, target);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
});

afterEach(() => {
  Reflect.deleteProperty(document.body, 'getClientRects');
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
  expect(controllerMocks.cancelVoiceInput).toHaveBeenCalledTimes(2);
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
  designReviewModeState.tool = 'comment';
  designReviewModeState.editingText = false;
  designReviewModeState.checkOpen = false;
  designReviewModeState.selectionOrigin = 'page';
  await act(async () => root?.render(<Harness />));
  expect(latest?.inspectorOpen).toBe(true);
  expect(latest?.viewState.text.preview).toBe('Changed');
});

it('saves the comment and flushes properties before selecting another tree element', () => {
  act(() => latest?.actions.navigateElement(document.body));
  expect(controllerMocks.openTarget).toHaveBeenCalledWith(document.body);
  expect(controllerMocks.closeComment.mock.invocationCallOrder[0]).toBeLessThan(
    controllerMocks.flushHistory.mock.invocationCallOrder[0]!
  );
  expect(controllerMocks.flushHistory.mock.invocationCallOrder[0]).toBeLessThan(
    controllerMocks.openTarget.mock.invocationCallOrder[0]!
  );
  expect(controllerMocks.dismissSelection).not.toHaveBeenCalled();
});

it('retains the current element when its comment cannot be saved or the target is detached', () => {
  controllerMocks.closeComment.mockReturnValue(false);
  act(() => latest?.actions.navigateElement(document.body));
  controllerMocks.closeComment.mockReturnValue(true);
  act(() => latest?.actions.navigateElement(document.createElement('div')));
  expect(controllerMocks.openTarget).not.toHaveBeenCalled();
  expect(controllerMocks.flushHistory).not.toHaveBeenCalled();
  expect(latest?.inspectorOpen).toBe(true);
});

it.each(['refused', 'history failure'] as const)(
  'keeps selection and reports %s during tree navigation',
  (failure) => {
    if (failure === 'refused') controllerMocks.openTarget.mockReturnValue(false);
    else
      controllerMocks.flushHistory.mockImplementationOnce(() => {
        throw new Error('Cannot flush');
      });
    act(() => latest?.actions.navigateElement(document.body));
    expect(controllerMocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(controllerMocks.dismissSelection).not.toHaveBeenCalled();
    expect(latest?.inspectorOpen).toBe(true);
  }
);

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
  controllerMocks.cancelVoiceInput.mockClear();
  controllerMocks.closeComment.mockClear();
  controllerMocks.dismissSelection.mockClear();

  act(() => expect(controllerMocks.dismissRequestHandler?.()).toBe(true));
  expect(controllerMocks.cancelVoiceInput).toHaveBeenCalledOnce();
  expect(controllerMocks.closeComment).not.toHaveBeenCalled();
  expect(controllerMocks.dismissSelection).not.toHaveBeenCalled();
  expect(latest?.inspectorOpen).toBe(true);

  controllerMocks.voiceActive = false;
  controllerMocks.voicePending = false;
  await act(async () => root?.render(<Harness />));
  act(() => expect(controllerMocks.dismissRequestHandler?.()).toBe(true));

  expect(controllerMocks.cancelVoiceInput).toHaveBeenCalledTimes(2);
  expect(controllerMocks.closeComment).toHaveBeenCalledOnce();
  expect(controllerMocks.dismissSelection).toHaveBeenCalledOnce();
  expect(latest?.inspectorOpen).toBe(false);
});

it('cancels processing on dismissal before closing the comment', async () => {
  controllerMocks.voicePending = true;
  await act(async () => root?.render(<Harness />));
  controllerMocks.cancelVoiceInput.mockClear();
  controllerMocks.closeComment.mockClear();
  act(() => expect(controllerMocks.dismissRequestHandler?.()).toBe(true));
  expect(controllerMocks.cancelVoiceInput).toHaveBeenCalledOnce();
  expect(controllerMocks.closeComment).not.toHaveBeenCalled();
  expect(latest?.inspectorOpen).toBe(true);
});

it('refuses finding navigation when the comment owner cannot close', () => {
  controllerMocks.closeComment.mockReturnValue(false);
  const finding = {
    id: 'f',
    target,
    label: 'button',
    kind: 'positive-tabindex' as const,
    evidence: { value: 2 },
  };
  act(() => latest?.onFinding(finding, 'show'));
  expect(controllerMocks.openTarget).not.toHaveBeenCalled();
  expect(latest?.checks.navigationFailed).toBe(true);
});

it('shows a finding through its origin without selecting a page tool', () => {
  const finding = {
    id: 'f',
    target,
    label: 'button',
    kind: 'positive-tabindex' as const,
    evidence: { value: 2 },
  };
  act(() => latest?.onFinding(finding, 'show'));
  expect(controllerMocks.openTarget).toHaveBeenCalledWith(target, 'finding');
  expect(latest?.checks.navigationFailed).toBe(false);
});

it('appends a finding to existing feedback only after explicit Comment handoff', async () => {
  designReviewModeState.checkOpen = true;
  designReviewModeState.selectionOrigin = 'finding';
  await act(async () => root?.render(<Harness />));
  expect(latest?.inspectorOpen).toBe(false);
  const finding = {
    id: 'f',
    target,
    label: 'button',
    kind: 'positive-tabindex' as const,
    evidence: { value: 2 },
  };
  await act(async () => {
    latest?.onFinding(finding, 'comment');
    root?.render(<Harness />);
  });
  expect(controllerMocks.updateDraft).toHaveBeenCalledWith(
    expect.stringMatching(/^Existing feedback\n\n.+/u)
  );
});

it('keeps finding navigation out of the automatic Comment presentation after Check closes', async () => {
  designReviewModeState.selectionOrigin = 'finding';
  await act(async () => root?.render(<Harness />));
  expect(latest?.inspectorOpen).toBe(false);
});

it('refreshes the selected source and its observation revision after canonical edits and replay', () => {
  Object.defineProperty(target, 'getClientRects', {
    configurable: true,
    value: () => [new DOMRect(0, 0, 200, 40)],
  });
  const evidence = createBrowserAnnotationTargetEvidence(target);
  const change = (value: string) => ({
    property: 'width',
    order: 1,
    before: { value: '', priority: '' },
    after: { value, priority: '' },
  });
  act(() => {
    target.style.width = '50%';
    browserAnnotationSession.recordPropertyChanges({ target, evidence, changes: [change('50%')] });
  });
  const accepted = browserAnnotationSession.captureSnapshot();
  const revision = latest!.sessionRevision;
  const width = () =>
    latest!.viewState.selection!.patch.declarations.find((item) => item.property === 'width')
      ?.value;
  expect(width()).toBe('50%');
  act(() => {
    target.style.width = '25%';
    browserAnnotationSession.recordPropertyChanges({ target, evidence, changes: [change('25%')] });
  });
  expect(latest!.sessionRevision).toBeGreaterThan(revision);
  expect(width()).toBe('25%');
  act(() => {
    target.style.width = '50%';
    browserAnnotationSession.applySnapshot(accepted);
  });
  expect(width()).toBe('50%');
  Reflect.deleteProperty(target, 'getClientRects');
  browserAnnotationSession.resetForDocument();
});

it.each([
  { tool: 'inspect' as const, dismiss: 'close' },
  { tool: 'compare' as const, dismiss: 'close' },
  { tool: 'inspect' as const, dismiss: 'Escape' },
  { tool: 'compare' as const, dismiss: 'Escape' },
])(
  'keeps $tool workspace closed after Check $dismiss while retaining the selected identity',
  async ({ tool, dismiss }) => {
    designReviewModeState.tool = tool;
    designReviewModeState.checkOpen = true;
    await act(async () => root?.render(<Harness />));
    const selected = designReviewModeState.selection;
    expect(latest?.toolPanelOpen).toBe(true);
    await act(async () => {
      if (dismiss === 'close') latest?.workspace.close();
      else controllerMocks.dismissRequestHandler?.(new KeyboardEvent('keydown', { key: 'Escape' }));
      root?.render(<Harness />);
    });
    expect(designReviewModeState.checkOpen).toBe(false);
    expect(latest?.toolPanelOpen).toBe(false);
    expect(latest?.tool).toBe(tool);
    expect(designReviewModeState.selection).toBe(selected);
  }
);

it.each(['inspect', 'compare'] as const)(
  'resumes the existing %s workspace when Check presentation closes without a workspace dismissal',
  async (tool) => {
    designReviewModeState.tool = tool;
    designReviewModeState.checkOpen = true;
    await act(async () => root?.render(<Harness />));
    await act(async () => {
      designReviewModeState.checkOpen = false;
      root?.render(<Harness />);
    });
    expect(latest?.toolPanelOpen).toBe(true);
    expect(latest?.tool).toBe(tool);
  }
);
