import {
  resolveStandaloneCalloutSettings,
  resolveStandaloneStepBadgeSettings,
} from '../../features/highlighter/frame-annotation/model';
import type { AnnotationPlacementControl } from './creation-placement';
import type { ComponentProps, RefObject } from 'react';
import { FutureCalloutSettingsPopover } from './callout/popover';
import { FutureStepBadgeSettingsPopover } from './step-badge/popover';
import { FrameAnnotationCreationFramePopover } from './frame/popover';
import type {
  FrameAnnotationCreationFramePopoverRenderer,
  FrameAnnotationCreationMenu,
  FrameAnnotationCreationSettings,
  FrameAnnotationStyleSettings,
} from './contracts';
import type { TemplateSourceControl } from './popover/template-source';
import { getRepresentativeColor } from '@sniptale/foundation/paint';

type FrameCreationPopoversProps = {
  activeMenu: FrameAnnotationCreationMenu | null;
  creationPlacement?: AnnotationPlacementControl;
  calloutRef: RefObject<HTMLButtonElement | null>;
  close: () => void;
  frameRef: RefObject<HTMLButtonElement | null>;
  portalTarget?: HTMLElement | DocumentFragment | ShadowRoot;
  renderFramePopover?: FrameAnnotationCreationFramePopoverRenderer;
  settings: FrameAnnotationCreationSettings;
  showCallout: boolean;
  showStepBadge: boolean;
  stepBadgeRef: RefObject<HTMLButtonElement | null>;
  update: (patch: Partial<FrameAnnotationCreationSettings>) => void;
  calloutTemplateSourceControl?: TemplateSourceControl;
  stepBadgeTemplateSourceControl?: TemplateSourceControl;
};

export function FrameCreationPopovers(props: FrameCreationPopoversProps) {
  const frameSettings = selectFrameStyle(props.settings);
  const callout = selectCalloutCreationPopover(props);
  const stepBadge = selectStepBadgeCreationPopover(props);
  const frameArgs = {
    anchorEl: props.frameRef.current,
    isOpen: props.activeMenu === 'frame',
    onChange: (settings: FrameAnnotationStyleSettings) => props.update(settings),
    onClose: props.close,
    settings: frameSettings,
  };
  return (
    <>
      {props.renderFramePopover ? (
        props.renderFramePopover(frameArgs)
      ) : (
        <FrameAnnotationCreationFramePopover
          {...frameArgs}
          {...(props.portalTarget ? { portalTarget: props.portalTarget } : {})}
        />
      )}
      {callout ? <FutureCalloutSettingsPopover {...callout} /> : null}
      {stepBadge ? <FutureStepBadgeSettingsPopover {...stepBadge} /> : null}
    </>
  );
}

function selectFrameStyle(settings: FrameAnnotationCreationSettings): FrameAnnotationStyleSettings {
  return {
    blurSettings: settings.blurSettings,
    borderSettings: settings.borderSettings,
    effectMode: settings.effectMode,
    focusSettings: settings.focusSettings,
  };
}

function selectCalloutCreationPopover(
  props: FrameCreationPopoversProps
): ComponentProps<typeof FutureCalloutSettingsPopover> | null {
  const settings = props.settings.callout;
  if (!props.showCallout || !settings) return null;
  return {
    ...(props.creationPlacement ? { creationPlacement: props.creationPlacement } : {}),
    anchorEl: props.calloutRef.current,
    isOpen: props.activeMenu === 'callout',
    onChange: (callout) => props.update({ callout }),
    onClose: props.close,
    onDisable: () => {
      props.update({ callout: null });
      props.close();
    },
    settings: props.creationPlacement ? resolveStandaloneCalloutSettings(settings) : settings,
    ...(props.calloutTemplateSourceControl
      ? { templateSourceControl: props.calloutTemplateSourceControl }
      : {}),
    ...(props.portalTarget ? { portalTarget: props.portalTarget } : {}),
  };
}

function selectStepBadgeCreationPopover(
  props: FrameCreationPopoversProps
): ComponentProps<typeof FutureStepBadgeSettingsPopover> | null {
  const settings = props.settings.stepBadge;
  if (!props.showStepBadge || !settings) return null;
  return {
    ...(props.creationPlacement ? { creationPlacement: props.creationPlacement } : {}),
    anchorEl: props.stepBadgeRef.current,
    frameVisuals: {
      borderColor: props.settings.borderSettings.color,
      borderWidth: props.settings.borderSettings.width,
      fillColor: getRepresentativeColor(props.settings.borderSettings.fillPaint),
    },
    isOpen: props.activeMenu === 'step-badge',
    onChange: (stepBadge) => props.update({ stepBadge }),
    onClose: props.close,
    onDisable: () => {
      props.update({ stepBadge: null });
      props.close();
    },
    settings: props.creationPlacement ? resolveStandaloneStepBadgeSettings(settings) : settings,
    ...(props.stepBadgeTemplateSourceControl
      ? { templateSourceControl: props.stepBadgeTemplateSourceControl }
      : {}),
    ...(props.portalTarget ? { portalTarget: props.portalTarget } : {}),
  };
}
