// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mountStyleMock: vi.fn(),
  walkAllDocumentsMock: vi.fn(),
}));

vi.mock('../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal()),
  mountStyleInAccessibleDocuments: mocks.mountStyleMock,
  walkAllDocuments: mocks.walkAllDocumentsMock,
}));

import { disableQuickEditCursor, enableQuickEditCursor } from './cursor';

describe('quick edit cursor enablement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables cursor styling across accessible documents', () => {
    const doc = document.implementation.createHTMLDocument('frame');
    document.body.appendChild(
      Object.assign(document.createElement('style'), { id: 'sniptale-quick-edit-cursor-style' })
    );
    mocks.walkAllDocumentsMock.mockImplementation((callback: (doc: Document) => void) => {
      callback(document);
      callback(doc);
    });
    const state: any = {
      cleanupCursorStyle: vi.fn(),
      cursorStyleElement: null,
    };
    const cleanupCursorStyle = state.cleanupCursorStyle;

    enableQuickEditCursor(state);

    expect(document.body.classList.contains('sniptale-quick-edit-mode')).toBe(true);
    expect(doc.body?.classList.contains('sniptale-quick-edit-mode')).toBe(true);
    expect(cleanupCursorStyle).toHaveBeenCalledOnce();
    expect(mocks.mountStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: expect.stringContaining('quick-edit-cursor') })
    );
    expect(state.cursorStyleElement?.id).toContain('quick-edit-cursor');
  });
});

describe('quick edit cursor disablement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables cursor styling and clears stored elements', () => {
    const removable = document.createElement('style');
    document.body.appendChild(removable);
    mocks.walkAllDocumentsMock.mockImplementation((callback: (doc: Document) => void) => {
      callback(document);
      callback({ body: null } as never);
    });
    const state: any = {
      cleanupCursorStyle: vi.fn(),
      cursorStyleElement: removable,
    };
    const cleanupCursorStyle = state.cleanupCursorStyle;

    document.body.classList.add('sniptale-quick-edit-mode');
    document.body.style.userSelect = 'none';
    disableQuickEditCursor(state);

    expect(document.body.classList.contains('sniptale-quick-edit-mode')).toBe(false);
    expect(document.body.style.userSelect).toBe('');
    expect(cleanupCursorStyle).toHaveBeenCalledOnce();
    expect(state.cleanupCursorStyle).toBeNull();
    expect(state.cursorStyleElement).toBeNull();
  });
});
