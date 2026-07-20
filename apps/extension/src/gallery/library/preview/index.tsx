import { useEffect } from 'react';
import { translate } from '../../../platform/i18n';
import { createSafeExternalHref } from '@sniptale/platform/security/safe-url';
import {
  isGalleryMediaItem,
  isGalleryScenarioExportItem,
  isGalleryScenarioItem,
  isGalleryVideoProjectItem,
} from '../items';
import type { PreviewPanelProps } from './types';
import { PreviewActions, PreviewMedia, PreviewMetadataCards, PreviewTagEditor } from './views';
import { formatDate, getGalleryItemKindLabel } from '../ui';

function isMetadataEditable(item: PreviewPanelProps['item']) {
  return isGalleryMediaItem(item) || isGalleryScenarioItem(item);
}

function UnavailableProjectNotice({ item }: Pick<PreviewPanelProps, 'item'>) {
  if (!isGalleryVideoProjectItem(item) || !item.unavailableReason) return null;
  const reasonKey =
    item.unavailableReason === 'unsupported-engine1'
      ? 'gallery.preview.unavailableUnsupportedProject'
      : 'gallery.preview.unavailableInvalidProject';
  return (
    <div
      role="alert"
      className="rounded-[16px] border border-[var(--sniptale-color-danger)] p-3 text-xs"
    >
      <p>{translate(reasonKey)}</p>
      <p className="mt-1 text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.preview.unavailableProjectRecovery')}
      </p>
    </div>
  );
}

function PreviewPanelHeader(props: Pick<PreviewPanelProps, 'item'>) {
  return (
    <div>
      <div>
        <div
          className="text-xs font-semibold uppercase tracking-[0.14em]
            text-[var(--sniptale-color-text-muted-strong)]"
        >
          {translate('gallery.preview.inspector')}
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{getGalleryItemKindLabel(props.item.kind)}</h2>
        <div className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">
          {formatDate(props.item.createdAt)}
        </div>
      </div>
    </div>
  );
}

function PreviewFilenameField(
  props: Pick<PreviewPanelProps, 'filenameDraft' | 'item' | 'onFilenameChange'>
) {
  const editable = isMetadataEditable(props.item);

  return (
    <div>
      <label
        className="mb-2 block text-xs font-semibold uppercase
          tracking-[0.12em] text-[var(--sniptale-color-text-muted-strong)]"
      >
        {isGalleryScenarioItem(props.item)
          ? translate('gallery.preview.scenarioName')
          : translate('gallery.preview.filename')}
      </label>
      <input
        value={props.filenameDraft}
        onChange={(event) => props.onFilenameChange(event.target.value)}
        readOnly={!editable}
        className="w-full rounded-[16px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-3 py-2.5 text-sm
          text-[var(--sniptale-color-text-primary)] outline-none transition
          focus:border-[var(--sniptale-color-border-accent-strong)] read-only:cursor-default"
      />
    </div>
  );
}

function PreviewSourceField(props: Pick<PreviewPanelProps, 'item'>) {
  const sourceValue =
    props.item.sourceUrl ??
    (isGalleryScenarioExportItem(props.item) ? props.item.project.name : null);
  const safeSourceHref = createSafeExternalHref(props.item.sourceUrl);

  return (
    <div>
      <label
        className="mb-2 block text-xs font-semibold uppercase
          tracking-[0.12em] text-[var(--sniptale-color-text-muted-strong)]"
      >
        {translate('gallery.preview.source')}
      </label>
      <div
        className="rounded-[16px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-3 py-2.5 text-xs
          text-[var(--sniptale-color-text-secondary)]"
      >
        {safeSourceHref ? (
          <a
            href={safeSourceHref}
            className="break-all text-[var(--sniptale-color-info)] hover:opacity-80"
            target="_blank"
            rel="noreferrer"
          >
            {props.item.sourceUrl}
          </a>
        ) : (
          (sourceValue ?? translate('gallery.preview.sourceMissing'))
        )}
      </div>
    </div>
  );
}

function PreviewPanelSidebar(props: PreviewPanelProps) {
  return (
    <aside
      className="w-[360px] shrink-0 border-l border-[var(--sniptale-color-border-soft)]
        bg-[linear-gradient(
          180deg,
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)_0%,
          color-mix(in_srgb,var(--sniptale-color-surface-canvas)_82%,transparent)_100%
        )]
        p-5 text-[var(--sniptale-color-text-primary)]"
    >
      <PreviewPanelHeader item={props.item} />
      <div className="mt-6 space-y-4">
        <PreviewFilenameField
          filenameDraft={props.filenameDraft}
          item={props.item}
          onFilenameChange={props.onFilenameChange}
        />
        <UnavailableProjectNotice item={props.item} />
        <PreviewMetadataCards item={props.item} />
        <PreviewSourceField item={props.item} />
        <PreviewTagEditor
          {...(props.allTags === undefined ? {} : { allTags: props.allTags })}
          item={props.item}
          tagDraft={props.tagDraft}
          tagDrafts={props.tagDrafts}
          onTagDraftChange={props.onTagDraftChange}
          onRemoveTag={props.onRemoveTag}
          onAddTag={props.onAddTag}
        />
        <PreviewActions {...props} />
      </div>
    </aside>
  );
}

export function PreviewPanel(props: PreviewPanelProps) {
  const { item, previewUrl } = props;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.filename}
      className="fixed inset-0 z-40 flex
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_72%,black_20%)]
      "
    >
      <div className="flex min-h-0 flex-1 px-4 py-4">
        <div
          className="flex h-full w-full overflow-hidden rounded-[20px]
            border border-[var(--sniptale-color-border-soft)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]
            text-[var(--sniptale-color-text-primary)] shadow-sm"
        >
          <PreviewMedia
            item={item}
            previewUrl={previewUrl}
            inspectorCollapsed={props.inspectorCollapsed}
            onInspectorToggle={props.onInspectorToggle}
            onClose={props.onClose}
          />
          {props.inspectorCollapsed ? null : <PreviewPanelSidebar {...props} />}
        </div>
      </div>
    </div>
  );
}
