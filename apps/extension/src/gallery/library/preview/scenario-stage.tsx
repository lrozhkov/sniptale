import { useEffect, useState, type ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import { listScenarioPreviewSteps } from '../../../composition/persistence/scenario/store/project-steps/project-step-queries';
import type { ScenarioPreviewStep } from '../../../features/scenario/contracts/types/project';
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
  recentSteps: ScenarioPreviewStep[];
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
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.recentSteps.map((step) => (
            <ScenarioPreviewStepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </ScenarioPreviewSurface>
  );
}

export function PreviewScenarioStage(props: { item: GalleryItem }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [recentSteps, setRecentSteps] = useState<ScenarioPreviewStep[]>([]);

  useEffect(() => {
    if (!isGalleryScenarioItem(props.item) && !isGalleryScenarioExportItem(props.item)) {
      return undefined;
    }

    let active = true;
    setRecentSteps([]);
    if (props.item.project.availability !== 'available') {
      setStatus('unavailable');
      return;
    }
    setStatus('loading');
    void listScenarioPreviewSteps(props.item.project.id)
      .then((steps) => {
        if (active) {
          setRecentSteps(steps);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (active) {
          setRecentSteps([]);
          setStatus('unavailable');
        }
      });

    return () => {
      active = false;
    };
  }, [props.item]);

  if (status !== 'ready')
    return (
      <p role="status">
        {translate(
          status === 'loading' ? 'gallery.app.loading' : 'gallery.preview.unavailableGuide'
        )}
      </p>
    );
  return (
    <ScenarioPreviewStepsGrid
      exportMode={isGalleryScenarioExportItem(props.item)}
      recentSteps={recentSteps}
      title={props.item.filename}
    />
  );
}
