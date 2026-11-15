import { KeyboardFeedbackFields } from '../../../../../ui/keyboard-feedback/fields';
import { PointerFeedbackFields } from '../../../../../ui/pointer-feedback/fields';
import { ActionAudioFields } from '../../../../../ui/action-audio/fields';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import { InspectorDetails } from '../shared/details';
import {
  patchSourceInteractionFeedback,
  sourceInteractionFeedback,
} from '../../../../../features/video/project/source-interaction-authoring';
import {
  getVideoProjectClickStyle,
  getVideoProjectKeyStyle,
} from '../../../../../features/video/project/action-feedback/projection';
import {
  patchReviewKeys,
  REVIEW_KEY_DEFAULT,
} from '../../../../../features/video/project/action-feedback/key-animation';
import {
  patchReviewClicks,
  REVIEW_CLICK_DEFAULT,
} from '../../../../../features/video/review/advanced/click-animation';
import { patchReviewActionAudio } from '../../../../../features/video/review/advanced/action-audio';
import type {
  VideoProject,
  VideoProjectActionEvent,
} from '../../../../../features/video/project/types';

/** Retained manual presses use the existing shared controls and the source document's mutation owner. */
export function SourceInteractionFeedbackFields(props: {
  project: VideoProject;
  event: VideoProjectActionEvent;
  part: 'display' | 'appearance' | 'timing' | 'position' | 'sound';
  disabled: boolean;
}) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const anchor = props.event.anchor;
  if (anchor.kind === 'project') return null;
  const current = sourceInteractionFeedback(props.project, props.event.id);
  if (!current) return null;
  const target = {
    ref: { kind: 'action' as const, id: anchor.sourceEventId },
    family: props.event.kind === 'KEY' ? ('keyboard' as const) : ('mouse' as const),
  };
  if (props.part === 'sound')
    return (
      <ActionAudioFields
        targets={[target]}
        settings={current.settings}
        busy={props.disabled}
        onChange={(_, patch) => {
          if (!props.disabled)
            updateProject((project) =>
              patchSourceInteractionFeedback(project, props.event.id, {
                settings: patchReviewActionAudio(
                  sourceInteractionFeedback(project, props.event.id)?.settings ?? [],
                  [target],
                  patch
                ),
              })
            );
        }}
      />
    );
  if (props.event.kind === 'KEY')
    return (
      <KeyboardFeedbackFields
        values={[getVideoProjectKeyStyle(props.project, props.event) ?? REVIEW_KEY_DEFAULT]}
        part={props.part}
        disabled={props.disabled}
        onChange={(patch) => {
          if (!props.disabled)
            updateProject((project) =>
              patchSourceInteractionFeedback(project, props.event.id, {
                keyStyles: patchReviewKeys(
                  sourceInteractionFeedback(project, props.event.id)?.keyStyles ?? [],
                  [anchor.sourceEventId],
                  patch
                ),
              })
            );
        }}
      />
    );
  return (
    <PointerFeedbackFields
      values={[getVideoProjectClickStyle(props.project, props.event) ?? REVIEW_CLICK_DEFAULT]}
      part={props.part === 'display' ? 'animation' : props.part}
      disabled={props.disabled}
      Details={InspectorDetails}
      onChange={(patch) => {
        if (!props.disabled)
          updateProject((project) =>
            patchSourceInteractionFeedback(project, props.event.id, {
              gestureStyles: patchReviewClicks(
                sourceInteractionFeedback(project, props.event.id)?.gestureStyles ?? [],
                [anchor.sourceEventId],
                patch
              ),
            })
          );
      }}
    />
  );
}
