import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import type { PageProfileDetectorContext, PageProfileDetectorResult } from '../types';

function resolvePageUrl(context: PageProfileDetectorContext): string {
  return context.pageUrl ?? (typeof window === 'undefined' ? '' : window.location.href);
}

function buildSignals(
  documentRoot: ParentNode,
  context: PageProfileDetectorContext
): PageProfile['matchedSignals'] {
  const signals: PageProfile['matchedSignals'] = [];
  const url = resolvePageUrl(context);
  if (url.includes('/sd/operator/')) {
    signals.push({ id: 'url.sd-operator', source: 'url', strength: 'hard' });
  }

  if (documentRoot.querySelector('.gwt-TabLayoutPanel, table.attrList, [id*="PropertyList"]')) {
    signals.push({ id: 'dom.gwt-property-layout', source: 'dom', strength: 'hard' });
  }

  if (
    documentRoot.querySelector(
      [
        '.GAQEVERFM',
        '[id*="EmbeddedApplicationContent"]',
        'iframe[data-application-code="dynamicFields"]',
        'iframe[data-application-code="mvs"]',
        '[data-virtual-iframe="true"][data-application-code="dynamicFields"]',
        '[data-virtual-iframe="true"][data-application-code="mvs"]',
      ].join(', ')
    )
  ) {
    signals.push({ id: 'dom.gwt-embedded-app', source: 'dom', strength: 'hard' });
  }

  if (documentRoot.querySelector('.GAQEVERFM, .stringView, .boRreference')) {
    signals.push({ id: 'dom.gwt-components', source: 'dom', strength: 'soft' });
  }

  return signals;
}

function resolvePageKind(documentRoot: ParentNode): string {
  if (documentRoot.querySelector('[id*="EmbeddedApplicationContent.dynamicFields"]')) {
    return 'object-card-with-dynamic-fields';
  }

  if (
    documentRoot.querySelector(
      'iframe[data-application-code="dynamicFields"], [data-application-code="dynamicFields"]'
    )
  ) {
    return 'dynamic-fields';
  }

  if (
    documentRoot.querySelector('iframe[data-application-code="mvs"], [data-application-code="mvs"]')
  ) {
    return 'embedded-mvs';
  }

  if (documentRoot.querySelector('[id*="PropertyList"], table.attrList')) {
    return 'object-card';
  }

  return 'workspace';
}

export function detectNaumenSdGwt(
  documentRoot: ParentNode,
  context: PageProfileDetectorContext
): PageProfileDetectorResult | null {
  const matchedSignals = buildSignals(documentRoot, context);
  if (!matchedSignals.some((signal) => signal.strength === 'hard')) {
    return null;
  }

  return {
    confidence: matchedSignals.length >= 3 ? 0.99 : 0.95,
    matchedSignals,
    profile: {
      vendor: 'naumen-sd-gwt',
      appFamily: 'naumen-sd',
      pageKind: resolvePageKind(documentRoot),
      pipelineId: 'naumen-sd-gwt',
      confidence: matchedSignals.length >= 3 ? 0.99 : 0.95,
      matchedSignals,
      preferredRoots: ['#gwt-debug-mainContentContainer', '#gwt-debug-scrollableArea', 'body'],
    },
  };
}
