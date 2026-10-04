import { getControlIconButtonClassName } from '@sniptale/ui/control-language';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { AppWindow } from 'lucide-react';
import type { MouseEvent, MouseEventHandler, RefObject } from 'react';
import { translate } from '../../../../platform/i18n';
import { ScenarioRecorderSidebarHeader } from './header';
import {
  ScenarioSidebarCaptureMode,
  ScenarioSidebarProjectPicker,
  type ScenarioSidebarControlsProps,
} from './controls';
import { ScenarioRecorderSidebarStepCard } from './step-card';
import type { ScenarioRecorderSidebarStep } from './types';

interface ScenarioRecorderSidebarStepListProps {
  highlightedStepId: string | null;
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  onMoveStep: (stepId: string, toIndex: number) => void;
  onPreviewOpen: (step: ScenarioRecorderSidebarStep) => void;
  recentSteps: ScenarioRecorderSidebarStep[];
  stepsContainerRef: RefObject<HTMLDivElement | null>;
}

function ScenarioRecorderStepList(props: ScenarioRecorderSidebarStepListProps) {
  return (
    <div
      ref={props.stepsContainerRef}
      className="grid min-w-0 min-h-0 max-h-[420px] gap-2 overflow-auto pr-1"
    >
      {props.recentSteps.map((step, index) => (
        <ScenarioRecorderSidebarStepCard
          key={step.id}
          highlightedStepId={props.highlightedStepId}
          moveUpIndex={props.recentSteps[index - 1]?.position ?? null}
          moveDownIndex={props.recentSteps[index + 1]?.position ?? null}
          onDeleteStep={props.onDeleteStep}
          onInspectStep={props.onInspectStep}
          onMoveStep={props.onMoveStep}
          onPreviewOpen={props.onPreviewOpen}
          step={step}
        />
      ))}
    </div>
  );
}

function ScenarioRecorderSidebarFooter(props: {
  onFinish: () => void;
  onCaptureVisible: (event: MouseEvent<HTMLButtonElement>) => Promise<void>;
  captureBusy: boolean;
  finishBusy: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
      <button
        type="button"
        onClick={(event) => void props.onCaptureVisible(event)}
        disabled={props.captureBusy}
        aria-busy={props.captureBusy}
        data-ui="content.scenario.sidebar.capture-visible"
        aria-label={translate('content.toolbar.visibleArea')}
        title={translate('content.toolbar.visibleArea')}
        className={getControlIconButtonClassName({ density: 'compact' })}
      >
        <AppWindow aria-hidden="true" size={18} />
      </button>
      <ProductActionButton
        tone="primary"
        disabled={props.captureBusy}
        aria-busy={props.finishBusy}
        onClick={props.onFinish}
        data-ui="content.scenario.sidebar.finish"
        className="min-w-0 w-full"
      >
        {translate(props.finishBusy ? 'scenario.content.finishing' : 'scenario.content.finish')}
      </ProductActionButton>
    </div>
  );
}

function getScenarioRecorderSidebarSurfaceClassName(dragging: boolean) {
  return [
    'sniptale-scenario-recorder-sidebar pointer-events-auto fixed z-40 flex min-w-0 flex-col',
    'w-[336px] max-h-[calc(100vh-24px)] gap-3 overflow-hidden rounded-[22px] border p-3',
    'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
    'shadow-[0_18px_38px_color-mix(in_srgb,var(--sniptale-color-overlay)_14%,transparent)]',
    dragging
      ? 'select-none shadow-[0_22px_48px_color-mix(in_srgb,var(--sniptale-color-overlay)_22%,transparent)]'
      : '',
  ].join(' ');
}

function getScenarioRecorderSidebarSurfaceStyle(
  position: { x: number; y: number },
  uiScale: number
) {
  return {
    zIndex: 2147483646,
    top: `${position.y * uiScale}px`,
    left: `${position.x * uiScale}px`,
  };
}

function ScenarioRecorderSidebarRecentSteps(props: ScenarioRecorderSidebarStepListProps) {
  if (props.recentSteps.length === 0) {
    return (
      <p
        className="rounded-[18px] border border-dashed border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_34%,transparent)]
          p-4 text-sm text-[var(--sniptale-color-text-muted)]"
      >
        {translate('scenario.content.sidebarEmpty')}
      </p>
    );
  }

  return (
    <div className="relative min-w-0 min-h-0 overflow-auto">
      <ScenarioRecorderStepList
        highlightedStepId={props.highlightedStepId}
        onDeleteStep={props.onDeleteStep}
        onInspectStep={props.onInspectStep}
        onMoveStep={props.onMoveStep}
        onPreviewOpen={props.onPreviewOpen}
        recentSteps={props.recentSteps}
        stepsContainerRef={props.stepsContainerRef}
      />
    </div>
  );
}

export function ScenarioRecorderSidebarSurface(
  props: ScenarioSidebarControlsProps & {
    dragging: boolean;
    highlightedStepId: string | null;
    onDeleteStep: (stepId: string) => void;
    onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
    onMoveStep: (stepId: string, toIndex: number) => void;
    onFinish: () => void;
    onCollapse: (event: MouseEvent<HTMLButtonElement>) => void;
    onCaptureVisible: (event: MouseEvent<HTMLButtonElement>) => Promise<void>;
    captureBusy: boolean;
    finishBusy: boolean;
    onPreviewOpen: (step: ScenarioRecorderSidebarStep) => void;
    onSidebarHeaderMouseDown: MouseEventHandler<HTMLDivElement>;
    onProjectMenuToggle: () => void;
    onProjectMenuClose: () => void;
    projectMenuOpen: boolean;
    position: { x: number; y: number };
    projectName: string | null;
    recentSteps: ScenarioRecorderSidebarStep[];
    sidebarRef: RefObject<HTMLElement | null>;
    uiScale?: number;
    stepsContainerRef: RefObject<HTMLDivElement | null>;
  }
) {
  return (
    <aside
      ref={props.sidebarRef}
      data-ui="content.scenario.sidebar"
      style={getScenarioRecorderSidebarSurfaceStyle(props.position, props.uiScale ?? 1)}
      className={getScenarioRecorderSidebarSurfaceClassName(props.dragging)}
    >
      <fieldset disabled={props.finishBusy} className="contents">
        <ScenarioRecorderSidebarHeader
          dragging={props.dragging}
          onCollapse={props.onCollapse}
          onMouseDown={props.onSidebarHeaderMouseDown}
          onProjectMenuToggle={props.onProjectMenuToggle}
          projectMenuOpen={props.projectMenuOpen}
          projectName={props.projectName}
        />

        {props.projectMenuOpen ? (
          <ScenarioSidebarProjectPicker {...props} onClose={props.onProjectMenuClose} />
        ) : null}
        <ScenarioSidebarCaptureMode {...props} />

        <ScenarioRecorderSidebarRecentSteps
          highlightedStepId={props.highlightedStepId}
          onDeleteStep={props.onDeleteStep}
          onInspectStep={props.onInspectStep}
          onMoveStep={props.onMoveStep}
          onPreviewOpen={props.onPreviewOpen}
          recentSteps={props.recentSteps}
          stepsContainerRef={props.stepsContainerRef}
        />

        <ScenarioRecorderSidebarFooter
          onFinish={props.onFinish}
          onCaptureVisible={props.onCaptureVisible}
          captureBusy={props.captureBusy}
          finishBusy={props.finishBusy}
        />
      </fieldset>
    </aside>
  );
}
