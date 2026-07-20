import type { VideoProjectAnnotationClip } from '../types/index';

export type VideoProjectAnnotationStylePatch = Record<string, string | number>;

export interface VideoProjectAnnotationTemplatePatch extends Partial<
  Pick<
    VideoProjectAnnotationClip,
    | 'direction'
    | 'intensity'
    | 'introAnimation'
    | 'introDurationMs'
    | 'outroAnimation'
    | 'outroDurationMs'
    | 'target'
    | 'templateKind'
  >
> {
  calloutDecor?: Partial<VideoProjectAnnotationClip['calloutDecor']>;
  content?: Partial<VideoProjectAnnotationClip['content']>;
  leaderLine?: Partial<VideoProjectAnnotationClip['leaderLine']>;
  preservePlacementOnTemplateChange?: boolean;
  style?: Partial<VideoProjectAnnotationClip['style']>;
  targetPoint?: VideoProjectAnnotationClip['targetPoint'];
  targetRect?: VideoProjectAnnotationClip['targetRect'];
  templateControlValues?: VideoProjectAnnotationClip['templateControlValues'];
  templateRef?: VideoProjectAnnotationClip['templateRef'];
  templateSnapshot?: VideoProjectAnnotationClip['templateSnapshot'];
}
