import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, FileStack, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { openScenarioEditorPage } from '../../../platform/navigation/extension-pages/index';
import { listRecentScenarioSteps } from '../../../composition/persistence/scenario/store/project-steps/project-step-queries';
import { getScenarioProjectRecord } from '../../../composition/persistence/scenario/store/project-records/index';
import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
} from '../../../features/scenario/contracts/types/project';
import { formatDate } from '../ui';
import { ScenarioPreviewStepCard } from './scenario-step-card';

interface GalleryScenarioPreviewPanelProps {
  project: ScenarioProjectSummary;
  onClose: () => void;
}

function ScenarioPreviewSurface(props: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center
        bg-[radial-gradient(circle_at_top,
          color-mix(in_srgb,var(--sniptale-color-accent-soft)_80%,transparent),
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_38%,var(--sniptale-color-surface-canvas)_62%)_40%,
          var(--sniptale-color-surface-canvas)_100%)]
        p-6"
    >
      {props.children}
    </div>
  );
}

function ScenarioPreviewEmptyState() {
  return (
    <div
      className="flex h-[240px] w-full max-w-xl flex-col items-center justify-center rounded-[20px]
        border border-dashed border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,transparent)]
        text-center text-[var(--sniptale-color-text-secondary)]"
    >
      <FileStack className="mb-4 h-8 w-8 text-[var(--sniptale-color-accent-emphasis)]" />
      <div className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('gallery.app.scenarioProjectsTitle')}
      </div>
      <div className="mt-2 max-w-sm text-sm leading-6">
        {translate('gallery.app.scenarioPreviewEmpty')}
      </div>
    </div>
  );
}

function ScenarioPreviewStepsGrid(props: { recentSteps: ScenarioRecentStep[] }) {
  return (
    <div className="grid w-full max-w-5xl gap-4 md:grid-cols-2 xl:grid-cols-3">
      {props.recentSteps.slice(0, 6).map((step) => (
        <ScenarioPreviewStepCard key={step.id} step={step} />
      ))}
    </div>
  );
}

function ScenarioPreviewHero(props: { recentSteps: ScenarioRecentStep[] }) {
  return (
    <ScenarioPreviewSurface>
      {props.recentSteps.length === 0 ? (
        <ScenarioPreviewEmptyState />
      ) : (
        <ScenarioPreviewStepsGrid recentSteps={props.recentSteps} />
      )}
    </ScenarioPreviewSurface>
  );
}

function ScenarioPreviewSummaryCard(props: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-[16px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] px-3 py-3"
    >
      <div className="text-[var(--sniptale-color-text-muted)]">{props.label}</div>
      <div className="mt-1 font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.value}
      </div>
    </div>
  );
}

function ScenarioPreviewSidebarHeader(props: {
  onClose: () => void;
  project: ScenarioProjectSummary;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div
          className="text-xs font-semibold uppercase tracking-[0.14em]
            text-[var(--sniptale-color-text-muted-strong)]"
        >
          {translate('gallery.preview.inspector')}
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{props.project.name}</h2>
        <div className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.app.updatedLabel')} {formatDate(props.project.updatedAt)}
        </div>
      </div>
      <button
        type="button"
        onClick={props.onClose}
        className="rounded-full border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,transparent)]
          p-2 text-[var(--sniptale-color-text-muted)] transition
          hover:border-[var(--sniptale-color-border-strong)]
          hover:text-[var(--sniptale-color-text-primary)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ScenarioPreviewEditorButton(props: { projectId: string }) {
  return (
    <button
      type="button"
      onClick={() => void openScenarioEditorPage(props.projectId)}
      className="flex w-full items-center justify-center gap-2 rounded-[14px]
        border border-[var(--sniptale-color-border-accent-soft)]
        bg-[var(--sniptale-color-accent-soft)] px-4 py-3 text-sm font-semibold
        text-[var(--sniptale-color-accent-emphasis)] transition
        hover:border-[var(--sniptale-color-border-accent-strong)]"
    >
      {translate('gallery.preview.openInEditor')}
      <ArrowUpRight className="h-4 w-4" />
    </button>
  );
}

function ScenarioPreviewSidebar(props: {
  onClose: () => void;
  project: ScenarioProjectSummary;
  stepCount: number | null;
}) {
  return (
    <aside
      className="w-[388px] shrink-0 border-l border-[var(--sniptale-color-border-soft)]
        bg-[linear-gradient(180deg,
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)_0%,
          color-mix(in_srgb,var(--sniptale-color-surface-canvas)_82%,transparent)_100%)]
        p-5 text-[var(--sniptale-color-text-primary)]"
    >
      <ScenarioPreviewSidebarHeader project={props.project} onClose={props.onClose} />
      <div className="mt-6 space-y-4">
        <ScenarioPreviewSummaryCard
          label={translate('gallery.app.scenarioStepCount')}
          value={props.stepCount ?? '—'}
        />
        <ScenarioPreviewSummaryCard
          label={translate('gallery.app.createdLabel')}
          value={formatDate(props.project.createdAt)}
        />
        <ScenarioPreviewEditorButton projectId={props.project.id} />
      </div>
    </aside>
  );
}

function useScenarioPreviewDetails(projectId: string) {
  const [recentSteps, setRecentSteps] = useState<ScenarioRecentStep[]>([]);
  const [stepCount, setStepCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([listRecentScenarioSteps(projectId), getScenarioProjectRecord(projectId)])
      .then(([steps, projectRecord]) => {
        if (!active) {
          return;
        }

        setRecentSteps(steps);
        setStepCount(projectRecord?.steps.length ?? 0);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setRecentSteps([]);
        setStepCount(0);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  return { recentSteps, stepCount };
}

export function GalleryScenarioPreviewPanel(props: GalleryScenarioPreviewPanelProps) {
  const { recentSteps, stepCount } = useScenarioPreviewDetails(props.project.id);

  return (
    <div
      className="fixed inset-0 z-40 flex
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_72%,black_20%)]"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-5">
        <div
          className="flex h-full w-full max-w-7xl overflow-hidden rounded-[16px]
            border border-[var(--sniptale-color-border-soft)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]
            text-[var(--sniptale-color-text-primary)] shadow-sm"
        >
          <ScenarioPreviewHero recentSteps={recentSteps} />
          <ScenarioPreviewSidebar
            project={props.project}
            stepCount={stepCount}
            onClose={props.onClose}
          />
        </div>
      </div>
    </div>
  );
}
