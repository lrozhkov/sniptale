import {
  browserAnnotationSession,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import type { CssDeclarationDelta, PageStyleMutationElement } from './types';
import { isCssDeclarationValueAllowed } from './validation';

/** Publishes only deltas accepted by the same declaration policy used by apply and replay. */
export function publishPageStyleAnnotation(args: {
  changes: CssDeclarationDelta[];
  evidence: BrowserAnnotationTargetEvidence;
  target: PageStyleMutationElement;
}): void {
  if (args.changes.length === 0) {
    return;
  }

  const allChangesValid = args.changes.every((change) =>
    (['before', 'after'] as const).every((side) => {
      const policy = side === 'before' ? change.beforePolicy : change.afterPolicy;
      return isCssDeclarationValueAllowed({
        ...(policy.assetUrl ? { assetUrl: policy.assetUrl } : {}),
        element: args.target,
        property: change.property,
        source: policy.source,
        value: change[side],
      });
    })
  );
  if (!allChangesValid) {
    throw new Error('Cannot publish invalid page-style annotation evidence');
  }

  browserAnnotationSession.recordPropertyChanges({
    changes: args.changes.map((change) => ({
      after: { ...change.after },
      before: { ...change.before },
      order: change.order,
      property: change.property,
    })),
    evidence: args.evidence,
    target: args.target,
  });
}
