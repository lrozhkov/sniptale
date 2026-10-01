// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentToolbarShell } from './toolbar';
import { createDrawingSession } from '../../../features/drawing/public';
import { createContentDrawingController } from '../../drawing/controller';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import * as quickEdit from '../../selection/quick-edit';
import { registerDesignReviewCommentDraftFinalizer } from '../design-review/session/comment-draft-finalization';
import { createProps } from './toolbar.test-support';
const { clearAllPagePreparationChangesMock, flushPendingPageStyleHistoryMock, showToastMock } =
  vi.hoisted(() => ({
    clearAllPagePreparationChangesMock: vi.fn(() => true),
    flushPendingPageStyleHistoryMock: vi.fn(),
    showToastMock: vi.fn(),
  }));
vi.mock('../../application/page-preparation-reset', () => ({
  clearAllPagePreparationChanges: clearAllPagePreparationChangesMock,
}));
vi.mock('../design-review/runtime/actions', () => ({
  flushPendingPageStyleHistory: flushPendingPageStyleHistoryMock,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: showToastMock }));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));
const toolbarMock = vi.hoisted(() => vi.fn());
vi.mock('../toolbar/view', () => ({
  Toolbar: (props: unknown) => {
    toolbarMock(props);
    return null;
  },
}));
let container: HTMLDivElement | null = null;
let root: Root | null = null;
async function renderShell(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ContentToolbarShell {...props} />);
  });
}
function useContentToolbarShellTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    flushPendingPageStyleHistoryMock.mockReset();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}
async function verifiesDrawingOnlyHistoryEnablesResetInNavigation() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  props.toolbar.frameCount = 0;
  props.toolbar.modes.screenshotMode = false;
  props.toolbar.modes.aiPickMode = false;
  const getHistoryState = vi
    .spyOn(pagePreparationHistory, 'getState')
    .mockReturnValue({ canRedo: false, canUndo: true, revision: 1 });
  try {
    await renderShell(props);
    const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
      canClearPagePreparation: boolean;
    };
    expect(lastToolbarProps.canClearPagePreparation).toBe(true);
  } finally {
    getHistoryState.mockRestore();
  }
}

async function verifiesPendingDrawingTextEnablesReset() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  props.toolbar.frameCount = 0;
  vi.spyOn(pagePreparationHistory, 'getState').mockReturnValue({
    canRedo: false,
    canUndo: false,
    revision: 0,
  });
  vi.spyOn(pagePreparationHistory, 'hasPendingSnapshotChanges').mockReturnValue(false);
  const drawingController = createContentDrawingController(
    createDrawingSession({ onDocumentCommit: () => true })
  );
  drawingController.registerInteractionFinalizer(() =>
    drawingController.setPendingTextChange?.(false)
  );
  props.toolbar.drawingController = drawingController;
  await renderShell(props);
  act(() => drawingController.setPendingTextChange?.(true));

  const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
    canClearPagePreparation: boolean;
    onClearPagePreparation: () => void;
  };
  expect(lastToolbarProps.canClearPagePreparation).toBe(true);
  lastToolbarProps.onClearPagePreparation();
  expect(clearAllPagePreparationChangesMock).toHaveBeenCalledOnce();
}

async function verifiesPendingDesignReviewCommentEnablesReset() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  props.toolbar.frameCount = 0;
  vi.spyOn(pagePreparationHistory, 'getState').mockReturnValue({
    canRedo: false,
    canUndo: false,
    revision: 0,
  });
  vi.spyOn(pagePreparationHistory, 'hasPendingSnapshotChanges').mockReturnValue(false);
  let pending = true;
  const finalize = vi.fn(() => {
    pending = false;
    return true;
  });
  const unregister = registerDesignReviewCommentDraftFinalizer(finalize, () => pending);
  try {
    await renderShell(props);
    const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
      canClearPagePreparation: boolean;
      onClearPagePreparation: () => void;
    };
    expect(lastToolbarProps.canClearPagePreparation).toBe(true);
    lastToolbarProps.onClearPagePreparation();
    expect(finalize).toHaveBeenCalledOnce();
    expect(clearAllPagePreparationChangesMock).toHaveBeenCalledOnce();
  } finally {
    act(() => unregister());
  }
}

async function verifiesPendingFrameChangeEnablesReset() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  props.toolbar.frameCount = 0;
  props.toolbar.modes.screenshotMode = false;
  const pending = vi
    .spyOn(pagePreparationHistory, 'hasPendingSnapshotChanges')
    .mockReturnValue(true);
  try {
    await renderShell(props);
    const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
      canClearPagePreparation: boolean;
    };
    expect(lastToolbarProps.canClearPagePreparation).toBe(true);
  } finally {
    pending.mockRestore();
  }
}

async function verifiesPendingDocumentEditEnablesReset() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  props.toolbar.frameCount = 0;
  const pending = vi
    .spyOn(quickEdit, 'hasPendingQuickEditDocumentModeChanges')
    .mockReturnValue(true);
  try {
    await renderShell(props);
    const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
      canClearPagePreparation: boolean;
    };
    expect(lastToolbarProps.canClearPagePreparation).toBe(true);
  } finally {
    pending.mockRestore();
  }
}
describe('Reset availability and toolbar binding', () => {
  useContentToolbarShellTestScope();
  it(
    'enables reset in navigation when only shared Drawing history exists',
    verifiesDrawingOnlyHistoryEnablesResetInNavigation
  );
  it('enables reset for an uncommitted Drawing text draft', verifiesPendingDrawingTextEnablesReset);
  it(
    'enables reset for an uncommitted Design Review comment',
    verifiesPendingDesignReviewCommentEnablesReset
  );
  it(
    'offers reset for a changed frame before its deferred history commit',
    verifiesPendingFrameChangeEnablesReset
  );
  it(
    'offers reset for a changed document-mode edit before it closes',
    verifiesPendingDocumentEditEnablesReset
  );
  it.each([
    ['drawing', { drawingMode: true }],
    ['annotation', { highlighterMode: true }],
    ['content-editing', { quickEditMode: true }],
    ['design-review', { designReviewMode: true }],
  ] as const)(
    'routes %s availability and reset without treating foreign frames as own changes',
    async (scope, modes) => {
      const props = createProps();
      props.toolbar.modes = {
        screenshotMode: true,
        aiPickMode: false,
        designReviewMode: false,
        highlighterMode: false,
        quickEditMode: false,
        quickEditDocumentMode: false,
        ...modes,
      };
      const hasChanges = vi.spyOn(pagePreparationHistory, 'hasChanges').mockReturnValue(false);
      vi.spyOn(pagePreparationHistory, 'hasPendingSnapshotChanges').mockReturnValue(false);
      const resetScope = vi.spyOn(pagePreparationHistory, 'resetScope').mockReturnValue(true);
      await renderShell(props);
      expect(toolbarMock.mock.calls.at(-1)?.[0]).toMatchObject({
        resetScope: scope,
        canClearPagePreparation: false,
      });
      expect(hasChanges).toHaveBeenCalledWith(scope);
      hasChanges.mockReturnValue(true);
      await renderShell(props);
      const toolbar = toolbarMock.mock.calls.at(-1)?.[0] as { onClearPagePreparation: () => void };
      expect(toolbarMock.mock.calls.at(-1)?.[0]).toMatchObject({ canClearPagePreparation: true });
      toolbar.onClearPagePreparation();
      expect(resetScope).toHaveBeenCalledWith(scope);
      expect(clearAllPagePreparationChangesMock).not.toHaveBeenCalled();
    }
  );
  it('updates Reset All from inline input and finalizes that draft before the scoped reset', async () => {
    const props = createProps();
    props.toolbar.modes.aiPickMode = false;
    props.toolbar.modes.quickEditMode = true;
    vi.spyOn(pagePreparationHistory, 'hasChanges').mockReturnValue(false);
    vi.spyOn(pagePreparationHistory, 'hasPendingSnapshotChanges').mockReturnValue(false);
    let pending = false;
    vi.spyOn(quickEdit, 'hasPendingQuickEditElementChanges').mockImplementation(() => pending);
    const finalize = vi
      .spyOn(quickEdit, 'finalizeQuickEditElementChanges')
      .mockImplementation(() => {
        pending = false;
      });
    const resetScope = vi.spyOn(pagePreparationHistory, 'resetScope').mockReturnValue(true);
    await renderShell(props);
    expect(toolbarMock.mock.calls.at(-1)?.[0]).toMatchObject({ canClearPagePreparation: false });
    pending = true;
    act(() => window.dispatchEvent(new Event('sniptale-document-mode-history-changed')));
    expect(toolbarMock.mock.calls.at(-1)?.[0]).toMatchObject({ canClearPagePreparation: true });
    const toolbar = toolbarMock.mock.calls.at(-1)?.[0] as { onClearPagePreparation: () => void };
    toolbar.onClearPagePreparation();
    expect(finalize).toHaveBeenCalledOnce();
    expect(resetScope).toHaveBeenCalledWith('content-editing');
    expect(finalize.mock.invocationCallOrder[0]).toBeLessThan(
      resetScope.mock.invocationCallOrder[0]!
    );
  });
});
