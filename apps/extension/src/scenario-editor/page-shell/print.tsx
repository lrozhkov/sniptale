import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SegmentedRow, ToggleField } from '../../ui/compact-inspector-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { GuideReadDocument } from './reader-document';
import './print.css';
import './export-workspace.css';

type GuidePrintSettings = GuideProject['print'] & { keepStepsTogether?: boolean };

/** Output settings and browser print readiness are disposable, never project mutations. */
export function GuidePrint({
  project,
  initialSettings = project.print,
  images,
  onClose,
  t,
}: {
  project: GuideProject;
  initialSettings?: GuidePrintSettings | undefined;
  images: Record<string, string | null>;
  onClose: (settings: GuidePrintSettings) => void;
  t: Translate;
}) {
  const [settings, setSettings] = useState<GuidePrintSettings>(initialSettings);
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
      data-keep-steps={settings.keepStepsTogether || undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose(settings);
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
          onClick={() => onClose(settings)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('scenario.editor.guidePrintBack')}</span>
        </ContentToolbarButton>
        <h1>{project.name}</h1>
        <ProductActionButton
          tone="secondary"
          disabled={pending || loading || missing}
          onClick={() => void print()}
        >
          <Printer size={16} aria-hidden="true" />
          {t('scenario.editor.guidePrintAction')}
        </ProductActionButton>
      </header>
      <PrintSettingsControls settings={settings} onChange={setSettings} pending={pending} t={t} />
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

/** Print options change only the disposable output settings, independently of readiness. */
function PrintSettingsControls({
  settings,
  onChange,
  pending,
  t,
}: {
  settings: GuidePrintSettings;
  onChange: (settings: GuidePrintSettings) => void;
  pending: boolean;
  t: Translate;
}) {
  return (
    <fieldset
      className="guide-print-settings guide-export-controls sniptale-inspector-surface"
      disabled={pending}
    >
      <legend className="sr-only">{t('scenario.editor.guidePrintSettings')}</legend>
      <SegmentedRow
        columns={2}
        label={t('scenario.editor.guidePrintPaper')}
        ariaLabel={t('scenario.editor.guidePrintPaper')}
        value={settings.pageSize}
        options={[
          { value: 'a4', label: 'A4' },
          { value: 'letter', label: t('scenario.editor.guidePrintLetter') },
        ]}
        onChange={(pageSize) => onChange({ ...settings, pageSize })}
      />
      <SegmentedRow
        columns={2}
        label={t('scenario.editor.guidePrintOrientation')}
        ariaLabel={t('scenario.editor.guidePrintOrientation')}
        value={settings.orientation}
        options={[
          { value: 'portrait', label: t('scenario.editor.guidePrintPortrait') },
          { value: 'landscape', label: t('scenario.editor.guidePrintLandscape') },
        ]}
        onChange={(orientation) => onChange({ ...settings, orientation })}
      />
      <SegmentedRow
        columns={2}
        label={t('scenario.editor.guidePrintPagination')}
        ariaLabel={t('scenario.editor.guidePrintPagination')}
        value={settings.pagination}
        options={[
          { value: 'flow', label: t('scenario.editor.guideReaderFlow') },
          { value: 'step', label: t('scenario.editor.guidePrintStep') },
        ]}
        onChange={(pagination) => onChange({ ...settings, pagination })}
      />
      {settings.pagination === 'flow' && (
        <ToggleField
          label={t('scenario.editor.guidePrintKeepSteps')}
          value={settings.keepStepsTogether ?? false}
          disabled={pending}
          onChange={(keepStepsTogether) => onChange({ ...settings, keepStepsTogether })}
        />
      )}
    </fieldset>
  );
}

/** Restores the reader command after closing the temporary print surface. */
export function useGuidePrintMode() {
  const [active, setActive] = useState(false);
  const [settings, setSettings] = useState<GuidePrintSettings>();
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
    settings,
    trigger,
    open: () => setActive(true),
    close: (next: GuidePrintSettings) => {
      setSettings(next);
      restore.current = true;
      setActive(false);
    },
  };
}
