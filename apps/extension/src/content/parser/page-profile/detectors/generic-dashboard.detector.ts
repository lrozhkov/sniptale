import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import type { PageProfileDetectorResult } from '../types';

export function detectGenericDashboard(documentRoot: ParentNode): PageProfileDetectorResult | null {
  const cardCount = documentRoot.querySelectorAll(
    '[class*="card"], [class*="widget"], [class*="tile"]'
  ).length;
  const tableCount = documentRoot.querySelectorAll('table').length;
  const hasCardSignal = cardCount >= 3;
  const hasTableSignal = tableCount >= 2;
  const hasMixedSignal = cardCount >= 1 && tableCount >= 1;

  if (!hasCardSignal && !hasTableSignal && !hasMixedSignal) {
    return null;
  }

  const matchedSignals: PageProfile['matchedSignals'] = [];
  if (hasCardSignal) {
    matchedSignals.push({ id: 'dom.dashboard-cards', source: 'dom', strength: 'soft' });
  }
  if (hasTableSignal || hasMixedSignal) {
    matchedSignals.push({ id: 'dom.dashboard-tables', source: 'dom', strength: 'soft' });
  }

  return {
    confidence: 0.55,
    matchedSignals,
    profile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'dashboard',
      pipelineId: 'generic-safe-fallback',
      confidence: 0.55,
      matchedSignals,
      preferredRoots: ['main', '[role="main"]', 'body'],
    },
  };
}
