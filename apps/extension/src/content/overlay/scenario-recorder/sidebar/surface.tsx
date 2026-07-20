import type { MouseEventHandler, RefObject } from 'react';
import { translate } from '../../../../platform/i18n';
import { ScenarioRecorderSidebarHeader } from './header';
import { ScenarioRecorderSidebarStepCard } from './step-card';
import type { ScenarioRecorderSidebarStep } from './types';

interface ScenarioRecorderSidebarStepListProps {
  dragStepId: string | null;
  highlightedStepId: string | null;
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  onMoveStep: (stepId: string, toIndex: number) => void;
  onPreviewOpen: (step: ScenarioRecorderSidebarStep) => void;
  recentSteps: ScenarioRecorderSidebarStep[];
  setDragStepId: (stepId: string | null) => void;
  stepsContainerRef: RefObject<HTMLDivElement | null>;
}

function ScenarioRecorderStepList(props: ScenarioRecorderSidebarStepListProps) {
  return (
    <div
      ref={props.stepsContainerRef}
      className="grid min-w-0 max-h-[420px] gap-2 overflow-auto pr-1"
    >
      {props.recentSteps.map((step, index) => (
        <ScenarioRecorderSidebarStepCard
          key={step.id}
          dragStepId={props.dragStepId}
          highlightedStepId={props.highlightedStepId}
          index={index}
          onDeleteStep={props.onDeleteStep}
          onInspectStep={props.onInspectStep}
          onMoveStep={props.onMoveStep}
          onPreviewOpen={props.onPreviewOpen}
          setDragStepId={props.setDragStepId}
          step={step}
        />
      ))}
    </div>
  );
}

function ScenarioRecorderSidebarFooter(props: { onOpenEditor: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onOpenEditor}
      data-ui="content.scenario.sidebar.open-editor"
      className="inline-flex min-w-0 w-full items-center justify-center overflow-hidden rounded-[14px]
        border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_54%,transparent)]
        px-4 py-3 text-sm font-semibold text-[var(--sniptale-color-text-primary)] transition
        hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_72%,transparent)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]"
    >
      {translate('scenario.content.openEditorCta')}
    </button>
  );
}

function getScenarioRecorderSidebarSurfaceClassName(dragging: boolean) {
  return [
    'pointer-events-auto fixed z-40 grid min-w-0 w-[336px] gap-3 overflow-hidden rounded-[22px] border p-3',
    'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
    'shadow-[0_18px_38px_color-mix(in_srgb,var(--sniptale-color-overlay)_14%,transparent)]',
    dragging
      ? 'select-none shadow-[0_22px_48px_color-mix(in_srgb,var(--sniptale-color-overlay)_22%,transparent)]'
      : '',
  ].join(' ');
}

function getScenarioRecorderSidebarSurfaceStyle(position: { x: number; y: number }) {
  return {
    zIndex: 2147483646,
    top: `${position.y}px`,
    left: `${position.x}px`,
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
    <div className="relative min-w-0">
      <ScenarioRecorderStepList
        dragStepId={props.dragStepId}
        highlightedStepId={props.highlightedStepId}
        onDeleteStep={props.onDeleteStep}
        onInspectStep={props.onInspectStep}
        onMoveStep={props.onMoveStep}
        onPreviewOpen={props.onPreviewOpen}
        recentSteps={props.recentSteps}
        setDragStepId={props.setDragStepId}
        stepsContainerRef={props.stepsContainerRef}
      />
    </div>
  );
}

export function ScenarioRecorderSidebarSurface(props: {
  dragging: boolean;
  dragStepId: string | null;
  highlightedStepId: string | null;
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  onMoveStep: (stepId: string, toIndex: number) => void;
  onOpenEditor: () => void;
  onPreviewOpen: (step: ScenarioRecorderSidebarStep) => void;
  onSidebarHeaderMouseDown: MouseEventHandler<HTMLDivElement>;
  position: { x: number; y: number };
  projectName: string | null;
  recentSteps: ScenarioRecorderSidebarStep[];
  setDragStepId: (stepId: string | null) => void;
  sidebarRef: RefObject<HTMLElement | null>;
  stepsContainerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <aside
      ref={props.sidebarRef}
      data-ui="content.scenario.sidebar"
      style={getScenarioRecorderSidebarSurfaceStyle(props.position)}
      className={getScenarioRecorderSidebarSurfaceClassName(props.dragging)}
    >
      <ScenarioRecorderSidebarHeader
        dragging={props.dragging}
        onMouseDown={props.onSidebarHeaderMouseDown}
        projectName={props.projectName}
      />

      <ScenarioRecorderSidebarRecentSteps
        dragStepId={props.dragStepId}
        highlightedStepId={props.highlightedStepId}
        onDeleteStep={props.onDeleteStep}
        onInspectStep={props.onInspectStep}
        onMoveStep={props.onMoveStep}
        onPreviewOpen={props.onPreviewOpen}
        recentSteps={props.recentSteps}
        setDragStepId={props.setDragStepId}
        stepsContainerRef={props.stepsContainerRef}
      />

      <ScenarioRecorderSidebarFooter onOpenEditor={props.onOpenEditor} />
    </aside>
  );
}
