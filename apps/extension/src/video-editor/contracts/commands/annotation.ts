import type { VideoProject } from '../../../features/video/project/types/model';
import type {
  VideoProjectCommentDocumentInput,
  VideoProjectCommentEdit,
} from '../../../features/video/project/comments/authoring';
import type {
  VideoProjectAnnotationStylePatch,
  VideoProjectAnnotationTemplatePatch,
} from '../../../features/video/project/annotation/contract';
import type { VideoAnnotationTemplateInput } from '../../../features/video/project/annotation/template';
import type { VideoProjectAnnotationClip } from '../../../features/video/project/types/index';

export interface VideoEditorAnnotationActions {
  /** Adds retained comments only to the exact accepted project snapshot. */
  addCommentDocument: (
    expectedProject: VideoProject,
    input: VideoProjectCommentDocumentInput
  ) => string | null;
  /** Merges one comment edit through the existing project updater and history. */
  editCommentDocument: (
    expectedProject: VideoProject,
    documentId: string,
    edit: VideoProjectCommentEdit
  ) => boolean;
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
