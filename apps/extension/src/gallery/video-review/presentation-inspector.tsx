import { PresentationMediaFields } from '../../ui/presentation-media-fields';
import { PresentationFadeFields } from '../../ui/presentation-fade-fields';
import { FolderOpen, Library, LogIn, LogOut, Play, RotateCcw } from 'lucide-react';
import { backgroundActionClassName } from '../../composition/background-resources/picker';
import { useCallback, useEffect, useState } from 'react';
import {
  parseQuickEditPresentationSettings,
  presentationEdgeControl,
  type PresentationEdgeControl,
  type QuickEditPresentationSettings,
} from '../../features/video/review/advanced/presentation';
import { ColorField, SegmentedRow, SelectField } from '../../ui/compact-inspector-controls';
import { translate, useAppLocale } from '../../platform/i18n';
import { ReviewButton, ReviewDetails, reviewSelectFieldClassName } from './controls';
import { PreviewNumericRow as ReviewPreviewNumberRow } from '../../ui/compact-inspector-controls/numeric-preview';
import { ReviewPresentationMediaPreview } from './presentation-media-preview';

type Settings = QuickEditPresentationSettings;
type SlotName = 'intro' | 'outro';
type Slot = Settings[SlotName];
type Mode = Slot['mode'];
type Message =
  keyof typeof import('../../platform/i18n/messages/gallery/video-review-presentation').galleryVideoReviewPresentationMessages;
const label = (key: Message) => translate(`gallery.videoReview.${key}`);

/** Acquisition and pending empty-slot selection remain with the scene controller. */
export interface ReviewPresentationInspectorProps {
  settings: Settings;
  timing?: Settings;
  output?: { width: number; height: number } | undefined;
  slotModes: Record<SlotName, Mode>;
  pending?: boolean;
  error?: string | null;
  onChange(settings: Settings): void;
  onPreview(settings: Settings | null): void;
  onMode(slot: SlotName, mode: Mode): void;
  onChoose(slot: SlotName, kind: 'image' | 'video' | 'media', source: 'computer' | 'library'): void;
  onJoinPreview?: ((slot: SlotName, target?: 'fade' | 'join') => void) | undefined;
  previewDisabled?: boolean;
  onReset(): void;
}

/** Controlled fields use the same transactional gestures as the other scene inspectors. */
export function ReviewPresentationInspector(props: ReviewPresentationInspectorProps) {
  useAppLocale();
  return (
    <fieldset
      disabled={props.pending}
      aria-busy={props.pending}
      className="min-w-0 space-y-3"
      data-ui="gallery.videoReview.presentationInspector"
    >
      {props.error && (
        <p role="alert" className="text-xs">
          {props.error}
        </p>
      )}
      <div className="review-inspector-columns">
        {(['intro', 'outro'] as const).map((slot) => (
          <Bookend key={slot} {...props} slot={slot} />
        ))}
      </div>
    </fieldset>
  );
}

function NumberField(
  props: Pick<ReviewPresentationInspectorProps, 'onChange' | 'onPreview'> & {
    label: string;
    value: number;
    min: number;
    max: number;
    scrubMax?: number;
    scrubMin?: number;
    step: number;
    unit?: 's' | '%';
    patch(value: number): Settings;
  }
) {
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setInvalid(false), [props.value]);
  const proposal = (value: number) => parseQuickEditPresentationSettings(props.patch(value));
  return (
    <div>
      <ReviewPreviewNumberRow
        label={props.label}
        value={props.value}
        min={props.min}
        max={props.max}
        {...(props.scrubMax === undefined ? {} : { scrubMax: props.scrubMax })}
        {...(props.scrubMin === undefined ? {} : { scrubMin: props.scrubMin })}
        step={props.step}
        {...(props.unit === undefined ? {} : { unit: props.unit })}
        precision={props.step === 0.001 ? Math.max(3, decimalPrecision(props.value)) : 2}
        onChange={(value) => {
          const next = proposal(value);
          setInvalid(next === null);
          if (next) props.onChange(next);
        }}
        onPreview={(value) => {
          const next = value === null ? null : proposal(value);
          setInvalid(value !== null && next === null);
          props.onPreview(next);
        }}
      />
      {invalid && (
        <p role="alert" className="text-xs">
          {label('presentationTrimInvalid')}
        </p>
      )}
    </div>
  );
}

function decimalPrecision(value: number) {
  const [mantissa = '', exponent = '0'] = value.toString().split('e');
  return Math.min(100, Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent)));
}

function Bookend(props: ReviewPresentationInspectorProps & { slot: SlotName }) {
  const [audio, setAudio] = useState<{ assetId: string; available: boolean } | null>(null);
  const slot = props.settings[props.slot];
  const control = presentationEdgeControl(props.settings, props.slot);
  const heading = label(props.slot === 'intro' ? 'presentationIntro' : 'presentationOutro');
  const media = slot.mode === 'image' ? slot.image : slot.mode === 'video' ? slot.video : undefined;
  const assetId = media?.assetId;
  const onAudio = useCallback(
    (available: boolean) => setAudio(assetId ? { assetId, available } : null),
    [assetId]
  );
  const key = props.slot === 'intro' ? 'introControl' : 'outroControl';
  const patch = (next: PresentationEdgeControl): Settings => ({ ...props.settings, [key]: next });
  const adapted = { ...props, slotModes: { ...props.slotModes, [props.slot]: slot.mode } };
  return (
    <section aria-label={heading}>
      <ReviewDetails
        label={heading}
        preferenceId={`presentation.${props.slot}`}
        icon={props.slot === 'intro' ? LogIn : LogOut}
        initiallyOpen
      >
        <SegmentedRow
          columns={3}
          ariaLabel={heading}
          value={control.mode}
          options={[
            { value: 'none', label: label('presentationNoEffect') },
            {
              value: 'fade',
              label: label(props.slot === 'intro' ? 'presentationFadeIn' : 'presentationFadeOut'),
            },
            { value: 'media', label: label('presentationBookend') },
          ]}
          onChange={(mode: PresentationEdgeControl['mode']) =>
            props.onChange(patch({ ...control, mode }))
          }
        />
        {control.mode === 'fade' && (
          <FadeFields {...props} control={control} patch={patch} media={false} />
        )}
        {control.mode === 'media' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={backgroundActionClassName}
                onClick={() => props.onChoose(props.slot, 'media', 'computer')}
              >
                <FolderOpen size={14} aria-hidden="true" />
                {label('presentationComputer')}
              </button>
              <button
                type="button"
                className={backgroundActionClassName}
                onClick={() => props.onChoose(props.slot, 'media', 'library')}
              >
                <Library size={14} aria-hidden="true" />
                {label('presentationLibrary')}
              </button>
            </div>
            {media && slot.mode !== 'none' && props.output && (
              <ReviewPresentationMediaPreview
                pending={props.pending}
                slot={slot}
                output={props.output}
                onAudio={onAudio}
              />
            )}
            {media && (
              <>
                <BookendFields
                  {...adapted}
                  hasAudio={audio?.assetId === assetId && audio?.available === true}
                />
                <JoinFields {...adapted} />
                <ReviewDetails
                  label={label('presentationAdvanced')}
                  preferenceId={`presentation.${props.slot}.advanced`}
                >
                  <FadeFields {...props} control={control} patch={patch} media />
                </ReviewDetails>
              </>
            )}
          </>
        )}
        {control.mode !== 'none' && (
          <ReviewButton
            label={label(
              props.slot === 'intro' ? 'presentationResetIntro' : 'presentationResetOutro'
            )}
            className="review-inspector-parameter-command"
            onClick={() => props.onChange(patch({ ...control, mode: 'none' }))}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{label('presentationReset')}</span>
          </ReviewButton>
        )}
      </ReviewDetails>
    </section>
  );
}

function FadeFields(
  props: ReviewPresentationInspectorProps & {
    slot: SlotName;
    control: PresentationEdgeControl;
    media: boolean;
    patch(value: PresentationEdgeControl): Settings;
  }
) {
  const field = props.media ? 'media' : 'plain';
  const fade = props.control[field];
  const duration = presentationEdgeControl(props.timing ?? props.settings, props.slot)[field]
    .duration;
  const patch = (value: Partial<typeof fade>) =>
    props.patch({ ...props.control, [field]: { ...fade, ...value } });
  return (
    <PresentationFadeFields
      value={fade}
      duration={duration}
      fallbackColor={props.settings.color}
      fallbackAudioFade={props.settings.audioFade}
      colorClassName={reviewSelectFieldClassName}
      {...(props.media
        ? {
            enabledLabel: label(
              props.slot === 'intro' ? 'presentationFadeIn' : 'presentationFadeOut'
            ),
          }
        : {})}
      onChange={(change) => {
        const next = parseQuickEditPresentationSettings(patch(change));
        if (next) props.onChange(next);
      }}
      onPreview={(change) =>
        props.onPreview(change === null ? null : parseQuickEditPresentationSettings(patch(change)))
      }
    >
      <ReviewButton
        label={label(
          props.slot === 'intro' ? 'presentationPreviewFadeIn' : 'presentationPreviewFadeOut'
        )}
        disabled={props.previewDisabled || !props.onJoinPreview}
        className="review-inspector-parameter-command"
        onClick={() => props.onJoinPreview?.(props.slot, 'fade')}
      >
        <Play size={14} aria-hidden="true" />
        <span>
          {label(
            props.slot === 'intro' ? 'presentationPreviewFadeIn' : 'presentationPreviewFadeOut'
          )}
        </span>
      </ReviewButton>
    </PresentationFadeFields>
  );
}

/** Each Gallery adapter retains the selected asset metadata and whole-scene validation. */
function BookendFields(
  props: ReviewPresentationInspectorProps & { slot: SlotName; hasAudio: boolean }
) {
  const slot = props.settings[props.slot];
  const shared = {
    Details: ReviewDetails,
    preferenceId: `presentation.${props.slot}`,
    colorClassName: reviewSelectFieldClassName,
  };
  const publish = (
    media: Partial<NonNullable<Slot['image']> & NonNullable<Slot['video']>> | null,
    preview: boolean
  ) => {
    const kind = props.slotModes[props.slot];
    const previous = kind === 'image' ? slot.image : kind === 'video' ? slot.video : null;
    const next =
      media && previous
        ? parseQuickEditPresentationSettings({
            ...props.settings,
            [props.slot]: { ...slot, [kind]: { ...previous, ...media } },
          })
        : null;
    if (preview) props.onPreview(next);
    else if (next) props.onChange(next);
  };
  if (props.slotModes[props.slot] === 'image' && slot.image)
    return (
      <PresentationMediaFields
        {...shared}
        kind="image"
        value={slot.image}
        onChange={(value) => publish(value, false)}
        onPreview={(value) => publish(value, true)}
      />
    );
  if (props.slotModes[props.slot] === 'video' && slot.video)
    return (
      <PresentationMediaFields
        {...shared}
        kind="video"
        value={slot.video}
        sourceDuration={slot.video.source.duration}
        hasAudio={props.hasAudio}
        onChange={(value) => publish(value, false)}
        onPreview={(value) => publish(value, true)}
      />
    );
  return null;
}

function JoinFields(props: ReviewPresentationInspectorProps & { slot: SlotName }) {
  const key = props.slot === 'intro' ? 'introTransition' : 'outroTransition';
  const transition = props.settings[key];
  const timing = (props.timing ?? props.settings)[key] ?? transition;
  const patch = (value: NonNullable<Settings[typeof key]> | null): Settings => {
    const next = { ...props.settings };
    if (value) next[key] = value;
    else delete next[key];
    return next;
  };
  return (
    <div className="min-w-0 space-y-1">
      <SelectField<'none' | 'dissolve' | 'fade-black'>
        className={reviewSelectFieldClassName}
        label={label(props.slot === 'intro' ? 'presentationJoinIntro' : 'presentationJoinOutro')}
        value={transition?.type ?? 'none'}
        options={[
          { value: 'none', label: translate('gallery.videoReview.transitionNone') },
          { value: 'dissolve', label: translate('gallery.videoReview.cutDissolve') },
          { value: 'fade-black', label: translate('gallery.videoReview.cutFadeColor') },
        ]}
        onChange={(type) =>
          props.onChange(
            patch(
              type === 'none'
                ? null
                : {
                    before: 0.2,
                    after: 0.2,
                    ...transition,
                    type,
                  }
            )
          )
        }
      />
      {transition && (
        <>
          {transition.type === 'fade-black' && (
            <ColorField
              className={reviewSelectFieldClassName}
              label={translate('gallery.videoReview.cutTransitionColor')}
              title={translate('gallery.videoReview.cutTransitionColor')}
              value={transition.color ?? '#000000'}
              allowAlpha={false}
              allowTransparent={false}
              onChange={(color) => props.onChange(patch({ ...transition, color }))}
              onPreviewChange={(color) =>
                props.onPreview(color ? patch({ ...transition, color }) : null)
              }
            />
          )}
          <NumberField
            {...props}
            label={label('presentationDuration')}
            value={timing!.before + timing!.after}
            min={0.05}
            max={60}
            scrubMax={3}
            step={0.05}
            unit="s"
            patch={(total) => {
              const ratio = timing!.before / (timing!.before + timing!.after);
              return patch({ ...transition, before: total * ratio, after: total * (1 - ratio) });
            }}
          />
          <ReviewButton
            label={label(
              props.slot === 'intro'
                ? 'presentationPreviewJoinIntro'
                : 'presentationPreviewJoinOutro'
            )}
            disabled={props.previewDisabled || !props.onJoinPreview}
            onClick={() => props.onJoinPreview?.(props.slot, 'join')}
          >
            <Play size={14} aria-hidden="true" />
            <span>
              {label(
                props.slot === 'intro'
                  ? 'presentationPreviewJoinIntro'
                  : 'presentationPreviewJoinOutro'
              )}
            </span>
          </ReviewButton>
          <ReviewDetails
            label={label('presentationJoinTiming')}
            preferenceId={`presentation.${props.slot}.joinTiming`}
          >
            {(['before', 'after'] as const).map((edge) => (
              <NumberField
                {...props}
                key={edge}
                label={label(
                  edge === 'before' ? 'presentationJoinBefore' : 'presentationJoinAfter'
                )}
                value={timing![edge]}
                min={transition[edge === 'before' ? 'after' : 'before'] === 0 ? 0.05 : 0}
                max={60 - transition[edge === 'before' ? 'after' : 'before']}
                scrubMax={Math.min(3, 60 - transition[edge === 'before' ? 'after' : 'before'])}
                step={0.05}
                unit="s"
                patch={(value) => patch({ ...transition, [edge]: value })}
              />
            ))}
          </ReviewDetails>
        </>
      )}
    </div>
  );
}
