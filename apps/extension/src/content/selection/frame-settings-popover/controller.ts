import type {
  BorderPreset,
  BlurSettings,
  FocusSettings,
} from '../../../features/highlighter/contracts';
import { useContentPortalTheme } from '../interactive-frame/layout/portal';
import { useFrameSettingsPopoverBindings } from './bindings';
import {
  useFrameSettingsPopoverDistanceClose,
  useFrameSettingsPopoverModeClose,
  useFrameSettingsPopoverOutsideClose,
} from './sync';
import { useFrameSettingsPopoverState } from './state';
import { usePopoverEscapeClose } from '../popover-sync/hooks';

export function useFrameSettingsPopoverController(args: {
  anchorEl: HTMLElement | null;
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
  onApplyToFrame: (settings: {
    borderSettings?: BorderPreset;
    blurSettings?: BlurSettings;
    focusSettings?: FocusSettings;
  }) => void;
  onClose: () => void;
}) {
  const portalTheme = useContentPortalTheme(args.anchorEl);
  const state = useFrameSettingsPopoverState({
    frameId: args.frameId,
    isOpen: args.isOpen,
    onApplyToFrame: args.onApplyToFrame,
    ...(args.blurSettings === undefined ? {} : { blurSettings: args.blurSettings }),
    ...(args.borderSettings === undefined ? {} : { borderSettings: args.borderSettings }),
    ...(args.focusSettings === undefined ? {} : { focusSettings: args.focusSettings }),
  });
  const bindings = useFrameSettingsPopoverBindings({
    handleSelectPreset: state.handlers.handleSelectPreset,
    onClose: args.onClose,
  });

  useFrameSettingsPopoverOutsideClose({
    isOpen: args.isOpen,
    onClose: args.onClose,
    popoverRef: bindings.popoverRef,
  });
  useFrameSettingsPopoverModeClose({ isOpen: args.isOpen, onClose: args.onClose });
  useFrameSettingsPopoverDistanceClose({
    isOpen: args.isOpen,
    onClose: args.onClose,
    popoverRef: bindings.popoverRef,
  });
  usePopoverEscapeClose({
    anchorEl: args.anchorEl,
    isOpen: args.isOpen,
    onClose: args.onClose,
  });

  return {
    handlers: {
      ...state.handlers,
      handleSelectPreset: bindings.handleSelectPresetAndClose,
    },
    settings: state.settings,
    surface: {
      popoverRef: bindings.popoverRef,
      portalTheme,
    },
  };
}
