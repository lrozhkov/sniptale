import { ReviewActionAudioUnavailable } from '../../../../../features/video/review/action-audio';
import { createProjectActionAudioRuntime } from '../../../../preview/stage/runtime/action-audio';
import { ActionAudioFields } from '../../../../../ui/action-audio/fields';
import { reviewGestureAreaBounds } from '../../../../../features/video/project/action-feedback/validation';
import {
  buildProjectActionAudioAuditionPlan,
  projectActionFeedbackMarkers,
} from '../../../../../features/video/review/project-action-audio';
import { InspectorDetails } from '../shared/details';
import { useState, useEffect, useRef, useCallback } from 'react';
import { NumericRow, type NumericRowProps } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import {
  useVideoEditorPlaybackPort,
  useVideoEditorProjectLifecyclePort,
  useVideoEditorTimelineEditingPort,
} from '../../../../runtime/controller/store';
import type { VideoProject } from '../../../../../features/video/project/types';
import { patchVideoProjectActionFeedback } from '../../../../../features/video/project/action-feedback/projection';
import {
  patchReviewActionAudio,
  type ReviewActionAudioTarget,
  type ReviewActionAudioPatch,
  type ReviewActionAudioStyle,
} from '../../../../../features/video/review/advanced/action-audio';
import {
  patchReviewClicks,
  REVIEW_CLICK_DEFAULT,
  type ReviewClickStyle,
} from '../../../../../features/video/review/advanced/click-animation';
import { ToggleField } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';

/** Local inspector adapter sends one authored update to the established project history port. */
interface FeedbackProps {
  project: VideoProject;
  recordingId: string;
  sourceInstanceId: string;
  target: ReviewActionAudioTarget;
  disabled: boolean;
  gesture?: boolean;
  part?: 'sound' | 'gesture';
}

export function ActionFeedbackFields(props: FeedbackProps) {
  const soundPreview = useActionSoundAudition(props);
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const group = props.project.actionFeedback?.find(
    (item) =>
      item.recordingId === props.recordingId && item.sourceInstanceId === props.sourceInstanceId
  );
  if (
    !group ||
    (props.target.ref.kind === 'signal' &&
      group.signals.some(
        (signal) => signal.id === props.target.ref.id && signal.data['privacy'] === 'protected'
      ))
  )
    return null;
  const identity = { recordingId: props.recordingId, sourceInstanceId: props.sourceInstanceId };
  const change = (patch: ReviewActionAudioPatch | null) => {
    if (props.disabled) return;
    updateProject((project) => {
      const current = project.actionFeedback?.find(
        (item) =>
          item.recordingId === identity.recordingId &&
          item.sourceInstanceId === identity.sourceInstanceId
      );
      return current
        ? patchVideoProjectActionFeedback(project, identity, {
            settings: patchReviewActionAudio(current.settings, [props.target], patch),
          })
        : project;
    });
  };
  const gestureStyle = group.gestureStyles?.find((item) => item.id === props.target.ref.id) ?? {
    ...REVIEW_CLICK_DEFAULT,
    effect:
      props.project.actionPresentation?.enabled === false ? ('off' as const) : ('press' as const),
  };
  const changeGesture = (patch: Partial<ReviewClickStyle>) => {
    if (props.disabled) return;
    updateProject((project) => {
      const current = project.actionFeedback?.find(
        (item) =>
          item.recordingId === identity.recordingId &&
          item.sourceInstanceId === identity.sourceInstanceId
      );
      return current
        ? patchVideoProjectActionFeedback(project, identity, {
            gestureStyles: patchReviewClicks(
              current.gestureStyles ?? [],
              [props.target.ref.id],
              {
                effect:
                  current.gestureStyles?.find((item) => item.id === props.target.ref.id)?.effect ??
                  (project.actionPresentation?.enabled === false ? 'off' : 'press'),
                ...patch,
              },
              patch.gestureAppearance === 'area'
                ? projectActionFeedbackMarkers(project, current)
                : []
            ),
          })
        : project;
    });
  };
  return (
    <fieldset
      disabled={props.disabled}
      className="sniptale-parameter-stack min-w-0 space-y-2"
      data-ui="video-editor.action-feedback-fields"
    >
      {props.part !== 'gesture' ? (
        <ActionAudioFields
          dataUi="video-editor.action-audio-fields"
          targets={[props.target]}
          settings={group.settings}
          busy={props.disabled}
          onChange={(_targets, patch) => change(patch)}
          onAudition={soundPreview.audition}
          onStopAudition={soundPreview.stop}
        />
      ) : null}
      {soundPreview.error ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {soundPreview.error}
        </p>
      ) : null}
      {props.gesture && props.part !== 'sound' ? (
        <FeedbackGestureFields gestureStyle={gestureStyle} changeGesture={changeGesture} />
      ) : null}
    </fieldset>
  );
}

function useActionSoundAudition(props: FeedbackProps) {
  const project = useVideoEditorProjectLifecyclePort((port) => port.project);
  const setPlaying = useVideoEditorPlaybackPort((port) => port.setPlaying);
  const active = useRef<{
    controller: AbortController;
    runtime: ReturnType<typeof createProjectActionAudioRuntime>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback(() => {
    const previous = active.current;
    active.current = null;
    previous?.controller.abort();
    if (previous) void previous.runtime.close().catch(() => undefined);
  }, []);
  useEffect(() => {
    stop();
    setError(null);
    return stop;
  }, [
    project?.id,
    project?.duration,
    project?.clips,
    project?.tracks,
    project?.assets,
    project?.actionEvents,
    project?.actionFeedback,
    project?.actionPresentation,
    props.recordingId,
    props.sourceInstanceId,
    props.target.ref.kind,
    props.target.ref.id,
    props.disabled,
    props.part,
    stop,
  ]);
  const audition = (target: ReviewActionAudioTarget, style: ReviewActionAudioStyle) => {
    if (props.disabled || !project || project.id !== props.project.id) return;
    stop();
    setError(null);
    const session = {
      controller: new AbortController(),
      runtime: createProjectActionAudioRuntime(),
    };
    active.current = session;
    setPlaying(false);
    const plan = buildProjectActionAudioAuditionPlan(
      project,
      {
        recordingId: props.recordingId,
        sourceInstanceId: props.sourceInstanceId,
      },
      target,
      style
    );
    void session.runtime
      .audition(plan, session.controller.signal)
      .catch((failure: unknown) => {
        if (active.current === session && !session.controller.signal.aborted)
          setError(
            translate(
              failure instanceof ReviewActionAudioUnavailable && failure.reason === 'voice-limit'
                ? 'gallery.videoReview.actionAudioLimit'
                : 'gallery.videoReview.actionAudioResource'
            )
          );
      })
      .finally(() => {
        if (active.current === session) active.current = null;
        void session.runtime.close().catch(() => undefined);
      });
  };
  return { audition, stop, error };
}

function FeedbackNumber(props: Omit<NumericRowProps, 'onPreviewValue'>) {
  const [draft, setDraft] = useState<number>();
  useEffect(() => setDraft(undefined), [props.value]);
  return (
    <NumericRow
      {...props}
      value={draft ?? props.value}
      onPreviewValue={setDraft}
      onCommitValue={(value) => {
        setDraft(undefined);
        props.onCommitValue(value);
      }}
    />
  );
}

function FeedbackGestureFields({
  gestureStyle,
  changeGesture,
}: {
  gestureStyle: ReviewClickStyle;
  changeGesture(patch: Partial<ReviewClickStyle>): void;
}) {
  return (
    <>
      <ToggleField
        label={translate('gallery.videoReview.gestureFeedback')}
        checked={gestureStyle.effect !== 'off'}
        onChange={(enabled) => changeGesture({ effect: enabled ? 'press' : 'off' })}
      />
      <OptionButtonsField
        label={translate('gallery.videoReview.gestureAppearance')}
        value={gestureStyle.gestureAppearance ?? 'halo'}
        options={(['halo', 'path', 'area'] as const).map((value) => ({
          value,
          label: translate(`gallery.videoReview.gesture_${value}`),
        }))}
        onChange={(gestureAppearance) => changeGesture({ gestureAppearance })}
      />
      {gestureStyle.gestureAppearance === 'area' && gestureStyle.gestureArea ? (
        <InspectorDetails
          preferenceId="action-feedback:gesture-area"
          label={translate('gallery.videoReview.gestureAreaDetails')}
        >
          {(['x', 'y', 'width', 'height'] as const).map((key) => {
            const area = gestureStyle.gestureArea!;
            const { min, max } = reviewGestureAreaBounds(area, key);
            return (
              <FeedbackNumber
                key={key}
                appearance="plain"
                focusAppearance="accent-box"
                label={translate(`gallery.videoReview.gestureArea_${key}`)}
                value={area[key] * 100}
                min={min}
                max={max}
                step={0.1}
                precision={1}
                unit="%"
                scrub={{ min, max, step: 0.1 }}
                onCommitValue={(value) =>
                  changeGesture({ gestureArea: { ...area, [key]: value / 100 } })
                }
              />
            );
          })}
        </InspectorDetails>
      ) : null}
    </>
  );
}
