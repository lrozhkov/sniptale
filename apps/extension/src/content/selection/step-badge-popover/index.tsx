import { useAppLocale } from '../../../platform/i18n';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePopoverAdapter } from './adapter';
import { StepBadgePopoverEnabledContent } from '../../../composition/frame-annotation-controls/step-badge/enabled-content';
import { useStepBadgePopoverState } from './state';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import { useStepBadgePresetPopoverController } from '../../../composition/frame-annotation-controls/step-badge/preset-controller';
import { createStepBadgeTemplateFromSettings } from '../../../features/highlighter/step-badge-presets/catalog';
import { getLinkedStepBadgeDiameter } from '../../../features/highlighter/step-badge-presets/style';
import { useFloatingPopoverDrag } from '../../../composition/frame-annotation-controls/popover/drag';
import {
  SETTINGS_POPOVER_HEIGHT,
  SETTINGS_POPOVER_WIDTH,
} from '../../../composition/frame-annotation-controls/popover/surface';
import { usePopoverInteractionDismissal } from '../../../composition/frame-annotation-controls/popover/interaction-dismissal';
import { dispatchStepBadgeReorder } from '../../platform/page-context/frame-events';

interface StepBadgePopoverProps {
  anchorEl: HTMLElement | null;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  isOpen: boolean;
  onClose: () => void;
  stepBadge?: StepBadgeSettings;
  frameVisuals?: {
    borderColor: string;
    borderWidth: number;
    fillColor?: string;
    fillOpacity?: number;
  };
}

function useStepBadgePopoverPresentation(args: {
  anchorEl: HTMLElement | null;
  frameId: string;
  frameRect: StepBadgePopoverProps['frameRect'];
  isOpen: boolean;
  popoverRef: ReturnType<typeof useStepBadgePopoverState>['popoverRef'];
}) {
  const canonicalStyle = useFramePopoverPosition({
    anchorEl: args.anchorEl,
    fallbackSize: { width: SETTINGS_POPOVER_WIDTH, height: SETTINGS_POPOVER_HEIGHT },
    frameId: args.frameId,
    frameRect: args.frameRect,
    isOpen: args.isOpen,
    popoverRef: args.popoverRef,
    quickControlPlacement: 'anchor-aligned',
  });
  const drag = useFloatingPopoverDrag({
    basePosition: {
      left: typeof canonicalStyle.left === 'number' ? canonicalStyle.left : 0,
      top: typeof canonicalStyle.top === 'number' ? canonicalStyle.top : 0,
    },
    isOpen: args.isOpen,
    popoverRef: args.popoverRef,
    resetKey: args.frameId,
  });

  return {
    drag,
    popoverStyle: { ...canonicalStyle, ...drag.position, width: SETTINGS_POPOVER_WIDTH },
  };
}

function StepBadgePopoverSurface(props: {
  dismissal: ReturnType<typeof usePopoverInteractionDismissal>;
  presentation: ReturnType<typeof useStepBadgePopoverPresentation>;
  presets: ReturnType<typeof useStepBadgePresetPopoverController>;
  request: StepBadgePopoverProps;
  state: ReturnType<typeof useStepBadgePopoverState>;
  templateSettings: ReturnType<typeof createStepBadgeTemplateFromSettings>;
  visuals: NonNullable<StepBadgePopoverProps['frameVisuals']>;
}) {
  const { anchorEl, frameId, isOpen, onClose } = props.request;
  return (
    <StepBadgePopoverAdapter
      anchorEl={anchorEl}
      getPopoverStyle={() => props.presentation.popoverStyle}
      isOpen={isOpen}
      popoverRef={props.state.popoverRef}
    >
      <StepBadgePopoverEnabledContent
        frameId={frameId}
        frameVisuals={props.visuals}
        headerContext="element"
        headerDrag={props.presentation.drag}
        isAuto={props.state.isAuto}
        localStepBadgeSettings={props.state.localStepBadgeSettings}
        onAlphabetChange={props.state.handleAlphabetChange}
        onAnchorChange={(anchor) => {
          if (anchor) props.state.handleAnchorChange(anchor);
        }}
        onApplyPreset={props.state.applyPreset}
        onForkPreset={props.state.forkPreset}
        onAutoModeChange={props.state.handleAutoModeChange}
        onCreatePreset={props.presets.catalog.create}
        onClose={onClose}
        onDisable={() => props.state.handleEnabledChange(false)}
        onFloatingInteractionChange={props.dismissal.onFloatingInteractionChange}
        onOffsetToggle={props.state.handleOffsetToggle}
        onResetPreset={(preset) => void props.presets.catalog.reset(preset)}
        onReorder={(direction, ownedFrameId) =>
          dispatchStepBadgeReorder({ direction, frameId: ownedFrameId })
        }
        onShowPresets={props.presets.catalog.refresh}
        onSettingsChange={props.state.handleSettingsChange}
        onTogglePreset={(preset) => void props.presets.catalog.toggle(preset)}
        onTemplateCreated={props.state.markTemplateCreated}
        onTypeChange={(type) => props.state.handleTypeChange(type)}
        onUpdatePreset={props.presets.catalog.update}
        onValueChange={props.state.handleValueChange}
        pendingPresetIds={props.presets.catalog.pending}
        presetError={props.presets.catalog.error}
        presets={props.presets.catalog.visiblePresets}
        templateSettings={props.templateSettings}
      />
    </StepBadgePopoverAdapter>
  );
}

export function StepBadgePopover(props: StepBadgePopoverProps) {
  const { anchorEl, frameId, frameRect, frameVisuals, isOpen, onClose, stepBadge } = props;
  useAppLocale();
  const presets = useStepBadgePresetPopoverController(isOpen);
  const dismissal = usePopoverInteractionDismissal({ blocked: presets.editor.isOpen, isOpen });
  const stepBadgeState = useStepBadgePopoverState({
    anchorEl,
    frameId,
    isDismissalEnabled: dismissal.isDismissalEnabled,
    isOpen,
    onClose,
    ...(stepBadge === undefined ? {} : { stepBadge }),
  });
  const { popoverRef } = stepBadgeState;
  const presentation = useStepBadgePopoverPresentation({
    anchorEl,
    frameId,
    frameRect,
    isOpen,
    popoverRef,
  });
  const visuals = frameVisuals ?? { borderColor: '#f97316', borderWidth: 4 };
  const templateSettings = createStepBadgeTemplateFromSettings(
    stepBadgeState.localStepBadgeSettings,
    getLinkedStepBadgeDiameter(visuals.borderWidth)
  );
  return (
    <StepBadgePopoverSurface
      dismissal={dismissal}
      presentation={presentation}
      presets={presets}
      request={props}
      state={stepBadgeState}
      templateSettings={templateSettings}
      visuals={visuals}
    />
  );
}
