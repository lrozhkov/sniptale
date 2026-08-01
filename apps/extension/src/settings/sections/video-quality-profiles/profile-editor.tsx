import { useState, type FormEvent } from 'react';
import {
  getDefaultVideoOutputCodec,
  isVideoOutputCodecCompatible,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
  type VideoRecordingQualityProfile,
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
const CONTAINER_OPTIONS = Object.values(VideoOutputContainer).map((value) => ({
  value,
  label: getContainerLabel(value),
}));
const RESOLUTION_OPTIONS = Object.values(VideoResolutionPreset).map((value) => ({
  value,
  label: getResolutionLabel(value),
}));

function createDraft(profile?: VideoRecordingQualityProfile): VideoRecordingQualityProfile {
  return (
    profile ?? {
      id: '',
      name: '',
      quality: VideoQuality.HIGH,
      output: {
        codec: VideoOutputCodec.VP9,
        container: VideoOutputContainer.WEBM,
        resolution: VideoResolutionPreset.P1080,
      },
    }
  );
}

export function VideoQualityProfileEditor(props: {
  busy: boolean;
  onClose: () => void;
  onSave: (profile: VideoRecordingQualityProfile) => Promise<void>;
  profile?: VideoRecordingQualityProfile;
}) {
  const [draft, setDraft] = useState(() => createDraft(props.profile));
  const codecOptions = Object.values(VideoOutputCodec)
    .filter((codec) => isVideoOutputCodecCompatible(draft.output.container, codec))
    .map((value) => ({ value, label: getCodecLabel(value) }));
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
            <ProductField label={translate('settings.videoQuality.qualityLabel')}>
              <ProductSelect
                aria-label={translate('settings.videoQuality.qualityLabel')}
                menuPlacement="auto"
                menuScrollable={false}
                value={draft.quality}
                options={QUALITY_OPTIONS}
                onChange={(quality) => setDraft({ ...draft, quality })}
              />
            </ProductField>
            <ProductField label={translate('settings.videoQuality.containerLabel')}>
              <ProductSelect
                aria-label={translate('settings.videoQuality.containerLabel')}
                menuPlacement="auto"
                menuScrollable={false}
                value={draft.output.container}
                options={CONTAINER_OPTIONS}
                onChange={(container) =>
                  setDraft({
                    ...draft,
                    output: {
                      ...draft.output,
                      container,
                      codec: isVideoOutputCodecCompatible(container, draft.output.codec)
                        ? draft.output.codec
                        : getDefaultVideoOutputCodec(container),
                    },
                  })
                }
              />
            </ProductField>
            <ProductField label={translate('settings.videoQuality.codecLabel')}>
              <ProductSelect
                aria-label={translate('settings.videoQuality.codecLabel')}
                menuPlacement="auto"
                menuScrollable={false}
                value={draft.output.codec}
                options={codecOptions}
                onChange={(codec) => setDraft({ ...draft, output: { ...draft.output, codec } })}
              />
            </ProductField>
            <ProductField label={translate('settings.videoQuality.resolutionLabel')}>
              <ProductSelect
                aria-label={translate('settings.videoQuality.resolutionLabel')}
                menuPlacement="auto"
                menuScrollable={false}
                value={draft.output.resolution}
                options={RESOLUTION_OPTIONS}
                onChange={(resolution) =>
                  setDraft({ ...draft, output: { ...draft.output, resolution } })
                }
              />
            </ProductField>
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
