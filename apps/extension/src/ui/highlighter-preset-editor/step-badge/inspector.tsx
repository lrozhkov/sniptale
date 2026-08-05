import type {
  StepBadgeColorSource,
  StepBadgeOutlineColorSource,
  StepBadgeSettings,
  StepBadgeVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { ProductGlassChip, ProductGlassRow } from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import { CompactColorSelector } from '../../color-selector';
import { NumericRow } from '../../compact-inspector-controls';
import { HighlighterPresetPropertyField as PropertyField } from '../inspector-field';
import {
  getEffectiveStepBadgeVisualStyle,
  getLinkedStepBadgeDiameter,
  resolveStepBadgeVisualStyle,
} from '../../../features/highlighter/step-badge-presets/style';

const PALETTE = ['#ffffff', '#111827', '#2563eb', '#f97316', '#ef4444', '#22c55e', '#a855f7'];

type FrameVisuals = {
  borderColor: string;
  borderWidth: number;
  fillColor?: string;
  fillOpacity?: number;
};

function SourceField<T extends string>(props: {
  label: string;
  onChange: (source: T) => void;
  options: readonly T[];
  source: T;
}) {
  return (
    <PropertyField label={props.label}>
      <ProductGlassRow>
        {props.options.map((source) => (
          <ProductGlassChip
            active={source === props.source}
            key={source}
            onClick={() => props.onChange(source)}
          >
            {translate(
              source === 'frame-border'
                ? 'content.stepBadge.colorSource.frameBorder'
                : source === 'frame-fill'
                  ? 'content.stepBadge.colorSource.frameFill'
                  : source === 'surface'
                    ? 'content.stepBadge.colorSource.surface'
                    : 'content.stepBadge.colorSource.custom'
            )}
          </ProductGlassChip>
        ))}
      </ProductGlassRow>
    </PropertyField>
  );
}

function ColorEditor(props: {
  frame: FrameVisuals;
  label: string;
  onColorChange: (color: string) => void;
  onSourceChange: (source: StepBadgeColorSource | StepBadgeOutlineColorSource) => void;
  outline?: boolean;
  settings: StepBadgeSettings;
  source: StepBadgeColorSource | StepBadgeOutlineColorSource;
}) {
  const resolved = resolveStepBadgeVisualStyle(props.settings, props.frame);
  const value =
    props.label === translate('content.stepBadge.background')
      ? resolved.backgroundColor
      : props.label === translate('content.stepBadge.textColor')
        ? resolved.textColor
        : resolved.outlineColor;
  const options = props.outline
    ? (['custom', 'frame-border', 'frame-fill', 'surface'] as const)
    : (['custom', 'frame-border', 'frame-fill'] as const);
  return (
    <div className="grid gap-1.5">
      <SourceField
        label={props.label}
        onChange={props.onSourceChange}
        options={options}
        source={props.source}
      />
      <fieldset
        className={props.source === 'custom' ? 'm-0 border-0 p-0' : 'm-0 border-0 p-0 opacity-55'}
        disabled={props.source !== 'custom'}
      >
        <CompactColorSelector
          label={props.label}
          title={props.label}
          value={value}
          palette={PALETTE}
          onChange={props.onColorChange}
        />
      </fieldset>
    </div>
  );
}

export function StepBadgeAppearanceSection(props: {
  frame: FrameVisuals;
  onChange: (patch: Partial<StepBadgeSettings>) => void;
  settings: StepBadgeSettings;
}) {
  const style = getEffectiveStepBadgeVisualStyle(props.settings);
  const updateStyle = (patch: Partial<StepBadgeVisualStyle>) =>
    props.onChange({ style: { ...style, ...patch } });
  const linkedDiameter = getLinkedStepBadgeDiameter(props.frame.borderWidth);
  return (
    <ContentPopoverSection title={translate('content.stepBadge.appearanceSection')}>
      <div className="grid gap-2">
        <PropertyField label={translate('content.stepBadge.sizeSource')}>
          <ProductGlassRow>
            <ProductGlassChip
              active={style.sizeSource === 'frame-border'}
              onClick={() => updateStyle({ sizeSource: 'frame-border' })}
            >
              {translate('content.stepBadge.sizeFromFrame')}
            </ProductGlassChip>
            <ProductGlassChip
              active={style.sizeSource === 'custom'}
              onClick={() =>
                updateStyle({
                  sizeSource: 'custom',
                  diameter: style.sizeSource === 'frame-border' ? linkedDiameter : style.diameter,
                })
              }
            >
              {translate('content.stepBadge.sizeCustom')}
            </ProductGlassChip>
          </ProductGlassRow>
        </PropertyField>
        <NumericRow
          appearance="plain"
          disabled={style.sizeSource !== 'custom'}
          label={translate('content.stepBadge.diameter')}
          min={16}
          max={160}
          step={1}
          unit="px"
          value={style.sizeSource === 'frame-border' ? linkedDiameter : style.diameter}
          scrub={{ min: 16, max: 160, step: 1 }}
          onPreviewValue={(diameter) => updateStyle({ diameter })}
          onCommitValue={(diameter) => updateStyle({ diameter })}
        />
        <ColorEditor
          frame={props.frame}
          label={translate('content.stepBadge.background')}
          onColorChange={(backgroundColor) => updateStyle({ backgroundColor })}
          onSourceChange={(backgroundColorSource) =>
            updateStyle({ backgroundColorSource: backgroundColorSource as StepBadgeColorSource })
          }
          settings={{ ...props.settings, style }}
          source={style.backgroundColorSource}
        />
        <ColorEditor
          frame={props.frame}
          label={translate('content.stepBadge.textColor')}
          onColorChange={(textColor) => updateStyle({ textColor })}
          onSourceChange={(textColorSource) =>
            updateStyle({ textColorSource: textColorSource as StepBadgeColorSource })
          }
          settings={{ ...props.settings, style }}
          source={style.textColorSource}
        />
        <ColorEditor
          outline
          frame={props.frame}
          label={translate('content.stepBadge.outline')}
          onColorChange={(outlineColor) => updateStyle({ outlineColor })}
          onSourceChange={(outlineColorSource) => updateStyle({ outlineColorSource })}
          settings={{ ...props.settings, style }}
          source={style.outlineColorSource}
        />
      </div>
    </ContentPopoverSection>
  );
}
