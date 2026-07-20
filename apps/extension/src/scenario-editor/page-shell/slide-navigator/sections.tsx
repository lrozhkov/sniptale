import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import {
  ScenarioNavigatorStepRow,
  ScenarioNavigatorTrashRow,
} from './ScenarioSlideNavigatorStepRow';
import type { ScenarioSlideNavigatorController } from './types';

type ScenarioNavigatorProject = NonNullable<ScenarioSlideNavigatorController['project']['project']>;

function ScenarioNavigatorList(props: {
  controller: ScenarioSlideNavigatorController;
  dragStepId: string | null;
  onSetDragStepId: (stepId: string | null) => void;
  project: ScenarioNavigatorProject;
  thumbnailUrls: Record<string, string>;
}) {
  return (
    <div className="grid min-h-0 gap-3 overflow-x-hidden overflow-y-auto pr-1">
      <ScenarioNavigatorStepRows
        controller={props.controller}
        dragStepId={props.dragStepId}
        onSetDragStepId={props.onSetDragStepId}
        steps={props.project.steps}
        thumbnailUrls={props.thumbnailUrls}
      />
      <ScenarioNavigatorTrashSection
        controller={props.controller}
        project={props.project}
        thumbnailUrls={props.thumbnailUrls}
      />
    </div>
  );
}

function ScenarioNavigatorStepRows(props: {
  controller: ScenarioSlideNavigatorController;
  dragStepId: string | null;
  onSetDragStepId: (stepId: string | null) => void;
  steps: ScenarioStep[];
  thumbnailUrls: Record<string, string>;
}) {
  return (
    <div className="grid gap-2">
      {props.steps.map((step, index) => (
        <ScenarioNavigatorStepRow
          key={step.id}
          controller={props.controller}
          dragStepId={props.dragStepId}
          index={index}
          onSetDragStepId={props.onSetDragStepId}
          step={step}
          thumbnailUrl={step.kind === 'capture' ? (props.thumbnailUrls[step.id] ?? null) : null}
        />
      ))}
    </div>
  );
}

function ScenarioNavigatorTrashSection(props: {
  controller: ScenarioSlideNavigatorController;
  project: ScenarioNavigatorProject;
  thumbnailUrls: Record<string, string>;
}) {
  const [collapsed, setCollapsed] = useState(true);

  if (props.project.trash.length === 0) {
    return null;
  }

  return (
    <div
      className="grid gap-2 border-t
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)] pt-3"
    >
      <div className="flex items-center gap-2">
        <ScenarioNavigatorTrashToggle
          collapsed={collapsed}
          count={props.project.trash.length}
          onToggle={() => setCollapsed((current) => !current)}
        />
        {collapsed ? null : (
          <ScenarioNavigatorClearTrashButton
            onClear={() => props.controller.stepActions.clearTrash()}
          />
        )}
      </div>

      {collapsed
        ? null
        : props.project.trash.map((entry) => (
            <ScenarioNavigatorTrashEntry
              controller={props.controller}
              key={entry.step.id}
              onRestore={() => props.controller.stepActions.restoreStep(entry.step.id)}
              step={entry.step}
              thumbnailUrl={getTrashEntryThumbnailUrl(entry.step, props.thumbnailUrls)}
            />
          ))}
    </div>
  );
}

function getTrashEntryThumbnailUrl(
  step: ScenarioNavigatorProject['trash'][number]['step'],
  thumbnailUrls: Record<string, string>
): string | null {
  return step.kind === 'capture' ? (thumbnailUrls[step.id] ?? null) : null;
}

function ScenarioNavigatorClearTrashButton(props: { onClear: () => Promise<void> }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[14px] border
          border-[var(--sniptale-color-border-soft)] px-3 text-sm font-semibold
          text-[var(--sniptale-color-danger)] transition hover:border-[var(--sniptale-color-danger)]"
        title={translate('scenario.editor.clearTrash')}
        aria-label={translate('scenario.editor.clearTrash')}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {translate('scenario.editor.clearTrash')}
      </button>
      <ProductConfirmDialog
        isOpen={confirmOpen}
        title={translate('scenario.editor.clearTrash')}
        message={translate('scenario.editor.clearTrashConfirm')}
        confirmText={translate('scenario.editor.clearTrash')}
        cancelText={translate('common.actions.cancel')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void props.onClear();
        }}
      />
    </>
  );
}

function ScenarioNavigatorTrashToggle(props: {
  collapsed: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      className={[
        'flex items-center justify-between gap-3 rounded-[14px] border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]',
        'px-3 py-2.5 text-left transition',
        [
          'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,',
          'var(--sniptale-color-border-accent-strong)_24%)]',
        ].join(''),
      ].join(' ')}
      aria-expanded={props.collapsed ? 'false' : 'true'}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.editor.trash')}
      </span>
      <span className="inline-flex items-center gap-2 text-xs text-[var(--sniptale-color-text-muted)]">
        {props.count}
        {props.collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
}

function ScenarioNavigatorTrashEntry(props: {
  controller: Pick<ScenarioSlideNavigatorController, 'ui'>;
  onRestore: () => void;
  step: ScenarioNavigatorProject['trash'][number]['step'];
  thumbnailUrl: string | null;
}) {
  return (
    <ScenarioNavigatorTrashRow
      controller={props.controller}
      onRestore={props.onRestore}
      step={props.step}
      thumbnailUrl={props.thumbnailUrl}
    />
  );
}

export function ScenarioNavigatorPanelContent(props: {
  controller: ScenarioSlideNavigatorController;
  dragStepId: string | null;
  onSetDragStepId: (stepId: string | null) => void;
  project: ScenarioSlideNavigatorController['project']['project'];
  thumbnailUrls: Record<string, string>;
}) {
  if (!props.project) {
    return (
      <div
        className="rounded-[18px] border border-dashed border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_76%,transparent)] p-4 text-sm
          text-[var(--sniptale-color-text-muted)]"
      >
        {translate('scenario.editor.empty')}
      </div>
    );
  }

  return (
    <ScenarioNavigatorList
      controller={props.controller}
      dragStepId={props.dragStepId}
      onSetDragStepId={props.onSetDragStepId}
      project={props.project}
      thumbnailUrls={props.thumbnailUrls}
    />
  );
}
