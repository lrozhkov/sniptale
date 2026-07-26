// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  walkAllDocumentsMock: vi.fn(),
}));

vi.mock('../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal()),
  walkAllDocuments: mocks.walkAllDocumentsMock,
}));

import { mountQuickEditDocumentCursorTracking } from './document-cursor';

const cursorCleanups: Array<() => void> = [];

function movePointer(target: Element, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
}

function mountCursorTracking(): () => void {
  const cleanup = mountQuickEditDocumentCursorTracking();
  cursorCleanups.push(cleanup);
  return cleanup;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.walkAllDocumentsMock.mockImplementation((callback: (doc: Document) => void) => {
    callback(document);
  });
  document.body.className = 'sniptale-quick-edit-document-mode';
  document.body.replaceChildren();
});

afterEach(() => {
  cursorCleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'caretRangeFromPoint');
  Reflect.deleteProperty(document, 'caretPositionFromPoint');
});

describe('quick edit document cursor tracking', () => {
  it('keeps the default cursor over empty surfaces and images', () => {
    const empty = document.createElement('div');
    const image = document.createElement('img');
    document.body.append(empty, image);

    mountCursorTracking();

    movePointer(empty, 40, 40);
    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);

    document.body.classList.add('sniptale-quick-edit-text-cursor');
    movePointer(image, 40, 40);
    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);
  });

  it('uses the text cursor only when the pointer intersects rendered text', () => {
    const paragraph = document.createElement('p');
    const textNode = document.createTextNode('Editable text');
    paragraph.append(textNode);
    document.body.append(paragraph);
    const caretRange = document.createRange();
    caretRange.setStart(textNode, 4);
    caretRange.collapse(true);
    const characterRange = document.createRange();
    Object.defineProperty(characterRange, 'getClientRects', {
      configurable: true,
      value: vi.fn(() => [{ bottom: 30, left: 10, right: 80, top: 10 }]),
    });
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => caretRange),
    });
    vi.spyOn(document, 'createRange').mockReturnValue(characterRange);

    mountCursorTracking();

    movePointer(paragraph, 40, 20);
    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(true);

    movePointer(paragraph, 120, 60);
    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);
  });

  it('uses the text cursor for native text controls without a caret range', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);

    mountCursorTracking();
    movePointer(input, 20, 20);

    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(true);
  });

  it('does not enable the text cursor outside document edit mode', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);
    document.body.classList.remove('sniptale-quick-edit-document-mode');

    mountCursorTracking();
    movePointer(input, 20, 20);

    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);
  });

  it('removes the listener and transient cursor marker on cleanup', () => {
    document.body.classList.add('sniptale-quick-edit-text-cursor');
    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);
    const cleanup = mountCursorTracking();

    cleanup();

    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);
    movePointer(input, 20, 20);
    expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);
  });
});
