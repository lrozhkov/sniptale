import type { CalloutAnchor, CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassDestructiveButton,
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
} from '@sniptale/ui/product-glass-controls';
import { Eye, EyeOff, RotateCcw, Settings2 } from 'lucide-react';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { CalloutPresetPreview } from '../../../ui/highlighter-preset-editor/callout/thumbnail';
import { PresetNameWithOverflowHint } from '../../../ui/compact-inspector-controls/overflow-hint';
import { CalloutSettingsPositionGrid } from '../../../ui/highlighter-preset-editor/callout/position-grid';
import {
  resolveCalloutColorBindings,
  type CalloutFrameColors,
} from '../../../features/highlighter/callout-color-bindings';

export function CalloutPresetSection(props: {
  activePresetId?: string;
  onApplyPreset: (preset: CalloutPreset) => void;
  onCustomizePreset: (preset: CalloutPreset) => void;
  onResetPreset?: ((preset: CalloutPreset) => void) | undefined;
  onTogglePreset: (preset: CalloutPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  presets: CalloutPreset[];
  error: string | null;
  frameColors?: CalloutFrameColors;
}) {
  const locale = useAppLocale();
  const enabledPresetCount = props.presets.filter((preset) => preset.enabled !== false).length;
  return (
    <ContentPopoverSection
      title={translate('content.callout.presetsSection')}
      dataUi="content.callout-settings.presets-section"
    >
      <ProductGlassPresetList className="sniptale-callout-preset-list" scrollable>
        {props.presets.map((preset) => {
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
                <button
                  aria-label={translate('content.callout.configurePreset')}
                  className="sniptale-callout-preset-action"
                  disabled={pending}
                  onClick={() => props.onCustomizePreset(preset)}
                  title={translate('content.callout.configurePreset')}
                  type="button"
                >
                  <Settings2 size={15} />
                </button>
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
  onChange: (anchor: CalloutAnchor) => void;
}) {
  return (
    <ContentPopoverSection title={translate('content.callout.positionSection')}>
      <CalloutSettingsPositionGrid anchor={props.anchor} onChange={props.onChange} />
    </ContentPopoverSection>
  );
}

export function CalloutDeleteButton(props: { onDelete: () => void }) {
  return (
    <ProductGlassDestructiveButton onClick={props.onDelete}>
      {translate('content.callout.disableButton')}
    </ProductGlassDestructiveButton>
  );
}
