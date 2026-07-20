import type { VideoProjectAnnotationClip } from '../types/index';
import { resolveAnnotationGlossProfile } from './sweep-gloss-profile';
import { resolveAnnotationShimmerProfile } from './sweep-shimmer-profile';

export type { AnnotationSweepProfile } from './sweep-profile.types.ts';

export function resolveAnnotationSweepProfile(
  templateKind: VideoProjectAnnotationClip['templateKind'],
  kind: 'gloss' | 'shimmer'
) {
  switch (kind) {
    case 'gloss':
      return resolveAnnotationGlossProfile(templateKind);
    case 'shimmer':
      return resolveAnnotationShimmerProfile(templateKind);
  }
}
