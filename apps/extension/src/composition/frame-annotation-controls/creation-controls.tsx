import { useRef, useState } from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import { AnnotationCreationButtons, FrameStyleCreationButton } from './creation-buttons';
import { FrameCreationPopovers } from './creation-popovers';
import type {
  FrameAnnotationCreationFramePopoverRenderer,
  FrameAnnotationCreationMenu,
  FrameAnnotationCreationSettings,
} from './contracts';

export type {
  FrameAnnotationCreationFramePopoverRenderArgs,
  FrameAnnotationCreationMenu,
  FrameAnnotationCreationSettings,
} from './contracts';

export function FrameAnnotationCreationControls(props: {
  activeMenu?: FrameAnnotationCreationMenu | null;
  context?: 'content' | 'editor';
  dataUi?: string;
  enableCallout?: () => CalloutSettings;
  enableStepBadge?: () => StepBadgeSettings;
  onChange: (settings: FrameAnnotationCreationSettings) => void;
  onMenuChange?: (menu: FrameAnnotationCreationMenu | null) => void;
  portalTarget?: HTMLElement | DocumentFragment | ShadowRoot;
  renderFramePopover?: FrameAnnotationCreationFramePopoverRenderer;
  settings: FrameAnnotationCreationSettings;
  showCallout?: boolean;
  showStepBadge?: boolean;
}) {
  const [internalActiveMenu, setInternalActiveMenu] = useState<FrameAnnotationCreationMenu | null>(
    null
  );
  const activeMenu = props.activeMenu === undefined ? internalActiveMenu : props.activeMenu;
  const frameRef = useRef<HTMLButtonElement>(null);
  const calloutRef = useRef<HTMLButtonElement>(null);
  const stepBadgeRef = useRef<HTMLButtonElement>(null);

  const update = (patch: Partial<FrameAnnotationCreationSettings>) =>
    props.onChange({ ...props.settings, ...patch });
  const setActiveMenu = (menu: FrameAnnotationCreationMenu | null) => {
    if (props.activeMenu === undefined) setInternalActiveMenu(menu);
    props.onMenuChange?.(menu);
  };
  const toggle = (menu: FrameAnnotationCreationMenu) =>
    setActiveMenu(activeMenu === menu ? null : menu);
  const contentContext = props.context === 'content';
  const showCallout = props.showCallout ?? true;
  const showStepBadge = props.showStepBadge ?? true;

  const close = () => setActiveMenu(null);
  const enableCallout = () => {
    update({ callout: props.enableCallout?.() ?? createDefaultFrameCallout() });
    setActiveMenu('callout');
  };
  const enableStepBadge = () => {
    update({ stepBadge: props.enableStepBadge?.() ?? createDefaultFrameStepBadge() });
    setActiveMenu('step-badge');
  };
  const buttonGroups = (
    <>
      <FrameStyleCreationButton
        activeMenu={activeMenu}
        contentContext={contentContext}
        {...(props.dataUi ? { dataUi: props.dataUi } : {})}
        frameRef={frameRef}
        settings={props.settings}
        toggle={toggle}
      />
      <AnnotationCreationButtons
        activeMenu={activeMenu}
        calloutRef={calloutRef}
        contentContext={contentContext}
        enableCallout={enableCallout}
        enableStepBadge={enableStepBadge}
        settings={props.settings}
        showCallout={showCallout}
        showStepBadge={showStepBadge}
        stepBadgeRef={stepBadgeRef}
        toggle={toggle}
      />
    </>
  );
  return (
    <>
      {buttonGroups}
      <FrameCreationPopovers
        activeMenu={activeMenu}
        calloutRef={calloutRef}
        close={close}
        frameRef={frameRef}
        settings={props.settings}
        showCallout={showCallout}
        showStepBadge={showStepBadge}
        stepBadgeRef={stepBadgeRef}
        update={update}
        {...(props.portalTarget ? { portalTarget: props.portalTarget } : {})}
        {...(props.renderFramePopover ? { renderFramePopover: props.renderFramePopover } : {})}
      />
    </>
  );
}
