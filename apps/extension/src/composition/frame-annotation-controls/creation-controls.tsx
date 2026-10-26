import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import {
  AnnotationCreationButtons,
  FrameStyleCreationButton,
  type FrameAnnotationMenuDirectionResolver,
} from './creation-buttons';
import { FrameAnnotationPopoverMeasurementContext } from './popover/position';
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
  /** Presentation owner may place frame and annotation controls in independent toolbar slots. */
  renderFrameControl?: ((control: ReactNode) => ReactNode) | undefined;
  groupAnnotations?: boolean | undefined;
  renderAnnotationControl?:
    | ((menu: 'callout' | 'step-badge', control: ReactNode) => ReactNode)
    | undefined;
  activeMenu?: FrameAnnotationCreationMenu | null;
  allowInactiveFrameMenu?: boolean;
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
  resolveMenuDirection?: FrameAnnotationMenuDirectionResolver;
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
  const [, refreshMeasurements] = useReducer((value) => value + 1, 0);

  const update = (patch: Partial<FrameAnnotationCreationSettings>) =>
    props.onChange({ ...props.settings, ...patch });
  const setActiveMenu = (menu: FrameAnnotationCreationMenu | null) => {
    if (props.activeMenu === undefined) setInternalActiveMenu(menu);
    onMenuChange?.(menu);
  };
  const toggle = (menu: FrameAnnotationCreationMenu) =>
    setActiveMenu(activeMenu === menu ? null : menu);
  useEffect(() => {
    if (
      frameActive ||
      activeMenu === null ||
      (props.allowInactiveFrameMenu && activeMenu === 'frame')
    )
      return;
    if (controlledActiveMenu === undefined) setInternalActiveMenu(null);
    onMenuChange?.(null);
  }, [activeMenu, controlledActiveMenu, frameActive, onMenuChange, props.allowInactiveFrameMenu]);
  const contentContext = props.context === 'content';
  const showCallout = props.showCallout ?? true;
  const showStepBadge = props.showStepBadge ?? true;

  const close = () => setActiveMenu(null);
  const createCallout = () => props.enableCallout?.() ?? createDefaultFrameCallout();
  const createStepBadge = () => props.enableStepBadge?.() ?? createDefaultFrameStepBadge();
  const toggleCallout = () =>
    update({ callout: toggleCreationAnnotation(props.settings.callout, createCallout) });
  const toggleStepBadge = () =>
    update({ stepBadge: toggleCreationAnnotation(props.settings.stepBadge, createStepBadge) });
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
        renderControl={props.renderFrameControl}
        activeMenu={activeMenu}
        contentContext={contentContext}
        disabled={props.disabled ?? false}
        {...(props.dataUi ? { dataUi: props.dataUi } : {})}
        frameRef={frameRef}
        frameActive={frameActive}
        onToggleFrame={() => props.onFrameActiveChange?.(!frameActive)}
        onEffectModeChange={(effectMode) => update({ effectMode })}
        settings={props.settings}
        toggle={toggle}
        resolveMenuDirection={contentContext ? props.resolveMenuDirection : undefined}
      />
      <AnnotationCreationButtons
        grouped={props.groupAnnotations}
        renderControl={props.renderAnnotationControl}
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
        resolveMenuDirection={contentContext ? props.resolveMenuDirection : undefined}
      />
    </>
  );
  return (
    <FrameAnnotationPopoverMeasurementContext value={contentContext ? refreshMeasurements : null}>
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
    </FrameAnnotationPopoverMeasurementContext>
  );
}

/** Enabling preserves a configured annotation; disabling preserves the existing null reset. */
function toggleCreationAnnotation<T extends { enabled?: boolean }>(
  current: T | null,
  create: () => T
): T | null {
  if (current && current.enabled !== false) return null;
  return current ? { ...current, enabled: true } : create();
}
