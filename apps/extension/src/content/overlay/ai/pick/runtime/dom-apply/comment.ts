import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';

const logger = createLogger({ namespace: 'ContentAiCommentEdit' });

function updateCommentTextIframe(rowElement: HTMLElement, targetEl: Element, newValue: string) {
  const iframe = targetEl.querySelector('iframe');
  if (!iframe) {
    return false;
  }

  logger.debug('Updating comment text inside rich-text iframe');

  try {
    const iframeEl = iframe as HTMLIFrameElement;
    const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document;

    if (iframeDoc && iframeDoc.body) {
      iframeDoc.body.replaceChildren();
      const lines = newValue.split('\n');
      lines.forEach((line, index) => {
        iframeDoc.body.appendChild(iframeDoc.createTextNode(line));
        if (index < lines.length - 1) {
          iframeDoc.body.appendChild(iframeDoc.createElement('br'));
        }
      });
      logger.debug('Updated rich-text iframe content');
      showToast(translate('content.runtime.commentTextUpdated'), 'success');
      return true;
    }
  } catch (e) {
    logger.warn('Cannot access rich-text iframe because it is cross-origin', e);
  }

  const editableEl = rowElement.querySelector('[contenteditable="true"]');
  if (editableEl) {
    (editableEl as HTMLElement).textContent = newValue;
    logger.debug('Updated fallback contenteditable comment element');
    return true;
  }

  logger.warn('Rich-text iframe remained inaccessible after fallback attempt');
  showToast(translate('content.runtime.froalaUnsupported'), 'warning');
  return false;
}

function resolveCommentCodeAttribute(columnName: string): 'author' | 'date' | 'text' | undefined {
  const codeByColumn = {
    Автор: 'author',
    Дата: 'date',
    Текст: 'text',
  } as const;

  return codeByColumn[columnName as keyof typeof codeByColumn];
}

function resolveCommentTarget(rowElement: HTMLElement, codeAttribute: 'author' | 'date' | 'text') {
  const modernSelector = {
    author: '.Comment__author',
    date: '.Comment__date',
    text: '.Comment__text',
  }[codeAttribute];

  return rowElement.querySelector(`[__code="${codeAttribute}"], ${modernSelector}`);
}

export function applyCommentEdit(
  rowElement: HTMLElement,
  columnName: string,
  newValue: string,
  updateTextPreservingStructure: (element: HTMLElement, newValue: string) => void
): boolean {
  logger.debug('Applying comment edit', {
    columnName,
    newValueLength: newValue.length,
    rowId: rowElement.id,
  });

  const codeAttribute = resolveCommentCodeAttribute(columnName);
  if (!codeAttribute) {
    logger.warn('Unknown comment column', { columnName });
    return false;
  }

  const targetEl = resolveCommentTarget(rowElement, codeAttribute);
  if (!targetEl) {
    logger.warn('Comment element not found for column', { codeAttribute, columnName });
    return false;
  }

  logger.debug('Resolved comment target element', {
    hasClassName: Boolean((targetEl as HTMLElement).className),
    tagName: targetEl.tagName,
  });

  if (codeAttribute === 'text' && updateCommentTextIframe(rowElement, targetEl, newValue)) {
    return true;
  }

  updateTextPreservingStructure(targetEl as HTMLElement, newValue);
  logger.debug('Updated comment content', {
    columnName,
    newValueLength: newValue.length,
  });
  return true;
}
