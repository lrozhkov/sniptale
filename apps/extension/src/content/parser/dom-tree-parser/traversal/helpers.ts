import { createLogger } from '@sniptale/platform/observability/logger';
import { isRichTextEditorChromeElement } from '../../rich-text-content';

const logger = createLogger({ namespace: 'ContentDomTreeParser:Traversal' });

export function shouldRejectTreeWalkerTag(tagName: string) {
  return [
    'SCRIPT',
    'STYLE',
    'SVG',
    'NOSCRIPT',
    'TEMPLATE',
    'HEAD',
    'META',
    'LINK',
    'BR',
    'HR',
  ].includes(tagName);
}

function hasMatchingToken(value: string, candidates: string[]) {
  const normalized = value.toLowerCase();
  return candidates.some((candidate) => normalized.includes(candidate));
}

export function shouldRejectVirtualIframeSubtree(element: Element) {
  if (element.getAttribute('data-virtual-iframe') !== 'true') {
    return false;
  }

  const applicationCode = element.getAttribute('data-application-code');
  if (applicationCode === 'dynamicFields' || applicationCode === 'mvs') {
    return false;
  }

  const iframeId = (element as HTMLElement).id || '';
  const iframeClassName = (element as HTMLElement).className || '';
  const iframeSrc = element.getAttribute('data-iframe-src') || '';

  return (
    hasMatchingToken(iframeSrc, ['summernote', 'richtext']) ||
    hasMatchingToken(iframeClassName, ['summernote', 'froala']) ||
    hasMatchingToken(iframeId, ['rtf-editor', 'richtext'])
  );
}

export function shouldRejectTreeWalkerClassList(classList: DOMTokenList | null) {
  if (!classList) {
    return false;
  }

  for (let i = 0; i < classList.length; i += 1) {
    const cls = classList[i];
    if (cls === undefined) {
      continue;
    }
    if (
      cls.startsWith('sniptale-') ||
      cls.startsWith('shadow-') ||
      cls === 'sniptale-root' ||
      cls.startsWith('note-') ||
      cls.startsWith('fr-')
    ) {
      return true;
    }
  }

  return false;
}

export function shouldRejectTreeWalkerContext(element: Element) {
  if (isRichTextEditorChromeElement(element)) {
    return NodeFilter.FILTER_REJECT;
  }

  if (
    (element as HTMLElement).closest('.gwt-ToolPanel, .buttonsGroup, .toolbar, .actions, .g-button')
  ) {
    return NodeFilter.FILTER_REJECT;
  }

  const attrWideParent = (element as HTMLElement).closest('td.attrWide');
  if (attrWideParent && element !== attrWideParent) {
    return NodeFilter.FILTER_SKIP;
  }

  return null;
}

export function shouldSkipActionPanel(
  element: Element,
  classList: DOMTokenList | null,
  elementId: string
) {
  if (
    elementId &&
    (elementId.includes('actionsForceEnabled') ||
      elementId === 'GAQEVERBM' ||
      elementId.includes('GAQEVERBM'))
  ) {
    logger.debug('Rejecting action panel by ID', elementId);
    return true;
  }

  if (classList && classList.contains('actionsForceEnabled')) {
    const hasTitleChild = element.querySelector('#gwt-debug-title, [id*="title"]');
    if (!hasTitleChild) {
      logger.debug('Rejecting action panel by class actionsForceEnabled');
      return true;
    }

    logger.debug('Skipping section header wrapper with actionsForceEnabled title');
    return true;
  }

  if (classList && classList.contains('GAQEVERBM')) {
    const hasTitleChild = element.querySelector('#gwt-debug-title, [id*="title"]');
    if (!hasTitleChild) {
      logger.debug('Rejecting action panel by class GAQEVERBM');
      return true;
    }

    logger.debug('Skipping section header wrapper with GAQEVERBM title');
    return true;
  }

  return false;
}
