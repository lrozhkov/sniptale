import { PresentationMediaFields } from '../../ui/presentation-media-fields';
import { PresentationFadeFields } from '../../ui/presentation-fade-fields';
import { FolderOpen, Library, LogIn, LogOut, Play, RotateCcw } from 'lucide-react';
import { backgroundActionClassName } from '../../composition/background-resources/picker';
import { useCallback, useState } from 'react';
import {
  parseQuickEditPresentationSettings,
  presentationEdgeControl,
  type PresentationEdgeControl,
  type QuickEditPresentationSettings,
} from '../../features/video/review/advanced/presentation';
import { SegmentedRow } from '../../ui/compact-inspector-controls';
import { translate, useAppLocale } from '../../platform/i18n';
import { ReviewButton, ReviewDetails, reviewSelectFieldClassName } from './controls';
import { PresentationJoinFields } from '../../ui/presentation-join-fields';
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
  const accept = (value: NonNullable<Settings[typeof key]> | null, preview: boolean) => {
    const next =
      value === null && preview ? null : parseQuickEditPresentationSettings(patch(value));
    if (preview) props.onPreview(next);
    else if (next) props.onChange(next);
  };
  return (
    <PresentationJoinFields
      label={label(props.slot === 'intro' ? 'presentationJoinIntro' : 'presentationJoinOutro')}
      value={transition}
      timing={timing}
      colorClassName={reviewSelectFieldClassName}
      Details={ReviewDetails}
      preferenceId={`presentation.${props.slot}`}
      onChange={(value) => accept(value, false)}
      onPreview={(value) => accept(value, true)}
    >
      <ReviewButton
        label={label(
          props.slot === 'intro' ? 'presentationPreviewJoinIntro' : 'presentationPreviewJoinOutro'
        )}
        disabled={props.previewDisabled || !props.onJoinPreview}
        onClick={() => props.onJoinPreview?.(props.slot, 'join')}
      >
        <Play size={14} aria-hidden="true" />
        <span>
          {label(
            props.slot === 'intro' ? 'presentationPreviewJoinIntro' : 'presentationPreviewJoinOutro'
          )}
        </span>
      </ReviewButton>
    </PresentationJoinFields>
  );
}
