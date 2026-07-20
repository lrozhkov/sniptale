import { getIframeDocument } from '../../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentDomTreeParser:IframeTraversal' });

function buildNodeMapping(
  virtualToOriginalMap: Map<Node, Node>,
  virtual: Node,
  original: Node
): void {
  virtualToOriginalMap.set(virtual, original);

  const virtualChildren = Array.from(virtual.childNodes);
  const originalChildren = Array.from(original.childNodes);

  for (let i = 0; i < virtualChildren.length && i < originalChildren.length; i += 1) {
    const virtualChild = virtualChildren[i];
    const originalChild = originalChildren[i];
    if (virtualChild === undefined || originalChild === undefined) {
      continue;
    }
    buildNodeMapping(virtualToOriginalMap, virtualChild, originalChild);
  }
}

function resolveIframeLabel(iframe: HTMLIFrameElement) {
  return iframe.id || iframe.src?.substring(0, 50);
}

function resolveVirtualIframe(props: { iframeId: string; virtualBody: HTMLElement }) {
  const escapedId = props.iframeId.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
  return props.virtualBody.querySelector(`iframe#${escapedId}`) as HTMLIFrameElement | null;
}

function annotateIframeClone(iframeBodyClone: HTMLElement, iframeId: string) {
  const allElements = iframeBodyClone.querySelectorAll('*');
  logger.debug(`Iframe ${iframeId} has ${allElements.length} total elements (including nested)`);

  for (let i = 0; i < allElements.length; i += 1) {
    const element = allElements[i];
    if (element === undefined) {
      continue;
    }
    if (!element.hasAttribute('data-iframe-source')) {
      element.setAttribute('data-iframe-source', iframeId);
    }
  }

  if (!iframeBodyClone.hasAttribute('data-iframe-source')) {
    iframeBodyClone.setAttribute('data-iframe-source', iframeId);
  }
  logger.debug(`Iframe ${iframeId}: set data-iframe-source on all ${allElements.length} elements`);
}

function appendIframeBodyChildren(props: {
  iframeBody: HTMLElement;
  iframeBodyClone: HTMLElement;
  iframeId: string;
  virtualIframeContainer: HTMLElement;
  virtualToOriginalMap: Map<Node, Node>;
}): void {
  const cloneChildren = Array.from(props.iframeBodyClone.childNodes);
  const originalChildren = Array.from(props.iframeBody.childNodes);

  cloneChildren.forEach((cloneChild, index) => {
    const originalChild = originalChildren[index];
    if (originalChild) {
      buildNodeMapping(props.virtualToOriginalMap, cloneChild, originalChild);
    }

    if (cloneChild instanceof HTMLElement) {
      annotateIframeClone(cloneChild, props.iframeId);
    }

    props.virtualIframeContainer.appendChild(cloneChild);
  });
}

function embedNestedVirtualIframes(props: {
  iframeBodyClone: HTMLElement;
  iframeBody: HTMLElement;
  virtualToOriginalMap: Map<Node, Node>;
}): void {
  const nestedIframes = Array.from(props.iframeBody.querySelectorAll('iframe'));

  for (const nestedIframe of nestedIframes) {
    try {
      embedVirtualIframe({
        originalIframe: nestedIframe,
        virtualBody: props.iframeBodyClone,
        virtualToOriginalMap: props.virtualToOriginalMap,
      });
    } catch (error) {
      logger.warn('Cannot embed nested iframe', {
        error,
        iframeId: nestedIframe.id || nestedIframe.src,
      });
    }
  }
}

function createVirtualIframeContainer(props: {
  iframeId: string;
  originalIframe: HTMLIFrameElement;
  virtualIframe: HTMLIFrameElement;
}) {
  const virtualIframeContainer = document.createElement('div');
  virtualIframeContainer.setAttribute('data-virtual-iframe', 'true');
  virtualIframeContainer.setAttribute('data-iframe-source', props.iframeId);
  virtualIframeContainer.id = props.iframeId;

  if (props.virtualIframe.className) {
    virtualIframeContainer.className = props.virtualIframe.className;
  }

  if (props.originalIframe.src) {
    virtualIframeContainer.setAttribute('data-iframe-src', props.originalIframe.src);
  }

  const appCode = props.originalIframe.getAttribute('data-application-code');
  if (appCode) {
    virtualIframeContainer.setAttribute('data-application-code', appCode);
    logger.debug(`Preserved data-application-code="${appCode}" for iframe ${props.iframeId}`);
  }

  const dataOrigin = props.originalIframe.getAttribute('data-origin');
  if (dataOrigin) {
    virtualIframeContainer.setAttribute('data-origin', dataOrigin);
  }

  return virtualIframeContainer;
}

function embedResolvedVirtualIframe(args: {
  iframeDoc: Document;
  iframeId: string;
  originalIframe: HTMLIFrameElement;
  virtualIframe: HTMLIFrameElement;
  virtualToOriginalMap: Map<Node, Node>;
}): void {
  const iframeBodyClone = args.iframeDoc.body.cloneNode(true) as HTMLElement;
  const virtualIframeContainer = createVirtualIframeContainer({
    iframeId: args.iframeId,
    originalIframe: args.originalIframe,
    virtualIframe: args.virtualIframe,
  });
  buildNodeMapping(args.virtualToOriginalMap, virtualIframeContainer, args.originalIframe);
  embedNestedVirtualIframes({
    iframeBody: args.iframeDoc.body,
    iframeBodyClone,
    virtualToOriginalMap: args.virtualToOriginalMap,
  });

  appendIframeBodyChildren({
    iframeBody: args.iframeDoc.body,
    iframeBodyClone,
    iframeId: args.iframeId,
    virtualIframeContainer,
    virtualToOriginalMap: args.virtualToOriginalMap,
  });

  args.virtualIframe.replaceWith(virtualIframeContainer);
}

export function embedVirtualIframe(props: {
  originalIframe: HTMLIFrameElement;
  virtualBody: HTMLElement;
  virtualToOriginalMap: Map<Node, Node>;
}) {
  const iframeDoc = getIframeDocument(props.originalIframe);
  if (!iframeDoc?.body) {
    logger.debug(`Skipping iframe without body: ${resolveIframeLabel(props.originalIframe)}`);
    return;
  }

  logger.debug(`Embedding iframe: ${resolveIframeLabel(props.originalIframe)}`);

  const iframeId = props.originalIframe.id;
  if (!iframeId) {
    logger.debug('Skipping iframe without ID');
    return;
  }

  const virtualIframe = resolveVirtualIframe({
    iframeId,
    virtualBody: props.virtualBody,
  });
  if (!virtualIframe) {
    logger.debug(`Virtual iframe not found: ${iframeId}`);
    return;
  }

  embedResolvedVirtualIframe({
    iframeDoc,
    iframeId,
    originalIframe: props.originalIframe,
    virtualIframe,
    virtualToOriginalMap: props.virtualToOriginalMap,
  });
}
