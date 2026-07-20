import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';

export type PageProfileDetectorResult = {
  confidence: number;
  matchedSignals: PageProfile['matchedSignals'];
  profile: PageProfile;
};

export type PageProfileDetectorContext = {
  pageUrl?: string | undefined;
};

export type PageProfileDetector = (
  documentRoot: ParentNode,
  context: PageProfileDetectorContext
) => PageProfileDetectorResult | null;
