import { convertTextClipToAnnotationClip } from '../../../../features/video/project/annotation/conversion';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { VideoProjectClipType } from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { applyProjectUpdate, areClipTracksEditable } from '../helpers';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

export function createTextClipToAnnotationActions(
  set: VideoEditorStoreSet
): Pick<VideoEditorProjectState, 'convertTextClipToAnnotation'> {
  return {
    convertTextClipToAnnotation: (clipId, templateKind) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const clipToConvert = project.clips.find((item) => item.id === clipId);
          if (
            !clipToConvert ||
            clipToConvert.type !== VideoProjectClipType.TEXT ||
            !areClipTracksEditable(project, [clipId])
          ) {
            return project;
          }

          return applyVideoProjectMutationPatch(project, {
            clips: project.clips.map((clip) =>
              clip.id === clipId
                ? convertTextClipToAnnotationClip(project, clipToConvert, templateKind)
                : clip
            ),
          });
        })
      ),
  };
}
