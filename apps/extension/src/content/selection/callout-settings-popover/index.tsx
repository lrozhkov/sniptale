import { useRef, type RefObject } from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { dispatchCalloutDelete } from '../../platform/page-context/frame-events';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { CalloutSettingsPopoverContent } from './body';
import { POPOVER_HEIGHT, POPOVER_WIDTH } from './helpers';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import { usePopoverEscapeClose } from '../popover-sync/hooks';
import { useCalloutSettingsPopoverState } from './state';
import { useCalloutPresetPopoverController } from './preset-controller';
import { CalloutPresetEditor } from '../../../ui/highlighter-preset-editor/callout';
import { useCalloutSettingsPopoverDrag } from './drag';

interface CalloutSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  settings?: CalloutSettings;
  anchorEl: HTMLElement | null;
}

function useCalloutPopoverPresentation(args: {
  anchorEl: HTMLElement | null;
  frameId: string;
  frameRect: CalloutSettingsPopoverProps['frameRect'];
  isOpen: boolean;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  const popoverStyle = useFramePopoverPosition({
    anchorEl: args.anchorEl,
    fallbackSize: { width: POPOVER_WIDTH, height: POPOVER_HEIGHT },
    frameId: args.frameId,
    frameRect: args.frameRect,
    isOpen: args.isOpen,
    popoverRef: args.popoverRef,
  });
  const drag = useCalloutSettingsPopoverDrag({
    basePosition: {
      left: typeof popoverStyle.left === 'number' ? popoverStyle.left : 0,
      top: typeof popoverStyle.top === 'number' ? popoverStyle.top : 0,
    },
    isOpen: args.isOpen,
    popoverRef: args.popoverRef,
    resetKey: args.frameId,
  });
  return {
    drag,
    style: { ...popoverStyle, left: drag.position.left, top: drag.position.top },
  };
}

export function CalloutSettingsPopover({
  isOpen,
  onClose,
  frameId,
  frameRect,
  settings,
  anchorEl,
}: CalloutSettingsPopoverProps) {
  useAppLocale();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const presentation = useCalloutPopoverPresentation({
    anchorEl,
    frameId,
    frameRect,
    isOpen,
    popoverRef,
  });
  const { applyPreset, handleSettingChange, localSettings } = useCalloutSettingsPopoverState({
    frameId,
    isOpen,
    ...(settings === undefined ? {} : { settings }),
  });
  const presets = useCalloutPresetPopoverController(isOpen);

  usePopoverEscapeClose({ anchorEl, isOpen: isOpen && !presets.editor.isOpen, onClose });

  const handleDelete = () => {
    dispatchCalloutDelete({ frameId });
    onClose();
  };

  return (
    <ContentPopoverAdapter
      isOpen={isOpen}
      anchorEl={anchorEl}
      portalTarget={resolveContentPortalTarget(anchorEl)}
      popoverRef={popoverRef}
      className={[
        'sniptale-callout-settings-popover sniptale-glass-popover',
        'sniptale-glass-popover--wide sniptale-content-popover--compact',
        'sniptale-content-popover--toolbar-menu sniptale-content-popover--scroll',
      ].join(' ')}
      style={{
        ...presentation.style,
        width: POPOVER_WIDTH,
      }}
      dataUi="content.callout-settings.popover"
    >
      <CalloutSettingsPopoverContent
        handleDelete={handleDelete}
        headerDrag={presentation.drag}
        handleSettingChange={handleSettingChange}
        localSettings={localSettings}
        onApplyPreset={applyPreset}
        onCustomizePreset={presets.editor.open}
        onResetPreset={(preset) => void presets.editor.reset(preset)}
        onTogglePreset={(preset) => void presets.catalog.toggle(preset)}
        pendingPresetIds={presets.catalog.pendingPresetIds}
        presets={presets.catalog.visiblePresets}
        presetError={presets.catalog.error}
        onClose={onClose}
      />
      {presets.editor.preset ? (
        <CalloutPresetEditor
          isOpen={presets.editor.isOpen}
          isSaving={presets.editor.isSaving}
          preset={presets.editor.preset}
          onClose={presets.editor.close}
          {...(presets.editor.preset.origin === 'system' &&
          presets.editor.preset.customized === true
            ? { onReset: () => presets.editor.reset(presets.editor.preset!) }
            : {})}
          onSave={presets.editor.save}
        />
      ) : null}
    </ContentPopoverAdapter>
  );
}
