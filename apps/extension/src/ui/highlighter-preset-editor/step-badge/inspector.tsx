import type {
  StepBadgeColorSource,
  StepBadgeOutlineColorSource,
  StepBadgeSettings,
  StepBadgeVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { ProductGlassBoldButton } from '@sniptale/ui/product-glass-controls';
import {
  Braces,
  Circle,
  Hash,
  MapPin,
  Maximize2,
  PaintBucket,
  Palette,
  Square,
} from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { CompactColorSelector } from '../../color-selector';
import { NumericRow, SegmentedRow } from '../../compact-inspector-controls';
import { useInspectorLayout } from '../../compact-inspector-controls/layout';
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
  onOpenChange?: ((open: boolean) => void) | undefined;
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
    <PropertyField label={props.label} valueMinimum={178}>
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
            {...(props.onOpenChange ? { onOpenChange: props.onOpenChange } : {})}
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
  onFloatingInteractionChange?: ((open: boolean) => void) | undefined;
  settings: StepBadgeSettings;
};

export function StepBadgeSizeSection(props: StepBadgeAppearanceProps & { embedded?: boolean }) {
  const style = getEffectiveStepBadgeVisualStyle(props.settings);
  const updateStyle = (patch: Partial<StepBadgeVisualStyle>) =>
    props.onChange({ style: { ...style, ...patch } });
  const linkedDiameter = getLinkedStepBadgeDiameter(props.frame.borderWidth);
  const inspector = useInspectorLayout();
  const content = (
    <div className={inspector ? 'sniptale-parameter-stack' : 'grid gap-2'}>
      <SegmentedRow
        label={translate('content.stepBadge.sizeSource')}
        ariaLabel={translate('content.stepBadge.sizeSource')}
        options={[
          { label: translate('content.stepBadge.sizeFromFrame'), value: 'frame-border' },
          { label: translate('content.stepBadge.sizeCustom'), value: 'custom' },
        ]}
        value={style.sizeSource}
        onChange={(sizeSource) =>
          updateStyle({
            sizeSource,
            ...(sizeSource === 'custom' && style.sizeSource === 'frame-border'
              ? { diameter: linkedDiameter }
              : {}),
          })
        }
      />
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
        onPreviewValue={(diameter) => updateStyle({ diameter: Math.round(diameter) })}
        onCommitValue={(diameter) => updateStyle({ diameter: Math.round(diameter) })}
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
  const inspector = useInspectorLayout();
  const content = (
    <div className={inspector ? 'sniptale-parameter-stack' : 'grid gap-2'}>
      <ColorEditor
        onOpenChange={props.onFloatingInteractionChange}
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
        onOpenChange={props.onFloatingInteractionChange}
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
        onOpenChange={props.onFloatingInteractionChange}
        outline
        frame={props.frame}
        label={translate('content.stepBadge.outline')}
        onColorChange={(outlineColor) => updateStyle({ outlineColor })}
        onSourceChange={(outlineColorSource) => updateStyle({ outlineColorSource })}
        settings={{ ...props.settings, style }}
        source={style.outlineColorSource}
        colorRole="outline"
      />
      <NumericRow
        appearance="plain"
        label={translate('content.stepBadge.outlineWidth')}
        min={0}
        max={20}
        step={1}
        unit="px"
        value={style.outlineWidth ?? 2}
        scrub={{ min: 0, max: 20, step: 1 }}
        onPreviewValue={(outlineWidth) => updateStyle({ outlineWidth })}
        onCommitValue={(outlineWidth) => updateStyle({ outlineWidth })}
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

/** Read current localized section names when the inspector renders. */
export function getStepBadgeInspectorSections() {
  return [
    { icon: Hash, id: 'numbering', label: translate('content.stepBadge.numberingSection') },
    { icon: MapPin, id: 'position', label: translate('content.stepBadge.positionSection') },
    { icon: Maximize2, id: 'size', label: translate('content.stepBadge.sizeSection') },
    { icon: Palette, id: 'colors', label: translate('content.stepBadge.colorsSection') },
    { icon: Braces, id: 'css', label: translate('content.stepBadge.cssSection') },
  ] as const;
}
