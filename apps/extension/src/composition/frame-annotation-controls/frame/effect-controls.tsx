import { useInspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { SegmentedRow, ToggleField } from '../../../ui/compact-inspector-controls';

import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import type {
  BlurSettings,
  BlurType,
  FocusSettings,
} from '../../../features/highlighter/contracts';
import { translate } from '../../../platform/i18n';
import { CompactSelect, NumericRow } from '../../../ui/compact-inspector-controls';
import { HighlighterPresetPropertyField as PropertyField } from '../../../ui/highlighter-preset-editor/inspector-field';
import { buildBlurTypeOptions } from './helpers';

export function FrameDecorationToggle(props: {
  embedded?: boolean;
  onChange: (showBorder: boolean) => void;
  showBorder: boolean;
}) {
  const label = translate('content.overlayControls.showBorderTitle');
  const inspector = useInspectorLayout();
  if (inspector) {
    const toggle = <ToggleField label={label} value={props.showBorder} onChange={props.onChange} />;
    return props.embedded ? (
      toggle
    ) : (
      <ContentPopoverSection className="sniptale-frame-decoration-section">
        {toggle}
      </ContentPopoverSection>
    );
  }
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
  embedded?: boolean;
  handleBlurChange: (amount: number) => void;
  handleBlurTypeChange: (blurType: BlurType) => void;
  settings: BlurSettings;
}) {
  const inspector = useInspectorLayout();
  const label = translate('content.overlayControls.blurStrengthLabelPrefix');
  const fields = (
    <div className={inspector ? 'sniptale-parameter-stack' : 'grid gap-3'}>
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
      {inspector ? (
        <SegmentedRow
          ariaLabel={translate('content.overlayControls.blurTypeLabel')}
          label={translate('content.overlayControls.blurTypeLabel')}
          onChange={props.handleBlurTypeChange}
          options={buildBlurTypeOptions().map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          value={props.settings.blurType}
        />
      ) : (
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
      )}
    </div>
  );
  return props.embedded ? fields : <ContentPopoverSection>{fields}</ContentPopoverSection>;
}

export function FrameFocusControls(props: {
  embedded?: boolean;
  handleFocusBlurChange: (blurAmount: number) => void;
  handleFocusChange: (opacity: number) => void;
  settings: FocusSettings;
}) {
  const inspector = useInspectorLayout();
  const dimmingLabel = translate('content.overlayControls.focusDimmingLabelPrefix');
  const blurLabel = translate('content.overlayControls.focusBlurLabel');
  const dimmingValue = Math.round(props.settings.opacity * 100);
  const handleDimmingChange = (nextValue: number) => props.handleFocusChange(nextValue / 100);
  const fields = (
    <div className={inspector ? 'sniptale-parameter-stack' : 'grid gap-3'}>
      <NumericRow
        appearance="plain"
        label={dimmingLabel}
        max={100}
        min={0}
        onCommitValue={handleDimmingChange}
        onPreviewValue={handleDimmingChange}
        scrub={{ max: 100, min: 0 }}
        unit="%"
        value={dimmingValue}
      />
      <NumericRow
        appearance="plain"
        label={blurLabel}
        max={25}
        min={0}
        onCommitValue={props.handleFocusBlurChange}
        onPreviewValue={props.handleFocusBlurChange}
        scrub={{ max: 25, min: 0 }}
        unit="px"
        value={props.settings.blurAmount ?? 0}
      />
    </div>
  );
  return props.embedded ? fields : <ContentPopoverSection>{fields}</ContentPopoverSection>;
}
