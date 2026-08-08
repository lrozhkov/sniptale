import { useRef, type RefObject } from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { dispatchCalloutDelete } from '../../platform/page-context/frame-events';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { CalloutSettingsPopoverContent } from '../../../composition/frame-annotation-controls/callout/body';
import {
  POPOVER_HEIGHT,
  POPOVER_WIDTH,
} from '../../../composition/frame-annotation-controls/callout/helpers';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import { usePopoverEscapeClose } from '../../../composition/frame-annotation-controls/popover/hooks';
import { useCalloutSettingsPopoverState } from './state';
import { useCalloutPresetPopoverController } from '../../../composition/frame-annotation-controls/callout/preset-controller';
import { useFloatingPopoverDrag } from '../../../composition/frame-annotation-controls/popover/drag';
import type { CalloutFrameColors } from '../../../features/highlighter/callout-color-bindings';
import { createCalloutSaveSection } from '../../../composition/frame-annotation-controls/callout/save-section';

interface CalloutSettingsPopoverProps {
  calloutIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  frameId: string;
  frameColors?: CalloutFrameColors;
  frameRect: { x: number; y: number; width: number; height: number };
  settings?: CalloutSettings;
  anchorEl: HTMLElement | null;
  onDelete?: () => void;
  onSettingsChange?: (settings: CalloutSettings) => void;
}

function CalloutSettingsPopoverSurface(props: {
  handleDelete: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
  portalTarget: HTMLElement | ShadowRoot | DocumentFragment;
  presentation: ReturnType<typeof useCalloutPopoverPresentation>;
  presets: ReturnType<typeof useCalloutPresetPopoverController>;
  request: CalloutSettingsPopoverProps;
  state: ReturnType<typeof useCalloutSettingsPopoverState>;
}) {
  const { frameColors, isOpen, onClose } = props.request;
  const saveSection = createCalloutSaveSection({
    create: props.presets.catalog.create,
    error: props.presets.catalog.error,
    isSaving: props.presets.catalog.isSaving,
    overwrite: props.presets.catalog.overwrite,
    presets: props.presets.catalog.presets,
    settings: props.state.localSettings,
    onCreated: props.state.markTemplateCreated,
  });
  return (
    <ContentPopoverAdapter
      isOpen={isOpen}
      anchorEl={props.request.anchorEl}
      portalTarget={props.portalTarget}
      popoverRef={props.popoverRef}
      className={[
        'sniptale-callout-settings-popover sniptale-glass-popover',
        'sniptale-glass-popover--wide sniptale-content-popover--compact',
        'sniptale-content-popover--toolbar-menu sniptale-content-popover--scroll',
      ].join(' ')}
      style={{ ...props.presentation.style, width: POPOVER_WIDTH }}
      dataUi="content.callout-settings.popover"
    >
      <CalloutSettingsPopoverContent
        {...(frameColors ? { frameColors } : {})}
        handleDelete={props.handleDelete}
        headerContext="element"
        headerDrag={props.presentation.drag}
        handleSettingChange={props.state.handleSettingChange}
        localSettings={props.state.localSettings}
        onApplyPreset={props.state.applyPreset}
        onForkPreset={props.state.forkPreset}
        onResetPreset={(preset) => {
          void props.presets.editor.reset(preset).then((restored) => {
            if (restored) props.state.applyPreset(restored);
          });
        }}
        onShowPresets={props.presets.catalog.refresh}
        onTogglePreset={(preset) => void props.presets.catalog.toggle(preset)}
        pendingPresetIds={props.presets.catalog.pendingPresetIds}
        presets={props.presets.catalog.visiblePresets}
        presetError={props.presets.catalog.error}
        saveSection={saveSection}
        onClose={onClose}
      />
    </ContentPopoverAdapter>
  );
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
  const drag = useFloatingPopoverDrag({
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

export function CalloutSettingsPopover(props: CalloutSettingsPopoverProps) {
  const { anchorEl, frameId, frameRect, isOpen, onClose, settings } = props;
  useAppLocale();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const presentation = useCalloutPopoverPresentation({
    anchorEl,
    frameId,
    frameRect,
    isOpen,
    popoverRef,
  });
  const state = useCalloutSettingsPopoverState({
    calloutIndex: props.calloutIndex ?? 0,
    frameId,
    isOpen,
    ...(settings === undefined ? {} : { settings }),
    ...(props.onSettingsChange ? { onSettingsChange: props.onSettingsChange } : {}),
  });
  const presets = useCalloutPresetPopoverController(isOpen);
  const portalTarget = resolveContentPortalTarget(anchorEl);

  usePopoverEscapeClose({ anchorEl, isOpen: isOpen && !presets.editor.isOpen, onClose });

  const handleDelete = () => {
    props.onDelete?.();
    dispatchCalloutDelete({
      ...((props.calloutIndex ?? 0) === 0 ? {} : { calloutIndex: props.calloutIndex }),
      frameId,
    });
    onClose();
  };

  return (
    <CalloutSettingsPopoverSurface
      handleDelete={handleDelete}
      popoverRef={popoverRef}
      portalTarget={portalTarget}
      presentation={presentation}
      presets={presets}
      request={props}
      state={state}
    />
  );
}
