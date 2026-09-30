import { BookOpen, Play } from 'lucide-react';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { useEffect, useState } from 'react';
import { readScenarioViewingSnapshot } from '../../../composition/persistence/scenario/projects/viewing';
import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';
import { createTranslator, useAppLocale } from '../../../platform/i18n';

const inspectorLinkClassName = [
  'w-full !justify-start !rounded-[8px] !px-3 text-left gap-2',
  getControlSecondaryButtonClassName({ density: 'compact' }),
].join(' ');

const inlineLinkClassName = [
  'rounded-md border border-[var(--sniptale-color-border-soft)]',
  'px-3 py-2 text-sm underline focus-visible:outline',
].join(' ');

/** Library links open committed representations; export rows never imply historic bytes. */
export function ScenarioViewingActions({
  projectId,
  exportMode = false,
  revision,
  availability = 'available',
  layout = 'inline',
}: {
  projectId: string;
  exportMode?: boolean;
  revision?: number;
  availability?: 'available' | 'unsupported' | 'invalid' | 'unavailable';
  layout?: 'inline' | 'inspector';
}) {
  const t = createTranslator(useAppLocale());
  const [result, setResult] = useState<{
    key: string;
    status: 'ready' | 'unavailable';
    tour: boolean;
  } | null>(null);
  const key = `${projectId}:${revision ?? 0}`;
  useEffect(() => {
    if (availability !== 'available') return;
    let active = true;
    setResult(null);
    void readScenarioViewingSnapshot(projectId)
      .then((snapshot) => {
        if (active)
          setResult({
            key,
            status: snapshot ? 'ready' : 'unavailable',
            tour: Boolean(snapshot?.project.tour),
          });
      })
      .catch(() => {
        if (active) setResult({ key, status: 'unavailable', tour: false });
      });
    return () => {
      active = false;
    };
  }, [availability, key, projectId]);
  if (availability !== 'available') return null;
  if (!result || result.key !== key) return null;
  if (result.status === 'unavailable')
    return <p role="status">{t('gallery.preview.unavailableGuide')}</p>;
  return (
    <nav
      className={layout === 'inspector' ? 'flex flex-col gap-1' : 'flex flex-wrap gap-3'}
      aria-label={t('scenario.editor.previewTitle')}
    >
      {exportMode ? (
        <a
          className={layout === 'inspector' ? inspectorLinkClassName : inlineLinkClassName}
          href={buildScenarioEditorUrl({ projectId })}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('gallery.preview.openCurrentProject')}
        </a>
      ) : null}
      {!exportMode &&
        (['guide', 'tour'] as const)
          .filter((mode) => mode === 'guide' || result.tour)
          .map((mode) => (
            <a
              key={mode}
              className={layout === 'inspector' ? inspectorLinkClassName : inlineLinkClassName}
              href={buildScenarioEditorUrl({ projectId, view: mode })}
              target="_blank"
              rel="noopener noreferrer"
            >
              {layout === 'inspector' ? (
                mode === 'guide' ? (
                  <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
                )
              ) : null}
              {t(mode === 'guide' ? 'scenario.editor.viewGuide' : 'scenario.editor.viewTour')}
            </a>
          ))}
    </nav>
  );
}
