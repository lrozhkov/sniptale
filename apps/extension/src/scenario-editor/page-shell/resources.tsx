import { GuideVideoFrameResources } from './video-frame-resources';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  GuideImageImportPlacement,
  TourImageImportPlacement,
  GuideImageImportSource,
} from '../../composition/persistence/scenario/store/public';
import type { Translate } from '../../platform/i18n';
import { GuideLibraryBrowser } from './library-browser';

type Selection = { id: string; name: string; source: GuideImageImportSource };
type ResourceProps = {
  toolbarTarget?: HTMLElement | null;
  disabled: boolean;
  selectedStepId: string | null;
  target?: GuideImageImportPlacement | TourImageImportPlacement;
  onComplete?: () => void;
  onLibraryDragStart?: () => void;
  t: Translate;
  onImport: (input: {
    sources: readonly GuideImageImportSource[];
    placement: GuideImageImportPlacement | TourImageImportPlacement;
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
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const remove = (id: string) => {
    setSelection(selection.filter((entry) => entry.id !== id));
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
  const single =
    target?.kind === 'replace-image' ||
    target?.kind === 'tour-image' ||
    target?.kind === 'tour-background';
  const limit = target?.kind === 'tour-slides' ? 300 : 50;
  const chooseLibrary = (id: string, name: string) => {
    if (locked) return;
    const existing = selection.find(
      (item) => item.source.kind === 'library' && item.source.mediaId === id
    );
    if (existing) {
      remove(existing.id);
      return;
    }
    if (!single && selection.length >= limit) {
      setFailed(true);
      return;
    }
    const item: Selection = {
      id: crypto.randomUUID(),
      name,
      source: { kind: 'library', mediaId: id },
    };
    setFailed(false);
    setSelection(single ? [item] : [...selection, item]);
  };
  return {
    selection,
    placement,
    setPlacement,
    pending,
    progress,
    failed,
    locked,
    submit,
    chooseLibrary,
    cancel: () => controller.current?.abort(),
  };
}

/** Keeps import actions in the drawer header and ordered selection in one owner. */
export function GuideImageResources(props: ResourceProps) {
  const { t, target, selectedStepId } = props;
  const state = useGuideImageResources(props);
  const [videoId, setVideoId] = useState<string | null>(null);
  const actions = (
    <div hidden={Boolean(videoId)} className="guide-import-actions" aria-busy={state.pending}>
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
    </div>
  );
  return (
    <div className="guide-import" aria-busy={state.pending}>
      {props.toolbarTarget ? createPortal(actions, props.toolbarTarget) : actions}
      <GuideLibraryBrowser
        t={t}
        disabled={state.locked}
        selectedIds={state.selection.flatMap((item) =>
          item.source.kind === 'library' ? [item.source.mediaId] : []
        )}
        onPreview={() => setVideoId(null)}
        onChoose={(id, name, kind) => {
          if (kind === 'image') state.chooseLibrary(id, name);
          else setVideoId(id);
        }}
        previewContent={
          videoId ? (
            <GuideVideoFrameResources key={videoId} mediaId={videoId} {...props} />
          ) : undefined
        }
        onDragStart={props.onLibraryDragStart}
      />
    </div>
  );
}
