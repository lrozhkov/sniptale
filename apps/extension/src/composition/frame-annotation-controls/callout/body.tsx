import type {
  CalloutAnchor,
  CalloutPlacement,
  CalloutPreset,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { useEffect, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { getPreferredSideFromAnchor } from '../../../features/highlighter/frame-annotation/callout/geometry';
import type { CalloutSettingsPatch } from '../../../features/highlighter/frame-annotation/callout/model';
import { CalloutPositionSection, CalloutPresetSection } from './views';
import { CalloutManualSettings } from '../../../ui/highlighter-preset-editor/callout/inspector';
import type { CalloutFrameColors } from '../../../features/highlighter/callout-color-bindings';
import type { CalloutSaveSectionProps } from '../../../ui/highlighter-preset-editor/callout/inspector-save';
import type { FloatingPopoverDrag } from '../popover/drag';
import { SettingsPopoverHeader, type SettingsPopoverContext } from '../popover/header';
import { selectOrClosePopoverPreset } from '../popover/preset-selection';

export function createCalloutAnchorPlacement(
  anchor: CalloutAnchor
): Pick<CalloutPlacement, 'anchor' | 'side'> {
  return { anchor, side: getPreferredSideFromAnchor(anchor) ?? 'top' };
}

export function CalloutSettingsPopoverContent(props: {
  handleDelete: () => void;
  headerContext: SettingsPopoverContext;
  headerDrag?: FloatingPopoverDrag;
  handleSettingChange: (patch: CalloutSettingsPatch) => void;
  frameColors?: CalloutFrameColors;
  localSettings: CalloutSettings;
  onApplyPreset: (preset: CalloutPreset) => void;
  onCustomizePreset: (preset: CalloutPreset) => void;
  onResetPreset?: ((preset: CalloutPreset) => void) | undefined;
  onShowPresets: () => void | Promise<void>;
  onTogglePreset: (preset: CalloutPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  presets: CalloutPreset[];
  presetError: string | null;
  saveSection: CalloutSaveSectionProps;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'preset' | 'manual'>(() =>
    props.localSettings.sourcePresetId ? 'preset' : 'manual'
  );
  const hasSelectedPreset = Boolean(props.localSettings.sourcePresetId);
  useEffect(() => {
    setMode(hasSelectedPreset ? 'preset' : 'manual');
  }, [hasSelectedPreset]);
  const switchMode = () => {
    const nextMode = mode === 'preset' ? 'manual' : 'preset';
    if (nextMode === 'preset') void props.onShowPresets();
    setMode(nextMode);
  };
  return (
    <>
      <SettingsPopoverHeader
        action={{
          label: translate(
            mode === 'preset' ? 'content.callout.switchToManual' : 'content.callout.switchToPresets'
          ),
          onClick: switchMode,
        }}
        closeLabel={translate('content.callout.closeSettings')}
        context={props.headerContext}
        destructiveAction={{
          label: translate('content.callout.disableButton'),
          onClick: props.handleDelete,
        }}
        {...(props.headerDrag ? { drag: props.headerDrag } : {})}
        onClose={props.onClose}
        title={translate('content.callout.settingsTitle')}
      />
      {mode === 'preset' ? (
        <CalloutPresetSection
          {...(props.frameColors ? { frameColors: props.frameColors } : {})}
          {...(props.localSettings.sourcePresetId
            ? { activePresetId: props.localSettings.sourcePresetId }
            : {})}
          onApplyPreset={(preset) => {
            selectOrClosePopoverPreset({
              isActive: props.localSettings.sourcePresetId === preset.id,
              onApply: props.onApplyPreset,
              onClose: props.onClose,
              preset,
            });
          }}
          onCustomizePreset={props.onCustomizePreset}
          {...(props.onResetPreset ? { onResetPreset: props.onResetPreset } : {})}
          onTogglePreset={props.onTogglePreset}
          pendingPresetIds={props.pendingPresetIds}
          presets={props.presets}
          error={props.presetError}
        />
      ) : (
        <CalloutManualSettings
          {...(props.frameColors ? { frameColors: props.frameColors } : {})}
          settings={props.localSettings}
          positionSection={
            <CalloutPositionSection
              embedded
              anchor={props.localSettings.placement.anchor}
              onChange={(anchor) =>
                props.handleSettingChange({
                  placement: createCalloutAnchorPlacement(anchor),
                })
              }
            />
          }
          saveSection={props.saveSection}
          onChange={props.handleSettingChange}
        />
      )}
    </>
  );
}
