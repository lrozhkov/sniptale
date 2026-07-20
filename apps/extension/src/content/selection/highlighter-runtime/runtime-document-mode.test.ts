// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const walkAllDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('../../platform/frame', () => ({
  walkAllDocuments: walkAllDocumentsMock,
}));

import { applyHighlighterDocumentMode } from './runtime-document-mode';

beforeEach(() => {
  walkAllDocumentsMock.mockReset();
});

describe('applyHighlighterDocumentMode', () => {
  it('toggles the highlighter document mode on discovered document bodies', () => {
    const enabledDoc = document.implementation.createHTMLDocument('enabled');
    const disabledDoc = document.implementation.createHTMLDocument('disabled');
    enabledDoc.body.style.userSelect = 'text';
    enabledDoc.body.style.webkitUserSelect = 'text';
    disabledDoc.body.style.userSelect = 'all';
    disabledDoc.body.style.webkitUserSelect = 'all';

    walkAllDocumentsMock.mockImplementation((visit: (doc: Document) => void) => {
      visit(enabledDoc);
      visit(disabledDoc);
      visit({ body: null } as unknown as Document);
    });

    applyHighlighterDocumentMode(true);
    expect(enabledDoc.body.classList.contains('sniptale-highlighter-mode')).toBe(true);
    expect(enabledDoc.body.style.userSelect).toBe('none');
    expect(enabledDoc.body.style.webkitUserSelect).toBe('none');

    applyHighlighterDocumentMode(false);
    expect(disabledDoc.body.classList.contains('sniptale-highlighter-mode')).toBe(false);
    expect(disabledDoc.body.style.userSelect).toBe('all');
    expect(disabledDoc.body.style.webkitUserSelect).toBe('all');
    expect(enabledDoc.body.style.userSelect).toBe('text');
    expect(enabledDoc.body.style.webkitUserSelect).toBe('text');
  });
});
