import { useEffect, useState } from 'react';
import { readScenarioViewingSnapshot } from '../../../composition/persistence/scenario/projects/viewing';
import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';
import { createTranslator, useAppLocale } from '../../../platform/i18n';

/** Library links open committed representations; export rows never imply historic bytes. */
export function ScenarioViewingActions({
  projectId,
  exportMode = false,
}: {
  projectId: string;
  exportMode?: boolean;
}) {
  const t = createTranslator(useAppLocale());
  const [available, setAvailable] = useState<{ tour: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    setAvailable(null);
    void readScenarioViewingSnapshot(projectId)
      .then((snapshot) => {
        if (active) setAvailable(snapshot ? { tour: Boolean(snapshot.project.tour) } : null);
      })
      .catch(() => {
        if (active) setAvailable(null);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  if (!available) return null;
  return (
    <nav className="flex flex-wrap gap-3" aria-label={t('scenario.editor.previewTitle')}>
      {exportMode && <p className="w-full text-sm">{t('scenario.editor.viewCurrentExportHint')}</p>}
      {(['guide', 'tour'] as const)
        .filter((mode) => mode === 'guide' || available.tour)
        .map((mode) => (
          <a
            key={mode}
            className="rounded-md border border-[var(--sniptale-color-border-soft)]
            px-3 py-2 text-sm underline focus-visible:outline"
            href={buildScenarioEditorUrl({ projectId, view: mode })}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(mode === 'guide' ? 'scenario.editor.viewGuide' : 'scenario.editor.viewTour')}
          </a>
        ))}
    </nav>
  );
}
