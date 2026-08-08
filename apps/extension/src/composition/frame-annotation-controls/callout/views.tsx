import type { CalloutAnchor, CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';

import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
} from '@sniptale/ui/product-glass-controls';
import { CopyPlus, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { CalloutPresetPreview } from '../../../ui/highlighter-preset-editor/callout/thumbnail';
import { PresetNameWithOverflowHint } from '../../../ui/compact-inspector-controls/overflow-hint';
import { CalloutSettingsPositionGrid } from '../../../ui/highlighter-preset-editor/callout/position-grid';
import {
  resolveCalloutColorBindings,
  type CalloutFrameColors,
} from '../../../features/highlighter/callout-color-bindings';
import { useOpeningPresetOrder } from '../popover/preset-order';

export function CalloutPresetSection(props: {
  activePresetId?: string;
  onApplyPreset: (preset: CalloutPreset) => void;
  onForkPreset: (preset: CalloutPreset) => void;
  onResetPreset?: ((preset: CalloutPreset) => void) | undefined;
  onTogglePreset: (preset: CalloutPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  presets: CalloutPreset[];
  error: string | null;
  frameColors?: CalloutFrameColors;
}) {
  const locale = useAppLocale();
  const enabledPresetCount = props.presets.filter((preset) => preset.enabled !== false).length;
  const orderedPresets = useOpeningPresetOrder(props.presets, props.activePresetId);
  return (
    <ContentPopoverSection dataUi="content.callout-settings.presets-section">
      <ProductGlassPresetList className="sniptale-callout-preset-list" scrollable variant="menu">
        {orderedPresets.map((preset) => {
          const pending = props.pendingPresetIds.has(preset.id);
          const disabled = preset.enabled === false;
          const displayName = getCalloutPresetDisplayName(preset, locale);
          return (
            <div
              className="sniptale-callout-preset-row"
              data-disabled={disabled ? 'true' : undefined}
              key={preset.id}
            >
              <ProductGlassPresetItem
                active={props.activePresetId === preset.id}
                disabled={disabled}
                onClick={() => props.onApplyPreset(preset)}
                showActiveIndicator
              >
                <CalloutPresetPreview
                  compact
                  placement={preset.placement}
                  style={resolveCalloutColorBindings(preset.style, props.frameColors ?? {})}
                />
                <ProductGlassPresetMeta>
                  <PresetNameWithOverflowHint name={displayName} />
                </ProductGlassPresetMeta>
              </ProductGlassPresetItem>
              <span className="sniptale-callout-preset-actions">
                {props.activePresetId === preset.id ? (
                  <button
                    aria-label={translate('content.templateFork.fork')}
                    className="sniptale-callout-preset-action"
                    disabled={pending}
                    onClick={() => props.onForkPreset(preset)}
                    title={translate('content.templateFork.fork')}
                    type="button"
                  >
                    <CopyPlus size={15} />
                  </button>
                ) : null}
                {preset.origin === 'system' && preset.customized === true && props.onResetPreset ? (
                  <button
                    aria-label={translate('highlighter.calloutPresets.reset')}
                    className="sniptale-callout-preset-action"
                    disabled={pending}
                    onClick={() => props.onResetPreset?.(preset)}
                    title={translate('highlighter.calloutPresets.reset')}
                    type="button"
                  >
                    <RotateCcw size={15} />
                  </button>
                ) : null}
                <button
                  aria-label={translate(
                    disabled ? 'content.callout.showPreset' : 'content.callout.hidePreset'
                  )}
                  className="sniptale-callout-preset-action"
                  disabled={pending || (!disabled && enabledPresetCount <= 1)}
                  onClick={() => props.onTogglePreset(preset)}
                  title={translate(
                    disabled ? 'content.callout.showPreset' : 'content.callout.hidePreset'
                  )}
                  type="button"
                >
                  {disabled ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </span>
            </div>
          );
        })}
      </ProductGlassPresetList>
      {props.error ? <div role="alert">{props.error}</div> : null}
    </ContentPopoverSection>
  );
}

export function CalloutPositionSection(props: {
  anchor: CalloutAnchor;
  embedded?: boolean;
  onChange: (anchor: CalloutAnchor) => void;
}) {
  const grid = (
    <CalloutSettingsPositionGrid layout="square" anchor={props.anchor} onChange={props.onChange} />
  );
  return props.embedded ? (
    grid
  ) : (
    <ContentPopoverSection title={translate('content.callout.positionSection')}>
      {grid}
    </ContentPopoverSection>
  );
}
