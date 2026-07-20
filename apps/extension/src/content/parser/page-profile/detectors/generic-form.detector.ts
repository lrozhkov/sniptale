import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import type { PageProfileDetectorResult } from '../types';
import {
  countFormControls,
  hasStrongNarrativeSignals,
  queryGenericContentRoot,
} from './generic-detector.helpers';

export function detectGenericForm(documentRoot: ParentNode): PageProfileDetectorResult | null {
  const formRoot = documentRoot.querySelector('form, .form-group, .FormField-EA__field');
  if (!(formRoot instanceof HTMLElement)) {
    return null;
  }

  const labelCount = documentRoot.querySelectorAll('label').length;
  const inputCount = documentRoot.querySelectorAll('input, select, textarea').length;
  if (labelCount === 0 || inputCount === 0) {
    return null;
  }

  const contentRoot = queryGenericContentRoot(documentRoot);
  if (contentRoot && hasStrongNarrativeSignals(contentRoot)) {
    const contentRootFormControls = countFormControls(contentRoot);
    const maxNarrativeFormControls = Math.max(2, Math.floor(inputCount / 3));
    if (contentRootFormControls <= maxNarrativeFormControls) {
      return null;
    }
  }

  const matchedSignals: PageProfile['matchedSignals'] = [
    { id: 'dom.form-controls', source: 'dom', strength: 'hard' },
  ];

  return {
    confidence: 0.8,
    matchedSignals,
    profile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'form',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals,
      preferredRoots: ['form', 'main', '[role="main"]', 'body'],
    },
  };
}
