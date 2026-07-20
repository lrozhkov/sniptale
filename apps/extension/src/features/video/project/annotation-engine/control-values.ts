import type { AnnotationSceneResolvableClip } from './scene';
import type { VideoAnnotationTemplate, VideoAnnotationTemplateControlValues } from './types';

export function resolveAnnotationControlValues(
  template: VideoAnnotationTemplate,
  clip: AnnotationSceneResolvableClip
): VideoAnnotationTemplateControlValues {
  return {
    ...Object.fromEntries(template.controls.map((control) => [control.id, control.defaultValue])),
    ...(clip.templateSnapshot?.controls ?? {}),
    ...(clip.templateControlValues ?? {}),
  };
}
