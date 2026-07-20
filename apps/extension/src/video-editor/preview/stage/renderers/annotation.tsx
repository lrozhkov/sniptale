import { resolveAnnotationLayoutFeatures } from '../../../../features/video/project/annotation/layout';
import {
  resolveClipAnnotationScene,
  VideoAnnotationTargetBindingKind,
} from '../../../../features/video/project/annotation-engine';
import type {
  VideoProject,
  VideoProjectAnnotationClip,
} from '../../../../features/video/project/types/index';
import type { TextPreviewClipParams } from './shared';
import { getAnnotationPreviewClipStyle } from '../canvas/clip-layout';
import { renderResolvedAnnotationScene } from './annotation-scene';

interface AnnotationPreviewClipProps {
  clip: VideoProjectAnnotationClip;
  currentTime: number;
  onBeginInteraction: TextPreviewClipParams['onBeginInteraction'];
  project: VideoProject;
  selectedClipId: string | null;
}

function getAnnotationPreviewClassName() {
  return 'overflow-visible border-0 bg-transparent';
}

export function renderAnnotationPreviewClip(props: AnnotationPreviewClipProps) {
  const layout = resolveAnnotationLayoutFeatures(props.clip.templateKind);

  return (
    <button
      key={props.clip.id}
      type="button"
      style={getAnnotationPreviewClipStyle(props.project, props.clip, props.currentTime)}
      data-annotation-renderer="scene"
      data-annotation-layout={layout.family}
      className={getAnnotationPreviewClassName()}
      onPointerDown={(event) => props.onBeginInteraction(event, props.clip, 'move')}
    >
      {renderScene(props)}
    </button>
  );
}

function renderScene(props: AnnotationPreviewClipProps) {
  const scene = resolveClipAnnotationScene({
    clip: props.clip,
    currentTime: props.currentTime,
    project: props.project,
  });

  return renderResolvedAnnotationScene({
    scene,
    sourceFrame:
      scene.target.binding === VideoAnnotationTargetBindingKind.NONE
        ? scene.frame
        : scene.presentation.labelFrame,
  });
}
