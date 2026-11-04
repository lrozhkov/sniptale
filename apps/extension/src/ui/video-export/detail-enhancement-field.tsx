import { useEffect, useState } from 'react';
import type { VideoExportDetailMode } from '../../features/video/project/types/export';
import { translate, useAppLocale } from '../../platform/i18n';
import { SelectField } from '../compact-inspector-controls';

type Capability = Awaited<
  ReturnType<
    (typeof import('../../features/video/composition/export-enhancement/enhancer'))['probeEnhancementCapabilities']
  >
>;

function capabilityMessage(capability: Capability | null) {
  if (!capability) return translate('videoEditor.exportDialog.detailEnhancementChecking');
  switch (capability.reason) {
    case 'supported':
      return null;
    case 'webgpu-unavailable':
      return translate('videoEditor.exportDialog.detailEnhancementWebGpuUnavailable');
    case 'shader-f16-unavailable':
      return translate('videoEditor.exportDialog.detailEnhancementPrecisionUnavailable');
    case 'adapter-unavailable':
      return translate('videoEditor.exportDialog.detailEnhancementAdapterUnavailable');
    case 'adapter-request-failed':
      return translate('videoEditor.exportDialog.detailEnhancementProbeFailed');
  }
}

/** Shows export choices and probes the adapter. The export job owns the model and device. */
export function DetailEnhancementField(props: {
  value: VideoExportDetailMode | undefined;
  onChange(value: VideoExportDetailMode): void;
  disabled?: boolean;
}) {
  useAppLocale();
  const [capability, setCapability] = useState<Capability | null>(null);
  useEffect(() => {
    let current = true;
    void import('../../features/video/composition/export-enhancement/enhancer')
      .then(({ probeEnhancementCapabilities }) => probeEnhancementCapabilities())
      .then((result) => {
        if (current) setCapability(result);
      })
      .catch(() => {
        if (current) setCapability({ clark: false, reason: 'adapter-request-failed' });
      });
    return () => {
      current = false;
    };
  }, []);
  return (
    <div data-ui="video.exportDetailEnhancement" className="min-w-0">
      <SelectField<VideoExportDetailMode>
        label={translate('videoEditor.exportDialog.detailEnhancementLabel')}
        value={props.value ?? 'off'}
        onChange={props.onChange}
        disabled={props.disabled}
        options={[
          { value: 'off', label: translate('videoEditor.exportDialog.detailEnhancementOff') },
          {
            value: 'bicubic-sharpen',
            label: translate('videoEditor.exportDialog.detailEnhancementBicubic'),
          },
          {
            value: 'clark-x2',
            label: translate('videoEditor.exportDialog.detailEnhancementClark'),
            disabled: !capability?.clark,
          },
        ]}
      />
      <div className="space-y-1 text-xs leading-relaxed text-[var(--sniptale-color-text-muted)]">
        <p>{translate('videoEditor.exportDialog.detailEnhancementHint')}</p>
        {!capability?.clark ? <p role="status">{capabilityMessage(capability)}</p> : null}
        {props.value === 'clark-x2' ? (
          <p>{translate('videoEditor.exportDialog.detailEnhancementTimeNote')}</p>
        ) : null}
      </div>
    </div>
  );
}
