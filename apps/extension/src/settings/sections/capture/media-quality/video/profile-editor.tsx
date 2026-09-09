import { useId, useState, type FormEvent } from 'react';
import {
  getDefaultVideoOutputCodec,
  isVideoOutputCodecCompatible,
  isVideoResolutionFrameRateSupported,
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
  type VideoOutputProfile,
  type VideoRecordingProfile,
} from '@sniptale/runtime-contracts/video/types/types';
import { ProductField, ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../../platform/i18n';
import { useProfileCodecSupport } from './profile-support';
import { SettingsControlRow, settingsModalClassName } from '../../../../section-surface';
import { getCodecLabel, getQualityLabel, getResolutionLabel } from './profile-copy';

function createDraft(profile?: VideoRecordingProfile): VideoRecordingProfile {
  return (
    profile ?? {
      id: '',
      name: '',
      configuration: {
        codec: VideoOutputCodec.VP9,
        container: VideoOutputContainer.WEBM,
        frameRate: VideoFrameRate.FPS30,
        quality: VideoQuality.HIGH,
        resolution: VideoResolutionPreset.P1080,
      },
    }
  );
}

function VideoProfileFormatFields(props: {
  configuration: VideoOutputProfile;
  onChange: (configuration: VideoOutputProfile) => void;
}) {
  const codecOptions = Object.values(VideoOutputCodec)
    .filter((codec) => isVideoOutputCodecCompatible(props.configuration.container, codec))
    .map((value) => ({ value, label: getCodecLabel(value) }));
  return (
    <>
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-medium">
          {translate('settings.videoQuality.qualityLabel')}
        </legend>
        <SegmentedSwitch
          ariaLabel={translate('settings.videoQuality.qualityLabel')}
          activeId={props.configuration.quality}
          options={[
            VideoQuality.LOW,
            VideoQuality.MEDIUM,
            VideoQuality.HIGH,
            VideoQuality.ULTRA,
          ].map((value) => ({
            id: value,
            label: getQualityLabel(value),
          }))}
          onChange={(quality) => props.onChange({ ...props.configuration, quality })}
        />
        <div className="flex justify-between text-xs text-[var(--sniptale-color-text-muted)]">
          <span>{translate('settings.videoQuality.smallerFile')}</span>
          <span>{translate('settings.videoQuality.moreDetail')}</span>
        </div>
      </fieldset>
      <fieldset className="mt-4 min-w-0">
        <legend className="mb-2 text-sm font-medium">
          {translate('settings.videoQuality.containerLabel')}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {Object.values(VideoOutputContainer).map((container) => (
            <label
              key={container}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                'has-[:focus-visible]:outline-[var(--sniptale-color-focus-ring)]',
                props.configuration.container === container
                  ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-surface-hover)]'
                  : 'border-[var(--sniptale-color-border-soft)] hover:bg-[var(--sniptale-color-surface-hover)]',
              ].join(' ')}
            >
              <input
                type="radio"
                name="recording-container"
                value={container}
                aria-label={container === VideoOutputContainer.MP4 ? 'MP4' : 'WebM'}
                checked={props.configuration.container === container}
                className="mt-1 h-3.5 w-3.5 shrink-0 outline-none accent-[var(--sniptale-color-accent)]"
                onChange={() =>
                  props.onChange({
                    ...props.configuration,
                    container,
                    codec: isVideoOutputCodecCompatible(container, props.configuration.codec)
                      ? props.configuration.codec
                      : getDefaultVideoOutputCodec(container),
                  })
                }
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {container === VideoOutputContainer.MP4 ? 'MP4' : 'WebM'}
                </span>
                <span className="mt-1 block text-xs text-[var(--sniptale-color-text-muted)]">
                  {translate(
                    container === VideoOutputContainer.MP4
                      ? 'settings.videoQuality.mp4Purpose'
                      : 'settings.videoQuality.webmPurpose'
                  )}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <details className="mt-2 border-t border-[var(--sniptale-color-border-subtle)] pt-3">
        <summary className="cursor-pointer text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.videoQuality.advanced')}
        </summary>
        <div className="pt-3">
          <SettingsControlRow
            className="!min-h-10 !py-1 sm:!grid-cols-[minmax(0,1fr)_minmax(0,240px)]"
            label={translate('settings.videoQuality.codecLabel')}
          >
            <ProductSelect
              aria-label={translate('settings.videoQuality.codecLabel')}
              menuPlacement="auto"
              menuScrollable={false}
              value={props.configuration.codec}
              options={codecOptions}
              onChange={(codec) => props.onChange({ ...props.configuration, codec })}
            />
          </SettingsControlRow>
          <p className="mt-2 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {translate('settings.videoQuality.geometryHelp')}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {translate('settings.videoQuality.compressionHelp')}
          </p>
        </div>
      </details>
    </>
  );
}

function resolveSelectedFrameRate(value: string): VideoFrameRate {
  if (value === String(VideoFrameRate.FPS24)) return VideoFrameRate.FPS24;
  if (value === String(VideoFrameRate.FPS60)) return VideoFrameRate.FPS60;
  return VideoFrameRate.FPS30;
}

function VideoProfileGeometryFields(props: {
  configuration: VideoOutputProfile;
  onChange: (configuration: VideoOutputProfile) => void;
}) {
  const frameRateOptions = Object.values(VideoFrameRate).map((frameRate) => ({
    value: String(frameRate),
    label: `${frameRate} fps`,
    disabled: !isVideoResolutionFrameRateSupported(props.configuration.resolution, frameRate),
  }));
  return (
    <>
      <ProductField
        label={
          <span className="text-sm font-medium tracking-normal">
            {translate('settings.videoQuality.resolutionLabel')}
          </span>
        }
      >
        <ProductSelect
          aria-label={translate('settings.videoQuality.resolutionLabel')}
          menuPlacement="auto"
          menuScrollable={false}
          value={props.configuration.resolution}
          options={Object.values(VideoResolutionPreset).map((value) => ({
            value,
            label:
              value === VideoResolutionPreset.SOURCE
                ? getResolutionLabel(value)
                : `${translate('settings.videoQuality.upTo')} ${getResolutionLabel(value)}`,
            disabled: !isVideoResolutionFrameRateSupported(value, props.configuration.frameRate),
          }))}
          onChange={(resolution) => {
            if (isVideoResolutionFrameRateSupported(resolution, props.configuration.frameRate)) {
              props.onChange({ ...props.configuration, resolution });
            }
          }}
        />
      </ProductField>
      <ProductField
        label={
          <span className="text-sm font-medium tracking-normal">
            {translate('settings.videoQuality.frameRateLabel')}
          </span>
        }
      >
        <ProductSelect
          aria-label={translate('settings.videoQuality.frameRateLabel')}
          menuPlacement="auto"
          menuScrollable={false}
          value={String(props.configuration.frameRate)}
          options={frameRateOptions}
          onChange={(value) => {
            const frameRate = resolveSelectedFrameRate(value);
            if (isVideoResolutionFrameRateSupported(props.configuration.resolution, frameRate)) {
              props.onChange({ ...props.configuration, frameRate });
            }
          }}
        />
      </ProductField>
    </>
  );
}

export function VideoQualityProfileEditor(props: {
  busy: boolean;
  onClose: () => void;
  onSave: (profile: VideoRecordingProfile) => Promise<void>;
  profile?: VideoRecordingProfile;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(() => createDraft(props.profile));
  const codecSupport = useProfileCodecSupport(draft.configuration.codec);
  const cannotSave =
    props.busy ||
    !draft.name.trim() ||
    codecSupport === 'checking' ||
    codecSupport === 'unavailable';
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!cannotSave) void props.onSave(draft);
  };

  return (
    <ProductModal
      isOpen
      labelledBy={titleId}
      onClose={props.onClose}
      width="560px"
      maxHeight="84vh"
      scrollable
      backdropClassName="backdrop-blur-sm"
      dialogClassName={`${settingsModalClassName} [&_.sniptale-modal-header-sm]:shrink-0`}
    >
      <ProductModalHeader
        compact
        title={
          <span id={titleId}>
            {translate(
              props.profile
                ? 'settings.videoQuality.editTitle'
                : 'settings.videoQuality.createTitle'
            )}
          </span>
        }
        closeTitle={translate('common.actions.close')}
        onClose={props.onClose}
      />
      <ProductModalBody compact asForm onSubmit={onSubmit} className="min-h-0 overflow-hidden">
        <div className="grid min-h-0 gap-4 overflow-y-auto">
          <ProductField
            label={
              <span className="text-sm font-medium tracking-normal">
                {translate('settings.videoQuality.nameLabel')}
              </span>
            }
          >
            <ProductInput
              aria-label={translate('settings.videoQuality.nameLabel')}
              className="sniptale-input-compact"
              autoFocus
              maxLength={80}
              placeholder={translate('settings.videoQuality.namePlaceholder')}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            />
          </ProductField>
          <div className="grid grid-cols-2 gap-x-4 border-b border-[var(--sniptale-color-border-subtle)] pb-4">
            <VideoProfileGeometryFields
              configuration={draft.configuration}
              onChange={(configuration) => setDraft({ ...draft, configuration })}
            />
          </div>
          <div className="grid gap-1">
            <VideoProfileFormatFields
              configuration={draft.configuration}
              onChange={(configuration) => setDraft({ ...draft, configuration })}
            />
          </div>
          <p
            role="status"
            className="min-h-8 text-xs leading-4 text-[var(--sniptale-color-text-secondary)]"
          >
            {codecSupport === 'available'
              ? ''
              : translate(
                  codecSupport === 'checking'
                    ? 'settings.videoQuality.codecChecking'
                    : codecSupport === 'unavailable'
                      ? 'settings.videoQuality.codecUnavailable'
                      : 'settings.videoQuality.codecUnknown'
                )}
          </p>
        </div>
        <ProductModalFooter compact className="shrink-0">
          <ProductActionButton type="button" tone="secondary" onClick={props.onClose}>
            {translate('settings.videoQuality.cancel')}
          </ProductActionButton>
          <ProductActionButton type="submit" tone="primary" disabled={cannotSave}>
            {translate('settings.videoQuality.save')}
          </ProductActionButton>
        </ProductModalFooter>
      </ProductModalBody>
    </ProductModal>
  );
}
