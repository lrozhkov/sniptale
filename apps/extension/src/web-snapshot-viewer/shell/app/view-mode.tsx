import { useState } from 'react';
import { useCommandPress } from '@sniptale/ui/control-language/press';
import type { WebSnapshotViewport } from '@sniptale/runtime-contracts/web-snapshot';
import type { PagePackageScreenshotCoverage } from '@sniptale/runtime-contracts/page-package';
import { translate, type AppLocale } from '../../../platform/i18n';

export type WebSnapshotViewerMode = 'assets' | 'static-document' | 'visual';

const WEB_SNAPSHOT_VIEWER_MODES: readonly WebSnapshotViewerMode[] = [
  'static-document',
  'assets',
  'visual',
];

/** Return the localized name shared by a mode tab and its content panel. */
export function getViewerModeLabel(mode: WebSnapshotViewerMode, locale: AppLocale): string {
  const key =
    mode === 'assets'
      ? 'webSnapshotViewer.app.assetsMode'
      : mode === 'visual'
        ? 'webSnapshotViewer.app.visualMode'
        : 'webSnapshotViewer.app.staticDocumentMode';
  return translate(key, locale);
}

export function getViewerModeTabId(mode: WebSnapshotViewerMode): string {
  return `web-snapshot-mode-${mode}-tab`;
}

export function getViewerModePanelId(mode: WebSnapshotViewerMode): string {
  return `web-snapshot-mode-${mode}-panel`;
}

/** Keep inactive panel relationships available without mounting saved document consumers. */
export function InactiveViewerModePanels(props: { mode: WebSnapshotViewerMode }) {
  return WEB_SNAPSHOT_VIEWER_MODES.filter((mode) => mode !== props.mode).map((mode) => (
    <section
      key={mode}
      role="tabpanel"
      id={getViewerModePanelId(mode)}
      aria-labelledby={getViewerModeTabId(mode)}
      hidden
    />
  ));
}

const partialNoticeStyle = {
  background: [
    'color-mix(in srgb, var(--sniptale-color-warning-soft) 28%,',
    'var(--sniptale-color-surface-panel) 72%)',
  ].join(' '),
  borderColor: [
    'color-mix(in srgb, var(--sniptale-color-warning) 34%,',
    'var(--sniptale-color-border-soft) 66%)',
  ].join(' '),
} as const;

export function WebSnapshotViewerModeSwitch(props: {
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onModeChange: (mode: WebSnapshotViewerMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={translate('webSnapshotViewer.app.modeLabel', props.locale)}
      data-ui="web-snapshot-viewer.mode-tabs"
      className="ml-auto flex min-w-0 max-w-full gap-1 overflow-x-auto"
      onKeyDown={(event) => {
        const tabs = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        );
        const current = event.target instanceof HTMLButtonElement ? tabs.indexOf(event.target) : -1;
        if (current < 0) return;
        let next: number;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
        else return;
        event.preventDefault();
        tabs[next]?.click();
        tabs[next]?.focus();
      }}
    >
      <ModeButton
        active={props.mode === 'static-document'}
        mode="static-document"
        label={getViewerModeLabel('static-document', props.locale)}
        onClick={() => props.onModeChange('static-document')}
      />
      <ModeButton
        active={props.mode === 'assets'}
        mode="assets"
        label={getViewerModeLabel('assets', props.locale)}
        onClick={() => props.onModeChange('assets')}
      />
      <ModeButton
        active={props.mode === 'visual'}
        mode="visual"
        label={getViewerModeLabel('visual', props.locale)}
        onClick={() => props.onModeChange('visual')}
      />
    </div>
  );
}

function ModeButton(props: {
  active: boolean;
  label: string;
  mode: WebSnapshotViewerMode;
  onClick: () => void;
}) {
  const press = useCommandPress({ onClick: props.onClick });
  return (
    <button
      {...press.props}
      type="button"
      role="tab"
      id={getViewerModeTabId(props.mode)}
      aria-controls={getViewerModePanelId(props.mode)}
      aria-selected={props.active}
      tabIndex={props.active ? 0 : -1}
      data-command-press=""
      data-pressing={press.pressed ? 'true' : undefined}
      className={[
        'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap',
        'rounded-[4px] border-0 border-b-2 border-solid px-2.5 text-[13px] leading-[18px] font-medium',
        'bg-transparent focus-visible:outline-none',
        props.active
          ? 'border-[var(--sniptale-color-text-primary)] text-[var(--sniptale-color-text-primary)]'
          : 'border-transparent text-[var(--sniptale-color-text-secondary)]',
        'hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <span className="sniptale-command-content">{props.label}</span>
    </button>
  );
}

export function WebSnapshotVisualSurface(props: {
  locale: AppLocale;
  screenshotUrl: string;
  screenshotCoverage: PagePackageScreenshotCoverage;
  sourceTitle: string | null;
  viewport?: WebSnapshotViewport | undefined;
  zoom: number;
}) {
  const [decodedScreenshot, setDecodedScreenshot] = useState<{
    naturalWidth: number;
    url: string;
  } | null>(null);
  const capturedWidth = props.viewport?.width;
  const naturalWidth =
    decodedScreenshot?.url === props.screenshotUrl ? decodedScreenshot.naturalWidth : null;
  const logicalWidth =
    capturedWidth === undefined || naturalWidth === null
      ? capturedWidth
      : Math.min(capturedWidth, naturalWidth);
  const style =
    logicalWidth === undefined ? undefined : { width: `${logicalWidth * props.zoom}px` };
  const sourceTitle = props.sourceTitle?.trim();
  const alt = sourceTitle
    ? `${translate('webSnapshotViewer.app.visualAlt', props.locale)}: ${sourceTitle}`
    : translate('webSnapshotViewer.app.visualAlt', props.locale);

  return (
    <div className="relative min-h-full min-w-max bg-[var(--sniptale-color-surface-canvas)]">
      {props.screenshotCoverage === 'viewport' ? (
        <div
          className={[
            'absolute left-3 top-3 z-10 w-fit max-w-[min(32rem,calc(100vw-1.5rem))]',
            'rounded-[4px] border px-3 py-2 text-[14px] leading-5 font-normal shadow-sm',
            'text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
          role="status"
          style={partialNoticeStyle}
        >
          {translate('webSnapshotViewer.app.partialScreenshotNotice', props.locale)}
        </div>
      ) : null}
      <img
        alt={alt}
        className="mx-auto block h-auto max-w-none bg-white"
        data-testid="snapshot-visual-image"
        draggable={false}
        onLoad={(event) =>
          setDecodedScreenshot({
            naturalWidth: event.currentTarget.naturalWidth,
            url: props.screenshotUrl,
          })
        }
        src={props.screenshotUrl}
        style={style}
      />
    </div>
  );
}
