import type {
  BorderPreset,
  BlurSettings,
  FocusSettings,
} from '../../../features/highlighter/contracts';
import { useRef } from 'react';
import { useContentPortalTheme } from '../interactive-frame/layout/portal';
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
  scope?: 'frame' | 'session';
}) {
  const portalTheme = useContentPortalTheme(args.anchorEl);
  const state = useFrameSettingsPopoverState({
    frameId: args.frameId,
    isOpen: args.isOpen,
    onApplyToFrame: args.onApplyToFrame,
    scope: args.scope ?? 'frame',
    ...(args.blurSettings === undefined ? {} : { blurSettings: args.blurSettings }),
    ...(args.borderSettings === undefined ? {} : { borderSettings: args.borderSettings }),
    ...(args.focusSettings === undefined ? {} : { focusSettings: args.focusSettings }),
  });
  const popoverRef = useRef<HTMLDivElement>(null);

  useFrameSettingsPopoverOutsideClose({
    isOpen: args.isOpen && !state.catalog.editor.isOpen,
    onClose: args.onClose,
    popoverRef,
  });
  useFrameSettingsPopoverModeClose({ isOpen: args.isOpen, onClose: args.onClose });
  useFrameSettingsPopoverDistanceClose({
    isOpen: args.isOpen && !state.catalog.editor.isOpen,
    onClose: args.onClose,
    popoverRef,
  });
  usePopoverEscapeClose({
    anchorEl: args.anchorEl,
    isOpen: args.isOpen && !state.catalog.editor.isOpen,
    onClose: args.onClose,
  });

  return {
    catalog: state.catalog,
    handlers: state.handlers,
    settings: state.settings,
    surface: {
      popoverRef,
      portalTheme,
    },
  };
}
