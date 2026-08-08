import { createLogger } from '@sniptale/platform/observability/logger';
import { isSniptaleIdRetained } from '../../platform/frame';

type OriginalElementResolver = (node: Node) => Node | null;

type DomHelpersTextResolverState = {
  getOriginalElementFn: OriginalElementResolver | null;
};

interface DomHelpersTextResolverController {
  assignSniptaleId: (element: HTMLElement, id: string) => void;
  getResolver: () => OriginalElementResolver | null;
  setResolver: (fn: OriginalElementResolver | null) => void;
}

const logger = createLogger({ namespace: 'ContentDomTextResolver' });

function createResolverState(): DomHelpersTextResolverState {
  return {
    getOriginalElementFn: null,
  };
}

function logVirtualToOriginalAssignment(element: HTMLElement, id: string, original: Node): void {
  logger.log('Mapping virtual to original', {
    id,
    originalHasDataset: !!(original as HTMLElement).dataset,
    originalId: (original as HTMLElement).id,
    originalTag: (original as HTMLElement).tagName,
    virtualId: element.id,
    virtualTag: element.tagName,
  });
}

function warnMissingOriginalElement(element: HTMLElement, id: string): void {
  logger.warn('No original element found for virtual element', {
    className: element.className,
    elementId: element.id,
    id,
    tag: element.tagName,
  });
}

function assignParserSniptaleId(element: HTMLElement, id: string): void {
  if (isSniptaleIdRetained(element.dataset['sniptaleId'])) {
    return;
  }
  element.dataset['sniptaleId'] = id;
}

/**
 * Creates a controller that owns original-element resolver state for sniptale ids.
 */
export function createDomHelpersTextResolverController(): DomHelpersTextResolverController {
  const state = createResolverState();

  return {
    setResolver: (fn: OriginalElementResolver | null) => {
      state.getOriginalElementFn = fn;
    },

    getResolver: () => state.getOriginalElementFn,

    assignSniptaleId: (element: HTMLElement, id: string) => {
      const resolver = state.getOriginalElementFn;

      if (resolver) {
        const original = resolver(element);
        if (original && original !== element) {
          logVirtualToOriginalAssignment(element, id, original);
          assignParserSniptaleId(original as HTMLElement, id);
          return;
        }

        if (!original && !element.isConnected) {
          warnMissingOriginalElement(element, id);
        }
      } else {
        logger.warn('Original element resolver is not set');
      }

      assignParserSniptaleId(element, id);
    },
  };
}
