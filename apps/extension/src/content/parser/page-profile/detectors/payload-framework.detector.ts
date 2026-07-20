import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import type { PageProfileDetectorResult } from '../types';

export function detectPayloadFramework(documentRoot: ParentNode): PageProfileDetectorResult | null {
  const nextData = documentRoot.querySelector('#__NEXT_DATA__');
  const nuxtData = documentRoot.querySelector('#__NUXT_DATA__');
  const angularRoot = documentRoot.querySelector('[ng-version]');
  const svelteKitRoot = documentRoot.querySelector('[data-sveltekit-hydrate]');

  const matchedSignals: PageProfile['matchedSignals'] = [];
  let appFamily = 'payload-framework';
  if (nextData) {
    appFamily = 'nextjs';
    matchedSignals.push({ id: 'payload.next-data', source: 'payload', strength: 'soft' });
  }
  if (nuxtData) {
    appFamily = 'nuxt';
    matchedSignals.push({ id: 'payload.nuxt-data', source: 'payload', strength: 'soft' });
  }
  if (angularRoot) {
    appFamily = 'angular';
    matchedSignals.push({ id: 'dom.angular-root', source: 'dom', strength: 'soft' });
  }
  if (svelteKitRoot) {
    appFamily = 'sveltekit';
    matchedSignals.push({ id: 'dom.sveltekit-root', source: 'dom', strength: 'soft' });
  }

  if (matchedSignals.length === 0) {
    return null;
  }

  return {
    confidence: 0.45,
    matchedSignals,
    profile: {
      vendor: 'generic',
      appFamily,
      pageKind: 'payload-webapp',
      pipelineId: 'generic-safe-fallback',
      confidence: 0.45,
      matchedSignals,
      preferredRoots: ['main', '[role="main"]', 'body'],
    },
  };
}
