import { useEffect, useState, type ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import { listRecentScenarioSteps } from '../../../composition/persistence/scenario/store/project-steps/project-step-queries';
import type { ScenarioRecentStep } from '../../../features/scenario/contracts/types/project';
import { isGalleryScenarioExportItem, isGalleryScenarioItem, type GalleryItem } from '../items';
import { ScenarioPreviewStepCard } from './scenario-step-card';

function ScenarioPreviewSurface(props: { children: ReactNode }) {
  return <div className="grid w-full max-w-6xl gap-4">{props.children}</div>;
}

function ScenarioPreviewEmptyState(props: { exportMode: boolean }) {
  return (
    <div
      className="flex h-[240px] w-full max-w-xl flex-col items-center justify-center rounded-[20px]
        border border-dashed border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,transparent)]
        px-6 text-center text-[var(--sniptale-color-text-secondary)]"
    >
      <div className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.exportMode
          ? translate('gallery.preview.kindScenarioExport')
          : translate('gallery.app.scenarioProjectsTitle')}
      </div>
      <div className="mt-2 max-w-sm text-sm leading-6">
        {translate('gallery.app.scenarioPreviewEmpty')}
      </div>
    </div>
  );
}

function ScenarioPreviewStepsGrid(props: {
  exportMode: boolean;
  recentSteps: ScenarioRecentStep[];
  title: string;
}) {
  return (
    <ScenarioPreviewSurface>
      <div className="mb-2">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--sniptale-color-text-muted-strong)]">
          {props.exportMode
            ? translate('gallery.preview.kindScenarioExport')
            : translate('gallery.preview.folderScenario')}
        </div>
        <div className="mt-2 text-2xl font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.title}
        </div>
      </div>
      {props.recentSteps.length === 0 ? (
        <ScenarioPreviewEmptyState exportMode={props.exportMode} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.recentSteps.slice(0, 6).map((step) => (
            <ScenarioPreviewStepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </ScenarioPreviewSurface>
  );
}

export function PreviewScenarioStage(props: { item: GalleryItem }) {
  const [recentSteps, setRecentSteps] = useState<ScenarioRecentStep[]>([]);

  useEffect(() => {
    if (!isGalleryScenarioItem(props.item) && !isGalleryScenarioExportItem(props.item)) {
      return undefined;
    }

    let active = true;
    void listRecentScenarioSteps(props.item.project.id)
      .then((steps) => {
        if (active) {
          setRecentSteps(steps);
        }
      })
      .catch(() => {
        if (active) {
          setRecentSteps([]);
        }
      });

    return () => {
      active = false;
    };
  }, [props.item]);

  return (
    <ScenarioPreviewStepsGrid
      exportMode={isGalleryScenarioExportItem(props.item)}
      recentSteps={recentSteps}
      title={props.item.filename}
    />
  );
}
