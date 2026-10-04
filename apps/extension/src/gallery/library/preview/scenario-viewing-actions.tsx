import { ArrowUpRight, BookOpen, FileText, MousePointerClick } from 'lucide-react';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { useEffect, useState } from 'react';
import { readScenarioViewingSnapshot } from '../../../composition/persistence/scenario/projects/viewing';
import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';
import { createTranslator, useAppLocale } from '../../../platform/i18n';
import type { ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';

const inspectorLinkClassName = [
  'w-full !justify-start !rounded-[8px] !px-3 text-left gap-2',
  getControlSecondaryButtonClassName({ density: 'compact' }),
].join(' ');

const inlineLinkClassName = [
  'rounded-md border border-[var(--sniptale-color-border-soft)]',
  'px-3 py-2 text-sm underline focus-visible:outline',
].join(' ');

function SavedExportLinks({
  entry,
  projectId,
  sourceAvailable,
  className,
  showIcons,
  t,
}: {
  entry: ScenarioExportEntry;
  projectId: string;
  sourceAvailable: boolean;
  className: string;
  showIcons: boolean;
  t: ReturnType<typeof createTranslator>;
}) {
  return (
    <>
      {entry.format === 'html' &&
        (entry.html ? (
          <a
            className={className}
            href={buildScenarioEditorUrl({ exportId: entry.id, view: 'export' })}
            target="_blank"
            rel="noopener noreferrer"
          >
            {showIcons ? <FileText className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            {t('gallery.preview.openExport')}
          </a>
        ) : (
          <>
            <button type="button" className={className} disabled>
              {showIcons ? <FileText className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              {t('gallery.preview.openExport')}
            </button>
            <p role="status" className="px-3 text-xs">
              {t('gallery.preview.exportFileUnavailable')}
            </p>
          </>
        ))}
      {sourceAvailable && (
        <a
          className={className}
          href={buildScenarioEditorUrl({ projectId })}
          target="_blank"
          rel="noopener noreferrer"
        >
          {showIcons ? <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          {t('gallery.preview.openCurrentProject')}
        </a>
      )}
    </>
  );
}

/** Chosen immutable files are available independently of the current project representation. */
export function ScenarioViewingActions({
  projectId,
  exportEntry,
  revision,
  availability = 'available',
  layout = 'inline',
}: {
  projectId: string;
  exportEntry?: ScenarioExportEntry;
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
  if (exportEntry)
    return (
      <nav
        className={layout === 'inspector' ? 'flex flex-col gap-1' : 'flex flex-wrap gap-3'}
        aria-label={t('scenario.editor.previewTitle')}
      >
        <SavedExportLinks
          entry={exportEntry}
          projectId={projectId}
          t={t}
          showIcons={layout === 'inspector'}
          sourceAvailable={
            availability === 'available' && result?.key === key && result.status === 'ready'
          }
          className={layout === 'inspector' ? inspectorLinkClassName : inlineLinkClassName}
        />
      </nav>
    );
  if (availability !== 'available') return null;
  if (!result || result.key !== key) return null;
  if (result.status === 'unavailable')
    return <p role="status">{t('gallery.preview.unavailableGuide')}</p>;
  return (
    <nav
      className={layout === 'inspector' ? 'flex flex-col gap-1' : 'flex flex-wrap gap-3'}
      aria-label={t('scenario.editor.previewTitle')}
    >
      {(['guide', 'tour'] as const)
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
                <MousePointerClick className="h-4 w-4 shrink-0" aria-hidden="true" />
              )
            ) : null}
            {t(mode === 'guide' ? 'scenario.editor.viewGuide' : 'scenario.editor.viewTour')}
          </a>
        ))}
    </nav>
  );
}
