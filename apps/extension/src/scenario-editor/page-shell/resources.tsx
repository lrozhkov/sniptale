import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Upload, X } from 'lucide-react';
import type {
  GuideImageImportPlacement,
  GuideImageImportSource,
} from '../../composition/persistence/scenario/store/public';
import { PROJECT_ASSET_IMAGE_MIME_TYPES } from '../../features/media-hub/project-assets';
import type { Translate } from '../../platform/i18n';
import { GuideLibraryBrowser } from './library-browser';

type Selection = { id: string; name: string; source: GuideImageImportSource; preview?: string };
type ResourceProps = {
  disabled: boolean;
  selectedStepId: string | null;
  target?: Extract<GuideImageImportPlacement, { kind: 'replace-image' }>;
  onComplete?: () => void;
  onLibraryDragStart?: () => void;
  t: Translate;
  onImport: (input: {
    sources: readonly GuideImageImportSource[];
    placement: GuideImageImportPlacement;
    signal: AbortSignal;
    onProgress: (completed: number, total: number) => void;
  }) => Promise<boolean>;
};

/** Owns ordered selection and one abortable import; library browsing owns no mutations. */
function useGuideImageResources({
  disabled,
  selectedStepId,
  target,
  onImport,
  onComplete,
}: ResourceProps) {
  const [selection, setSelection] = useState<Selection[]>([]);
  const [placement, setPlacement] = useState<'steps' | 'blocks'>('steps');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const alive = useRef(true);
  const release = () => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
      release();
    };
  }, []);
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
    const destination = index + delta;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setSelection(next);
  };
  const submit = async () => {
    if (
      controller.current ||
      disabled ||
      !selection.length ||
      (!target && placement === 'blocks' && !selectedStepId)
    )
      return;
    const operation = new AbortController();
    controller.current = operation;
    setPending(true);
    setProgress(0);
    setFailed(false);
    try {
      const accepted = await onImport({
        sources: selection.map((item) => item.source),
        placement:
          target ??
          (placement === 'blocks' && selectedStepId
            ? { kind: 'blocks', stepId: selectedStepId }
            : { kind: 'steps' }),
        signal: operation.signal,
        onProgress: (completed) => {
          if (alive.current) setProgress(completed);
        },
      });
      if (!alive.current) return;
      if (accepted) {
        release();
        setSelection([]);
        onComplete?.();
      } else if (!operation.signal.aborted) setFailed(true);
    } catch {
      if (alive.current && !operation.signal.aborted) setFailed(true);
    } finally {
      if (controller.current === operation) controller.current = null;
      if (alive.current) setPending(false);
    }
  };
  const locked = disabled || pending;
  const addFiles = (files: File[]) => {
    if (locked) return;
    if ((target && files.length !== 1) || (!target && selection.length + files.length > 50)) {
      setFailed(true);
      return;
    }
    if (target) release();
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
    setSelection(target ? additions : [...selection, ...additions]);
  };
  const chooseLibrary = (id: string, name: string) => {
    if (locked) return;
    const existing = selection.find(
      (item) => item.source.kind === 'library' && item.source.mediaId === id
    );
    if (existing) {
      remove(existing.id);
      return;
    }
    if (!target && selection.length >= 50) {
      setFailed(true);
      return;
    }
    if (target) release();
    const item: Selection = {
      id: crypto.randomUUID(),
      name,
      source: { kind: 'library', mediaId: id },
    };
    setFailed(false);
    setSelection(target ? [item] : [...selection, item]);
  };
  return {
    selection,
    placement,
    setPlacement,
    pending,
    progress,
    failed,
    locked,
    remove,
    move,
    submit,
    addFiles,
    chooseLibrary,
    cancel: () => controller.current?.abort(),
  };
}

/** Composes browsing and the explicit selection/import footer. */
export function GuideImageResources(props: ResourceProps) {
  const { t, target, selectedStepId } = props;
  const state = useGuideImageResources(props);
  return (
    <div className="guide-import" aria-busy={state.pending}>
      <GuideLibraryBrowser
        t={t}
        disabled={state.locked}
        selectedIds={state.selection.flatMap((item) =>
          item.source.kind === 'library' ? [item.source.mediaId] : []
        )}
        onChoose={state.chooseLibrary}
        onDragStart={props.onLibraryDragStart}
        fileAction={
          <label className="guide-import-file-action">
            <Upload size={16} aria-hidden="true" />
            {t('scenario.editor.guideImportFiles')}
            <input
              type="file"
              accept={PROJECT_ASSET_IMAGE_MIME_TYPES.join(',')}
              multiple={!target}
              disabled={state.locked}
              onChange={(event) => {
                state.addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </label>
        }
      />
      <footer className="guide-import-footer" data-targeted={Boolean(target)}>
        <GuideImportSelection
          selection={state.selection}
          locked={state.locked}
          move={state.move}
          remove={state.remove}
          t={t}
        />
        <div className="guide-import-submit">
          {!target && (
            <div
              className="guide-import-destination"
              role="group"
              aria-label={t('scenario.editor.guideImportPlacement')}
            >
              <ProductActionButton
                tone="toggle"
                compact
                active={state.placement === 'steps'}
                aria-pressed={state.placement === 'steps'}
                disabled={state.locked}
                onClick={() => state.setPlacement('steps')}
              >
                {t('scenario.editor.guideImportAsSteps')}
              </ProductActionButton>
              <ProductActionButton
                tone="toggle"
                compact
                active={state.placement === 'blocks'}
                aria-pressed={state.placement === 'blocks'}
                disabled={state.locked || !selectedStepId}
                onClick={() => state.setPlacement('blocks')}
              >
                {t('scenario.editor.guideImportAsBlocks')}
              </ProductActionButton>
            </div>
          )}
          <ProductActionButton
            tone="primary"
            compact
            className="guide-primary"
            disabled={
              state.locked ||
              !state.selection.length ||
              (!target && state.placement === 'blocks' && !selectedStepId)
            }
            onClick={() => void state.submit()}
          >
            {t('scenario.editor.guideImportSelected')}
          </ProductActionButton>
        </div>
        {state.pending && (
          <div role="status">
            {t('scenario.editor.guideImportProgress')} {state.progress} / {state.selection.length}
            <ProductActionButton tone="secondary" compact onClick={state.cancel}>
              {t('scenario.editor.guideImportCancel')}
            </ProductActionButton>
          </div>
        )}
        {state.failed && <p role="alert">{t('scenario.editor.guideImportFailed')}</p>}
      </footer>
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
            {selection.length > 1 && (
              <>
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
              </>
            )}
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
