import { TriangleAlert } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type { EditorVectorProvenance } from '../../../features/editor/document/vector-element';
import type {
  EditorVectorCatalogEntry,
  EditorVectorLibrarySnapshot,
} from '../../application/vector-elements/session';
import { type PointerEvent } from 'react';
import { getEditorVectorPresentation, type EditorIconAppearance } from './presentation';

export function EditorVectorSourceNotice({
  provenance,
  name,
  compact = false,
}: {
  provenance: EditorVectorProvenance;
  name: string;
  compact?: boolean;
}) {
  const authorUrl = sanitizeProvenanceUrl(provenance.authorUrl);
  const licenseUrl = sanitizeProvenanceUrl(provenance.licenseUrl);
  const identity = provenance.prefix ? `${provenance.prefix}:${name}` : name;
  return (
    <div
      className="min-w-0 text-xs leading-4 text-[var(--sniptale-color-text-secondary)]"
      data-ui="editor.elements.source-notice"
    >
      <div
        className={compact ? 'truncate' : 'break-words'}
        title={`${identity} · ${provenance.sourceId}`}
      >
        {identity}
        {compact ? ` · ${provenance.sourceId}` : null}
      </div>
      {!compact ? <div className="break-words">{provenance.sourceId}</div> : null}
      <div className={`flex min-w-0 gap-1 ${compact ? '' : 'flex-wrap'}`}>
        {provenance.author ? (
          authorUrl ? (
            <a
              href={authorUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate underline"
              title={provenance.author}
            >
              {provenance.author}
            </a>
          ) : (
            <span className="truncate" title={provenance.author}>
              {provenance.author}
            </span>
          )
        ) : null}
        {licenseUrl ? (
          <a
            href={licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate underline"
            title={provenance.license ?? translate('editor.elements.info')}
          >
            {provenance.license ?? translate('editor.elements.info')}
          </a>
        ) : (
          <span className="truncate">
            {provenance.license ?? translate('editor.elements.licenseUnknown')}
          </span>
        )}
      </div>
    </div>
  );
}

/** Resolves display metadata without exposing provider addresses in catalog hints. */
export function editorVectorCollectionName(
  entry: EditorVectorCatalogEntry,
  state: Pick<EditorVectorLibrarySnapshot, 'remoteCollections' | 'local'>
): string {
  const collection = state.local.collections.find((candidate) =>
    state.local.members.some(
      (member) =>
        member.definitionId === entry.key &&
        member.collectionId === candidate.id &&
        member.collectionIncarnation === candidate.incarnation
    )
  );
  return (
    collection?.name ??
    state.remoteCollections.find((candidate) => candidate.prefix === entry.prefix)?.name ??
    entry.prefix ??
    ''
  );
}

export function EditorElementsGrid(props: {
  entries: EditorVectorCatalogEntry[];
  selectedKey: string | null;
  appearance: EditorIconAppearance;
  onSelect(entry: EditorVectorCatalogEntry): void;
  onAdd(entry: EditorVectorCatalogEntry): void;
  collectionNames?: ReadonlyMap<string, string>;
  onPointerDown(event: PointerEvent<HTMLButtonElement>, entry: EditorVectorCatalogEntry): void;
}) {
  return (
    <div
      role="list"
      aria-label={translate('editor.elements.title')}
      className="grid grid-cols-6 gap-1.5"
      data-ui="editor.elements.grid"
    >
      {props.entries.map((entry) => (
        <div role="listitem" key={entry.key} className="relative min-w-0">
          <button
            type="button"
            aria-label={entry.prefix ? `${entry.prefix}:${entry.name}` : entry.name}
            aria-pressed={props.selectedKey === entry.key}
            title={[entry.name, props.collectionNames?.get(entry.key) ?? entry.prefix]
              .filter(Boolean)
              .join(' · ')}
            className={[
              'flex aspect-square w-full min-w-0 items-center justify-center',
              'rounded-[4px] border p-1 text-xs focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-[var(--sniptale-color-accent)]',
              'hover:bg-[var(--sniptale-color-surface-hover)]',
              props.selectedKey === entry.key
                ? 'border-[var(--sniptale-color-accent)]'
                : 'border-transparent',
            ].join(' ')}
            data-ui="editor.elements.card"
            data-entry-key={entry.key}
            onClick={() => props.onSelect(entry)}
            onPointerDown={(event) => props.onPointerDown(event, entry)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                props.onSelect(entry);
                props.onAdd(entry);
              }
            }}
          >
            <span
              className="flex h-full w-full items-center justify-center rounded-[4px]"
              style={{ backgroundColor: props.appearance.background }}
            >
              {entry.definition ? (
                <img
                  src={getEditorVectorPresentation(entry.definition, props.appearance).previewUrl}
                  alt=""
                  draggable={false}
                  className="h-7 w-7 max-h-full max-w-full object-contain"
                />
              ) : entry.issue ? (
                <TriangleAlert aria-label={translate('editor.elements.refused')} size={18} />
              ) : (
                <span
                  aria-label={translate('editor.elements.loading')}
                  className="h-6 w-6 rounded-[4px] bg-[var(--sniptale-color-surface-hover)]"
                />
              )}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

export function editorVectorErrorMessage(code: string | null): string {
  const keys: Record<
    string,
    keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
  > = {
    'permission-required': 'errorPermission',
    'http-forbidden': 'errorForbidden',
    forbidden: 'errorForbidden',
    'rate-limited': 'errorRateLimit',
    timeout: 'errorTimeout',
    'network-failed': 'errorNetwork',
    'source-changed': 'errorSourceChanged',
    'response-invalid': 'errorResponse',
    'response-too-large': 'errorResponse',
    'unsupported-search': 'errorSearchUnsupported',
    'search-unsupported': 'errorSearchUnsupported',
    'network-disabled': 'networkDisabled',
    'disclosure-required': 'errorConsent',
    unauthorized: 'errorUnauthorized',
    'http-error': 'errorNetwork',
    busy: 'errorBusy',
    canceled: 'operationFailed',
  };
  return translate(`editor.elements.${keys[code ?? ''] ?? 'operationFailed'}`);
}
