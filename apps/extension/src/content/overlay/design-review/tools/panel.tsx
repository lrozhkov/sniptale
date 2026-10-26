import { DesignReviewChecksView } from '../checks/view';
import type { DesignReviewChecks } from '../session/checks';
import type { ReviewCheckFinding } from '../../../selection/design-review/checks/scan';
import { useRef, useState } from 'react';
import { ArrowUp, ChevronDown, ChevronUp, GripVertical, MessageSquare, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { InspectorDisclosureView } from '../../../../ui/compact-inspector-controls/disclosure';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import { InspectorLayout } from '../../../../ui/compact-inspector-controls/layout';
import { useContentUiScale } from '../../../platform/dom-host';
import type { DesignReviewTool } from '../../../selection/design-review';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { DesignReviewMeasureSection, type MeasureModel } from './measure';
import { ReviewToolsSection } from '../settings/sections/tools';
import { useDesignReviewPopoverMetrics } from '../popover/position';
import { useDesignReviewPopoverDrag } from '../popover/drag';

const LABELS: Record<Exclude<DesignReviewTool, 'comment'>, TranslationKey> = {
  inspect: 'content.designReview.toolInspect',
  compare: 'content.designReview.toolCompare',
  move: 'content.designReview.toolMove',
};

function WorkspaceTree(props: {
  actions: DesignReviewActions;
  state: DesignReviewViewState;
  compact?: boolean;
}) {
  if (!props.state.selection) return null;
  const children = props.state.treeNavigation.children ?? [];
  return (
    <div
      className={
        props.compact
          ? 'grid gap-2'
          : 'grid shrink-0 gap-2 border-b border-[var(--sniptale-color-border-soft)] p-3'
      }
    >
      <div className="truncate text-xs font-medium" title={props.state.selection.domPath}>
        {props.state.selection.selectorLabel}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <ContentToolbarButton
          tone="utility"
          className="!size-7 !min-h-7 !min-w-7 !p-0"
          disabled={!props.state.treeNavigation.parent}
          aria-label={translate('content.designReview.workspaceParent')}
          onClick={() => {
            if (props.state.treeNavigation.parent)
              props.actions.navigateElement(props.state.treeNavigation.parent);
          }}
        >
          <ArrowUp size={14} />
        </ContentToolbarButton>
        <div className="min-w-0 flex-1">
          <ProductSelect
            controlSize="sm"
            value=""
            disabled={!children.length}
            aria-label={translate('content.designReview.workspaceChildren')}
            placeholder={translate(
              children.length
                ? 'content.designReview.workspaceChildren'
                : 'content.designReview.workspaceNoChildren'
            )}
            options={children.map((child, index) => ({
              value: String(index),
              label: childNavigationLabel(child),
            }))}
            onChange={(value) => {
              const child = children[Number(value)];
              if (child) props.actions.navigateElement(child);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** The workspace position belongs to the review session, not to the selected element. */
interface ToolPanelProps {
  tool: Exclude<DesignReviewTool, 'comment'>;
  checkOpen?: boolean;
  checks?: DesignReviewChecks;
  onFinding?: (finding: ReviewCheckFinding, action: 'show' | 'inspect' | 'comment') => void;
  actions: DesignReviewActions;
  state: DesignReviewViewState;
  open: boolean;
  measureModel: MeasureModel;
  workspace: { collapsed: boolean; toggleCollapsed(): void; close(): void; comment(): void };
}

export function DesignReviewToolPanel(props: ToolPanelProps) {
  const elementRef = useRef<HTMLElement | null>(null);
  const containedRef = useFloatingSurfaceWheelContainment(elementRef);
  const uiScale = useContentUiScale();
  const metrics = useDesignReviewPopoverMetrics({
    active: props.open,
    elementRef,
    measurementKey: `${props.tool}:${props.workspace.collapsed}`,
    uiScale,
  });
  const viewportWidth = metrics?.viewportWidth ?? window.innerWidth / uiScale;
  const width = Math.min(360, Math.max(0, viewportWidth - 24));
  const basePosition = { left: Math.max(12, viewportWidth - width - 12), top: 72 / uiScale };
  const drag = useDesignReviewPopoverDrag({
    active: true,
    basePosition,
    geometryKey: metrics?.height ?? 0,
    popoverRef: elementRef,
    resetKey: null,
    uiScale,
  });
  const top = Math.max(12, drag.position.top * uiScale);
  const title = translate(props.checkOpen ? 'content.designReview.checkTitle' : LABELS[props.tool]);
  return (
    <aside
      ref={containedRef}
      role="dialog"
      aria-label={title}
      hidden={!props.open}
      data-ui="content.design-review.tool-panel"
      data-floating-ui-capture-transient="true"
      className={[
        'sniptale-design-review-chrome sniptale-compact-workspace pointer-events-auto fixed z-[2147483646]',
        'flex min-h-0 flex-col overflow-hidden rounded bg-[var(--sniptale-color-surface-panel)]',
        'text-[var(--sniptale-color-text-primary)] shadow-xl',
      ].join(' ')}
      style={{
        display: props.open ? undefined : 'none',
        left: drag.position.left * uiScale,
        top,
        backgroundColor: 'rgb(from var(--sniptale-color-surface-panel) r g b / 1)',
        width: width * uiScale,
        maxHeight: `calc(var(--sniptale-content-ui-viewport-height) - ${top + 12}px)`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <ToolPanelHeader title={title} drag={drag} workspace={props.workspace} />
      <div
        className="flex min-h-0 flex-col"
        style={{ display: props.workspace.collapsed ? 'none' : undefined }}
      >
        <ToolPanelHierarchy {...props} />
        <ToolPanelContents {...props} />
        {!props.checkOpen && props.state.selection ? (
          <footer className="flex shrink-0 border-t border-[var(--sniptale-color-border-soft)] p-2">
            <ProductActionButton tone="secondary" compact onClick={props.workspace.comment}>
              <MessageSquare size={14} />
              {translate('content.designReview.workspaceComment')}
            </ProductActionButton>
          </footer>
        ) : null}
      </div>
    </aside>
  );
}

function ToolPanelHeader({
  title,
  drag,
  workspace,
}: {
  title: string;
  drag: ReturnType<typeof useDesignReviewPopoverDrag>;
  workspace: ToolPanelProps['workspace'];
}) {
  return (
    <header
      className={[
        'flex min-h-10 shrink-0 items-center gap-1 border-b',
        'border-[var(--sniptale-color-border-soft)] px-2',
      ].join(' ')}
    >
      <div
        className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 self-stretch text-xs font-semibold"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerUp}
      >
        <GripVertical size={14} className="shrink-0 text-[var(--sniptale-color-text-secondary)]" />
        {title}
      </div>
      <ContentToolbarButton
        tone="utility"
        className="!size-6 !min-h-6 !min-w-6 !p-0"
        aria-label={translate(
          workspace.collapsed
            ? 'content.designReview.workspaceExpand'
            : 'content.designReview.workspaceCollapse'
        )}
        aria-expanded={!workspace.collapsed}
        onClick={workspace.toggleCollapsed}
      >
        {workspace.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </ContentToolbarButton>
      <ContentToolbarButton
        tone="close"
        className="!size-6 !min-h-6 !min-w-6 !p-0"
        aria-label={translate('content.designReview.close')}
        onClick={workspace.close}
      >
        <X size={14} />
      </ContentToolbarButton>
    </header>
  );
}

function ToolPanelContents(props: ToolPanelProps) {
  return (
    <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 text-xs">
      {props.checkOpen && props.checks && props.onFinding ? (
        <DesignReviewChecksView checks={props.checks} onFinding={props.onFinding} />
      ) : null}
      <div style={{ display: !props.checkOpen && props.tool === 'inspect' ? undefined : 'none' }}>
        <InspectorLayout>
          {props.state.valueError ? (
            <p role="alert" className="py-2">
              {translate('content.designReview.workspaceValueError')}
            </p>
          ) : null}
          <ReviewToolsSection
            actions={props.actions}
            state={props.state}
            disabled={false}
            tool="inspect"
          />
          {!props.state.selection && !props.actions.tools?.cssDrafts.items.length ? (
            <p className="py-3" role="status">
              {translate('content.designReview.toolChooseElement')}
            </p>
          ) : null}
        </InspectorLayout>
      </div>
      <ActiveToolContents {...props} />
    </div>
  );
}

function ToolPanelHierarchy(props: ToolPanelProps) {
  const [treeOpen, setTreeOpen] = useState(false);
  return (
    <>
      {!props.checkOpen && props.state.selection ? (
        props.tool === 'compare' ? (
          <div className="shrink-0 border-b border-[var(--sniptale-color-border-soft)] px-1 py-1">
            <InspectorDisclosureView
              dataUi="content.design-review.measure-hierarchy"
              variant="structural"
              label={translate('content.designReview.measureTreeNavigation')}
              open={treeOpen}
              onOpenChange={setTreeOpen}
              bodyClassName="px-2 pb-2 pt-1"
            >
              <WorkspaceTree actions={props.actions} state={props.state} compact />
            </InspectorDisclosureView>
          </div>
        ) : (
          <WorkspaceTree actions={props.actions} state={props.state} />
        )
      ) : null}
    </>
  );
}

function ActiveToolContents(props: ToolPanelProps) {
  if (props.checkOpen || props.tool === 'inspect') return null;
  if (props.tool === 'compare' && props.state.measure)
    return (
      <DesignReviewMeasureSection
        state={props.state.measure}
        model={props.measureModel}
        current={props.state.selection?.element ?? null}
      />
    );
  if (!props.state.selection)
    return (
      <p className="py-3" role="status">
        {translate('content.designReview.toolChooseElement')}
      </p>
    );
  return (
    <InspectorLayout>
      <ReviewToolsSection
        actions={props.actions}
        state={props.state}
        disabled={false}
        tool={props.tool}
      />
    </InspectorLayout>
  );
}

function childNavigationLabel(child: Element): string {
  const identity = `${child.tagName.toLowerCase()}${child.id ? `#${child.id}` : ''}`;
  const text = child.textContent?.trim().slice(0, 36);
  return text ? `${identity} · ${text}` : identity;
}
