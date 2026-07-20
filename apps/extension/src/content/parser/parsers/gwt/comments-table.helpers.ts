import type { TableNode, TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { buildElementEvidence } from '../../ir/document-evidence';
import { generateStableId, generateId } from '../../dom-utils/id-generator';
import {
  extractCleanText,
  getSelector,
  isElementVisible,
  setSniptaleId,
} from '../../dom-utils/dom-helpers';
import type { TraversalContext } from '../types';
import { extractFroalaContentSync } from './comments-froala.helpers';

function extractAuthorName(element: HTMLElement): string {
  const link = element.querySelector('a[__code="author"]') || element.querySelector('a');
  if (link) {
    const title = link.getAttribute('title');
    if (title?.trim()) {
      return title.trim();
    }

    const nameSpan = link.querySelector('span[__code="name"]');
    if (nameSpan?.textContent) {
      return nameSpan.textContent.trim();
    }
  }

  const avatarSpan = element.querySelector('.userAvatar, [__code="avatar"]');
  if (!avatarSpan) {
    return element.textContent?.trim().replace(/\s+/g, ' ').trim() || '';
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelector('.userAvatar, [__code="avatar"]')?.remove();
  return (clone.textContent?.trim() || '').replace(/\s+/g, ' ').trim();
}

function resolveCommentText(textEl: Element | null) {
  if (!textEl) {
    return { attachments: [] as Array<{ uuid: string; src: string }>, text: '' };
  }

  const iframe = textEl.querySelector('iframe');
  const virtualContainer =
    !iframe &&
    ((textEl.querySelector('[data-virtual-iframe]') as HTMLElement | null) ||
      (textEl.querySelector('div[id^="iframe$"]') as HTMLElement | null));

  if (iframe || virtualContainer) {
    const froalaContent = extractFroalaContentSync((iframe || virtualContainer) as HTMLElement);
    if (froalaContent) {
      return { attachments: froalaContent.images, text: froalaContent.text };
    }
  }

  if (iframe) {
    const uuidMatch = (iframe as HTMLIFrameElement).src?.match(/uuid=([^&]+)/);
    return {
      attachments: [],
      text: uuidMatch
        ? `[Froala Editor - uuid: ${uuidMatch[1]}]`
        : '[Froala Editor - содержимое недоступно]',
    };
  }

  if (virtualContainer) {
    return { attachments: [], text: `[Froala Editor - virtual container: ${virtualContainer.id}]` };
  }

  return { attachments: [], text: extractCleanText(textEl as HTMLElement) };
}

function isDraftCommentComposer(comment: HTMLElement) {
  return comment.id === 'comment$currentUser' || comment.querySelector('.Comment__form') !== null;
}

function resolveCommentMetaElement(
  comment: HTMLElement,
  legacySelector: string,
  modernSelector: string
) {
  return (comment.querySelector(legacySelector) ||
    comment.querySelector(modernSelector)) as HTMLElement | null;
}

function buildCommentRow(comment: HTMLElement, index: number): TableRow | null {
  if (!isElementVisible(comment) || isDraftCommentComposer(comment)) {
    return null;
  }

  const authorEl = resolveCommentMetaElement(comment, '[__code="author"]', '.Comment__author');
  const dateEl = resolveCommentMetaElement(comment, '[__code="date"]', '.Comment__date');
  const textEl = resolveCommentMetaElement(comment, '[__code="text"]', '.Comment__text');
  const content = resolveCommentText(textEl);
  const author = authorEl ? extractAuthorName(authorEl) : '';
  const date = dateEl ? extractCleanText(dateEl) : '';
  if (!author || !content.text) {
    return null;
  }

  const stableId = generateStableId('comment', comment, index);
  setSniptaleId(comment, stableId);

  return {
    id: stableId,
    selected: true,
    data: {
      Автор: author,
      Дата: date,
      Текст: content.text,
    },
    cellTypes: {
      Автор: 'string',
      Дата: 'string',
      Текст: 'string',
    },
    selector: getSelector(comment),
    editable: false,
    evidence: buildElementEvidence(comment),
    ...(content.attachments.length > 0 ? { attachments: content.attachments } : {}),
  };
}

export function parseCommentList(container: HTMLElement, ctx: TraversalContext): TableNode | null {
  const rows = Array.from(container.querySelectorAll('[id^="comment$"]'))
    .map((commentEl, index) => buildCommentRow(commentEl as HTMLElement, index))
    .filter((row): row is TableRow => row !== null);

  if (rows.length === 0) {
    return null;
  }

  ctx.globalTableIndex++;

  return {
    type: 'table',
    id: generateId('comments'),
    headers: ['Автор', 'Дата', 'Текст'],
    rows,
    selected: false,
    editable: false,
    evidence: buildElementEvidence(container),
  };
}
