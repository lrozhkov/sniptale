import {
  EffectCatalogPreview,
  EffectCatalogPreviewProvider,
} from '../../../ui/effect-catalog-preview';
import { useState } from 'react';
import { Plus, Check, GripVertical } from 'lucide-react';
import {
  describeCatalogDocument,
  getEffectCatalogThemes,
  queryEffectCatalog,
  type EffectCatalogFilter,
} from '../../../features/video/project/effect-bundle/catalog/query';
import { EffectCatalogControls } from '../../../ui/effect-catalog-controls';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { writeVideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import { getCurrentLocale, translate } from '../../../platform/i18n';
import type { EffectLibraryOperations } from './operations';
import type { VideoEditorEffectsLibraryDockProps } from './types';

const CATALOG_CARD_CLASS_NAME =
  'space-y-2 border-b border-[var(--sniptale-color-border-soft)] pb-3';
const DOCUMENT_CARD_CLASS_NAME = [
  'effect-catalog-card group grid min-w-0 grid-cols-[minmax(64px,36%)_minmax(0,1fr)] items-center gap-2',
  'rounded-[6px] border p-1.5 cursor-grab active:cursor-grabbing',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

export function CatalogSection(
  props: VideoEditorEffectsLibraryDockProps & { disabled: boolean } & Pick<
      EffectLibraryOperations,
      'run'
    >
): React.JSX.Element {
  const [filter, setFilter] = useState<EffectCatalogFilter>({
    query: '',
    kind: 'all',
    theme: 'all',
  });
  const catalogs = props.catalogs.flatMap((item) =>
    item.status === 'ready' && item.catalog.enabled ? [item.catalog] : []
  );
  const themes = getEffectCatalogThemes(catalogs);
  const effectiveFilter: EffectCatalogFilter = {
    ...filter,
    theme: themes.some((theme) => theme === filter.theme) ? filter.theme : 'all',
  };
  const visibleCatalogs = catalogs.filter(
    (catalog) => queryEffectCatalog(catalog, effectiveFilter, getCurrentLocale()).length > 0
  );
  return (
    <EffectCatalogPreviewProvider>
      <section
        aria-label={translate('videoEditor.effectsLibrary.effectV1Label')}
        className="flex min-h-0 flex-1 flex-col"
      >
        {props.catalogs.length > 0 && (
          <div className="shrink-0 border-b border-[var(--sniptale-color-border-soft)] p-2">
            <EffectCatalogControls
              themes={themes}
              filter={effectiveFilter}
              onChange={setFilter}
              disabled={props.disabled}
            />
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {!props.isLoading && props.catalogs.length === 0 && (
            <p className="px-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
              {translate('videoEditor.effectsLibrary.noImportedPacks')}
            </p>
          )}
          {props.catalogs.length > 0 && visibleCatalogs.length === 0 && (
            <p
              role="status"
              className="px-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]"
            >
              {translate('videoEditor.effectsLibrary.noSearchResults')}
            </p>
          )}
          {visibleCatalogs.map((catalog) => (
            <CatalogEntry
              key={catalog.packId}
              catalog={catalog}
              {...props}
              filter={effectiveFilter}
            />
          ))}
        </div>
      </section>
    </EffectCatalogPreviewProvider>
  );
}

function CatalogEntry(
  props: VideoEditorEffectsLibraryDockProps & {
    catalog: EffectBundleCatalogEntry;
    disabled: boolean;
    filter: EffectCatalogFilter;
  } & Pick<EffectLibraryOperations, 'run'>
): React.JSX.Element {
  const { catalog } = props;
  const documents = queryEffectCatalog(catalog, props.filter, getCurrentLocale());
  return (
    <article className={CATALOG_CARD_CLASS_NAME}>
      {catalog.documents.length > 1 && (
        <div className="flex min-w-0 items-center justify-between gap-2 px-1">
          <h3 className="min-w-0 break-words text-[13px] font-semibold">
            {readLocalized(catalog.label)}
          </h3>
        </div>
      )}
      {catalog.enabled ? (
        documents.map((document) => (
          <CatalogDocument key={document.id} document={document} {...props} />
        ))
      ) : (
        <p className="px-1 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.effectsLibrary.disabledPack')}
        </p>
      )}
    </article>
  );
}

function CatalogDocument(
  props: Parameters<typeof CatalogEntry>[0] & {
    document: EffectBundleCatalogEntry['documents'][number];
  }
): React.JSX.Element {
  const target = resolveDocumentTarget(props.document.kind, props);
  const metadata = describeCatalogDocument(props.document, getCurrentLocale());
  return (
    <div
      className={DOCUMENT_CARD_CLASS_NAME}
      data-effect-document={props.document.id}
      draggable={!props.disabled}
      onDragStart={(event) =>
        writeVideoEditorEffectDocumentDragPayload(event.dataTransfer, {
          documentId: props.document.id,
          kind: props.document.kind,
          packId: props.catalog.packId,
        })
      }
    >
      <EffectCatalogPreview
        catalog={props.catalog}
        document={props.document}
        captureFrame={props.capturePreviewFrame}
      />
      <div className="flex min-w-0 flex-col items-stretch gap-1">
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-medium text-[var(--sniptale-color-text-primary)]">
            {metadata.label}
          </p>
          {metadata.theme !== 'unspecified' && (
            <span className="text-[10px] text-[var(--sniptale-color-text-muted)]">
              {translate(
                metadata.theme === 'dark'
                  ? 'videoEditor.effectsLibrary.darkTheme'
                  : 'videoEditor.effectsLibrary.lightTheme'
              )}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          {props.document.kind !== 'standalone' && (
            <span
              title={translate(
                props.document.kind === 'targetEffect'
                  ? 'videoEditor.effectsLibrary.dragToClip'
                  : 'videoEditor.effectsLibrary.dragToTransition'
              )}
              className="shrink-0 text-[var(--sniptale-color-text-muted)]"
            >
              <GripVertical size={14} aria-hidden="true" />
            </span>
          )}
          <ProductActionButton
            compact
            tone="secondary"
            className="self-end !min-w-0"
            title={getDocumentActionLabel(props.document.kind, target)}
            aria-label={getDocumentActionLabel(props.document.kind, target)}
            disabled={props.disabled || !target}
            onClick={() =>
              target &&
              void props.run('apply', () =>
                props.onApplyEffect({
                  catalog: props.catalog,
                  documentId: props.document.id,
                  startTime: props.currentTime,
                  target,
                })
              )
            }
          >
            {props.document.kind === 'standalone' ? (
              <Plus size={14} aria-hidden="true" />
            ) : (
              <Check size={14} aria-hidden="true" />
            )}
            <span className="effect-catalog-apply-label">
              {translate(
                props.document.kind === 'standalone'
                  ? 'common.actions.add'
                  : 'videoEditor.effectsLibrary.apply'
              )}
            </span>
          </ProductActionButton>
        </div>
      </div>
    </div>
  );
}

function getDocumentActionLabel(
  kind: EffectBundleCatalogEntry['documents'][number]['kind'],
  target: VideoProjectEffectTarget | null
): string {
  if (!target) {
    return kind === 'targetEffect'
      ? translate('videoEditor.effectsLibrary.selectClipTarget')
      : translate('videoEditor.effectsLibrary.selectTransitionTarget');
  }
  if (kind === 'standalone') return translate('videoEditor.effectsLibrary.applyToScene');
  if (kind === 'targetEffect') return translate('videoEditor.effectsLibrary.applyToClip');
  return translate('videoEditor.effectsLibrary.applyToTransition');
}

function resolveDocumentTarget(
  kind: EffectBundleCatalogEntry['documents'][number]['kind'],
  props: Pick<VideoEditorEffectsLibraryDockProps, 'selectedClipId' | 'selectedTransitionId'>
): VideoProjectEffectTarget | null {
  if (kind === 'standalone') return { kind: 'scene' };
  if (kind === 'targetEffect') {
    return props.selectedClipId ? { clipId: props.selectedClipId, kind: 'clip' } : null;
  }
  return props.selectedTransitionId
    ? { kind: 'transition', transitionId: props.selectedTransitionId }
    : null;
}

function readLocalized(value: { en: string; ru: string }): string {
  return getCurrentLocale() === 'ru' ? value.ru : value.en;
}
