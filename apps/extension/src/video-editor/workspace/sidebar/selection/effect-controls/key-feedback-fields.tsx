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
  const styles = new Map(
    (props.project.actionFeedback ?? []).flatMap((group) =>
      (group.keyStyles ?? []).map(
        (style) =>
          [JSON.stringify([group.recordingId, group.sourceInstanceId, style.id]), style] as const
      )
    )
  );
  const selected = targets.map((target) =>
    styles.get(JSON.stringify([target.recordingId, target.sourceInstanceId, target.sourceEventId]))
  );
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
          disabled={props.disabled || !selected.some(Boolean)}
          onClick={() => change(null)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {translate('gallery.videoReview.keyReset')}
        </ContentToolbarButton>
      ) : null}
    </fieldset>
  );
}
