import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { GuideReadDocument } from './reader-document';
import './print.css';

/** Output settings and browser print readiness are disposable, never project mutations. */
export function GuidePrint({
  project,
  images,
  onClose,
  t,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  onClose: () => void;
  t: Translate;
}) {
  const [settings, setSettings] = useState(project.print);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const documentRef = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const active = useRef(true);
  const busy = useRef(false);
  useLayoutEffect(() => {
    back.current?.focus();
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const assets = project.items.flatMap((item) =>
    item.kind === 'step'
      ? item.blocks.flatMap((block) => (block.kind === 'image' ? [block.assetId] : []))
      : []
  );
  const loading = assets.some((id) => images[id] === undefined);
  const missing = assets.some((id) => images[id] === null);
  const print = async () => {
    if (busy.current || loading || missing) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      await document.fonts.ready;
      await Promise.all(
        [...documentRef.current!.querySelectorAll('img')].map((image) => image.decode())
      );
      if (active.current) window.print();
    } catch {
      if (active.current) setFailed(true);
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };
  const dimensions = settings.pageSize === 'a4' ? [210, 297] : [215.9, 279.4];
  const [width, height] =
    settings.orientation === 'portrait' ? dimensions : [...dimensions].reverse();
  const pageStyle: CSSProperties & Record<`--guide-print-${string}`, string> = {
    '--guide-print-width': `${width}mm`,
    '--guide-print-height': `${height}mm`,
    '--guide-print-image-height': `${height! - 60}mm`,
  };
  const paper = settings.pageSize === 'a4' ? 'A4' : 'letter';
  const pageRule = `@page { size: ${paper} ${settings.orientation}; margin: 12mm; }`;
  return (
    <main
      className="guide-print"
      style={pageStyle}
      data-pagination={settings.pagination}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
          event.preventDefault();
          void print();
        }
      }}
    >
      <style>{pageRule}</style>
      <header className="guide-print-header">
        <ContentToolbarButton
          ref={back}
          className="guide-labeled-action"
          title={t('scenario.editor.guidePrintBack')}
          onClick={onClose}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('scenario.editor.guidePrintBack')}</span>
        </ContentToolbarButton>
        <h1>{project.name}</h1>
        <ProductActionButton
          tone="primary"
          compact
          disabled={pending || loading || missing}
          onClick={() => void print()}
        >
          <Printer size={16} aria-hidden="true" />
          {t('scenario.editor.guidePrintAction')}
        </ProductActionButton>
      </header>
      <fieldset className="guide-print-settings" disabled={pending}>
        <legend className="sr-only">{t('scenario.editor.guidePrintSettings')}</legend>
        <SegmentedSwitch
          density="compact"
          ariaLabel={t('scenario.editor.guidePrintPaper')}
          activeId={settings.pageSize}
          options={[
            { id: 'a4', label: 'A4' },
            { id: 'letter', label: t('scenario.editor.guidePrintLetter') },
          ]}
          onChange={(pageSize) => setSettings((current) => ({ ...current, pageSize }))}
        />
        <SegmentedSwitch
          density="compact"
          ariaLabel={t('scenario.editor.guidePrintOrientation')}
          activeId={settings.orientation}
          options={[
            { id: 'portrait', label: t('scenario.editor.guidePrintPortrait') },
            { id: 'landscape', label: t('scenario.editor.guidePrintLandscape') },
          ]}
          onChange={(orientation) => setSettings((current) => ({ ...current, orientation }))}
        />
        <SegmentedSwitch
          density="compact"
          ariaLabel={t('scenario.editor.guidePrintPagination')}
          activeId={settings.pagination}
          options={[
            { id: 'flow', label: t('scenario.editor.guideReaderFlow') },
            { id: 'step', label: t('scenario.editor.guidePrintStep') },
          ]}
          onChange={(pagination) => setSettings((current) => ({ ...current, pagination }))}
        />
      </fieldset>
      <p className="guide-print-status" role="status">
        {t(
          missing || failed
            ? 'scenario.editor.guidePrintError'
            : pending || loading
              ? 'scenario.editor.guidePrintPreparing'
              : 'scenario.editor.guidePrintHint'
        )}
      </p>
      <div className="guide-print-scroll">
        <div ref={documentRef} className="guide-print-paper">
          <GuideReadDocument project={project} images={images} t={t} />
        </div>
      </div>
    </main>
  );
}

/** Restores the reader command after closing the temporary print surface. */
export function useGuidePrintMode() {
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
    open: () => setActive(true),
    close: () => {
      restore.current = true;
      setActive(false);
    },
  };
}
