import { REVIEW_CLICK_DEFAULT } from '../../../../../features/video/project/action-feedback/validation';
import { RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { PointerFeedbackFields } from '../../../../../ui/pointer-feedback/fields';
import { ReviewActionAudioUnavailable } from '../../../../../features/video/review/action-audio';
import { createProjectActionAudioRuntime } from '../../../../preview/stage/runtime/action-audio';
import { ActionAudioFields } from '../../../../../ui/action-audio/fields';
import {
  buildProjectActionAudioAuditionPlan,
  projectActionFeedbackMarkers,
  getProjectGestureFeedbackDefaults,
} from '../../../../../features/video/review/project-action-audio';
import { InspectorDetails } from '../shared/details';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  type ReviewClickStyle,
} from '../../../../../features/video/review/advanced/click-animation';

/** Local inspector adapter sends one authored update to the established project history port. */
interface FeedbackProps {
  project: VideoProject;
  recordingId: string;
  sourceInstanceId: string;
  target: ReviewActionAudioTarget;
  disabled: boolean;
  visual?: 'click' | 'gesture';
  part?: 'sound' | 'visual';
  visualPart?: 'animation' | 'appearance' | 'timing' | 'position';
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
  const gestureStyle =
    group.gestureStyles?.find((item) => item.id === props.target.ref.id) ??
    (props.visual === 'gesture'
      ? getProjectGestureFeedbackDefaults(props.project)
      : REVIEW_CLICK_DEFAULT);
  const changeGesture = (patch: Partial<ReviewClickStyle> | null) => {
    if (props.disabled) return;
    updateProject((project) => {
      if (
        !project.actionEvents.some(
          (event) =>
            event.anchor.kind === 'recording-source' &&
            event.anchor.recordingId === identity.recordingId &&
            event.anchor.sourceInstanceId === identity.sourceInstanceId &&
            props.target.ref.kind === 'action' &&
            event.anchor.sourceEventId === props.target.ref.id
        )
      )
        return project;

      const current = project.actionFeedback?.find(
        (item) =>
          item.recordingId === identity.recordingId &&
          item.sourceInstanceId === identity.sourceInstanceId
      );
      if (
        patch === null &&
        !current?.gestureStyles?.some((style) => style.id === props.target.ref.id)
      )
        return project;
      return current
        ? patchVideoProjectActionFeedback(project, identity, {
            gestureStyles: patchReviewClicks(
              current.gestureStyles ?? [],
              [props.target.ref.id],
              patch === null
                ? null
                : {
                    ...(current.gestureStyles?.find((item) => item.id === props.target.ref.id) ??
                      (props.visual === 'gesture'
                        ? getProjectGestureFeedbackDefaults(project)
                        : REVIEW_CLICK_DEFAULT)),
                    ...patch,
                  },
              patch?.gestureAppearance === 'area'
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
      {props.part !== 'visual' ? (
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
      {props.visual && props.part !== 'sound' ? (
        <>
          <PointerFeedbackFields
            gesture={props.visual === 'gesture'}
            values={[gestureStyle]}
            part={props.visualPart ?? 'animation'}
            disabled={props.disabled}
            Details={InspectorDetails}
            disclosurePreferenceId="action-feedback:gesture-area"
            onChange={changeGesture}
          />
          {(props.visualPart ?? 'animation') === 'animation' ? (
            <ContentToolbarButton
              type="button"
              tone="outline"
              size="compact"
              className="flex w-full items-center justify-center gap-2"
              dataUi={`video-editor.${props.visual}.reset`}
              aria-label={translate('gallery.videoReview.clickReset')}
              title={translate('gallery.videoReview.clickReset')}
              disabled={
                props.disabled ||
                !group.gestureStyles?.some((style) => style.id === props.target.ref.id)
              }
              onClick={() => changeGesture(null)}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {translate('gallery.videoReview.clickReset')}
            </ContentToolbarButton>
          ) : null}
        </>
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
