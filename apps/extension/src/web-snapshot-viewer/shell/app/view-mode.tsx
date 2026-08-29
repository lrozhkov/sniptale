import { useState } from 'react';
import type { WebSnapshotViewport } from '@sniptale/runtime-contracts/web-snapshot';
import type { PagePackageScreenshotCoverage } from '@sniptale/runtime-contracts/page-package';
import { translate, type AppLocale } from '../../../platform/i18n';

export type WebSnapshotViewerMode = 'assets' | 'static-document' | 'visual';

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
      role="group"
      aria-label={translate('webSnapshotViewer.app.modeLabel', props.locale)}
      className="ml-auto flex shrink-0 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-muted)] p-0.5"
    >
      <ModeButton
        active={props.mode === 'static-document'}
        label={translate('webSnapshotViewer.app.staticDocumentMode', props.locale)}
        onClick={() => props.onModeChange('static-document')}
      />
      <ModeButton
        active={props.mode === 'assets'}
        label={translate('webSnapshotViewer.app.assetsMode', props.locale)}
        onClick={() => props.onModeChange('assets')}
      />
      <ModeButton
        active={props.mode === 'visual'}
        label={translate('webSnapshotViewer.app.visualMode', props.locale)}
        onClick={() => props.onModeChange('visual')}
      />
    </div>
  );
}

function ModeButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      className={`rounded-[6px] px-3 py-1.5 text-xs font-semibold transition
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]
        ${
          props.active
            ? 'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)] shadow-sm'
            : 'text-[var(--sniptale-color-text-muted)] hover:text-[var(--sniptale-color-text-primary)]'
        }`}
      onClick={props.onClick}
    >
      {props.label}
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
            'rounded-lg border px-3 py-2 text-xs shadow-sm',
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
