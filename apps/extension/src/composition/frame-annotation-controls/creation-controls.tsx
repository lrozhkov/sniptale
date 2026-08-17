import { useEffect, useRef, useState } from 'react';
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
import type { TemplateSourceControl } from './popover/template-source';

export type {
  FrameAnnotationCreationFramePopoverRenderArgs,
  FrameAnnotationCreationMenu,
  FrameAnnotationCreationSettings,
} from './contracts';

export function FrameAnnotationCreationControls(props: {
  activeMenu?: FrameAnnotationCreationMenu | null;
  context?: 'content' | 'editor';
  dataUi?: string;
  disabled?: boolean;
  enableCallout?: () => CalloutSettings;
  enableStepBadge?: () => StepBadgeSettings;
  frameActive?: boolean;
  onFrameActiveChange?: (active: boolean) => void;
  onChange: (settings: FrameAnnotationCreationSettings) => void;
  onMenuChange?: (menu: FrameAnnotationCreationMenu | null) => void;
  portalTarget?: HTMLElement | DocumentFragment | ShadowRoot;
  renderFramePopover?: FrameAnnotationCreationFramePopoverRenderer;
  settings: FrameAnnotationCreationSettings;
  showCallout?: boolean;
  showStepBadge?: boolean;
  calloutTemplateSourceControl?: TemplateSourceControl;
  stepBadgeTemplateSourceControl?: TemplateSourceControl;
}) {
  const { activeMenu: controlledActiveMenu, frameActive = true, onMenuChange } = props;
  const [internalActiveMenu, setInternalActiveMenu] = useState<FrameAnnotationCreationMenu | null>(
    null
  );
  const activeMenu = controlledActiveMenu === undefined ? internalActiveMenu : controlledActiveMenu;
  const frameRef = useRef<HTMLButtonElement>(null);
  const calloutRef = useRef<HTMLButtonElement>(null);
  const stepBadgeRef = useRef<HTMLButtonElement>(null);

  const update = (patch: Partial<FrameAnnotationCreationSettings>) =>
    props.onChange({ ...props.settings, ...patch });
  const setActiveMenu = (menu: FrameAnnotationCreationMenu | null) => {
    if (props.activeMenu === undefined) setInternalActiveMenu(menu);
    onMenuChange?.(menu);
  };
  const toggle = (menu: FrameAnnotationCreationMenu) =>
    setActiveMenu(activeMenu === menu ? null : menu);
  useEffect(() => {
    if (frameActive || activeMenu === null) return;
    if (controlledActiveMenu === undefined) setInternalActiveMenu(null);
    onMenuChange?.(null);
  }, [activeMenu, controlledActiveMenu, frameActive, onMenuChange]);
  const contentContext = props.context === 'content';
  const showCallout = props.showCallout ?? true;
  const showStepBadge = props.showStepBadge ?? true;

  const close = () => setActiveMenu(null);
  const createCallout = () => props.enableCallout?.() ?? createDefaultFrameCallout();
  const createStepBadge = () => props.enableStepBadge?.() ?? createDefaultFrameStepBadge();
  const toggleCallout = () => {
    const current = props.settings.callout;
    update({
      callout:
        current && current.enabled !== false
          ? null
          : current
            ? { ...current, enabled: true }
            : createCallout(),
    });
  };
  const toggleStepBadge = () => {
    const current = props.settings.stepBadge;
    update({
      stepBadge:
        current && current.enabled !== false
          ? null
          : current
            ? { ...current, enabled: true }
            : createStepBadge(),
    });
  };
  const openCalloutMenu = () => {
    if (!props.settings.callout) update({ callout: { ...createCallout(), enabled: false } });
    toggle('callout');
  };
  const openStepBadgeMenu = () => {
    if (!props.settings.stepBadge) {
      update({ stepBadge: { ...createStepBadge(), enabled: false } });
    }
    toggle('step-badge');
  };
  const buttonGroups = (
    <>
      <FrameStyleCreationButton
        activeMenu={activeMenu}
        contentContext={contentContext}
        disabled={props.disabled ?? false}
        {...(props.dataUi ? { dataUi: props.dataUi } : {})}
        frameRef={frameRef}
        frameActive={frameActive}
        onToggleFrame={() => props.onFrameActiveChange?.(!frameActive)}
        settings={props.settings}
        toggle={toggle}
      />
      <AnnotationCreationButtons
        activeMenu={activeMenu}
        calloutRef={calloutRef}
        contentContext={contentContext}
        disabled={props.disabled ?? false}
        onCalloutMenu={openCalloutMenu}
        onStepBadgeMenu={openStepBadgeMenu}
        onToggleCallout={toggleCallout}
        onToggleStepBadge={toggleStepBadge}
        settings={props.settings}
        showCallout={frameActive && showCallout}
        showStepBadge={frameActive && showStepBadge}
        stepBadgeRef={stepBadgeRef}
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
        showCallout={frameActive && showCallout}
        showStepBadge={frameActive && showStepBadge}
        stepBadgeRef={stepBadgeRef}
        update={update}
        {...(props.portalTarget ? { portalTarget: props.portalTarget } : {})}
        {...(props.renderFramePopover ? { renderFramePopover: props.renderFramePopover } : {})}
        {...(props.calloutTemplateSourceControl
          ? { calloutTemplateSourceControl: props.calloutTemplateSourceControl }
          : {})}
        {...(props.stepBadgeTemplateSourceControl
          ? { stepBadgeTemplateSourceControl: props.stepBadgeTemplateSourceControl }
          : {})}
      />
    </>
  );
}
