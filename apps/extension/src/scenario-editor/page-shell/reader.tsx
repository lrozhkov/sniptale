import { GuideHtmlWorkbench } from './html-workbench';
import { GuideHtmlExport } from './html-export';
import { GuidePrint, useGuidePrintMode } from './print';
import { GuideExportWorkspace } from './export-workspace';
import { GuideInspectorGroup } from './inspector';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { GuideReadingControls, GuideReadingNavigation } from './reader-navigation';
import { DEFAULT_GUIDE_READING, guideReadingPages } from './reader-pages';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { GuideReadDocument } from './reader-document';

/** Reading navigation is disposable and never publishes an edit or acquires media. */
export function GuideReader({
  project,
  images,
  initialId,
  onClose,
  onChange,
  feedback,
  t,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  initialId: string | null;
  onClose: () => void;
  onChange: (project: GuideProject) => void;
  feedback?: ReactNode;
  t: Translate;
}) {
  const print = useGuidePrintMode();
  const html = useGuideReaderMode(() => {});
  const { options, setOptions, pages, panel, index, current, select, move } = useReaderNavigation(
    project,
    initialId
  );
  const { mode } = options;
  useEffect(() => {
    if (mode !== 'steps' || html.active || print.active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, move, html.active, print.active]);
  if (html.active)
    return (
      <GuideHtmlWorkbench
        initialReading={options}
        project={project}
        images={images}
        onChange={onChange}
        feedback={feedback}
        onClose={html.close}
        t={t}
      />
    );
  if (print.active)
    return <GuidePrint project={project} images={images} onClose={print.close} t={t} />;
  return (
    <GuideExportWorkspace
      className="guide-reader"
      title={project.name}
      backLabel={t('scenario.editor.guideReaderBack')}
      stageLabel={t('scenario.editor.guideReaderOutline')}
      onClose={onClose}
      stage={
        <div
          className="guide-reader-body guide-reading-layout"
          data-navigation={options.navigation}
          data-reading-mode={mode}
        >
          <GuideReadingNavigation
            project={project}
            currentId={current?.id}
            onSelect={select}
            t={t}
          />
          <div ref={panel} className="guide-document-scroll">
            {project.items.length ? (
              <GuideReadDocument
                project={project}
                images={images}
                {...(mode === 'steps' && current
                  ? { itemIds: current.items.map((item) => item.id) }
                  : {})}
                t={t}
              />
            ) : (
              <p role="status">{t('scenario.editor.guideReaderEmpty')}</p>
            )}
          </div>
        </div>
      }
      inspector={
        <>
          <GuideInspectorGroup icon={BookOpen} title={t('scenario.editor.guideReaderMode')}>
            <GuideReadingControls value={options} onChange={setOptions} t={t} />
            {mode === 'steps' && (
              <div className="guide-reader-pagination">
                <ContentToolbarButton
                  title={t('scenario.editor.guideReaderPrevious')}
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </ContentToolbarButton>
                <span aria-live="polite">
                  {pages.length ? index + 1 : 0} / {pages.length}
                </span>
                <ContentToolbarButton
                  title={t('scenario.editor.guideReaderNext')}
                  disabled={index >= pages.length - 1}
                  onClick={() => move(1)}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </ContentToolbarButton>
              </div>
            )}
          </GuideInspectorGroup>
          {feedback}
        </>
      }
      actions={
        <>
          <GuideHtmlExport project={project} t={t} onOpenHtml={html.open} htmlRef={html.trigger} />
          <ContentToolbarButton
            className="guide-labeled-action"
            ref={print.trigger}
            title={t('scenario.editor.guidePrintAction')}
            onClick={print.open}
          >
            <Printer size={16} aria-hidden="true" />
            <span>{t('scenario.editor.guidePrintAction')}</span>
          </ContentToolbarButton>
        </>
      }
    />
  );
}

/** Owns entering/leaving reading mode and restoration to its remounted editor trigger. */
export function useGuideReaderMode(beforeOpen: () => void) {
  const [active, setActive] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  useEffect(() => {
    if (!active && restore.current) {
      restore.current = false;
      trigger.current?.focus();
    }
  }, [active]);
  return {
    active,
    trigger,
    open: () => {
      beforeOpen();
      setActive(true);
    },
    close: () => {
      restore.current = true;
      setActive(false);
    },
  };
}

/** Reading navigation and document focus share one disposable selection lifetime. */
function useReaderNavigation(project: GuideProject, initialId: string | null) {
  const [options, setOptions] = useState(DEFAULT_GUIDE_READING);
  const pages = guideReadingPages(project.items);
  const [selection, setSelection] = useState({
    id: initialId ?? project.items[0]?.id ?? null,
    sequence: 0,
  });
  const selectedId = selection.id;
  const select = (id: string) =>
    setSelection((current) => ({ id, sequence: current.sequence + 1 }));
  const panel = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    pages.findIndex((page) => page.items.some((item) => item.id === selectedId))
  );
  const current = pages[index];
  const targetId = options.mode === 'steps' ? current?.items[0]?.id : selectedId;
  useLayoutEffect(() => {
    const target = [
      ...(panel.current?.querySelectorAll<HTMLElement>('article, section') ?? []),
    ].find((item) => item.id === targetId);
    if (selection.sequence > 0) target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start' });
  }, [targetId, selection.sequence, options.mode]);
  const move = (direction: -1 | 1) => {
    const item = pages[index + direction];
    if (item) select(item.id);
  };
  return { options, setOptions, pages, panel, index, current, select, move };
}
