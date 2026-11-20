import { Clapperboard, Copy, Paintbrush, Trash2, Type } from 'lucide-react';
import { useRef } from 'react';
import {
  REVIEW_TEXT_DIRECTIONS,
  REVIEW_TEXT_LOOPS,
  REVIEW_TEXT_TRANSITIONS,
  type ReviewAnnotationTextClip,
} from '../../features/video/review/annotation-effects/types';
import { translate } from '../../platform/i18n';
import {
  ColorField,
  NumericRow,
  SelectField,
  TextareaField,
  ToggleField,
} from '../../ui/compact-inspector-controls';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';
import {
  ReviewButton,
  reviewDeleteButtonClassName,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
} from './controls';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';

type Props = {
  editor: ReturnType<typeof useReviewAnnotationEffects>;
  clip: ReviewAnnotationTextClip;
  busy: boolean;
};

export function ReviewAnnotationTextInspector({ editor, clip, busy }: Props) {
  const visible = editor.previewLane?.textClips?.find((item) => item.id === clip.id) ?? clip;
  const disabled = busy || editor.pending || editor.placementGestureActive;
  const cancelling = useRef(false);
  const change = (edit: (current: ReviewAnnotationTextClip) => ReviewAnnotationTextClip) =>
    editor.changeText(clip.id, edit);
  const phases = [
    { id: 'entrance', label: translate('gallery.videoReview.annotationTextEntrance') },
    { id: 'hold', label: translate('gallery.videoReview.annotationTextHold') },
    { id: 'exit', label: translate('gallery.videoReview.annotationTextExit') },
  ] as const;
  const sections = [
    {
      id: 'text',
      label: translate('gallery.videoReview.annotationText'),
      icon: Type,
      content: (
        <TextareaField
          clearable={false}
          label={translate('gallery.videoReview.annotationText')}
          disabled={disabled}
          value={visible.text}
          onChange={(text) => {
            if (editor.gestureId === clip.id || editor.beginGesture(clip.id, 'field'))
              editor.previewGesture({ text: text.slice(0, 4096) });
          }}
          onBlur={() => {
            if (!cancelling.current) void editor.commitGesture();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              cancelling.current = true;
              editor.cancelGesture();
              event.currentTarget.blur();
              cancelling.current = false;
            }
          }}
        />
      ),
    },
    {
      id: 'animation',
      label: translate('gallery.videoReview.annotationTextMotion'),
      icon: Clapperboard,
      content: phases.map((phase) => (
        <fieldset key={phase.id} aria-label={phase.label} className="min-w-0 space-y-1">
          {phase.id === 'hold' && (
            <legend className="sniptale-parameter-name px-2">{phase.label}</legend>
          )}
          {phase.id === 'hold' ? (
            <ReviewTextLoopFields clip={clip} disabled={disabled} change={change} />
          ) : (
            <ReviewTextTransitionFields
              phase={phase.id}
              label={phase.label}
              clip={clip}
              disabled={disabled}
              change={change}
            />
          )}
        </fieldset>
      )),
    },
    {
      id: 'appearance',
      label: translate('videoEditor.effectsLibrary.objectAppearance'),
      icon: Paintbrush,
      content: (
        <>
          <ToggleField
            label={translate('gallery.videoReview.annotationEnabled')}
            value={clip.enabled}
            disabled={disabled}
            onChange={(enabled) => change((item) => ({ ...item, enabled }))}
          />
          <ColorField
            title={translate('gallery.videoReview.annotationTextColor')}
            allowAlpha={false}
            allowTransparent={false}
            label={translate('gallery.videoReview.annotationTextColor')}
            value={clip.color}
            disabled={disabled}
            onChange={(color) => change((item) => ({ ...item, color: color.slice(0, 7) }))}
          />
          <NumericRow
            appearance="plain"
            label={translate('gallery.videoReview.annotationTextFontSize')}
            value={clip.fontSize * 100}
            disabled={disabled}
            unit="%"
            min={0.5}
            max={50}
            precision={1}
            step={0.5}
            onPreviewValue={() => undefined}
            onCommitValue={(size) => change((item) => ({ ...item, fontSize: size / 100 }))}
          />
        </>
      ),
    },
    reviewInspectorActions(
      <>
        <ReviewButton
          label={translate('gallery.videoReview.annotationDuplicate')}
          className={reviewTextButtonClassName}
          disabled={disabled}
          onClick={() => editor.duplicate(clip.id)}
        >
          <Copy size={16} aria-hidden />
          <span>{translate('gallery.videoReview.annotationDuplicate')}</span>
        </ReviewButton>
        <ReviewButton
          selectionAction="delete"
          label={translate('gallery.videoReview.deleteSelected')}
          className={reviewDeleteButtonClassName}
          disabled={disabled}
          onClick={() => editor.remove(clip.id)}
        >
          <Trash2 size={16} aria-hidden />
          <span>{translate('gallery.videoReview.deleteSelected')}</span>
        </ReviewButton>
      </>
    ),
  ];
  return (
    <div data-ui="gallery.videoReview.annotationTextInspector">
      {editor.failure && (
        <div role="alert">
          {translate('gallery.videoReview.annotationEditFailed')}
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            className={reviewTextButtonClassName}
            disabled={editor.pending}
            onClick={editor.retry}
          />
        </div>
      )}
      <ReviewInspectorSections sections={sections} />
    </div>
  );
}

type PhaseFields = {
  clip: ReviewAnnotationTextClip;
  disabled: boolean;
  change(edit: (current: ReviewAnnotationTextClip) => ReviewAnnotationTextClip): void;
};

function ReviewTextTransitionFields({
  clip,
  disabled,
  change,
  phase,
  label,
}: PhaseFields & {
  phase: 'entrance' | 'exit';
  label: string;
}) {
  const current = clip[phase];
  const update = (patch: Partial<typeof current>) =>
    change((item) => ({ ...item, [phase]: { ...item[phase], ...patch } }));
  const hasDistance = ['slide', 'bounce', 'tracking', 'blur', 'cascade', 'rise'].includes(
    current.preset
  );
  const hasStagger = ['words', 'letters', 'cascade'].includes(current.preset);
  return (
    <>
      <SelectField
        className={reviewSelectFieldClassName}
        label={label}
        disabled={disabled}
        value={current.preset}
        options={REVIEW_TEXT_TRANSITIONS.map((value) => ({
          value,
          label: translate(`gallery.videoReview.annotationTextPreset_${value}`),
        }))}
        onChange={(preset) => update({ preset })}
      />
      {current.preset !== 'none' && (
        <NumericRow
          appearance="plain"
          label={translate('gallery.videoReview.annotationTextPhaseTime')}
          disabled={disabled}
          value={current.duration}
          min={0}
          max={30}
          step={0.05}
          precision={2}
          unit="s"
          onPreviewValue={() => undefined}
          onCommitValue={(duration) => update({ duration })}
        />
      )}
      {current.preset === 'slide' && (
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.annotationTextDirection')}
          disabled={disabled}
          value={current.direction}
          options={REVIEW_TEXT_DIRECTIONS.map((value) => ({
            value,
            label: translate(`gallery.videoReview.annotationTextDirection_${value}`),
          }))}
          onChange={(direction) => update({ direction })}
        />
      )}
      {hasDistance && (
        <NumericRow
          appearance="plain"
          label={translate('gallery.videoReview.annotationTextDistance')}
          disabled={disabled}
          value={current.distance * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          onPreviewValue={() => undefined}
          onCommitValue={(value) => update({ distance: value / 100 })}
        />
      )}
      {hasStagger && (
        <NumericRow
          appearance="plain"
          label={translate('gallery.videoReview.annotationTextStagger')}
          disabled={disabled}
          value={current.stagger * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          onPreviewValue={() => undefined}
          onCommitValue={(value) => update({ stagger: value / 100 })}
        />
      )}
    </>
  );
}

function ReviewTextLoopFields({ clip, disabled, change }: PhaseFields) {
  const update = (patch: Partial<ReviewAnnotationTextClip['loop']>) =>
    change((item) => ({ ...item, loop: { ...item.loop, ...patch } }));
  return (
    <>
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.annotationTextLoop')}
        disabled={disabled}
        value={clip.loop.preset}
        options={REVIEW_TEXT_LOOPS.map((value) => ({
          value,
          label: translate(`gallery.videoReview.annotationTextPreset_${value}`),
        }))}
        onChange={(preset) => update({ preset })}
      />
      {clip.loop.preset !== 'none' && (
        <>
          <NumericRow
            appearance="plain"
            label={translate('gallery.videoReview.annotationTextPeriod')}
            disabled={disabled}
            value={clip.loop.period}
            min={0.1}
            max={30}
            step={0.05}
            precision={2}
            unit="s"
            onPreviewValue={() => undefined}
            onCommitValue={(period) => update({ period })}
          />
          <NumericRow
            appearance="plain"
            label={translate('gallery.videoReview.annotationTextAmount')}
            disabled={disabled}
            value={clip.loop.amount * 100}
            min={0}
            max={100}
            step={1}
            unit="%"
            onPreviewValue={() => undefined}
            onCommitValue={(value) => update({ amount: value / 100 })}
          />
        </>
      )}
    </>
  );
}
