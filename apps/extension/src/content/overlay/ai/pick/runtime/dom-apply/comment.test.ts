// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showToastMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
}));

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

import { applyCommentEdit } from './comment';

function createCommentRow() {
  const rowElement = document.createElement('div');
  rowElement.id = 'comment$1';

  const textElement = document.createElement('div');
  textElement.className = 'Comment__text';
  rowElement.appendChild(textElement);
  document.body.appendChild(rowElement);

  return { rowElement, textElement };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('ai-pick comment edit helpers', () => {
  it('updates rich-text iframe comments and emits the success toast', () => {
    const { rowElement, textElement } = createCommentRow();
    const iframe = document.createElement('iframe');
    textElement.appendChild(iframe);
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc?.body) {
      throw new Error('Expected iframe document');
    }

    applyCommentEdit(rowElement, 'Текст', 'Первая строка\nВторая строка', vi.fn());

    expect(iframeDoc.body.innerHTML).toBe('Первая строка<br>Вторая строка');
    expect(showToastMock).toHaveBeenCalledWith('content.runtime.commentTextUpdated', 'success');
  });

  it('falls back to the contenteditable comment body when iframe access fails', () => {
    const { rowElement, textElement } = createCommentRow();
    const iframe = document.createElement('iframe');
    textElement.appendChild(iframe);
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get() {
        throw new Error('cross-origin');
      },
    });
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    rowElement.appendChild(editable);

    applyCommentEdit(rowElement, 'Текст', 'Fallback comment', vi.fn());

    expect(editable.textContent).toBe('Fallback comment');
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('updates non-text comment columns through the provided text updater', () => {
    const rowElement = document.createElement('div');
    const author = document.createElement('div');
    author.className = 'Comment__author';
    author.textContent = 'Автор 1';
    rowElement.appendChild(author);
    const updateTextPreservingStructure = vi.fn();

    applyCommentEdit(rowElement, 'Автор', 'Автор 2', updateTextPreservingStructure);

    expect(updateTextPreservingStructure).toHaveBeenCalledWith(author, 'Автор 2');
  });
});
