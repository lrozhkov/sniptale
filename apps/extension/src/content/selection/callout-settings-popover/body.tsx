import type {
  CalloutAnchor,
  CalloutPlacement,
  CalloutPreset,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { ProductToolbarMenuGroupLabel } from '@sniptale/ui/product-menus/toolbar';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useState } from 'react';
import { X } from 'lucide-react';
import type { PointerEventHandler } from 'react';
import { translate } from '../../../platform/i18n';
import { getPreferredSideFromAnchor } from '../callout/geometry';
import type { CalloutSettingsPatch } from '../callout/model';
import { CalloutDeleteButton, CalloutPositionSection, CalloutPresetSection } from './views';
import { CalloutManualSettings } from '../../../ui/highlighter-preset-editor/callout/inspector';

export function createCalloutAnchorPlacement(
  anchor: CalloutAnchor
): Pick<CalloutPlacement, 'anchor' | 'side'> {
  return { anchor, side: getPreferredSideFromAnchor(anchor) ?? 'top' };
}

export function CalloutSettingsPopoverContent(props: {
  handleDelete: () => void;
  headerDrag: {
    isDragging: boolean;
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    onPointerMove: PointerEventHandler<HTMLDivElement>;
    onPointerUp: PointerEventHandler<HTMLDivElement>;
  };
  handleSettingChange: (patch: CalloutSettingsPatch) => void;
  localSettings: CalloutSettings;
  onApplyPreset: (preset: CalloutPreset) => void;
  onCustomizePreset: (preset: CalloutPreset) => void;
  onResetPreset?: ((preset: CalloutPreset) => void) | undefined;
  onTogglePreset: (preset: CalloutPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  presets: CalloutPreset[];
  presetError: string | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'preset' | 'manual'>('preset');
  return (
    <>
      <div
        className="sniptale-callout-settings-header"
        data-dragging={props.headerDrag.isDragging ? 'true' : undefined}
        onPointerDown={props.headerDrag.onPointerDown}
        onPointerMove={props.headerDrag.onPointerMove}
        onPointerUp={props.headerDrag.onPointerUp}
      >
        <ProductToolbarMenuGroupLabel>
          {translate('content.callout.settingsTitle')}
        </ProductToolbarMenuGroupLabel>
        <button
          aria-label={translate('content.callout.closeSettings')}
          className="sniptale-callout-settings-close"
          onClick={props.onClose}
          title={translate('content.callout.closeSettings')}
          type="button"
        >
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <CalloutPositionSection
        anchor={props.localSettings.placement.anchor}
        onChange={(anchor) =>
          props.handleSettingChange({
            placement: createCalloutAnchorPlacement(anchor),
          })
        }
      />
      <ContentPopoverSection dataUi="content.callout-settings.mode-section">
        <SegmentedSwitch
          activeId={mode}
          ariaLabel={translate('content.callout.settingsTitle')}
          dataAttribute={{ 'data-callout-settings-mode-switch': 'true' }}
          onChange={setMode}
          options={[
            { id: 'preset', label: translate('content.callout.modePreset') },
            { id: 'manual', label: translate('content.callout.modeManual') },
          ]}
        />
      </ContentPopoverSection>
      {mode === 'preset' ? (
        <CalloutPresetSection
          {...(props.localSettings.sourcePresetId
            ? { activePresetId: props.localSettings.sourcePresetId }
            : {})}
          onApplyPreset={props.onApplyPreset}
          onCustomizePreset={props.onCustomizePreset}
          {...(props.onResetPreset ? { onResetPreset: props.onResetPreset } : {})}
          onTogglePreset={props.onTogglePreset}
          pendingPresetIds={props.pendingPresetIds}
          presets={props.presets}
          error={props.presetError}
        />
      ) : (
        <CalloutManualSettings
          settings={props.localSettings}
          onChange={props.handleSettingChange}
        />
      )}
      <CalloutDeleteButton onDelete={props.handleDelete} />
    </>
  );
}
