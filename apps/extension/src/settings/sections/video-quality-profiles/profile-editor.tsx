import { useState, type FormEvent } from 'react';
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
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';
import {
  getCodecLabel,
  getContainerLabel,
  getQualityLabel,
  getResolutionLabel,
} from './profile-copy';

const QUALITY_OPTIONS = Object.values(VideoQuality).map((value) => ({
  value,
  label: getQualityLabel(value),
}));
const FRAME_RATE_OPTIONS = Object.values(VideoFrameRate).map((value) => ({
  frameRate: value,
  value: String(value),
  label: `${value} fps`,
}));
const CONTAINER_OPTIONS = Object.values(VideoOutputContainer).map((value) => ({
  value,
  label: getContainerLabel(value),
}));
const RESOLUTION_OPTIONS = Object.values(VideoResolutionPreset).map((value) => ({
  value,
  label: getResolutionLabel(value),
}));

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
      <ProductField label={translate('settings.videoQuality.qualityLabel')}>
        <ProductSelect
          aria-label={translate('settings.videoQuality.qualityLabel')}
          menuPlacement="auto"
          menuScrollable={false}
          value={props.configuration.quality}
          options={QUALITY_OPTIONS}
          onChange={(quality) => props.onChange({ ...props.configuration, quality })}
        />
      </ProductField>
      <ProductField label={translate('settings.videoQuality.containerLabel')}>
        <ProductSelect
          aria-label={translate('settings.videoQuality.containerLabel')}
          menuPlacement="auto"
          menuScrollable={false}
          value={props.configuration.container}
          options={CONTAINER_OPTIONS}
          onChange={(container) =>
            props.onChange({
              ...props.configuration,
              container,
              codec: isVideoOutputCodecCompatible(container, props.configuration.codec)
                ? props.configuration.codec
                : getDefaultVideoOutputCodec(container),
            })
          }
        />
      </ProductField>
      <ProductField label={translate('settings.videoQuality.codecLabel')}>
        <ProductSelect
          aria-label={translate('settings.videoQuality.codecLabel')}
          menuPlacement="auto"
          menuScrollable={false}
          value={props.configuration.codec}
          options={codecOptions}
          onChange={(codec) => props.onChange({ ...props.configuration, codec })}
        />
      </ProductField>
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
  const frameRateOptions = FRAME_RATE_OPTIONS.map(({ frameRate, label, value }) => ({
    disabled: !isVideoResolutionFrameRateSupported(props.configuration.resolution, frameRate),
    label,
    value,
  }));
  return (
    <>
      <ProductField label={translate('settings.videoQuality.resolutionLabel')}>
        <ProductSelect
          aria-label={translate('settings.videoQuality.resolutionLabel')}
          menuPlacement="auto"
          menuScrollable={false}
          value={props.configuration.resolution}
          options={RESOLUTION_OPTIONS}
          onChange={(resolution) =>
            props.onChange({
              ...props.configuration,
              frameRate: isVideoResolutionFrameRateSupported(
                resolution,
                props.configuration.frameRate
              )
                ? props.configuration.frameRate
                : VideoFrameRate.FPS24,
              resolution,
            })
          }
        />
      </ProductField>
      <ProductField label={translate('settings.videoQuality.frameRateLabel')}>
        <ProductSelect
          aria-label={translate('settings.videoQuality.frameRateLabel')}
          menuPlacement="auto"
          menuScrollable={false}
          value={String(props.configuration.frameRate)}
          options={frameRateOptions}
          onChange={(frameRate) =>
            props.onChange({
              ...props.configuration,
              frameRate: resolveSelectedFrameRate(frameRate),
            })
          }
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
  const [draft, setDraft] = useState(() => createDraft(props.profile));
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void props.onSave(draft);
  };

  return (
    <ProductModal isOpen onClose={props.onClose} width="460px" maxHeight="88vh" scrollable>
      <ProductModalHeader
        title={translate(
          props.profile ? 'settings.videoQuality.editTitle' : 'settings.videoQuality.createTitle'
        )}
        onClose={props.onClose}
      />
      <ProductModalBody compact asForm onSubmit={onSubmit}>
        <div className="grid gap-4">
          <ProductField label={translate('settings.videoQuality.nameLabel')}>
            <ProductInput
              autoFocus
              maxLength={80}
              placeholder={translate('settings.videoQuality.namePlaceholder')}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            />
          </ProductField>
          <div className="grid grid-cols-2 gap-3">
            <VideoProfileFormatFields
              configuration={draft.configuration}
              onChange={(configuration) => setDraft({ ...draft, configuration })}
            />
            <VideoProfileGeometryFields
              configuration={draft.configuration}
              onChange={(configuration) => setDraft({ ...draft, configuration })}
            />
          </div>
        </div>
        <ProductModalFooter compact>
          <ProductActionButton type="button" tone="secondary" onClick={props.onClose}>
            {translate('settings.videoQuality.cancel')}
          </ProductActionButton>
          <ProductActionButton
            type="submit"
            tone="primary"
            disabled={props.busy || draft.name.trim().length === 0}
          >
            {translate('settings.videoQuality.save')}
          </ProductActionButton>
        </ProductModalFooter>
      </ProductModalBody>
    </ProductModal>
  );
}
