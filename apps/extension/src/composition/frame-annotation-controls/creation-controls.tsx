import type { StandaloneAnnotationCreationOptions } from '../../features/highlighter/contracts';
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

type FrameAnnotationCreationControlsProps = {
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
  onStandaloneCreationChange?: (options: StandaloneAnnotationCreationOptions | null) => void;
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
};

export function FrameAnnotationCreationControls(props: FrameAnnotationCreationControlsProps) {
  const { activeMenu: controlledActiveMenu, frameActive = true, onMenuChange } = props;
  const [internalActiveMenu, setInternalActiveMenu] = useState<FrameAnnotationCreationMenu | null>(
    null
  );
  const activeMenu = controlledActiveMenu === undefined ? internalActiveMenu : controlledActiveMenu;
  const standalone = useStandaloneCreationSelection(props.onStandaloneCreationChange);
  const { tool: standaloneTool, select: selectStandalone } = standalone;
  const supportsStandalone = props.onStandaloneCreationChange !== undefined;
  const standaloneActive = !frameActive && supportsStandalone;

  const frameRef = useRef<HTMLButtonElement>(null);
  const calloutRef = useRef<HTMLButtonElement>(null);
  const stepBadgeRef = useRef<HTMLButtonElement>(null);
  const [, refreshMeasurements] = useReducer((value) => value + 1, 0);

  const update = (patch: Partial<FrameAnnotationCreationSettings>) => {
    props.onChange({ ...props.settings, ...patch });
    if (
      !frameActive &&
      ((standaloneTool === 'callout' && patch.callout === null) ||
        (standaloneTool === 'step-badge' && patch.stepBadge === null))
    )
      selectStandalone(null);
  };
  const setActiveMenu = (menu: FrameAnnotationCreationMenu | null) => {
    if (props.activeMenu === undefined) setInternalActiveMenu(menu);
    onMenuChange?.(menu);
  };
  const toggle = (menu: FrameAnnotationCreationMenu) =>
    setActiveMenu(activeMenu === menu ? null : menu);
  useEffect(() => {
    if (
      frameActive ||
      supportsStandalone ||
      activeMenu === null ||
      (props.allowInactiveFrameMenu && activeMenu === 'frame')
    )
      return;
    if (controlledActiveMenu === undefined) setInternalActiveMenu(null);
    onMenuChange?.(null);
  }, [
    activeMenu,
    controlledActiveMenu,
    frameActive,
    onMenuChange,
    props.allowInactiveFrameMenu,
    supportsStandalone,
  ]);
  const contentContext = props.context === 'content';
  const showCallout = (frameActive || supportsStandalone) && (props.showCallout ?? true);
  const showStepBadge = (frameActive || supportsStandalone) && (props.showStepBadge ?? true);

  const close = () => setActiveMenu(null);
  const createCallout = () => props.enableCallout?.() ?? createDefaultFrameCallout();
  const createStepBadge = () => props.enableStepBadge?.() ?? createDefaultFrameStepBadge();
  const toggleCallout = () => {
    if (standaloneActive) {
      if (!props.settings.callout) update({ callout: createCallout() });
      selectStandalone(standaloneTool === 'callout' ? null : 'callout');
    } else update({ callout: toggleCreationAnnotation(props.settings.callout, createCallout) });
  };
  const toggleStepBadge = () => {
    if (standaloneActive) {
      if (!props.settings.stepBadge) update({ stepBadge: createStepBadge() });
      selectStandalone(standaloneTool === 'step-badge' ? null : 'step-badge');
    } else
      update({ stepBadge: toggleCreationAnnotation(props.settings.stepBadge, createStepBadge) });
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
        renderControl={props.renderFrameControl}
        activeMenu={activeMenu}
        contentContext={contentContext}
        disabled={props.disabled ?? false}
        {...(props.dataUi ? { dataUi: props.dataUi } : {})}
        frameRef={frameRef}
        frameActive={frameActive}
        onToggleFrame={() => {
          standalone.reset();
          props.onFrameActiveChange?.(!frameActive);
        }}
        onEffectModeChange={(effectMode) => update({ effectMode })}
        settings={props.settings}
        toggle={toggle}
        resolveMenuDirection={contentContext ? props.resolveMenuDirection : undefined}
      />
      <AnnotationCreationButtons
        {...(standaloneActive
          ? {
              calloutActive: standaloneTool === 'callout',
              stepBadgeActive: standaloneTool === 'step-badge',
            }
          : {})}
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
        showCallout={showCallout}
        showStepBadge={showStepBadge}
        stepBadgeRef={stepBadgeRef}
        resolveMenuDirection={contentContext ? props.resolveMenuDirection : undefined}
      />
    </>
  );
  return (
    <FrameAnnotationPopoverMeasurementContext value={contentContext ? refreshMeasurements : null}>
      {buttonGroups}
      <FrameCreationPopovers
        {...(standaloneActive ? { creationPlacement: standalone.placementControl } : {})}
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
        {...(frameActive && props.calloutTemplateSourceControl
          ? { calloutTemplateSourceControl: props.calloutTemplateSourceControl }
          : {})}
        {...(frameActive && props.stepBadgeTemplateSourceControl
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

function useStandaloneCreationSelection(
  onChange: FrameAnnotationCreationControlsProps['onStandaloneCreationChange']
) {
  const [tool, setTool] = useState<StandaloneAnnotationCreationOptions['annotationKind'] | null>(
    null
  );
  const [placement, setPlacement] =
    useState<StandaloneAnnotationCreationOptions['placement']>('element');
  return {
    tool,
    reset: () => setTool(null),
    select: (next: StandaloneAnnotationCreationOptions['annotationKind'] | null) => {
      setTool(next);
      onChange?.(next ? { annotationKind: next, placement } : null);
    },
    placementControl: {
      value: placement,
      onChange: (value: StandaloneAnnotationCreationOptions['placement']) => {
        setPlacement(value);
        if (tool) onChange?.({ annotationKind: tool, placement: value });
      },
    },
  };
}
