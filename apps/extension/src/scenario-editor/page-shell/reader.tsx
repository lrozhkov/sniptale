import { GuideHtmlExport } from './html-export';
import { GuidePrint, useGuidePrintMode } from './print';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { resolveGuideNumbering } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideReadDocument } from './reader-document';

/** Reading navigation is disposable and never publishes an edit or acquires media. */
export function GuideReader({
  project,
  images,
  initialId,
  onClose,
  t,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  initialId: string | null;
  onClose: () => void;
  t: Translate;
}) {
  const print = useGuidePrintMode();
  const [mode, setMode] = useState<'flow' | 'steps'>('flow');
  const [selection, setSelection] = useState({
    id: initialId ?? project.items[0]?.id ?? null,
    sequence: 0,
  });
  const selectedId = selection.id;
  const select = (id: string) =>
    setSelection((current) => ({ id, sequence: current.sequence + 1 }));
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const index = Math.max(
    0,
    project.items.findIndex((item) => item.id === selectedId)
  );
  const current = project.items[index];
  const numbers = resolveGuideNumbering(project.items);
  useLayoutEffect(() => {
    back.current?.focus();
  }, []);
  useLayoutEffect(() => {
    const target = [
      ...(panel.current?.querySelectorAll<HTMLElement>('article, section') ?? []),
    ].find((item) => item.id === selectedId);
    if (selection.sequence > 0) target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start' });
  }, [selectedId, selection.sequence, mode]);
  const move = (direction: -1 | 1) => {
    const item = project.items[index + direction];
    if (item) select(item.id);
  };
  if (print.active)
    return <GuidePrint project={project} images={images} onClose={print.close} t={t} />;
  return (
    <main
      className="guide-reader"
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (mode === 'steps' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      <header className="guide-page-header">
        <ContentToolbarButton
          ref={back}
          title={t('scenario.editor.guideReaderBack')}
          onClick={onClose}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </ContentToolbarButton>
        <h1>{project.name}</h1>
        <GuideHtmlExport project={project} t={t} />
        <ContentToolbarButton
          ref={print.trigger}
          title={t('scenario.editor.guidePrintAction')}
          onClick={print.open}
        >
          <Printer size={16} aria-hidden="true" />
        </ContentToolbarButton>
        <SegmentedSwitch
          density="compact"
          ariaLabel={t('scenario.editor.guideReaderMode')}
          activeId={mode}
          options={[
            { id: 'flow', label: t('scenario.editor.guideReaderFlow') },
            { id: 'steps', label: t('scenario.editor.guideReaderSteps') },
          ]}
          onChange={setMode}
        />
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
              {project.items.length ? index + 1 : 0} / {project.items.length}
            </span>
            <ContentToolbarButton
              title={t('scenario.editor.guideReaderNext')}
              disabled={index >= project.items.length - 1}
              onClick={() => move(1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </ContentToolbarButton>
          </div>
        )}
      </header>
      <div className="guide-reader-body">
        <nav aria-label={t('scenario.editor.guideReaderOutline')}>
          {project.items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={current?.id === item.id ? 'step' : undefined}
              onClick={(event) => {
                event.preventDefault();
                select(item.id);
              }}
            >
              {numbers.get(item.id)?.label && <span>{numbers.get(item.id)?.label} </span>}
              {item.title ||
                t(
                  item.kind === 'section'
                    ? 'scenario.editor.guideSectionTitle'
                    : 'scenario.editor.guideStepTitle'
                )}
            </a>
          ))}
        </nav>
        <div ref={panel} className="guide-document-scroll">
          {project.items.length ? (
            <GuideReadDocument
              project={project}
              images={images}
              {...(mode === 'steps' && current ? { itemId: current.id } : {})}
              t={t}
            />
          ) : (
            <p role="status">{t('scenario.editor.guideReaderEmpty')}</p>
          )}
        </div>
      </div>
    </main>
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
