import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { listMediaLibrary } from '../../composition/persistence/media-library';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type {
  GuideImageImportPlacement,
  GuideImageImportSource,
} from '../../composition/persistence/scenario/store/public';
import { PROJECT_ASSET_IMAGE_MIME_TYPES } from '../../features/media-hub/project-assets';
import type { Translate } from '../../platform/i18n';

type Selection = { id: string; name: string; source: GuideImageImportSource; preview?: string };
type ResourceProps = {
  disabled: boolean;
  selectedStepId: string | null;
  t: Translate;
  onImport: (input: {
    sources: readonly GuideImageImportSource[];
    placement: GuideImageImportPlacement;
    signal: AbortSignal;
    onProgress: (completed: number, total: number) => void;
  }) => Promise<boolean>;
};

/** Owns the disposable ordered selection; the page and aggregate owners publish imported resources. */
function useGuideImageResources({ disabled, selectedStepId, onImport }: ResourceProps) {
  const [selection, setSelection] = useState<Selection[]>([]);
  const [library, setLibrary] = useState<MediaLibraryItem[] | null>(null);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [placement, setPlacement] = useState<'steps' | 'blocks'>('steps');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const alive = useRef(true);
  const libraryRequest = useRef(0);
  useEffect(() => {
    alive.current = true;
    const previews = urls.current;
    return () => {
      alive.current = false;
      controller.current?.abort();
      previews.forEach((url) => URL.revokeObjectURL(url));
      previews.clear();
    };
  }, []);
  const loadLibrary = async () => {
    const request = ++libraryRequest.current;
    setLibraryError(false);
    setLibraryLoading(true);
    try {
      const items = await listMediaLibrary();
      if (alive.current && request === libraryRequest.current)
        setLibrary(
          items.filter(
            (item) =>
              (item.kind === 'image' || item.kind === 'screenshot') &&
              item.source.kind !== 'web-snapshot'
          )
        );
    } catch {
      if (alive.current && request === libraryRequest.current) setLibraryError(true);
    } finally {
      if (alive.current && request === libraryRequest.current) setLibraryLoading(false);
    }
  };
  const remove = (id: string) => {
    const item = selection.find((entry) => entry.id === id);
    if (item?.preview) {
      URL.revokeObjectURL(item.preview);
      urls.current.delete(item.preview);
    }
    setSelection(selection.filter((entry) => entry.id !== id));
  };
  const move = (index: number, delta: number) => {
    const next = [...selection];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSelection(next);
  };
  const submit = async () => {
    if (
      pending ||
      disabled ||
      selection.length === 0 ||
      (placement === 'blocks' && !selectedStepId)
    )
      return;
    const operation = new AbortController();
    controller.current = operation;
    setPending(true);
    setProgress(0);
    setFailed(false);
    const accepted = await onImport({
      sources: selection.map((item) => item.source),
      placement:
        placement === 'blocks' && selectedStepId
          ? { kind: 'blocks', stepId: selectedStepId }
          : { kind: 'steps' },
      signal: operation.signal,
      onProgress: (completed) => {
        if (alive.current) setProgress(completed);
      },
    });
    if (!alive.current) return;
    setPending(false);
    controller.current = null;
    if (accepted) {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
      setSelection([]);
    } else if (!operation.signal.aborted) setFailed(true);
  };
  const locked = disabled || pending;
  const addFiles = (files: File[]) => {
    if (selection.length + files.length > 50) {
      setFailed(true);
      return;
    }
    const additions = files.map((file) => {
      const preview = URL.createObjectURL(file);
      urls.current.add(preview);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        source: { kind: 'file' as const, file },
        preview,
      };
    });
    setFailed(false);
    setSelection([...selection, ...additions]);
  };
  return {
    selection,
    setSelection,
    library,
    libraryError,
    libraryLoading,
    query,
    setQuery,
    placement,
    setPlacement,
    pending,
    progress,
    failed,
    locked,
    loadLibrary,
    remove,
    move,
    submit,
    addFiles,
    cancel: () => controller.current?.abort(),
  };
}

/** Renders the resource controls around their single disposable selection owner. */
export function GuideImageResources(props: ResourceProps) {
  const { t, selectedStepId } = props;
  const {
    selection,
    setSelection,
    library,
    libraryError,
    libraryLoading,
    query,
    setQuery,
    placement,
    setPlacement,
    pending,
    progress,
    failed,
    locked,
    loadLibrary,
    remove,
    move,
    submit,
    addFiles,
    cancel,
  } = useGuideImageResources(props);
  return (
    <div className="guide-import">
      <p>{t('scenario.editor.guideImportLimit')}</p>
      <label>
        {t('scenario.editor.guideImportFiles')}
        <input
          type="file"
          accept={PROJECT_ASSET_IMAGE_MIME_TYPES.join(',')}
          multiple
          disabled={locked}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </label>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        disabled={locked}
        onClick={() => void loadLibrary()}
      >
        {t('scenario.editor.guideChooseLibrary')}
      </ProductActionButton>
      {libraryLoading && <p role="status">{t('scenario.editor.loading')}</p>}
      {libraryError && <p role="alert">{t('scenario.editor.guideLibraryLoadFailed')}</p>}
      {library && (
        <div>
          <label>
            {t('scenario.editor.guideLibrarySearch')}
            <ProductInput value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="guide-import-library">
            {library
              .filter((item) =>
                item.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase())
              )
              .map((item) => (
                <ProductActionButton
                  tone="secondary"
                  compact
                  key={item.id}
                  type="button"
                  disabled={
                    locked ||
                    selection.length >= 50 ||
                    selection.some(
                      (selected) =>
                        selected.source.kind === 'library' && selected.source.mediaId === item.id
                    )
                  }
                  onClick={() =>
                    setSelection([
                      ...selection,
                      {
                        id: crypto.randomUUID(),
                        name: item.filename,
                        source: { kind: 'library', mediaId: item.id },
                      },
                    ])
                  }
                >
                  {item.filename}
                </ProductActionButton>
              ))}
            {library.length === 0 && <p>{t('scenario.editor.guideLibraryEmpty')}</p>}
          </div>
        </div>
      )}
      <GuideImportSelection
        selection={selection}
        locked={locked}
        move={move}
        remove={remove}
        t={t}
      />
      <label>
        {t('scenario.editor.guideImportPlacement')}
        <ProductSelect
          aria-label={t('scenario.editor.guideImportPlacement')}
          value={placement}
          disabled={locked}
          onChange={setPlacement}
          options={[
            { value: 'steps', label: t('scenario.editor.guideImportAsSteps') },
            {
              value: 'blocks',
              label: t('scenario.editor.guideImportAsBlocks'),
              disabled: !selectedStepId,
            },
          ]}
        />
      </label>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        className="guide-primary"
        disabled={locked || selection.length === 0 || (placement === 'blocks' && !selectedStepId)}
        onClick={() => void submit()}
      >
        {t('scenario.editor.guideImportSelected')}
      </ProductActionButton>
      {pending && (
        <div role="status">
          {t('scenario.editor.guideImportProgress')} {progress} / {selection.length}
          <ProductActionButton tone="secondary" compact type="button" onClick={cancel}>
            {t('scenario.editor.guideImportCancel')}
          </ProductActionButton>
        </div>
      )}
      {failed && <p role="alert">{t('scenario.editor.guideImportFailed')}</p>}
    </div>
  );
}

function GuideImportSelection({
  selection,
  locked,
  move,
  remove,
  t,
}: {
  selection: Selection[];
  locked: boolean;
  move: (index: number, delta: number) => void;
  remove: (id: string) => void;
  t: Translate;
}) {
  return (
    <ol aria-label={t('scenario.editor.guideImportOrder')}>
      {selection.map((item, index) => (
        <li key={item.id}>
          {item.preview && <img src={item.preview} alt="" />}
          <span>{item.name}</span>
          <div className="guide-import-selection-actions">
            <ProductActionButton
              tone="secondary"
              compact
              type="button"
              disabled={locked || index === 0}
              aria-label={t('scenario.editor.guideMoveUp')}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={14} aria-hidden="true" />
            </ProductActionButton>
            <ProductActionButton
              tone="secondary"
              compact
              type="button"
              disabled={locked || index === selection.length - 1}
              aria-label={t('scenario.editor.guideMoveDown')}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={14} aria-hidden="true" />
            </ProductActionButton>
            <ProductActionButton
              tone="secondary"
              compact
              type="button"
              disabled={locked}
              aria-label={t('scenario.editor.guideRemoveResource')}
              onClick={() => remove(item.id)}
            >
              <X size={14} aria-hidden="true" />
            </ProductActionButton>
          </div>
        </li>
      ))}
    </ol>
  );
}
