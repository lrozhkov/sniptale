import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  parseQuickEditPresentationSettings,
  type QuickEditPresentationSettings,
} from '../../features/video/review/advanced/presentation';
import { ColorField, SegmentedRow, SelectField } from '../../ui/compact-inspector-controls';
import { translate, useAppLocale } from '../../platform/i18n';
import { ReviewButton, reviewSelectFieldClassName } from './controls';
import { ReviewPreviewNumberRow } from './number-row';
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
  output?: { width: number; height: number } | undefined;
  slotModes: Record<SlotName, Mode>;
  pending?: boolean;
  error?: string | null;
  onChange(settings: Settings): void;
  onPreview(settings: Settings | null): void;
  onMode(slot: SlotName, mode: Mode): void;
  onChoose(slot: SlotName, kind: 'image' | 'video', source: 'computer' | 'library'): void;
  onJoinPreview?: ((slot: SlotName) => void) | undefined;
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
        {(['fadeIn', 'fadeOut'] as const).map((edge) => (
          <div key={edge} className="min-w-0 space-y-1">
            <Enabled
              label={label(edge === 'fadeIn' ? 'presentationFadeIn' : 'presentationFadeOut')}
              value={props.settings[edge].enabled}
              onChange={(enabled) =>
                props.onChange({ ...props.settings, [edge]: { ...props.settings[edge], enabled } })
              }
            />
            {props.settings[edge].enabled && (
              <NumberField
                {...props}
                label={label('presentationDuration')}
                value={props.settings[edge].duration}
                min={0}
                max={60}
                scrubMax={3}
                step={0.1}
                unit="s"
                patch={(duration) => ({
                  ...props.settings,
                  [edge]: { ...props.settings[edge], duration },
                })}
              />
            )}
          </div>
        ))}
        <ColorField
          className={reviewSelectFieldClassName}
          label={label('presentationFadeColor')}
          title={label('presentationFadeColor')}
          value={props.settings.color}
          allowAlpha={false}
          allowTransparent={false}
          onChange={(color) => props.onChange({ ...props.settings, color })}
          onPreviewChange={(color) => props.onPreview(color ? { ...props.settings, color } : null)}
        />
        <Enabled
          label={label('presentationAudioFade')}
          value={props.settings.audioFade}
          onChange={(audioFade) => props.onChange({ ...props.settings, audioFade })}
        />
      </div>
      {(['intro', 'outro'] as const).map((slot) => (
        <Bookend key={slot} {...props} slot={slot} />
      ))}
      <ReviewButton label={label('presentationReset')} onClick={props.onReset} />
    </fieldset>
  );
}

function Enabled(props: { label: string; value: boolean; onChange(value: boolean): void }) {
  return (
    <SelectField
      className={reviewSelectFieldClassName}
      label={props.label}
      value={props.value ? 'on' : 'off'}
      options={[
        { value: 'off', label: label('presentationOff') },
        { value: 'on', label: label('presentationOn') },
      ]}
      onChange={(value) => props.onChange(value === 'on')}
    />
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
  const mode = props.slotModes[props.slot];
  const heading = label(props.slot === 'intro' ? 'presentationIntro' : 'presentationOutro');
  const image = mode === 'image' ? slot.image : undefined;
  const video = mode === 'video' ? slot.video : undefined;
  const media = image ?? video;
  const assetId = media?.assetId;
  const onAudio = useCallback(
    (available: boolean) => {
      setAudio(assetId ? { assetId, available } : null);
    },
    [assetId]
  );
  return (
    <section
      className="min-w-0 space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3"
      aria-label={heading}
    >
      <h3 className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {heading}
      </h3>
      <SegmentedRow
        columns={3}
        ariaLabel={heading}
        value={mode}
        options={[
          { value: 'none', label: label('presentationNone') },
          { value: 'image', label: label('presentationImage') },
          { value: 'video', label: label('presentationVideo') },
        ]}
        onChange={(next: Mode) => props.onMode(props.slot, next)}
      />
      {mode !== 'none' && (
        <>
          <div className="flex flex-wrap gap-2">
            <ReviewButton
              label={label('presentationComputer')}
              onClick={() => props.onChoose(props.slot, mode, 'computer')}
            />
            <ReviewButton
              label={label('presentationLibrary')}
              onClick={() => props.onChoose(props.slot, mode, 'library')}
            />
          </div>
          {media && props.output && slot.mode !== 'none' && mode === slot.mode && (
            <ReviewPresentationMediaPreview
              pending={props.pending}
              slot={slot}
              output={props.output}
              onAudio={onAudio}
            />
          )}
          {media && (
            <BookendFields
              {...props}
              hasAudio={audio?.assetId === video?.assetId && audio?.available === true}
            />
          )}
          {media && <JoinFields {...props} />}
          <ReviewButton
            label={label('presentationPreview')}
            disabled={!media || props.previewDisabled || !props.onJoinPreview}
            onClick={() => props.onJoinPreview?.(props.slot)}
          />
        </>
      )}
    </section>
  );
}

/** Placement, crop and timing share the selected asset; acquisition stays with Bookend. */
function BookendFields(
  props: ReviewPresentationInspectorProps & { slot: SlotName; hasAudio: boolean }
) {
  const slot = props.settings[props.slot];
  const mode = props.slotModes[props.slot];
  const image = mode === 'image' ? slot.image : undefined;
  const video = mode === 'video' ? slot.video : undefined;
  const media = image ?? video;
  if (!media) return null;
  const patchMedia = (patch: Partial<NonNullable<Slot['image']>>) => {
    if (mode === 'none' || !media) return props.settings;
    return { ...props.settings, [props.slot]: { ...slot, [mode]: { ...media, ...patch } } };
  };
  const number = (
    name: Message,
    value: number,
    min: number,
    max: number,
    step: number,
    patch: (value: number) => Settings,
    unit?: 's' | '%',
    scrubMax?: number,
    scrubMin?: number
  ): ReactNode => (
    <NumberField
      {...props}
      label={label(name)}
      value={value}
      min={min}
      max={max}
      step={step}
      patch={patch}
      {...(unit === undefined ? {} : { unit })}
      {...(scrubMax === undefined ? {} : { scrubMax })}
      {...(scrubMin === undefined ? {} : { scrubMin })}
    />
  );
  return (
    <div className="review-inspector-columns">
      {image &&
        number(
          'presentationDuration',
          image.duration,
          0.1,
          60,
          0.1,
          (duration) => patchMedia({ duration }),
          's',
          10,
          1
        )}
      <SelectField
        className={reviewSelectFieldClassName}
        label={label('presentationFit')}
        value={media.fit}
        options={[
          { value: 'contain', label: label('presentationContain') },
          { value: 'cover', label: label('presentationCover') },
        ]}
        onChange={(fit: 'contain' | 'cover') => props.onChange(patchMedia({ fit }))}
      />
      <ColorField
        className={reviewSelectFieldClassName}
        label={label('presentationFill')}
        title={label('presentationFill')}
        value={media.fillColor}
        allowAlpha={false}
        allowTransparent={false}
        onChange={(fillColor) => props.onChange(patchMedia({ fillColor }))}
        onPreviewChange={(fillColor) =>
          props.onPreview(fillColor ? patchMedia({ fillColor }) : null)
        }
      />
      {media.fit === 'cover' && (
        <>
          {number(
            'presentationPanX',
            media.crop.panX * 100,
            -100,
            100,
            0.1,
            (value) => patchMedia({ crop: { ...media.crop, panX: value / 100 } }),
            '%'
          )}
          {number(
            'presentationPanY',
            media.crop.panY * 100,
            -100,
            100,
            0.1,
            (value) => patchMedia({ crop: { ...media.crop, panY: value / 100 } }),
            '%'
          )}
        </>
      )}
      {video && <VideoFields {...props} video={video} hasAudio={props.hasAudio} />}
    </div>
  );
}

function VideoFields(
  props: ReviewPresentationInspectorProps & {
    slot: SlotName;
    video: NonNullable<Slot['video']>;
    hasAudio: boolean;
  }
) {
  const video = props.video;
  const patch = (value: Partial<typeof video>) => ({
    ...props.settings,
    [props.slot]: { ...props.settings[props.slot], video: { ...video, ...value } },
  });
  return (
    <>
      <NumberField
        {...props}
        label={label('presentationTrimStart')}
        value={video.trim.start}
        min={0}
        max={video.trim.end}
        step={0.001}
        unit="s"
        patch={(start) => patch({ trim: { ...video.trim, start } })}
      />
      <NumberField
        {...props}
        label={label('presentationTrimEnd')}
        value={video.trim.end}
        min={video.trim.start}
        max={video.source.duration}
        step={0.001}
        unit="s"
        patch={(end) => patch({ trim: { ...video.trim, end } })}
      />
      {props.hasAudio && (
        <Enabled
          label={label('presentationSound')}
          value={!video.audio.muted}
          onChange={(enabled) =>
            props.onChange(patch({ audio: { ...video.audio, muted: !enabled } }))
          }
        />
      )}
      {props.hasAudio && !video.audio.muted && (
        <NumberField
          {...props}
          label={label('presentationVolume')}
          value={video.audio.gain * 100}
          min={0}
          max={200}
          step={1}
          unit="%"
          patch={(value) => patch({ audio: { ...video.audio, gain: value / 100 } })}
        />
      )}
    </>
  );
}

function JoinFields(props: ReviewPresentationInspectorProps & { slot: SlotName }) {
  const key = props.slot === 'intro' ? 'introTransition' : 'outroTransition';
  const transition = props.settings[key];
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
        label={label('presentationJoin')}
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
          {(['before', 'after'] as const).map((edge) => (
            <NumberField
              {...props}
              key={edge}
              label={label(edge === 'before' ? 'presentationJoinBefore' : 'presentationJoinAfter')}
              value={transition[edge]}
              min={transition[edge === 'before' ? 'after' : 'before'] === 0 ? 0.05 : 0}
              max={60 - transition[edge === 'before' ? 'after' : 'before']}
              scrubMax={Math.min(3, 60 - transition[edge === 'before' ? 'after' : 'before'])}
              step={0.05}
              unit="s"
              patch={(value) => patch({ ...transition, [edge]: value })}
            />
          ))}
        </>
      )}
    </div>
  );
}
