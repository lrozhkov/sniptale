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
    document.body.className = '';
    document.body.removeAttribute('style');
    document.body.replaceChildren();
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
    document.body.style.userSelect = 'text';

    enableQuickEditCursor(state);

    expect(document.body.classList.contains('sniptale-quick-edit-mode')).toBe(true);
    expect(doc.body?.classList.contains('sniptale-quick-edit-mode')).toBe(true);
    expect(cleanupCursorStyle).toHaveBeenCalledOnce();
    expect(document.body.style.userSelect).toBe('text');
    expect(mocks.mountStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: expect.stringContaining('quick-edit-cursor') })
    );
    expect(state.cursorStyleElement?.id).toContain('quick-edit-cursor');
  });

  it('restores native cursor and text selection while editing the document directly', () => {
    const state: any = {
      cleanupCursorStyle: null,
      cursorStyleElement: null,
    };

    enableQuickEditCursor(state);

    const stylesheet = mocks.mountStyleMock.mock.calls.at(-1)?.[0]?.textContent;

    expect(stylesheet).toContain('body.sniptale-quick-edit-document-mode');
    expect(stylesheet).toMatch(
      /body\.sniptale-quick-edit-document-mode[\s\S]*?cursor:\s*auto\s*!important;/
    );
    expect(stylesheet).toMatch(
      /body\.sniptale-quick-edit-document-mode[\s\S]*?user-select:\s*text\s*!important;/
    );
    expect(stylesheet).toContain('body.sniptale-quick-edit-document-mode .sniptale-toolbar');

    const style = document.createElement('style');
    const paragraph = document.createElement('p');
    const toolbar = document.createElement('div');
    const toolbarButton = document.createElement('button');

    style.textContent = stylesheet;
    toolbar.className = 'sniptale-toolbar';
    toolbar.append(toolbarButton);
    document.head.append(style);
    document.body.append(paragraph, toolbar);

    expect(getComputedStyle(paragraph).cursor).toContain('url(');

    document.body.classList.add('sniptale-quick-edit-document-mode');

    expect(getComputedStyle(paragraph).cursor).toBe('auto');
    expect(getComputedStyle(document.body).userSelect).toBe('text');
    expect(getComputedStyle(toolbarButton).cursor).toBe('pointer');

    style.remove();
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
    document.body.style.userSelect = 'text';
    disableQuickEditCursor(state);

    expect(document.body.classList.contains('sniptale-quick-edit-mode')).toBe(false);
    expect(document.body.style.userSelect).toBe('text');
    expect(cleanupCursorStyle).toHaveBeenCalledOnce();
    expect(state.cleanupCursorStyle).toBeNull();
    expect(state.cursorStyleElement).toBeNull();
  });
});
