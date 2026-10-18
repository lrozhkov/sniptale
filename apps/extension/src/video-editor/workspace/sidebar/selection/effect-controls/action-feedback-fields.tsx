import { reviewGestureAreaBounds } from '../../../../../features/video/project/action-feedback/validation';
import { projectActionFeedbackMarkers } from '../../../../../features/video/review/project-action-audio';
import { InspectorDetails } from '../shared/details';
import { useState, useEffect } from 'react';
import { NumericRow, type NumericRowProps } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import type { VideoProject } from '../../../../../features/video/project/types';
import { patchVideoProjectActionFeedback } from '../../../../../features/video/project/action-feedback/projection';
import {
  patchReviewActionAudio,
  REVIEW_ACTION_AUDIO_DEFAULT,
  isReviewActionAudioPreset,
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
  const style =
    group.settings.find(
      (item) => item.ref.kind === props.target.ref.kind && item.ref.id === props.target.ref.id
    ) ?? REVIEW_ACTION_AUDIO_DEFAULT;
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
  const preset =
    props.target.family === 'mouse'
      ? 'mouse-classic-paired-v2'
      : props.target.family === 'keyboard'
        ? 'keyboard-recorded-v2'
        : 'typing-recorded-v2';
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
        <>
          <FeedbackSoundFields
            style={style}
            target={props.target}
            preset={preset}
            change={change}
          />
          <FeedbackAttackFields style={style} target={props.target} change={change} />
        </>
      ) : null}
      {props.gesture && props.part !== 'sound' ? (
        <FeedbackGestureFields gestureStyle={gestureStyle} changeGesture={changeGesture} />
      ) : null}
    </fieldset>
  );
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

function FeedbackSoundFields({
  style,
  target,
  preset,
  change,
}: {
  style: ReviewActionAudioStyle;
  target: ReviewActionAudioTarget;
  preset: NonNullable<ReviewActionAudioStyle['presetId']>;
  change(patch: ReviewActionAudioPatch | null): void;
}) {
  return (
    <>
      {' '}
      <ToggleField
        label={translate('gallery.videoReview.actionAudioEnabled')}
        checked={style.enabled}
        onChange={(enabled) =>
          change(
            enabled
              ? style.presetId
                ? { enabled: true }
                : { presetId: preset }
              : { enabled: false }
          )
        }
      />
      <OptionButtonsField
        label={translate('gallery.videoReview.actionAudio')}
        value={style.presetId ?? 'none'}
        options={[
          { value: 'none', label: translate('gallery.videoReview.actionAudioNone') },
          {
            value: preset,
            label: translate(
              target.family === 'mouse'
                ? 'gallery.videoReview.actionAudioMousePaired'
                : 'gallery.videoReview.actionAudioRecorded'
            ),
          },
          ...(target.family === 'typing'
            ? [
                {
                  value: 'typing-natural-v1',
                  label: translate('gallery.videoReview.actionAudioTypingNatural'),
                },
              ]
            : target.family === 'keyboard'
              ? [
                  {
                    value: 'keyboard-v1',
                    label: translate('gallery.videoReview.actionAudioKeyboardNatural'),
                  },
                ]
              : [
                  {
                    value: 'mouse-soft-paired-v2',
                    label: translate('gallery.videoReview.actionAudioMouseSoftPaired'),
                  },
                  {
                    value: 'mouse-classic-v1',
                    label: translate('gallery.videoReview.actionAudioMouseClassic'),
                  },
                ]),
        ]}
        onChange={(value) => {
          if (value === 'none') change({ presetId: null });
          else if (isReviewActionAudioPreset(value)) change({ presetId: value });
        }}
      />
      <FeedbackNumber
        label={translate('gallery.videoReview.actionAudioVolume')}
        value={style.volume * 100}
        min={0}
        max={100}
        step={1}
        unit="%"
        onCommitValue={(volume) => change({ volume: volume / 100 })}
      />
      <FeedbackNumber
        label={translate('gallery.videoReview.actionAudioOffset')}
        value={style.offset}
        min={-2}
        max={2}
        step={0.01}
        precision={2}
        unit="s"
        onCommitValue={(offset) => change({ offset })}
      />
    </>
  );
}
function FeedbackAttackFields({
  style,
  target,
  change,
}: {
  style: ReviewActionAudioStyle;
  target: ReviewActionAudioTarget;
  change(patch: ReviewActionAudioPatch | null): void;
}) {
  return target.family === 'mouse' ? (
    (['down', 'up'] as const).map((phase) => {
      const enabledKey = phase === 'down' ? 'downEnabled' : 'upEnabled',
        gainKey = phase === 'down' ? 'downGain' : 'upGain';
      return (
        <div key={phase}>
          <ToggleField
            label={translate(
              phase === 'down'
                ? 'gallery.videoReview.actionAudioDown'
                : 'gallery.videoReview.actionAudioUp'
            )}
            checked={style[enabledKey] !== false}
            onChange={(enabled) => change({ [enabledKey]: enabled })}
          />
          <FeedbackNumber
            label={translate(
              phase === 'down'
                ? 'gallery.videoReview.actionAudioDownGain'
                : 'gallery.videoReview.actionAudioUpGain'
            )}
            value={(style[gainKey] ?? 1) * 100}
            min={0}
            max={100}
            step={1}
            unit="%"
            onCommitValue={(gain) => change({ [gainKey]: gain / 100 })}
          />
        </div>
      );
    })
  ) : (
    <ToggleField
      label={translate('gallery.videoReview.actionAudioRepeats')}
      checked={style.includeRepeats === true}
      onChange={(includeRepeats) => change({ includeRepeats })}
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
