import { useEffect, useRef, useState } from 'react';
import { Download, X, CircleCheck, RefreshCw, LoaderCircle, TriangleAlert } from 'lucide-react';
import { EditorIconButton } from '../../chrome/ui';
import { translate } from '../../../platform/i18n';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { editorVectorErrorMessage } from './catalog';
import { EditorVectorCatalogError } from '../../../features/editor/vector-catalog';

interface CollectionUpdateCheck {
  identity: string;
  loading: boolean;
  added?: number;
  removed?: number;
  error?: string;
}

function useCollectionUpdateCheck(
  session: ReturnType<typeof useEditorVectorLibrarySession>,
  identity: string
) {
  const current = useRef(identity);
  current.current = identity;
  const [check, setCheck] = useState<CollectionUpdateCheck>();
  useEffect(
    () => () => {
      current.current = '';
    },
    []
  );
  const checkUpdates = async (prefix: string) => {
    setCheck({ identity, loading: true });
    try {
      const difference = await session.checkCollectionUpdates(prefix);
      if (current.current === identity)
        setCheck({
          identity,
          loading: false,
          added: difference.added,
          removed: difference.removed,
        });
    } catch (error) {
      if (current.current === identity)
        setCheck({
          identity,
          loading: false,
          error: editorVectorErrorMessage(
            error instanceof EditorVectorCatalogError ? error.code : null
          ),
        });
    }
  };
  return { result: check?.identity === identity ? check : undefined, checkUpdates };
}

function collectionDownloadStatus(result: CollectionUpdateCheck | undefined): string {
  if (result?.error !== undefined) return result.error;
  let status = translate('editor.elements.collectionDownloaded');
  if (result?.added === 0) status = translate('editor.elements.collectionNamesCurrent');
  else if (result?.added)
    status = translate('editor.elements.collectionAdditions').replace(
      '{count}',
      String(result.added)
    );
  if (result?.removed) {
    const removed = translate('editor.elements.collectionRemovedNames').replace(
      '{count}',
      String(result.removed)
    );
    status += ` · ${removed}`;
  }
  return status;
}

function CollectionDownloadActions({
  ready,
  resumable,
  result,
  canRequest,
  status,
  onDownload,
  onCheck,
}: {
  ready: boolean;
  resumable: boolean;
  result: CollectionUpdateCheck | undefined;
  canRequest: boolean;
  status: string;
  onDownload(): void;
  onCheck(): void;
}) {
  return (
    <>
      {ready ? (
        <span
          className="flex h-8 w-6 items-center justify-center text-[var(--sniptale-color-text-secondary)]"
          role="status"
          aria-label={status}
          title={status}
        >
          {result?.error ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}
        </span>
      ) : null}
      {!ready || Boolean(result?.added) ? (
        <EditorIconButton
          className="!h-8 !w-8"
          disabled={!canRequest}
          title={
            result?.added
              ? status
              : translate(resumable ? 'editor.elements.resume' : 'editor.elements.download')
          }
          aria-label={
            result?.added
              ? status
              : translate(resumable ? 'editor.elements.resume' : 'editor.elements.download')
          }
          onClick={onDownload}
        >
          <Download size={16} />
        </EditorIconButton>
      ) : null}
      {ready ? (
        <EditorIconButton
          className="!h-8 !w-8"
          disabled={!canRequest}
          title={translate('editor.elements.checkCollectionUpdates')}
          aria-label={translate('editor.elements.checkCollectionUpdates')}
          onClick={onCheck}
        >
          {result?.loading ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </EditorIconButton>
      ) : null}
    </>
  );
}

function getCollectionDownloadSelection(state: ReturnType<typeof useEditorVectorLibrarySnapshot>) {
  const retained = state.downloads.find(
    (row) =>
      state.collection === `local:${row.collectionId}` ||
      (state.collection === `remote:${row.prefix}` &&
        row.source?.sourceId === state.settings?.baseUrl)
  );
  const running = state.download?.status === 'downloading';
  const prefix = running
    ? state.download?.prefix
    : state.collection.startsWith('remote:')
      ? state.collection.slice(7)
      : retained?.prefix;
  const identity = JSON.stringify([
    state.settings?.baseUrl,
    state.settings?.incarnation,
    state.settings?.sourceGeneration,
    state.collection,
    prefix,
    retained?.incarnation,
    retained?.generation,
    retained?.status,
  ]);
  return { retained, running, prefix, identity };
}

/** Collection actions stay explicit. Mounting and choosing a collection never check for updates. */
export function EditorElementsCollectionDownload() {
  const session = useEditorVectorLibrarySession();
  const state = useEditorVectorLibrarySnapshot();
  const { retained, running, prefix, identity } = getCollectionDownloadSelection(state);
  const { result, checkUpdates } = useCollectionUpdateCheck(session, identity);
  if (!prefix || (state.tab === 'favorites' && !running)) return null;
  const progress = state.download?.prefix === prefix ? state.download : null;
  const ready = retained?.status === 'ready';
  const resumable = Boolean(retained && !ready) || progress?.status === 'partial';
  const sameSource = !retained?.source || retained.source.sourceId === state.settings?.baseUrl;
  const canRequest = Boolean(
    state.settings?.networkEnabled && sameSource && !state.busy && !result?.loading
  );
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      data-ui="editor.elements.collection-download"
    >
      {running ? (
        <EditorIconButton
          className="!h-8 !w-8"
          aria-label={translate('editor.elements.cancelDownload')}
          title={[
            `${prefix}: ${progress?.accepted ?? 0}/${progress?.total ?? 0}`,
            translate('editor.elements.cancelDownload'),
          ].join(' · ')}
          onClick={() => void session.cancelDownload()}
        >
          <X size={16} />
        </EditorIconButton>
      ) : (
        <CollectionDownloadActions
          ready={ready}
          resumable={resumable}
          result={result}
          canRequest={canRequest}
          status={collectionDownloadStatus(result)}
          onDownload={() => void session.downloadCollection(prefix)}
          onCheck={() => void checkUpdates(prefix)}
        />
      )}
    </div>
  );
}
