const RICH_TEXT_CHROME_SELECTORS = [
  '.modal',
  '.modal-dialog',
  '.modal-content',
  '.modal-header',
  '.modal-body',
  '.modal-footer',
  '.link-dialog',
  '.note-toolbar',
  '.note-toolbar-wrapper',
  '.note-modal',
  '.note-dialog',
  '.note-help-dialog',
  '.note-link-dialog',
  '.note-image-dialog',
  '.note-video-dialog',
  '.note-popover',
  '.note-dropzone',
  '.note-handle',
  '.note-codable',
  '.note-placeholder',
  '.note-status-output',
  '.note-statusbar',
  '.note-btn-group',
  '.note-select-from-files',
  '.fr-toolbar',
  '.fr-popup',
  '.fr-modal',
  '.fr-second-toolbar',
  '.fr-newline',
  '.fr-counter',
  '.fr-character-counter',
].join(', ');

const RICH_TEXT_CONTENT_SELECTORS = [
  '.note-editable',
  '.fr-element.fr-view',
  '.fr-view',
  'body[contenteditable="true"]',
  '[contenteditable="true"]',
] as const;

const RICH_TEXT_SUBTREE_SELECTORS = [
  '#summernote',
  '.SummerNote__iframe',
  '.note-editor',
  '.note-modal',
  '.note-dialog',
  '.note-popover',
  '.fr-box',
  '.fr-popup',
  '.fr-modal',
  '[data-virtual-iframe="true"][data-iframe-src*="summerNote"]',
  '[data-virtual-iframe="true"][data-iframe-src*="richText"]',
  '[data-virtual-iframe="true"][id*="rtf-editor"]',
].join(', ');

function normalizeRichText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findRichTextContentRoot(container: HTMLElement): HTMLElement {
  for (const selector of RICH_TEXT_CONTENT_SELECTORS) {
    const candidate = container.querySelector(selector);
    if (candidate instanceof HTMLElement) {
      return candidate;
    }
  }

  return container;
}

export function isRichTextEditorChromeElement(element: Element): boolean {
  return element.closest(RICH_TEXT_SUBTREE_SELECTORS) !== null;
}

export function cloneRichTextContent(container: HTMLElement): HTMLElement {
  const source = findRichTextContentRoot(container);
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(RICH_TEXT_CHROME_SELECTORS).forEach((element) => element.remove());
  return clone;
}

export function sanitizeRichTextToText(container: HTMLElement): string {
  const clone = cloneRichTextContent(container);
  clone.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));
  clone.querySelectorAll('a').forEach((link) => link.replaceWith(link.textContent || ''));
  return normalizeRichText(clone.textContent || '');
}
