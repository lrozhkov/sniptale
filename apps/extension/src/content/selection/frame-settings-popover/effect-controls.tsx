import { Droplet, Focus, Square } from 'lucide-react';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassChip,
  ProductGlassChipIcon,
  ProductGlassOptionGrid,
  ProductGlassSwitch,
} from '@sniptale/ui/product-glass-controls';
import type {
  BlurSettings,
  BlurType,
  EffectMode,
  FocusSettings,
} from '../../../features/highlighter/contracts';
import { translate } from '../../../platform/i18n';
import { CompactSelect, NumericRow } from '../../../ui/compact-inspector-controls';
import { HighlighterPresetPropertyField as PropertyField } from '../../../ui/highlighter-preset-editor/inspector-field';
import { buildBlurTypeOptions } from './helpers';

const EFFECT_MODES = [
  { icon: Square, mode: 'border' },
  { icon: Droplet, mode: 'blur' },
  { icon: Focus, mode: 'focus' },
] as const;

function getEffectLabel(mode: EffectMode): string {
  if (mode === 'border') return translate('content.interactiveFrame.effectBorder');
  if (mode === 'blur') return translate('content.interactiveFrame.effectBlur');
  return translate('content.interactiveFrame.effectFocus');
}

export function FrameEffectModeSelector(props: {
  effectMode: EffectMode;
  onChange: (mode: EffectMode) => void;
}) {
  return (
    <ContentPopoverSection className="sniptale-frame-effect-mode-section">
      <ProductGlassOptionGrid>
        {EFFECT_MODES.map(({ icon: Icon, mode }) => (
          <ProductGlassChip
            active={props.effectMode === mode}
            className="inline-flex items-center justify-center gap-1.5"
            key={mode}
            onClick={() => props.onChange(mode)}
            title={getEffectLabel(mode)}
          >
            <ProductGlassChipIcon className="inline-flex shrink-0 items-center justify-center">
              <Icon size={15} />
            </ProductGlassChipIcon>
            <span>{getEffectLabel(mode)}</span>
          </ProductGlassChip>
        ))}
      </ProductGlassOptionGrid>
    </ContentPopoverSection>
  );
}

export function FrameDecorationToggle(props: {
  onChange: (showBorder: boolean) => void;
  showBorder: boolean;
}) {
  const label = translate('content.overlayControls.showBorderTitle');
  return (
    <ContentPopoverSection className="sniptale-frame-decoration-section">
      <PropertyField label={label}>
        <div className="flex justify-end">
          <ProductGlassSwitch
            aria-label={label}
            on={props.showBorder}
            onClick={() => props.onChange(!props.showBorder)}
          />
        </div>
      </PropertyField>
    </ContentPopoverSection>
  );
}

export function FrameBlurControls(props: {
  handleBlurChange: (amount: number) => void;
  handleBlurTypeChange: (blurType: BlurType) => void;
  settings: BlurSettings;
}) {
  const label = translate('content.overlayControls.blurStrengthLabelPrefix');
  return (
    <ContentPopoverSection>
      <div className="grid gap-3">
        <NumericRow
          appearance="plain"
          label={label}
          max={25}
          min={1}
          onCommitValue={props.handleBlurChange}
          onPreviewValue={props.handleBlurChange}
          scrub={{ max: 25, min: 1 }}
          value={props.settings.amount}
        />
        <PropertyField label={translate('content.overlayControls.blurTypeLabel')}>
          <CompactSelect
            appearance="plain"
            aria-label={translate('content.overlayControls.blurTypeLabel')}
            onChange={props.handleBlurTypeChange}
            options={buildBlurTypeOptions().map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            value={props.settings.blurType}
          />
        </PropertyField>
      </div>
    </ContentPopoverSection>
  );
}

export function FrameFocusControls(props: {
  handleFocusChange: (opacity: number) => void;
  settings: FocusSettings;
}) {
  const label = translate('content.overlayControls.focusDimmingLabelPrefix');
  const value = Math.round(props.settings.opacity * 100);
  const handleChange = (nextValue: number) => props.handleFocusChange(nextValue / 100);
  return (
    <ContentPopoverSection>
      <NumericRow
        appearance="plain"
        label={label}
        max={100}
        min={10}
        onCommitValue={handleChange}
        onPreviewValue={handleChange}
        scrub={{ max: 100, min: 10 }}
        unit="%"
        value={value}
      />
    </ContentPopoverSection>
  );
}
