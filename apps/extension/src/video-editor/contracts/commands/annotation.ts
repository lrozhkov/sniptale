import type {
  VideoProjectAnnotationStylePatch,
  VideoProjectAnnotationTemplatePatch,
} from '../../../features/video/project/annotation/contract';
import type { VideoAnnotationTemplateInput } from '../../../features/video/project/annotation/template';
import type { VideoProjectAnnotationClip } from '../../../features/video/project/types/index';

export interface VideoEditorAnnotationActions {
  addAnnotationOverlay: (
    trackId?: string | null,
    startTime?: number,
    templateInput?: VideoAnnotationTemplateInput
  ) => string | null;
  convertTextClipToAnnotation: (
    clipId: string,
    templateKind: VideoProjectAnnotationClip['templateKind']
  ) => void;
  updateAnnotationClipContent: (
    clipId: string,
    patch: Partial<VideoProjectAnnotationClip['content']>
  ) => void;
  updateAnnotationClipStyle: (clipId: string, patch: VideoProjectAnnotationStylePatch) => void;
  updateAnnotationClipTemplate: (
    clipId: string,
    patch: VideoProjectAnnotationTemplatePatch
  ) => void;
}
