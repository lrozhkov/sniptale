import type { RefObject } from 'react';
import { FutureCalloutSettingsPopover } from './callout/popover';
import { FutureStepBadgeSettingsPopover } from './step-badge/popover';
import { FrameAnnotationCreationFramePopover } from './frame/popover';
import type {
  FrameAnnotationCreationFramePopoverRenderer,
  FrameAnnotationCreationMenu,
  FrameAnnotationCreationSettings,
  FrameAnnotationStyleSettings,
} from './contracts';

export function FrameCreationPopovers(props: {
  activeMenu: FrameAnnotationCreationMenu | null;
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
}) {
  const frameSettings = selectFrameStyle(props.settings);
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
      {props.showCallout && props.settings.callout ? (
        <FutureCalloutSettingsPopover
          anchorEl={props.calloutRef.current}
          isOpen={props.activeMenu === 'callout'}
          onChange={(callout) => props.update({ callout })}
          onClose={props.close}
          onDisable={() => {
            props.update({ callout: null });
            props.close();
          }}
          settings={props.settings.callout}
          {...(props.portalTarget ? { portalTarget: props.portalTarget } : {})}
        />
      ) : null}
      {props.showStepBadge && props.settings.stepBadge ? (
        <FutureStepBadgeSettingsPopover
          anchorEl={props.stepBadgeRef.current}
          frameVisuals={{
            borderColor: props.settings.borderSettings.color,
            borderWidth: props.settings.borderSettings.width,
            fillColor: props.settings.borderSettings.fillColor,
            fillOpacity: props.settings.borderSettings.fillOpacity,
          }}
          isOpen={props.activeMenu === 'step-badge'}
          onChange={(stepBadge) => props.update({ stepBadge })}
          onClose={props.close}
          onDisable={() => {
            props.update({ stepBadge: null });
            props.close();
          }}
          settings={props.settings.stepBadge}
          {...(props.portalTarget ? { portalTarget: props.portalTarget } : {})}
        />
      ) : null}
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
