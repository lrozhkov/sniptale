// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ownedElementMock: vi.fn(() => false),
  quickEditTargetMock: vi.fn(),
  styleInspectableTargetMock: vi.fn(() => false),
  textTargetMock: vi.fn(() => false),
}));

vi.mock('./events.shared', () => ({
  isQuickEditOwnedElement: mocks.ownedElementMock,
  isQuickEditStyleInspectableTarget: mocks.styleInspectableTargetMock,
  isQuickEditTextTarget: mocks.textTargetMock,
  resolveQuickEditTarget: mocks.quickEditTargetMock,
}));

import {
  handleQuickEditBlur,
  handleQuickEditClick,
  handleQuickEditMouseLeave,
  handleQuickEditMouseMove,
  handleQuickEditOutsideClick,
} from './pointer';

function createOptions() {
  return {
    editingElementsSize: vi.fn(() => 1),
    finishEditing: vi.fn(),
    hideHoverOverlay: vi.fn(),
    isDocumentModeEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => true),
    isStyleInspectorModeEnabled: vi.fn(() => false),
    makeElementEditable: vi.fn(),
    showHoverOverlay: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

it('ignores outside clicks when quick edit is disabled or idle', () => {
  const options = createOptions();
  options.isEnabled.mockReturnValueOnce(false);
  handleQuickEditOutsideClick(new MouseEvent('mousedown'), options, []);

  options.isEnabled.mockReturnValue(true);
  options.editingElementsSize.mockReturnValueOnce(0);
  handleQuickEditOutsideClick(new MouseEvent('mousedown'), options, []);

  expect(options.finishEditing).not.toHaveBeenCalled();
});

it('ignores outside clicks for owned targets and finishes editable elements otherwise', () => {
  const editable = document.createElement('div');
  const target = document.createElement('div');
  const options = createOptions();

  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  mocks.ownedElementMock.mockReturnValueOnce(true);
  handleQuickEditOutsideClick(new MouseEvent('mousedown'), options, [editable]);

  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  handleQuickEditOutsideClick(event, options, [editable]);

  expect(options.finishEditing).toHaveBeenCalledWith(editable);
  expect(event.defaultPrevented).toBe(true);
});

it('updates hover state for missing, owned, text, and non-text targets', () => {
  const options = createOptions();
  const target = document.createElement('div');

  mocks.quickEditTargetMock.mockReturnValueOnce(null);
  handleQuickEditMouseMove(new MouseEvent('mousemove'), options);

  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  mocks.ownedElementMock.mockReturnValueOnce(true);
  handleQuickEditMouseMove(new MouseEvent('mousemove'), options);

  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  mocks.textTargetMock.mockReturnValueOnce(true);
  handleQuickEditMouseMove(new MouseEvent('mousemove'), options);

  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  handleQuickEditMouseMove(new MouseEvent('mousemove'), options);
  handleQuickEditMouseLeave(options);

  expect(options.hideHoverOverlay).toHaveBeenCalledTimes(4);
  expect(options.showHoverOverlay).toHaveBeenCalledWith(target);
});

it('keeps hover hidden while document mode owns text editing', () => {
  const options = createOptions();
  options.isDocumentModeEnabled.mockReturnValue(true);

  handleQuickEditMouseMove(new MouseEvent('mousemove'), options);

  expect(options.hideHoverOverlay).toHaveBeenCalledOnce();
  expect(options.showHoverOverlay).not.toHaveBeenCalled();
  expect(mocks.quickEditTargetMock).not.toHaveBeenCalled();
});

it('routes image-style targets to the hover frame only while the style inspector is open', () => {
  const options = createOptions();
  const target = document.createElement('img');
  options.isStyleInspectorModeEnabled.mockReturnValue(true);
  mocks.quickEditTargetMock.mockReturnValue(target);
  mocks.styleInspectableTargetMock.mockReturnValue(true);

  handleQuickEditMouseMove(new MouseEvent('mousemove'), options);

  expect(options.showHoverOverlay).toHaveBeenCalledWith(target);
  expect(options.hideHoverOverlay).not.toHaveBeenCalled();
});

it('does not start targeted editing while document mode owns text editing', () => {
  const options = createOptions();
  options.isDocumentModeEnabled.mockReturnValue(true);

  handleQuickEditClick(new MouseEvent('click'), options);

  expect(options.makeElementEditable).not.toHaveBeenCalled();
  expect(mocks.quickEditTargetMock).not.toHaveBeenCalled();
});

it('claims style-inspector image clicks without starting text editing', () => {
  const options = createOptions();
  const target = document.createElement('img');
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  options.isStyleInspectorModeEnabled.mockReturnValue(true);
  mocks.quickEditTargetMock.mockReturnValue(target);
  mocks.styleInspectableTargetMock.mockReturnValue(true);

  handleQuickEditClick(event, options);

  expect(event.defaultPrevented).toBe(true);
  expect(options.makeElementEditable).not.toHaveBeenCalled();
});

it('starts editing only for text targets and finishes blur after focus leaves', () => {
  const options = createOptions();
  const target = document.createElement('div');
  const other = document.createElement('button');
  target.className = 'sniptale-editing';
  document.body.append(target, other);

  mocks.quickEditTargetMock.mockReturnValueOnce(null);
  handleQuickEditClick(new MouseEvent('click'), options);

  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  mocks.ownedElementMock.mockReturnValueOnce(true);
  handleQuickEditClick(new MouseEvent('click'), options);

  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  handleQuickEditClick(new MouseEvent('click'), options);

  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  mocks.textTargetMock.mockReturnValueOnce(true);
  const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
  handleQuickEditClick(clickEvent, options);

  Object.defineProperty(target.ownerDocument, 'activeElement', {
    configurable: true,
    get: () => other,
  });
  mocks.quickEditTargetMock.mockReturnValueOnce(target);
  handleQuickEditBlur(new FocusEvent('blur'), options);
  vi.runAllTimers();

  expect(clickEvent.defaultPrevented).toBe(true);
  expect(options.makeElementEditable).toHaveBeenCalledWith(target);
  expect(options.finishEditing).toHaveBeenCalledWith(target);
});
