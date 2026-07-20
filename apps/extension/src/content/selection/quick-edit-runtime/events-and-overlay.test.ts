/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const eventMocks = vi.hoisted(() => ({
  appendOverlayMock: vi.fn((node: HTMLElement) => document.body.appendChild(node)),
  applyFrameRectMock: vi.fn(),
  blurMock: vi.fn(),
  clickMock: vi.fn(),
  keyDownMock: vi.fn(),
  mouseLeaveMock: vi.fn(),
  mouseMoveMock: vi.fn(),
  outsideClickMock: vi.fn(),
}));

vi.mock('../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/dom-host')>()),
  appendToContentOverlayRoot: eventMocks.appendOverlayMock,
}));

vi.mock('./overlay.frame', () => ({
  EDITABLE_BORDER: '1px solid red',
  applyQuickEditFrameRect: eventMocks.applyFrameRectMock,
}));

vi.mock('./events', () => ({
  handleQuickEditBlur: eventMocks.blurMock,
  handleQuickEditClick: eventMocks.clickMock,
  handleQuickEditKeyDown: eventMocks.keyDownMock,
  handleQuickEditMouseLeave: eventMocks.mouseLeaveMock,
  handleQuickEditMouseMove: eventMocks.mouseMoveMock,
  handleQuickEditOutsideClick: eventMocks.outsideClickMock,
}));

import {
  ensureQuickEditBlockingOverlay,
  hideQuickEditBlockingOverlay,
  removeQuickEditBlockingOverlay,
  showQuickEditBlockingOverlay,
  updateQuickEditBlockingOverlayShape,
} from './overlay.blocking';
import { createQuickEditRuntimeEvents } from './runtime.events';

function createRuntimeOptions() {
  const editingElements = new Map([['id', { element: document.createElement('div') }]]);

  return {
    editingElements,
    runtimeEvents: createQuickEditRuntimeEvents({
      cancelEditing: vi.fn(),
      disableDocumentMode: vi.fn(),
      disableRequested: vi.fn(),
      editingElements,
      finishEditing: vi.fn(),
      hideHoverOverlay: vi.fn(),
      isDocumentModeEnabled: vi.fn(() => false),
      isEnabled: vi.fn(() => true),
      isStyleInspectorModeEnabled: vi.fn(() => false),
      makeElementEditable: vi.fn(),
      showHoverOverlay: vi.fn(),
    }),
  };
}

describe('quick edit overlay and runtime events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates and reuses the blocking overlay', () => {
    const state = { activeFrameOverlay: null, blockingOverlay: null } as any;

    ensureQuickEditBlockingOverlay(state);
    ensureQuickEditBlockingOverlay(state);

    expect(eventMocks.appendOverlayMock).toHaveBeenCalledOnce();
    expect(state.blockingOverlay).toBeInstanceOf(HTMLElement);
  });

  it('updates, hides, and removes the blocking overlay', () => {
    const state = { activeFrameOverlay: null, blockingOverlay: null } as any;
    const element = document.createElement('div');

    ensureQuickEditBlockingOverlay(state);
    showQuickEditBlockingOverlay(state);
    updateQuickEditBlockingOverlayShape(state, element);
    hideQuickEditBlockingOverlay(state);
    removeQuickEditBlockingOverlay(state);

    expect(eventMocks.appendOverlayMock).toHaveBeenCalledOnce();
    expect(eventMocks.applyFrameRectMock).toHaveBeenCalledWith(expect.any(HTMLElement), element);
    expect(state.blockingOverlay).toBeNull();
    expect(state.activeFrameOverlay).toBeNull();
  });

  it('delegates blur, click, keydown, and pointer handlers', () => {
    const { runtimeEvents } = createRuntimeOptions();

    runtimeEvents.handleBlur(new FocusEvent('blur'));
    runtimeEvents.handleClick(new MouseEvent('click'));
    runtimeEvents.handleKeyDown(new KeyboardEvent('keydown'));
    runtimeEvents.handleMouseLeave();
    runtimeEvents.handleMouseMove(new MouseEvent('mousemove'));
    runtimeEvents.handleOutsideClick(new MouseEvent('mousedown'));

    expect(eventMocks.blurMock).toHaveBeenCalled();
    expect(eventMocks.clickMock).toHaveBeenCalled();
    expect(eventMocks.keyDownMock).toHaveBeenCalled();
    expect(eventMocks.mouseLeaveMock).toHaveBeenCalled();
    expect(eventMocks.mouseMoveMock).toHaveBeenCalled();
  });

  it('passes editing elements into outside click handling', () => {
    const { editingElements, runtimeEvents } = createRuntimeOptions();

    runtimeEvents.handleOutsideClick(new MouseEvent('mousedown'));

    expect(eventMocks.outsideClickMock).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      expect.objectContaining({ editingElementsSize: expect.any(Function) }),
      [editingElements.get('id')?.element],
      undefined
    );
  });
});
