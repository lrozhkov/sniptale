import type {
  EvidenceRef,
  EvidenceRefSource,
  TargetRef,
} from '@sniptale/runtime-contracts/dom-tree';
import { extractCleanText, getSelector } from '../dom-utils/dom-helpers';

type EvidenceOptions = {
  confidence?: number;
  excerpt?: string;
  excerptMaxLength?: number;
  source?: EvidenceRefSource;
};

function buildExcerpt(
  element: HTMLElement,
  excerptMaxLength: number,
  excerptOverride?: string
): string | undefined {
  const text = excerptOverride?.trim() || extractCleanText(element);
  if (!text) {
    return undefined;
  }

  if (text.length <= excerptMaxLength) {
    return text;
  }

  return `${text.slice(0, excerptMaxLength - 3)}...`;
}

export function buildElementEvidence(
  element: HTMLElement,
  options?: EvidenceOptions
): EvidenceRef[] {
  const locator = getSelector(element);
  if (!locator) {
    return [];
  }

  return [
    {
      source: options?.source ?? 'dom',
      locator,
      confidence: options?.confidence ?? 1,
      ...(() => {
        const excerpt = buildExcerpt(element, options?.excerptMaxLength ?? 160, options?.excerpt);
        return excerpt === undefined ? {} : { excerpt };
      })(),
    },
  ];
}

export function buildElementTargetRef(
  element: HTMLElement,
  editable: boolean,
  sniptaleId?: string
): TargetRef | undefined {
  const selector = getSelector(element);
  if (!selector) {
    return undefined;
  }

  return {
    realmId: 'document',
    selectors: [selector],
    anchorStrategy: sniptaleId ? 'sniptale' : 'selector-chain',
    editable,
    ...(sniptaleId === undefined ? {} : { sniptaleId }),
  };
}
