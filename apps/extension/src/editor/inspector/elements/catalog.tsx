import { Star, TriangleAlert } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { EditorIconButton } from '../../chrome/ui';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type { EditorVectorProvenance } from '../../../features/editor/document/vector-element';
import type { EditorVectorCatalogEntry } from '../../application/vector-elements/session';
import { useId, type PointerEvent } from 'react';

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

/** Preview markup has completed the same profile validation used by insertion. */
function editorVectorPreviewUrl(entry: EditorVectorCatalogEntry): string | undefined {
  return entry.definition
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(entry.definition.svg)}`
    : undefined;
}
export function EditorElementsGrid(props: {
  entries: EditorVectorCatalogEntry[];
  selectedKey: string | null;
  dark: boolean;
  onSelect(entry: EditorVectorCatalogEntry): void;
  onAdd(entry: EditorVectorCatalogEntry): void;
  onFavorite(entry: EditorVectorCatalogEntry): void;
  onPointerDown(event: PointerEvent<HTMLButtonElement>, entry: EditorVectorCatalogEntry): void;
}) {
  const sourceDescriptionId = useId();
  return (
    <div
      role="list"
      aria-label={translate('editor.elements.title')}
      className="grid grid-cols-4 gap-2"
      data-ui="editor.elements.grid"
    >
      {props.entries.map((entry) => (
        <div role="listitem" key={entry.key} className="relative min-w-0">
          <button
            type="button"
            aria-label={entry.prefix ? `${entry.prefix}:${entry.name}` : entry.name}
            aria-describedby={
              entry.definition?.provenance.sourceId
                ? `${sourceDescriptionId}-${encodeURIComponent(entry.key)}`
                : undefined
            }
            aria-pressed={props.selectedKey === entry.key}
            title={
              `${entry.prefix ? `${entry.prefix}:` : ''}${entry.name}` +
              (entry.definition ? ` · ${entry.definition.provenance.sourceId}` : '')
            }
            className={[
              'flex h-16 w-full min-w-0 flex-col items-center justify-center gap-1',
              'rounded-[4px] border p-1 text-xs hover:bg-[var(--sniptale-color-surface-hover)]',
              props.selectedKey === entry.key
                ? 'border-[var(--sniptale-color-accent)]'
                : 'border-transparent',
            ].join(' ')}
            data-ui="editor.elements.card"
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
              className="flex h-9 w-full items-center justify-center rounded-[4px]"
              style={{ backgroundColor: props.dark ? '#292929' : '#ffffff' }}
            >
              {entry.definition ? (
                <img
                  src={editorVectorPreviewUrl(entry)}
                  alt=""
                  draggable={false}
                  className="h-8 w-8 object-contain"
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
            <span className="w-full truncate text-[var(--sniptale-color-text-secondary)]">
              {entry.name}
            </span>
          </button>
          {entry.definition?.provenance.sourceId ? (
            <span
              id={`${sourceDescriptionId}-${encodeURIComponent(entry.key)}`}
              className="sr-only"
            >
              {entry.definition.provenance.sourceId}
            </span>
          ) : null}
          <EditorIconButton
            className="!absolute right-0 top-0 !h-6 !w-6"
            disabled={!entry.definition}
            title={translate(
              entry.favorite ? 'editor.elements.unfavorite' : 'editor.elements.favorite'
            )}
            aria-label={translate(
              entry.favorite ? 'editor.elements.unfavorite' : 'editor.elements.favorite'
            )}
            aria-pressed={entry.favorite}
            data-ui="editor.elements.favorite"
            onClick={() => props.onFavorite(entry)}
          >
            <Star size={12} fill={entry.favorite ? 'currentColor' : 'none'} />
          </EditorIconButton>
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
