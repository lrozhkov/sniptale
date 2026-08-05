import type {
  StepBadgeColorSource,
  StepBadgeOutlineColorSource,
  StepBadgeSettings,
  StepBadgeVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassBoldButton,
  ProductGlassChip,
  ProductGlassRow,
} from '@sniptale/ui/product-glass-controls';
import { Circle, PaintBucket, Palette, Square } from 'lucide-react';
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

const SOURCE_ICONS = {
  custom: Palette,
  'frame-border': Square,
  'frame-fill': PaintBucket,
  surface: Circle,
} as const;

function getSourceLabel(source: StepBadgeColorSource | StepBadgeOutlineColorSource) {
  return translate(
    source === 'frame-border'
      ? 'content.stepBadge.colorSource.frameBorder'
      : source === 'frame-fill'
        ? 'content.stepBadge.colorSource.frameFill'
        : source === 'surface'
          ? 'content.stepBadge.colorSource.surface'
          : 'content.stepBadge.colorSource.custom'
  );
}

function ColorEditor(props: {
  frame: FrameVisuals;
  label: string;
  onColorChange: (color: string) => void;
  onSourceChange: (source: StepBadgeColorSource | StepBadgeOutlineColorSource) => void;
  outline?: boolean;
  colorRole: 'background' | 'outline' | 'text';
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
  const options: readonly (StepBadgeColorSource | StepBadgeOutlineColorSource)[] = props.outline
    ? (['custom', 'frame-border', 'frame-fill', 'surface'] as const)
    : (['custom', 'frame-border', 'frame-fill'] as const);
  const sourceIndex = options.indexOf(props.source);
  const nextSource = options[(sourceIndex + 1) % options.length] ?? 'custom';
  const SourceIcon = SOURCE_ICONS[props.source];
  const sourceTitle = `${translate('content.stepBadge.colorSourceLabel')} — ${getSourceLabel(props.source)}`;
  return (
    <PropertyField label={props.label}>
      <div className="flex min-w-0 items-center gap-1.5">
        <fieldset
          className={
            props.source === 'custom'
              ? 'm-0 min-w-0 flex-1 border-0 p-0'
              : 'm-0 min-w-0 flex-1 border-0 p-0 opacity-55'
          }
          disabled={props.source !== 'custom'}
        >
          <CompactColorSelector
            disabled={props.source !== 'custom'}
            key={props.source}
            label={props.label}
            title={props.label}
            value={value}
            palette={PALETTE}
            onChange={props.onColorChange}
          />
        </fieldset>
        <ProductGlassBoldButton
          aria-label={sourceTitle}
          data-step-badge-color-role={props.colorRole}
          data-step-badge-color-source={props.source}
          onClick={() => props.onSourceChange(nextSource)}
          title={sourceTitle}
        >
          <SourceIcon aria-hidden="true" size={14} strokeWidth={2} />
        </ProductGlassBoldButton>
      </div>
    </PropertyField>
  );
}

type StepBadgeAppearanceProps = {
  frame: FrameVisuals;
  onChange: (patch: Partial<StepBadgeSettings>) => void;
  settings: StepBadgeSettings;
};

export function StepBadgeSizeSection(props: StepBadgeAppearanceProps & { embedded?: boolean }) {
  const style = getEffectiveStepBadgeVisualStyle(props.settings);
  const updateStyle = (patch: Partial<StepBadgeVisualStyle>) =>
    props.onChange({ style: { ...style, ...patch } });
  const linkedDiameter = getLinkedStepBadgeDiameter(props.frame.borderWidth);
  const content = (
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
    </div>
  );
  return props.embedded ? (
    content
  ) : (
    <ContentPopoverSection title={translate('content.stepBadge.sizeSection')}>
      {content}
    </ContentPopoverSection>
  );
}

export function StepBadgeColorSection(props: StepBadgeAppearanceProps & { embedded?: boolean }) {
  const style = getEffectiveStepBadgeVisualStyle(props.settings);
  const updateStyle = (patch: Partial<StepBadgeVisualStyle>) =>
    props.onChange({ style: { ...style, ...patch } });
  const content = (
    <div className="grid gap-2">
      <ColorEditor
        frame={props.frame}
        label={translate('content.stepBadge.background')}
        onColorChange={(backgroundColor) => updateStyle({ backgroundColor })}
        onSourceChange={(backgroundColorSource) =>
          updateStyle({ backgroundColorSource: backgroundColorSource as StepBadgeColorSource })
        }
        settings={{ ...props.settings, style }}
        source={style.backgroundColorSource}
        colorRole="background"
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
        colorRole="text"
      />
      <ColorEditor
        outline
        frame={props.frame}
        label={translate('content.stepBadge.outline')}
        onColorChange={(outlineColor) => updateStyle({ outlineColor })}
        onSourceChange={(outlineColorSource) => updateStyle({ outlineColorSource })}
        settings={{ ...props.settings, style }}
        source={style.outlineColorSource}
        colorRole="outline"
      />
    </div>
  );
  return props.embedded ? (
    content
  ) : (
    <ContentPopoverSection title={translate('content.stepBadge.colorsSection')}>
      {content}
    </ContentPopoverSection>
  );
}

export function StepBadgeAppearanceSection(props: StepBadgeAppearanceProps) {
  return (
    <ContentPopoverSection title={translate('content.stepBadge.appearanceSection')}>
      <StepBadgeSizeSection {...props} embedded />
      <StepBadgeColorSection {...props} embedded />
    </ContentPopoverSection>
  );
}
