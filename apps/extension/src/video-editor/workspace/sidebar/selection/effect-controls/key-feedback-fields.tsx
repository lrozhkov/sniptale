import { RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../../platform/i18n';
import { KeyboardFeedbackFields } from '../../../../../ui/keyboard-feedback/fields';
import type { VideoProject } from '../../../../../features/video/project/types';
import {
  REVIEW_KEY_DEFAULT,
  type ReviewKeyPatch,
} from '../../../../../features/video/project/action-feedback/key-animation';
import {
  getVideoProjectKeyFeedbackTargets,
  patchVideoProjectKeyFeedback,
} from '../../../../../features/video/project/action-feedback/projection';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';

type KeyFeedbackFieldsProps = {
  project: VideoProject;
  part: 'display' | 'appearance' | 'timing' | 'position';
  disabled: boolean;
} & (
  | { scope: 'project' }
  | {
      scope?: 'event';
      recordingId: string;
      sourceInstanceId: string;
      sourceEventId: string;
    }
);

function selectedKeyTargets(project: VideoProject, props: KeyFeedbackFieldsProps) {
  if (
    props.scope !== 'project' &&
    project.actionFeedback?.some(
      (group) =>
        group.events &&
        group.recordingId === props.recordingId &&
        group.sourceInstanceId === props.sourceInstanceId
    )
  )
    return [
      {
        recordingId: props.recordingId,
        sourceInstanceId: props.sourceInstanceId,
        sourceEventId: props.sourceEventId,
      },
    ];
  return getVideoProjectKeyFeedbackTargets(project).filter(
    (target) =>
      props.scope === 'project' ||
      (target.recordingId === props.recordingId &&
        target.sourceInstanceId === props.sourceInstanceId &&
        target.sourceEventId === props.sourceEventId)
  );
}

/** The Native adapter applies identity-scoped caption patches through the current document owner. */
export function KeyFeedbackFields(props: KeyFeedbackFieldsProps) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const targets = selectedKeyTargets(props.project, props);
  if (!targets.length) return null;
  const groupFor = (target: (typeof targets)[number]) =>
    props.project.actionFeedback?.find(
      (group) =>
        group.recordingId === target.recordingId &&
        group.sourceInstanceId === target.sourceInstanceId
    );
  const selected = targets.flatMap((target) => {
    const group = groupFor(target);
    return target.sourceEventId === null
      ? [group?.keyDefaults, ...(group?.keyStyles ?? [])]
      : [
          group?.keyStyles?.find((style) => style.id === target.sourceEventId) ??
            group?.keyDefaults,
        ];
  });
  const hasOverrides = targets.some((target) => {
    const group = groupFor(target);
    return target.sourceEventId === null
      ? Boolean(group?.keyDefaults || group?.keyStyles?.length)
      : group?.keyStyles?.some((style) => style.id === target.sourceEventId);
  });
  const change = (patch: ReviewKeyPatch | null) => {
    if (props.disabled) return;
    updateProject((project) =>
      patchVideoProjectKeyFeedback(project, selectedKeyTargets(project, props), patch)
    );
  };
  return (
    <fieldset
      disabled={props.disabled}
      className="sniptale-parameter-stack min-w-0 space-y-2"
      data-ui="video-editor.key-feedback-fields"
    >
      <KeyboardFeedbackFields
        values={selected.map((style) => style ?? REVIEW_KEY_DEFAULT)}
        part={props.part}
        disabled={props.disabled}
        onChange={change}
      />
      {props.part === 'display' ? (
        <ContentToolbarButton
          type="button"
          tone="outline"
          size="compact"
          className="flex w-full items-center justify-center gap-2"
          dataUi="video-editor.key.reset"
          aria-label={translate('gallery.videoReview.keyReset')}
          title={translate('gallery.videoReview.keyReset')}
          disabled={props.disabled || !hasOverrides}
          onClick={() => change(null)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {translate('gallery.videoReview.keyReset')}
        </ContentToolbarButton>
      ) : null}
    </fieldset>
  );
}
