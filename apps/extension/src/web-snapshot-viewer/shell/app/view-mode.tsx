import type { WebSnapshotViewport } from '@sniptale/runtime-contracts/web-snapshot';
import { translate, type AppLocale } from '../../../platform/i18n';

export type WebSnapshotViewerMode = 'static-document' | 'visual';

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
        active={props.mode === 'visual'}
        label={translate('webSnapshotViewer.app.visualMode', props.locale)}
        onClick={() => props.onModeChange('visual')}
      />
      <ModeButton
        active={props.mode === 'static-document'}
        label={translate('webSnapshotViewer.app.staticDocumentMode', props.locale)}
        onClick={() => props.onModeChange('static-document')}
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
  sourceTitle: string | null;
  viewport?: WebSnapshotViewport | undefined;
}) {
  const width = props.viewport?.width;
  const style = width === undefined ? undefined : { width: `${width}px` };
  const sourceTitle = props.sourceTitle?.trim();
  const alt = sourceTitle
    ? `${translate('webSnapshotViewer.app.visualAlt', props.locale)}: ${sourceTitle}`
    : translate('webSnapshotViewer.app.visualAlt', props.locale);

  return (
    <div className="h-full overflow-auto bg-[var(--sniptale-color-surface-canvas)]">
      <img
        alt={alt}
        className="mx-auto block h-auto max-w-none bg-white"
        data-testid="snapshot-visual-image"
        draggable={false}
        src={props.screenshotUrl}
        style={style}
      />
    </div>
  );
}
