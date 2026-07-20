// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateEditableElement: vi.fn(),
  buildEditableElementRecord: vi.fn(() => ({ editable: true })),
  cancelEditableElement: vi.fn(),
  captureDomStateMap: vi.fn(() => new Map([['before', new Map()]])),
  clearEditableElementState: vi.fn(),
  commitTransaction: vi.fn(),
  createDomMutationBatch: vi.fn(() => ({ changed: true })),
  finishEditableElement: vi.fn(),
  beginTransaction: vi.fn(),
  cancelTransaction: vi.fn(),
  loggerLog: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ log: mocks.loggerLog }),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  buildEditableElementRecord: mocks.buildEditableElementRecord,
}));

vi.mock('./editing-session', () => ({
  cancelEditableElement: mocks.cancelEditableElement,
  finishEditableElement: mocks.finishEditableElement,
}));

vi.mock('./session', () => ({
  activateEditableElement: mocks.activateEditableElement,
  clearEditableElementState: mocks.clearEditableElementState,
}));

vi.mock('../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../parser/page-preparation/history')>()),
  captureDomStateMap: mocks.captureDomStateMap,
  createDomMutationBatch: mocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: mocks.beginTransaction,
    cancelTransaction: mocks.cancelTransaction,
    commitTransaction: mocks.commitTransaction,
  },
}));

import { createQuickEditEditingActions } from './editing';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildEditableElementRecord.mockReturnValue({ editable: true });
  mocks.captureDomStateMap.mockReturnValue(new Map([['before', new Map()]]));
  mocks.createDomMutationBatch.mockReturnValue({ changed: true });
  mocks.activateEditableElement.mockImplementation((element: HTMLElement, id: string) => {
    element.dataset['sniptaleEditableId'] = id;
  });
  mocks.finishEditableElement.mockImplementation(
    (
      _editingElements: Map<string, unknown>,
      clearEditingState: (element: HTMLElement, id: string) => void,
      element: HTMLElement
    ) => {
      clearEditingState(element, element.dataset['sniptaleEditableId'] ?? 'missing-id');
    }
  );
  mocks.cancelEditableElement.mockImplementation(
    (
      _editingElements: Map<string, unknown>,
      clearEditingState: (element: HTMLElement, id: string) => void,
      element: HTMLElement
    ) => {
      clearEditingState(element, element.dataset['sniptaleEditableId'] ?? 'missing-id');
    }
  );
});

function createOverlayActions() {
  return {
    disconnectResizeObserver: vi.fn(),
    hideBlockingOverlay: vi.fn(),
    setupResizeObserver: vi.fn(),
    showBlockingOverlay: vi.fn(),
    updateBlockingOverlayShape: vi.fn(),
  };
}

it('makes an element editable and starts a quick-edit history transaction', () => {
  const element = document.createElement('div');
  const editingElements = new Map();
  const overlayActions = createOverlayActions();
  const actions = createQuickEditEditingActions({
    editingElements,
    overlayActions,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });

  actions.makeElementEditable(element);

  expect(mocks.buildEditableElementRecord).toHaveBeenCalledWith(element);
  expect(mocks.captureDomStateMap).toHaveBeenCalledWith([element]);
  const firstActivationCall = mocks.activateEditableElement.mock.calls[0];
  if (!firstActivationCall) {
    throw new Error('Expected editable activation call');
  }
  const [, editableId, editableRecord, options] = firstActivationCall;
  expect(mocks.beginTransaction).toHaveBeenCalledWith(`quick-edit:${editableId}`);
  expect(editableRecord).toEqual({ editable: true });
  options.setupResizeObserver();
  expect(overlayActions.setupResizeObserver).toHaveBeenCalledWith(element, expect.any(Function));
  const firstResizeObserverCall = overlayActions.setupResizeObserver.mock.calls[0];
  if (!firstResizeObserverCall) {
    throw new Error('Expected resize observer setup');
  }
  const onResize = firstResizeObserverCall[1];
  onResize();
  expect(overlayActions.updateBlockingOverlayShape).toHaveBeenCalledWith(element);
  expect(mocks.loggerLog).toHaveBeenCalledWith('Element made editable', editableId);
});

it('wires overlay callbacks and link-click suppression into editable activation', () => {
  const element = document.createElement('div');
  const overlayActions = createOverlayActions();
  const actions = createQuickEditEditingActions({
    editingElements: new Map(),
    overlayActions,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });
  const event = {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;

  actions.makeElementEditable(element);

  const firstActivationCall = mocks.activateEditableElement.mock.calls[0];
  if (!firstActivationCall) {
    throw new Error('Expected editable activation call');
  }
  const [, , , options] = firstActivationCall;
  options.handleChildLinkClick(event);
  options.showBlockingOverlay();
  options.hideBlockingOverlay();
  options.disconnectResizeObserver();

  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(overlayActions.showBlockingOverlay).toHaveBeenCalledTimes(1);
  expect(overlayActions.hideBlockingOverlay).toHaveBeenCalledTimes(1);
  expect(overlayActions.disconnectResizeObserver).toHaveBeenCalledTimes(1);
});

it('finishes editing and commits the captured DOM mutation batch', () => {
  const element = document.createElement('div');
  const overlayActions = createOverlayActions();
  const actions = createQuickEditEditingActions({
    editingElements: new Map(),
    overlayActions,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });

  actions.makeElementEditable(element);
  const editableId = element.dataset['sniptaleEditableId']!;
  actions.finishEditing(element);

  expect(mocks.finishEditableElement).toHaveBeenCalledWith(
    expect.any(Map),
    expect.any(Function),
    element
  );
  expect(mocks.clearEditableElementState).toHaveBeenCalledWith(
    element,
    editableId,
    expect.objectContaining({
      disconnectResizeObserver: expect.any(Function),
      hideBlockingOverlay: expect.any(Function),
      setupResizeObserver: expect.any(Function),
      showBlockingOverlay: expect.any(Function),
      updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
    })
  );
  expect(mocks.createDomMutationBatch).toHaveBeenCalledWith([element], expect.any(Map));
  expect(mocks.commitTransaction).toHaveBeenCalledWith(`quick-edit:${editableId}`, {
    changed: true,
  });
});

it('passes clear-state callbacks that reuse owner-local overlay wiring', () => {
  const element = document.createElement('div');
  const overlayActions = createOverlayActions();
  const actions = createQuickEditEditingActions({
    editingElements: new Map(),
    overlayActions,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });
  const event = {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;

  actions.makeElementEditable(element);
  actions.finishEditing(element);

  const firstClearStateCall = mocks.clearEditableElementState.mock.calls[0];
  if (!firstClearStateCall) {
    throw new Error('Expected clear state call');
  }
  const clearOptions = firstClearStateCall[2];
  clearOptions.handleChildLinkClick(event);
  clearOptions.showBlockingOverlay();
  clearOptions.hideBlockingOverlay();
  clearOptions.disconnectResizeObserver();
  clearOptions.setupResizeObserver();

  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(overlayActions.showBlockingOverlay).toHaveBeenCalledTimes(1);
  expect(overlayActions.hideBlockingOverlay).toHaveBeenCalledTimes(1);
  expect(overlayActions.disconnectResizeObserver).toHaveBeenCalledTimes(1);
  expect(overlayActions.setupResizeObserver).toHaveBeenCalledWith(element, expect.any(Function));
  const resizeObserverCall = overlayActions.setupResizeObserver.mock.calls.at(-1);
  if (!resizeObserverCall) {
    throw new Error('Expected clear-state resize observer setup');
  }
  const onResize = resizeObserverCall[1];
  onResize();
  expect(overlayActions.updateBlockingOverlayShape).toHaveBeenCalledWith(element);
});

it('exposes stable editing action seams for owner-local consumers', () => {
  const actions = createQuickEditEditingActions({
    editingElements: new Map(),
    overlayActions: createOverlayActions(),
    updateBlockingOverlayShape: vi.fn(),
  });

  expect(typeof actions.makeElementEditable).toBe('function');
  expect(typeof actions.finishEditing).toBe('function');
  expect(typeof actions.cancelEditing).toBe('function');
});

it('cancels editing and skips history cancellation when no editable id is present', () => {
  const element = document.createElement('div');
  const overlayActions = createOverlayActions();
  const actions = createQuickEditEditingActions({
    editingElements: new Map(),
    overlayActions,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });

  actions.cancelEditing(element);

  expect(mocks.cancelEditableElement).toHaveBeenCalledWith(
    expect.any(Map),
    expect.any(Function),
    element
  );
  expect(mocks.cancelTransaction).not.toHaveBeenCalled();
});

it('cancels and commits quick-edit history only when an editable id exists', () => {
  const element = document.createElement('div');
  const overlayActions = createOverlayActions();
  const actions = createQuickEditEditingActions({
    editingElements: new Map(),
    overlayActions,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });

  actions.makeElementEditable(element);
  const editableId = element.dataset['sniptaleEditableId']!;
  actions.cancelEditing(element);

  expect(mocks.cancelTransaction).toHaveBeenCalledWith(`quick-edit:${editableId}`);
  delete element.dataset['sniptaleEditableId'];
  actions.finishEditing(element);
  expect(mocks.commitTransaction).not.toHaveBeenCalled();
});

it('reuses the same child-link suppressor for activation and clear-state callbacks', () => {
  const element = document.createElement('div');
  const overlayActions = createOverlayActions();
  const actions = createQuickEditEditingActions({
    editingElements: new Map(),
    overlayActions,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });

  actions.makeElementEditable(element);
  actions.finishEditing(element);

  const activationOptions = mocks.activateEditableElement.mock.calls[0]?.[3];
  const clearOptions = mocks.clearEditableElementState.mock.calls[0]?.[2];
  expect(activationOptions?.handleChildLinkClick).toBe(clearOptions?.handleChildLinkClick);
});
