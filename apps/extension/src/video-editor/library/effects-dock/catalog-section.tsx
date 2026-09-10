import { AnnotationSourcePreview } from './source-preview';
import { CompactSelect } from '../../../ui/compact-inspector-controls';
import { useWorkspacePreference } from '../../runtime/controller/workspace-preferences';
import { useEffectDocumentDrag } from '../../chrome/effect-document-drag';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import {
  EffectCatalogPreview,
  EffectCatalogPreviewProvider,
} from '../../../ui/effect-catalog-preview';
import { useState } from 'react';
import { Plus, Check, ArrowRightToLine, ScanEye } from 'lucide-react';
import {
  describeCatalogDocument,
  getEffectCatalogThemes,
  queryEffectCatalog,
  type EffectCatalogFilter,
} from '../../../features/video/project/effect-bundle/catalog/query';
import { EffectCatalogControls } from '../../../ui/effect-catalog-controls';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { writeVideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import { getCurrentLocale, translate } from '../../../platform/i18n';
import type { EffectLibraryOperations } from './operations';
import type { VideoEditorEffectsLibraryDockProps } from './types';

const CATALOG_CARD_CLASS_NAME = 'contents';
const DOCUMENT_CARD_CLASS_NAME = [
  'effect-catalog-card group/effect-card flex min-w-0 flex-col items-stretch gap-1.5',
  'rounded-[6px] border p-1.5 cursor-grab active:cursor-grabbing',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

export function CatalogSection(
  props: VideoEditorEffectsLibraryDockProps & { disabled: boolean } & Pick<
      EffectLibraryOperations,
      'run'
    >
): React.JSX.Element {
  const [sourcePreview, setSourcePreview] = useState<{
    catalog: EffectBundleCatalogEntry;
    document: EffectBundleCatalogEntry['documents'][number];
  } | null>(null);
  const [filters, setFilters] = useWorkspacePreference('effectLibraryFilters');
  const key = props.kind ?? 'all';
  const filter: EffectCatalogFilter = { query: '', kind: 'all', theme: 'all', ...filters?.[key] };
  const setFilter = (next: EffectCatalogFilter) =>
    setFilters((current) => ({
      ...current,
      [key]: { query: next.query.slice(0, 256), theme: next.theme },
    }));
  const [scope, setScope] = useState<'selection' | 'clip' | 'track' | 'video-group'>('selection');
  const targetScope =
    scope === 'selection'
      ? props.selectedClipId
        ? 'clip'
        : props.selectedTrackId
          ? 'track'
          : props.effectTarget?.kind === 'video-group'
            ? 'video-group'
            : 'clip'
      : scope;
  const effectTarget: VideoProjectEffectTarget | null =
    targetScope === 'clip'
      ? props.selectedClipId
        ? { kind: 'clip', clipId: props.selectedClipId }
        : null
      : targetScope === 'track'
        ? props.selectedTrackId
          ? { kind: 'track', trackId: props.selectedTrackId }
          : null
        : { kind: 'video-group' };
  const catalogs = props.catalogs.flatMap((item) =>
    item.status === 'ready' && item.catalog.enabled ? [item.catalog] : []
  );
  const themes = getEffectCatalogThemes(
    catalogs.map((catalog) => ({
      ...catalog,
      documents: catalog.documents.filter(
        (document) => !props.kind || document.kind === props.kind
      ),
    })),
    getCurrentLocale()
  );
  const effectiveFilter: EffectCatalogFilter = {
    ...filter,
    kind: props.kind ?? filter.kind,
    theme: themes.some((theme) => theme.value === filter.theme) ? filter.theme : 'all',
  };
  const visibleCatalogs = catalogs.filter(
    (catalog) => queryEffectCatalog(catalog, effectiveFilter, getCurrentLocale()).length > 0
  );
  return (
    <EffectCatalogPreviewProvider>
      {sourcePreview ? (
        <AnnotationSourcePreview
          {...props}
          {...sourcePreview}
          onClose={() => setSourcePreview(null)}
        />
      ) : (
        <section
          aria-label={translate('videoEditor.effectsLibrary.effectV1Label')}
          className="flex min-h-0 flex-1 flex-col"
        >
          {props.catalogs.length > 0 && (
            <div className="shrink-0 border-b border-[var(--sniptale-color-border-soft)] p-2">
              <EffectCatalogControls
                themes={themes}
                hideCategories
                filter={effectiveFilter}
                onChange={setFilter}
                disabled={props.disabled}
              />
            </div>
          )}
          {props.kind === 'targetEffect' && (
            <label
              className={[
                'flex items-center gap-2 border-b px-2 py-1 text-xs',
                'border-[var(--sniptale-color-border-soft)]',
              ].join(' ')}
            >
              <span>{translate('videoEditor.effectsLibrary.applyTo')}</span>
              <CompactSelect
                value={targetScope}
                containerClassName="min-w-0 flex-1"
                aria-label={translate('videoEditor.effectsLibrary.applyTo')}
                onChange={setScope}
                options={[
                  {
                    value: 'clip',
                    label: translate('videoEditor.effectsLibrary.selectedClip'),
                    disabled: !props.selectedClipId,
                  },
                  {
                    value: 'track',
                    label: translate('videoEditor.effectsLibrary.selectedTrack'),
                    disabled: !props.selectedTrackId,
                  },
                  {
                    value: 'video-group',
                    label: translate('videoEditor.effectsLibrary.wholeVideo'),
                  },
                ]}
              />
            </label>
          )}
          <div
            className={[
              'grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(128px,1fr))] content-start',
              'auto-rows-max gap-2 overflow-y-auto p-2',
            ].join(' ')}
          >
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
                onPreview={(document) => setSourcePreview({ catalog, document })}
                filter={effectiveFilter}
                effectTarget={effectTarget}
              />
            ))}
          </div>
        </section>
      )}
    </EffectCatalogPreviewProvider>
  );
}

function CatalogEntry(
  props: VideoEditorEffectsLibraryDockProps & {
    catalog: EffectBundleCatalogEntry;
    onPreview(document: EffectBundleCatalogEntry['documents'][number]): void;
    disabled: boolean;
    filter: EffectCatalogFilter;
  } & Pick<EffectLibraryOperations, 'run'>
): React.JSX.Element {
  const { catalog } = props;
  const documents = queryEffectCatalog(catalog, props.filter, getCurrentLocale());
  return (
    <article className={CATALOG_CARD_CLASS_NAME}>
      {catalog.documents.length > 1 && (
        <div className="col-span-full flex min-w-0 items-center justify-between gap-2 px-1">
          <h3 className="min-w-0 break-words text-[13px] font-semibold">
            {readLocalized(catalog.label)}
          </h3>
        </div>
      )}
      {catalog.enabled ? (
        documents.map((document) => (
          <CatalogDocument
            key={`${document.id}:${document.previewPresetId ?? ''}`}
            document={document}
            {...props}
          />
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
  const drag = useEffectDocumentDrag();
  const target = resolveDocumentTarget(props.document.kind, props);
  const metadata = describeCatalogDocument(props.document, getCurrentLocale());
  return (
    <div
      className={DOCUMENT_CARD_CLASS_NAME}
      data-effect-document={props.document.id}
      draggable={!props.disabled}
      onDragStart={(event) => {
        const payload = {
          documentId: props.document.id,
          ...(props.document.previewPresetId
            ? { controlPresetId: props.document.previewPresetId }
            : {}),
          kind: props.document.kind,
          packId: props.catalog.packId,
        };
        writeVideoEditorEffectDocumentDragPayload(event.dataTransfer, payload);
        const duration = parseEffectV1Source(props.document.source).document?.duration;
        if (duration) drag.start({ ...payload, duration });
      }}
      onDragEnd={drag.end}
    >
      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="break-words text-[11px] leading-4 font-medium text-[var(--sniptale-color-text-primary)]">
            {metadata.label}
          </p>
          {(metadata.themeLabel || metadata.styleLabel) && (
            <span className="text-[10px] text-[var(--sniptale-color-text-muted)]">
              {[metadata.themeLabel, metadata.styleLabel].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <div
          className={[
            'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100',
            'group-hover/effect-card:opacity-100 group-focus-within/effect-card:opacity-100',
            '[@media(hover:none)]:opacity-100 motion-reduce:transition-none',
          ].join(' ')}
        >
          {props.document.kind === 'standalone' && (
            <EditorIconButton
              className="!h-6 !w-6 !min-w-6"
              title={translate('videoEditor.effectsLibrary.previewAnnotation')}
              onClick={() => props.onPreview(props.document)}
            >
              <ScanEye size={14} />
            </EditorIconButton>
          )}
          <EditorIconButton
            className="!h-6 !w-6 !min-w-6"
            title={getDocumentActionLabel(props.document.kind, target)}
            aria-label={getDocumentActionLabel(props.document.kind, target)}
            disabled={props.disabled || !target}
            onClick={() =>
              target &&
              void props.run('apply', () =>
                props.onApplyEffect({
                  catalog: props.catalog,
                  documentId: props.document.id,
                  ...(props.document.previewPresetId
                    ? { controlPresetId: props.document.previewPresetId }
                    : {}),
                  startTime: props.currentTime,
                  ...(props.document.kind === 'standalone' && props.selectedTrackId
                    ? { trackId: props.selectedTrackId }
                    : {}),
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
          </EditorIconButton>
          {props.document.kind === 'standalone' && props.appendTime !== undefined && (
            <EditorIconButton
              className="!h-6 !w-6 !min-w-6"
              title={translate('videoEditor.app.materialsAppend')}
              disabled={props.disabled || !target}
              onClick={() =>
                target &&
                void props.run('apply', () =>
                  props.onApplyEffect({
                    catalog: props.catalog,
                    documentId: props.document.id,
                    ...(props.document.previewPresetId
                      ? { controlPresetId: props.document.previewPresetId }
                      : {}),
                    startTime: props.appendTime!,
                    ...(props.selectedTrackId ? { trackId: props.selectedTrackId } : {}),
                    target,
                  })
                )
              }
            >
              <ArrowRightToLine size={14} aria-hidden="true" />
            </EditorIconButton>
          )}
        </div>
      </div>
      <EffectCatalogPreview
        catalog={props.catalog}
        document={props.document}
        captureFrame={props.capturePreviewFrame}
      />
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
  if (kind === 'targetEffect')
    return translate(
      target?.kind === 'track'
        ? 'videoEditor.effectsLibrary.selectedTrack'
        : target?.kind === 'video-group'
          ? 'videoEditor.effectsLibrary.wholeVideo'
          : 'videoEditor.effectsLibrary.applyToClip'
    );
  return translate('videoEditor.effectsLibrary.applyToTransition');
}

function resolveDocumentTarget(
  kind: EffectBundleCatalogEntry['documents'][number]['kind'],
  props: Pick<
    VideoEditorEffectsLibraryDockProps,
    'selectedClipId' | 'selectedTransitionId' | 'effectTarget'
  >
): VideoProjectEffectTarget | null {
  if (kind === 'standalone') return { kind: 'scene' };
  if (kind === 'targetEffect') {
    return props.effectTarget === undefined
      ? props.selectedClipId
        ? { clipId: props.selectedClipId, kind: 'clip' }
        : null
      : props.effectTarget;
  }
  return props.selectedTransitionId
    ? { kind: 'transition', transitionId: props.selectedTransitionId }
    : null;
}

function readLocalized(value: { en: string; ru: string }): string {
  return getCurrentLocale() === 'ru' ? value.ru : value.en;
}
