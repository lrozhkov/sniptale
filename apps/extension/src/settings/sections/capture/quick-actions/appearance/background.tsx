import { useRef, useState } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import type { QuickActionAppearance } from '../../../../../contracts/quick-action-appearance';
import { BackgroundImagePicker } from '../../../../../composition/background-resources/picker';
import { useGradientPresetCatalog } from '../../../../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { BackgroundThumbnails } from '../../../../../ui/background-thumbnails';
import { CompactPaintSelector } from '../../../../../ui/paint-selector';
import { NumericRow, SelectField } from '../../../../../ui/compact-inspector-controls';
import { blobToDataUrl } from '../../../../../platform/media-utils/data-url';
import { translate } from '../../../../../platform/i18n';

export function QuickActionBackgroundSettings(props: {
  value: QuickActionAppearance;
  onChange(value: QuickActionAppearance): void;
}) {
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState(false);
  const resources = useGradientPresetCatalog('highlighter-frame-fill');
  const background = props.value.background;
  const update = (patch: Partial<QuickActionAppearance['background']>) =>
    latest.current.onChange({
      ...latest.current.value,
      background: { ...latest.current.value.background, ...patch },
    });
  const gradients = resources.presets.filter(
    (preset) => preset.enabled && preset.gradient.type === 'linear'
  );
  return (
    <div className="space-y-3">
      <SelectField
        label={translate('settings.quickActions.appearanceBackgroundKind')}
        value={background.kind}
        options={[
          { value: 'none', label: translate('settings.quickActions.appearanceNone') },
          { value: 'paint', label: translate('settings.quickActions.appearancePaint') },
          { value: 'image', label: translate('settings.quickActions.appearanceImage') },
        ]}
        onChange={(kind) => {
          update({ kind });
          setError(false);
        }}
      />
      <CompactPaintSelector
        label={translate('settings.quickActions.appearancePaintLabel')}
        title={translate('settings.quickActions.appearancePaintLabel')}
        value={background.paint}
        allowedModes={['solid', 'linear']}
        onChange={(paint) =>
          update({ paint, kind: background.kind === 'image' ? 'image' : 'paint' })
        }
      />
      <BackgroundThumbnails
        label={translate('settings.quickActions.appearanceGradientPresets')}
        items={gradients.map((preset) => ({
          id: preset.id,
          name: preset.name,
          style: {
            background: serializePaintToCss({ kind: 'gradient', gradient: preset.gradient }),
          },
        }))}
        onSelect={(id) => {
          const preset = gradients.find((item) => item.id === id);
          if (preset)
            update({ paint: { kind: 'gradient', gradient: preset.gradient }, kind: 'paint' });
        }}
      />
      <BackgroundImagePicker
        onSelect={async ({ file }, signal) => {
          setError(false);
          if (file.size > 2 * 1024 * 1024)
            throw new Error('Quick-action background exceeds size limit');
          const imageDataUrl = await blobToDataUrl(file);
          signal.throwIfAborted();
          update({ kind: 'image', imageDataUrl });
        }}
        onError={() => setError(true)}
      />
      <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.quickActions.appearanceImageLimit')}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {translate('settings.quickActions.appearanceImageFailed')}
        </p>
      ) : null}
      {background.kind === 'image' ? (
        <SelectField
          label={translate('settings.quickActions.appearanceFit')}
          value={background.fit}
          options={[
            { value: 'cover', label: translate('settings.quickActions.appearanceCover') },
            { value: 'contain', label: translate('settings.quickActions.appearanceContain') },
          ]}
          onChange={(fit) => update({ fit })}
        />
      ) : null}
      {background.kind !== 'none' ? (
        <>
          <NumericRow
            label={translate('settings.quickActions.appearancePadding')}
            value={background.padding}
            min={0}
            max={256}
            unit="px"
            onPreviewValue={(padding) => update({ padding })}
            onCommitValue={(padding) => update({ padding })}
          />
          <NumericRow
            label={translate('settings.quickActions.appearanceRadius')}
            value={background.radius}
            min={0}
            max={256}
            unit="px"
            onPreviewValue={(radius) => update({ radius })}
            onCommitValue={(radius) => update({ radius })}
          />
          <NumericRow
            label={translate('settings.quickActions.appearanceShadow')}
            value={background.shadow}
            min={0}
            max={128}
            unit="px"
            onPreviewValue={(shadow) => update({ shadow })}
            onCommitValue={(shadow) => update({ shadow })}
          />
        </>
      ) : null}
    </div>
  );
}
