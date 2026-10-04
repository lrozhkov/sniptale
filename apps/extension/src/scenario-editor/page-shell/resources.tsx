import { CompactSegmentedSelector } from '../../ui/compact-inspector-controls/control-renderers';
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
  steps?: readonly { id: string; title: string }[];
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
  const destination = importDestinationLabel(props, state.placement);
  const actions = (
    <div hidden={Boolean(videoId)} className="guide-import-actions" aria-busy={state.pending}>
      <div className="guide-import-destination">
        {!target && (
          <CompactSegmentedSelector
            ariaLabel={t('scenario.editor.guideImportPlacement')}
            columns={2}
            value={state.placement}
            onChange={state.setPlacement}
            options={[
              {
                value: 'steps',
                label: t('scenario.editor.guideImportAsSteps'),
                disabled: state.locked,
              },
              {
                value: 'blocks',
                label: t('scenario.editor.guideImportAsBlocks'),
                disabled: state.locked || !selectedStepId,
              },
            ]}
          />
        )}
        <p className="guide-import-target" title={destination}>
          {destination}
        </p>
      </div>
      <div className="guide-import-submit">
        <span className="guide-import-count" role="status">
          {t('scenario.editor.guideImportSelectedCount').replace(
            '{count}',
            String(state.selection.length)
          )}
        </span>
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

/** Describe the admitted destination without exposing project or resource identifiers. */
function importDestinationLabel(props: ResourceProps, placement: 'steps' | 'blocks'): string {
  const { target, selectedStepId, steps, t } = props;
  const kind = target?.kind ?? placement;
  if (kind === 'tour-slides') return t('scenario.editor.guideImportTourSlides');
  if (kind === 'tour-image') return t('scenario.editor.guideImportTourImage');
  if (kind === 'tour-background') return t('scenario.editor.guideImportTourBackground');
  if (kind === 'steps') return t('scenario.editor.guideImportStepsHint');
  const stepId = target && 'stepId' in target ? target.stepId : selectedStepId;
  const name =
    steps?.find((step) => step.id === stepId)?.title.trim() || t('scenario.editor.untitledStep');
  return t(
    kind === 'replace-image'
      ? 'scenario.editor.guideImportReplaceTarget'
      : 'scenario.editor.guideImportStepTarget'
  ).replace('{name}', name);
}
