import { ArrowUpRight, FileStack } from 'lucide-react';
import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';
import { translate } from '../../../platform/i18n';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';

export function GalleryScenarioProjectsCard(props: { scenarioProjects: ScenarioProjectSummary[] }) {
  return (
    <div
      className="mt-6 rounded-[16px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]
        p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        <FileStack className="h-4 w-4 text-[var(--sniptale-color-accent-emphasis)]" />
        {translate('gallery.app.scenarioProjectsTitle')}
      </div>
      <div className="grid gap-2">
        {props.scenarioProjects.length > 0 ? (
          props.scenarioProjects
            .slice(0, 4)
            .map((project) => <GalleryScenarioProjectLink key={project.id} project={project} />)
        ) : (
          <div className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.app.scenarioProjectsEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

function GalleryScenarioProjectLink(props: { project: ScenarioProjectSummary }) {
  return (
    <a
      href={buildScenarioEditorUrl({ projectId: props.project.id })}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-[12px] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-3 py-2.5
        text-sm text-[var(--sniptale-color-text-primary)] transition
        hover:border-[var(--sniptale-color-border-strong)]"
    >
      <span className="truncate font-medium">{props.project.name}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.app.openScenarioProject')}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}
