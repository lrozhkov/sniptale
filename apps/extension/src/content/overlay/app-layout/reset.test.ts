// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canResetPagePreparation, clearPagePreparation } from './reset';
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
beforeEach(() => {
  vi.clearAllMocks();
  flushPendingPageStyleHistoryMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());
async function verifiesToolbarResetUsesSharedOwner() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  const drawingController = createContentDrawingController(
    createDrawingSession({ onDocumentCommit: () => true })
  );
  const finalizeInteraction = vi.spyOn(drawingController, 'finalizeInteraction');
  props.toolbar.drawingController = drawingController;
  const lastToolbarProps = { onClearPagePreparation: () => clearPagePreparation(props.toolbar) };
  vi.spyOn(pagePreparationHistory, 'getState').mockReturnValue({
    canRedo: false,
    canUndo: true,
    revision: 1,
  });
  expect(canResetPagePreparation(drawingController)).toBe(true);
  lastToolbarProps.onClearPagePreparation();

  expect(finalizeInteraction).toHaveBeenCalledOnce();
  expect(clearAllPagePreparationChangesMock).toHaveBeenCalledOnce();
  expect(showToastMock).toHaveBeenCalledWith('Все изменения очищены', 'info');
}

async function verifiesRejectedDrawingTextPreservesResetState() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  const drawingController = createContentDrawingController(
    createDrawingSession({ onDocumentCommit: () => false })
  );
  drawingController.setPendingTextChange?.(true);
  props.toolbar.drawingController = drawingController;
  const lastToolbarProps = { onClearPagePreparation: () => clearPagePreparation(props.toolbar) };
  lastToolbarProps.onClearPagePreparation();
  expect(clearAllPagePreparationChangesMock).not.toHaveBeenCalled();
  expect(showToastMock).toHaveBeenCalledWith('Не удалось очистить часть изменений', 'error');
}

async function verifiesFailedDesignReviewCommentPreservesResetState() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  const unregister = registerDesignReviewCommentDraftFinalizer(
    () => false,
    () => true
  );
  try {
    const lastToolbarProps = { onClearPagePreparation: () => clearPagePreparation(props.toolbar) };
    lastToolbarProps.onClearPagePreparation();
    expect(clearAllPagePreparationChangesMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('Не удалось очистить часть изменений', 'error');
  } finally {
    unregister();
  }
}

async function verifiesFailedOwnerFinalizationPreservesResetState() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  flushPendingPageStyleHistoryMock.mockImplementationOnce(() => {
    throw new Error('pending Design Review change cannot be finalized');
  });
  const lastToolbarProps = { onClearPagePreparation: () => clearPagePreparation(props.toolbar) };
  lastToolbarProps.onClearPagePreparation();
  expect(clearAllPagePreparationChangesMock).not.toHaveBeenCalled();
  expect(showToastMock).toHaveBeenCalledWith('Не удалось очистить часть изменений', 'error');
}

async function verifiesDocumentModeFinishesBeforeReset() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  const enabled = vi.spyOn(quickEdit, 'isQuickEditDocumentModeEnabled');
  enabled.mockReturnValueOnce(true).mockReturnValueOnce(false);
  try {
    const lastToolbarProps = { onClearPagePreparation: () => clearPagePreparation(props.toolbar) };
    lastToolbarProps.onClearPagePreparation();
    expect(props.toolbar.modeController.handleToggleQuickEditDocumentMode).toHaveBeenCalledWith(
      false
    );
    expect(clearAllPagePreparationChangesMock).toHaveBeenCalledOnce();
  } finally {
    enabled.mockRestore();
  }
}

async function verifiesDocumentModeFailurePreservesResetState() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  const enabled = vi.spyOn(quickEdit, 'isQuickEditDocumentModeEnabled').mockReturnValue(true);
  try {
    const lastToolbarProps = { onClearPagePreparation: () => clearPagePreparation(props.toolbar) };
    lastToolbarProps.onClearPagePreparation();
    expect(clearAllPagePreparationChangesMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('Не удалось очистить часть изменений', 'error');
  } finally {
    enabled.mockRestore();
  }
}

async function verifiesIncompleteResetReportsFailure() {
  const props = createProps();
  props.toolbar.modes.aiPickMode = false;
  clearAllPagePreparationChangesMock.mockReturnValueOnce(false);
  const lastToolbarProps = { onClearPagePreparation: () => clearPagePreparation(props.toolbar) };
  lastToolbarProps.onClearPagePreparation();
  expect(showToastMock).toHaveBeenCalledWith('Не удалось очистить часть изменений', 'error');
}
describe('Reset owner finalization and failure handling', () => {
  it(
    'routes reset through the shared page-preparation owner when frames exist',
    verifiesToolbarResetUsesSharedOwner
  );
  it(
    'preserves history when a Drawing text draft cannot commit',
    verifiesRejectedDrawingTextPreservesResetState
  );
  it(
    'preserves history when a Design Review comment cannot finish',
    verifiesFailedDesignReviewCommentPreservesResetState
  );
  it(
    'keeps history when an editor cannot finalize before reset',
    verifiesFailedOwnerFinalizationPreservesResetState
  );
  it(
    'finishes document mode before clearing page preparation',
    verifiesDocumentModeFinishesBeforeReset
  );
  it(
    'preserves history when document mode cannot finish',
    verifiesDocumentModeFailurePreservesResetState
  );
  it('reports an incomplete page preparation reset', verifiesIncompleteResetReportsFailure);
});
