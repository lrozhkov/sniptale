import { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { ProductGlassInput, ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
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
  'flex min-w-0 flex-col gap-2 rounded-[8px] border p-2',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

export function CatalogSection(
  props: VideoEditorEffectsLibraryDockProps & { disabled: boolean } & Pick<
      EffectLibraryOperations,
      'run'
    >
): React.JSX.Element {
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase(getCurrentLocale());
  const matches = (value: string) => value.toLocaleLowerCase(getCurrentLocale()).includes(search);
  const visibleCatalogs = props.catalogs.filter((item) =>
    item.status === 'invalid'
      ? matches(translate('videoEditor.effectsLibrary.invalidPack'))
      : matches(readLocalized(item.catalog.label)) ||
        item.catalog.documents.some((document) => matches(readDocumentLabel(document)))
  );
  return (
    <section
      aria-label={translate('videoEditor.effectsLibrary.effectV1Label')}
      className="space-y-3"
    >
      {props.catalogs.length > 0 && (
        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className={[
              'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2',
              'text-[var(--sniptale-color-text-muted)]',
            ].join(' ')}
          />
          <ProductGlassInput
            className="!h-9 w-full !pl-8"
            aria-label={translate('videoEditor.effectsLibrary.searchPlaceholder')}
            placeholder={translate('videoEditor.effectsLibrary.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
      )}
      {!props.isLoading && props.catalogs.length === 0 && (
        <p className="px-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.effectsLibrary.noImportedPacks')}
        </p>
      )}
      {props.catalogs.length > 0 && visibleCatalogs.length === 0 && (
        <p role="status" className="px-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.effectsLibrary.noSearchResults')}
        </p>
      )}
      {visibleCatalogs.map((item) =>
        item.status === 'ready' ? (
          <CatalogEntry
            key={item.catalog.packId}
            catalog={item.catalog}
            {...props}
            search={search}
          />
        ) : (
          <InvalidCatalogEntry key={item.packId} packId={item.packId} {...props} />
        )
      )}
    </section>
  );
}

function InvalidCatalogEntry(
  props: Pick<VideoEditorEffectsLibraryDockProps, 'onDeleteEffectBundle'> & {
    disabled: boolean;
    packId: string;
  } & Pick<EffectLibraryOperations, 'run'>
): React.JSX.Element {
  return (
    <article className={CATALOG_CARD_CLASS_NAME} data-state="invalid">
      <h4 className="text-sm font-medium">{translate('videoEditor.effectsLibrary.invalidPack')}</h4>
      <p className="break-all text-xs text-[var(--sniptale-color-text-muted)]">{props.packId}</p>
      <p className="text-xs text-[var(--sniptale-color-danger)]">
        {translate('videoEditor.effectsLibrary.invalidPackDescription')}
      </p>
      <ProductActionButton
        compact
        tone="danger"
        disabled={props.disabled}
        onClick={() => void props.run('delete', () => props.onDeleteEffectBundle(props.packId))}
      >
        {translate('videoEditor.effectsLibrary.deletePack')}
      </ProductActionButton>
    </article>
  );
}

function CatalogEntry(
  props: VideoEditorEffectsLibraryDockProps & {
    catalog: EffectBundleCatalogEntry;
    disabled: boolean;
    search: string;
  } & Pick<EffectLibraryOperations, 'run'>
): React.JSX.Element {
  const { catalog } = props;
  const packMatches = readLocalized(catalog.label)
    .toLocaleLowerCase(getCurrentLocale())
    .includes(props.search);
  const documents = catalog.documents.filter(
    (document) =>
      packMatches ||
      readDocumentLabel(document).toLocaleLowerCase(getCurrentLocale()).includes(props.search)
  );
  return (
    <article className={CATALOG_CARD_CLASS_NAME}>
      <div className="flex min-w-0 items-center justify-between gap-2 px-1">
        <h3 className="min-w-0 break-words text-[13px] font-semibold">
          {readLocalized(catalog.label)}
        </h3>
        <CatalogActions {...props} />
      </div>
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

function CatalogActions(props: Parameters<typeof CatalogEntry>[0]): React.JSX.Element {
  const toggleLabel = translate(
    props.catalog.enabled
      ? 'videoEditor.effectsLibrary.disablePack'
      : 'videoEditor.effectsLibrary.enablePack'
  );
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ProductGlassSwitch
        on={props.catalog.enabled}
        aria-pressed={props.catalog.enabled}
        aria-label={toggleLabel}
        title={toggleLabel}
        disabled={props.disabled}
        onClick={() =>
          void props.run('update', () =>
            props.onSetEffectBundleEnabled(props.catalog.packId, !props.catalog.enabled)
          )
        }
      />
      <EditorIconButton
        className="!h-8 !w-8 text-[var(--sniptale-color-danger)]"
        title={translate('videoEditor.effectsLibrary.deletePack')}
        disabled={props.disabled}
        onClick={() =>
          void props.run('delete', () => props.onDeleteEffectBundle(props.catalog.packId))
        }
      >
        <Trash2 size={15} aria-hidden="true" />
      </EditorIconButton>
    </div>
  );
}

function CatalogDocument(
  props: Parameters<typeof CatalogEntry>[0] & {
    document: EffectBundleCatalogEntry['documents'][number];
  }
): React.JSX.Element {
  const target = resolveDocumentTarget(props.document.kind, props);
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
      <div>
        <p
          className={
            props.catalog.documents.length === 1 &&
            readDocumentLabel(props.document) === readLocalized(props.catalog.label)
              ? 'sr-only'
              : 'break-words text-[13px] font-medium text-[var(--sniptale-color-text-primary)]'
          }
        >
          {readDocumentLabel(props.document)}
        </p>
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {getDocumentKindLabel(props.document.kind)}
        </p>
      </div>
      <ProductActionButton
        compact
        tone={target ? 'primary' : 'secondary'}
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
        {getDocumentActionLabel(props.document.kind, target)}
      </ProductActionButton>
    </div>
  );
}

function getDocumentKindLabel(kind: EffectBundleCatalogEntry['documents'][number]['kind']): string {
  if (kind === 'standalone') return translate('videoEditor.effectsLibrary.documentKindScene');
  if (kind === 'targetEffect') return translate('videoEditor.effectsLibrary.documentKindClip');
  return translate('videoEditor.effectsLibrary.documentKindTransition');
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

function readDocumentLabel(document: EffectBundleCatalogEntry['documents'][number]): string {
  const parsed = parseEffectV1Source(document.source).document;
  return parsed
    ? (parsed.label[getCurrentLocale()] ?? parsed.label.en ?? getDocumentKindLabel(document.kind))
    : getDocumentKindLabel(document.kind);
}
