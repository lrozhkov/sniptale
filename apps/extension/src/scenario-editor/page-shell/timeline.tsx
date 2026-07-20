import { Eye, EyeOff, Layers3, MousePointerClick } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ScenarioSlideBuildStepSummary } from '../project/stage-render/slide';
import { getScenarioSlideBuildStepSummaries } from '../project/stage-render/slide';
import type { ScenarioElement, ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { cx } from '../../ui/compact-inspector-controls';

type SelectedElementState = 'entering' | 'exiting' | 'hidden' | 'visible';

export function ScenarioBuildTimeline(props: {
  clickIndex: number;
  embedded?: boolean;
  onClickIndexChange: (clickIndex: number) => void;
  selectedElementId: string | null;
  slide: ScenarioSlide;
}) {
  const summaries = getScenarioSlideBuildStepSummaries(props.slide);
  const selectedElement = getSelectedTimelineElement(props.slide, props.selectedElementId);

  return (
    <div
      data-ui="scenario.editor.build-timeline"
      className={cx(
        props.embedded ? 'grid gap-1.5 p-2.5 pr-10' : 'grid gap-2 p-3',
        !props.embedded &&
          `absolute bottom-5 left-1/2 w-[min(760px,calc(100%-2rem))] -translate-x-1/2
          rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] shadow-[0_16px_34px_rgba(15,23,42,0.12)]`
      )}
    >
      <TimelineHeader clickIndex={props.clickIndex} slide={props.slide} />
      <div
        className={cx('grid overflow-x-auto pb-1', props.embedded ? 'gap-1.5' : 'gap-2')}
        style={{
          gridTemplateColumns: `repeat(${summaries.length}, minmax(${
            props.embedded ? 34 : 42
          }px, 1fr))`,
        }}
      >
        {summaries.map((summary) => (
          <TimelineStepButton
            key={summary.clickIndex}
            active={summary.clickIndex === props.clickIndex}
            compact={props.embedded ?? false}
            onClick={() => props.onClickIndexChange(summary.clickIndex)}
            selectedElementId={props.selectedElementId}
            summary={summary}
          />
        ))}
      </div>
      <TimelineSelectedElement element={selectedElement} summaries={summaries} />
    </div>
  );
}

function TimelineHeader(props: { clickIndex: number; slide: ScenarioSlide }) {
  const buildElements = props.slide.elements.filter(hasBuildTiming).length;

  return (
    <div className="flex items-center justify-between gap-3">
      <ValueBadge className="gap-1">
        <MousePointerClick className="h-3.5 w-3.5" />
        {translate('scenario.editor.buildTimeline')}
      </ValueBadge>
      <div className="flex min-w-0 items-center gap-2">
        <ValueBadge title={translate('scenario.editor.visibleElements')}>
          {buildElements}/{props.slide.elements.length}
        </ValueBadge>
        <ValueBadge>
          {props.clickIndex}/{props.slide.clicks.count}
        </ValueBadge>
      </div>
    </div>
  );
}

function TimelineStepButton(props: {
  active: boolean;
  compact: boolean;
  onClick: () => void;
  selectedElementId: string | null;
  summary: ScenarioSlideBuildStepSummary;
}) {
  const selectedState = getSelectedElementState(props.summary, props.selectedElementId);

  return (
    <button
      type="button"
      aria-label={`${translate('scenario.editor.buildStep')} ${props.summary.clickIndex}`}
      data-active={props.active ? 'true' : 'false'}
      data-selected-element-state={selectedState}
      onClick={props.onClick}
      className={cx(
        'group grid min-w-0 gap-1 rounded-[7px] border px-2 text-left transition',
        props.compact ? 'py-1.5' : 'py-2',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
        'hover:border-[var(--sniptale-color-border-accent-strong)]',
        props.active &&
          'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]'
      )}
    >
      <TimelineStepMarker
        active={props.active}
        compact={props.compact}
        state={selectedState}
        summary={props.summary}
      />
      <TimelineStepActivity summary={props.summary} />
    </button>
  );
}

function TimelineStepMarker(props: {
  active: boolean;
  compact: boolean;
  state: SelectedElementState | null;
  summary: ScenarioSlideBuildStepSummary;
}) {
  return (
    <span className="flex items-center justify-between gap-1">
      <span
        className={cx(
          'flex items-center justify-center rounded-full text-xs font-semibold',
          props.compact ? 'h-6 w-6' : 'h-7 w-7',
          props.active
            ? 'bg-[var(--sniptale-color-accent)] text-white'
            : 'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]'
        )}
      >
        {props.summary.clickIndex}
      </span>
      <TimelineSelectedElementDot state={props.state} />
    </span>
  );
}

function TimelineSelectedElementDot(props: { state: SelectedElementState | null }) {
  if (!props.state) {
    return null;
  }

  return (
    <span
      title={translate(getSelectedElementStateLabelKey(props.state))}
      className={cx(
        'h-2.5 w-2.5 rounded-full border border-[var(--sniptale-color-surface-panel)]',
        props.state === 'hidden' && 'bg-[var(--sniptale-color-text-muted)]',
        props.state === 'visible' && 'bg-[var(--sniptale-color-success)]',
        props.state === 'entering' && 'bg-[var(--sniptale-color-accent)]',
        props.state === 'exiting' && 'bg-[var(--sniptale-color-warning)]'
      )}
    />
  );
}

function TimelineStepActivity(props: { summary: ScenarioSlideBuildStepSummary }) {
  return (
    <span className="flex items-center justify-between gap-1 text-[11px]">
      <span className="inline-flex items-center gap-1 text-[var(--sniptale-color-text-secondary)]">
        <Eye className="h-3 w-3" />
        {props.summary.visibleElementIds.length}
      </span>
      <span className="inline-flex items-center gap-1 text-[var(--sniptale-color-text-muted)]">
        <EyeOff className="h-3 w-3" />
        {props.summary.hiddenElementIds.length}
      </span>
      <span className="text-[var(--sniptale-color-accent)]">
        +{props.summary.enteringElementIds.length}
      </span>
      <span className="text-[var(--sniptale-color-warning)]">
        -{props.summary.exitingElementIds.length}
      </span>
    </span>
  );
}

function TimelineSelectedElement(props: {
  element: ScenarioElement | null;
  summaries: ScenarioSlideBuildStepSummary[];
}) {
  if (!props.element) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-2">
      <ValueBadge className="gap-1">
        <Layers3 className="h-3.5 w-3.5" />
        {translate('scenario.editor.selectedElementBuild')}
      </ValueBadge>
      <span className="truncate text-xs text-[var(--sniptale-color-text-secondary)]">
        {props.element.name}
      </span>
      <span className="ml-auto text-xs text-[var(--sniptale-color-text-muted)]">
        {formatElementBuildRange(props.element, props.summaries)}
      </span>
    </div>
  );
}

function getSelectedTimelineElement(slide: ScenarioSlide, elementId: string | null) {
  return elementId ? (slide.elements.find((element) => element.id === elementId) ?? null) : null;
}

function getSelectedElementState(
  summary: ScenarioSlideBuildStepSummary,
  elementId: string | null
): SelectedElementState | null {
  if (!elementId) {
    return null;
  }
  if (summary.enteringElementIds.includes(elementId)) {
    return 'entering';
  }
  if (summary.exitingElementIds.includes(elementId)) {
    return 'exiting';
  }
  return summary.visibleElementIds.includes(elementId) ? 'visible' : 'hidden';
}

function getSelectedElementStateLabelKey(state: SelectedElementState) {
  const keys = {
    entering: 'scenario.editor.elementEntering',
    exiting: 'scenario.editor.elementExiting',
    hidden: 'scenario.editor.elementHidden',
    visible: 'scenario.editor.elementVisible',
  } as const;

  return keys[state];
}

function formatElementBuildRange(
  element: ScenarioElement,
  summaries: ScenarioSlideBuildStepSummary[]
): string {
  const firstVisible = summaries.find((summary) => summary.visibleElementIds.includes(element.id));
  const lastVisible = summaries.findLast((summary) =>
    summary.visibleElementIds.includes(element.id)
  );
  const firstClick = firstVisible?.clickIndex ?? element.build.showAtClick;
  const lastClick = lastVisible?.clickIndex ?? firstClick;
  return `${firstClick}-${lastClick}`;
}

function hasBuildTiming(element: ScenarioElement): boolean {
  return element.build.showAtClick > 0 || element.build.hideAtClick !== null;
}
