import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import { detectGenericArticle } from './detectors/generic-article.detector';
import { detectGenericDashboard } from './detectors/generic-dashboard.detector';
import { detectGenericForm } from './detectors/generic-form.detector';
import { detectNaumenPortal } from './detectors/naumen-portal.detector';
import { detectNaumenSdGwt } from './detectors/naumen-sd-gwt.detector';
import { detectPayloadFramework } from './detectors/payload-framework.detector';
import type {
  PageProfileDetector,
  PageProfileDetectorContext,
  PageProfileDetectorResult,
} from './types';

const DEFAULT_PROFILE: PageProfile = {
  vendor: 'unknown',
  appFamily: 'unknown',
  pageKind: 'unknown',
  pipelineId: 'generic-safe-fallback',
  confidence: 0.2,
  matchedSignals: [],
  preferredRoots: ['main', '[role="main"]', 'article', 'body'],
};

const DETECTORS: PageProfileDetector[] = [
  detectNaumenSdGwt,
  detectNaumenPortal,
  detectGenericArticle,
  detectGenericForm,
  detectPayloadFramework,
  detectGenericDashboard,
];

function resolveDefaultPageUrl(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.href;
}

export function resolvePageProfile(
  documentRoot: ParentNode = document,
  context: PageProfileDetectorContext = {}
): PageProfileDetectorResult {
  const detectorContext = {
    ...context,
    pageUrl: context.pageUrl ?? resolveDefaultPageUrl(),
  };
  const candidates = DETECTORS.map((detector) => detector(documentRoot, detectorContext))
    .filter((result): result is PageProfileDetectorResult => result !== null)
    .sort((left, right) => right.confidence - left.confidence);

  return (
    candidates[0] ?? {
      confidence: DEFAULT_PROFILE.confidence,
      matchedSignals: [],
      profile: DEFAULT_PROFILE,
    }
  );
}
