import {
  ProductModal,
  ProductModalHeader,
  ProductModalBody,
  ProductModalFooter,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  connectScenarioImageEditor,
  type ImageEditorPhase,
  type ImageEditorApplyInput,
  type ImageEditorApplyResult,
} from './image-editor-session';
import { prepareTourImageEditorPayload } from '../../workflows/scenario-capture-edit/tour-source';
import type { applyTourImageEdit } from '../../workflows/scenario-capture-edit/tour-edits';
import type { EditorBootstrapPayload } from '../../features/editor/contracts/bootstrap';
import { buildScenarioImageEditorUrl } from '../../platform/navigation/extension-pages';
import { prepareScenarioImageEditorPayload } from '../../workflows/scenario-capture-edit/source';
import type { applyScenarioImageEdit } from '../../workflows/scenario-capture-edit/edits';
import type { Translate } from '../../platform/i18n';

type EditInput = Omit<Parameters<typeof applyScenarioImageEdit>[0], 'project' | 'baseUpdatedAt'>;
type TourEditInput = Omit<Parameters<typeof applyTourImageEdit>[0], 'project' | 'baseUpdatedAt'>;

/** Owns entering/leaving image mode and returning focus after the new image URL becomes available. */
export function useGuideImageEditorMode(images: Record<string, string | null>) {
  const [selection, setSelection] = useState<{ itemId: string; blockId: string } | null>(null);
  const returnBlock = useRef<string | null>(null);
  const [tourSlideId, setTourSlideId] = useState<string | null>(null);
  const [returnSlideId, setReturnSlideId] = useState<string | null>(null);
  const returnTourFocus = useRef(false);
  useLayoutEffect(() => {
    if (tourSlideId || !returnTourFocus.current) return;
    const button = [...document.querySelectorAll<HTMLButtonElement>('[data-tour-edit-image]')].find(
      (entry) => entry.dataset['tourEditImage'] === returnSlideId
    );
    if (!button || button.disabled) return;
    button.focus({ preventScroll: true });
    returnTourFocus.current = false;
  }, [tourSlideId, returnSlideId, images]);
  useLayoutEffect(() => {
    if (selection || !returnBlock.current) return;
    const block = [...document.querySelectorAll<HTMLElement>('[data-block-id]')].find(
      (entry) => entry.dataset['blockId'] === returnBlock.current
    );
    const button = block?.querySelector<HTMLButtonElement>('[data-edit-image]');
    if (!button || button.disabled) return;
    button.focus();
    returnBlock.current = null;
  }, [selection, images]);
  return {
    selection,
    tourSlideId,
    returnSlideId,
    openTour: (slideId: string) => setTourSlideId(slideId),
    closeTour: () => {
      setReturnSlideId(tourSlideId);
      returnTourFocus.current = true;
      setTourSlideId(null);
    },
    open: (itemId: string, blockId: string) => setSelection({ itemId, blockId }),
    close: () => {
      returnBlock.current = selection?.blockId ?? null;
      setSelection(null);
    },
  };
}

/** Both representations use the same source-window/session admission and Apply lifecycle. */
export function GuideImageEditor({
  project,
  itemId,
  blockId,
  onApply,
  onClose,
  t,
}: {
  project: GuideProject;
  itemId: string;
  blockId: string;
  onApply: (input: EditInput) => Promise<boolean>;
  onClose: () => void;
  t: Translate;
}) {
  return (
    <ScenarioImageEditor
      prepare={() => prepareScenarioImageEditorPayload(project, itemId, blockId)}
      onApply={({ target, dataUrl, document }) => onApply({ target, dataUrl, document })}
      onClose={onClose}
      t={t}
    />
  );
}

export function TourImageEditor({
  project,
  slideId,
  onApply,
  onClose,
  t,
}: {
  project: GuideProject;
  slideId: string;
  onApply: (input: TourEditInput) => Promise<ImageEditorApplyResult>;
  onClose: () => void;
  t: Translate;
}) {
  return (
    <ScenarioImageEditor
      prepare={() => prepareTourImageEditorPayload(project, slideId)}
      onApply={onApply}
      onClose={onClose}
      t={t}
    />
  );
}

/** Owns preparation/retry and presentation; the disposable controller owns message admission. */
function ScenarioImageEditor<Target>({
  prepare,
  onApply,
  onClose,
  t,
}: {
  prepare: () => Promise<{ target: Target; payload: EditorBootstrapPayload }>;
  onApply: (input: ImageEditorApplyInput<Target>) => Promise<ImageEditorApplyResult>;
  onClose: () => void;
  t: Translate;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<{
    id: string;
    prepared: Awaited<ReturnType<typeof prepare>>;
  } | null>(null);
  const [phase, setPhase] = useState<ImageEditorPhase>('loading');
  const callbacks = useRef({ onApply, onClose });
  callbacks.current = { onApply, onClose };
  const source = useRef(prepare);
  const connection = useRef<ReturnType<typeof connectScenarioImageEditor<Target>> | null>(null);
  useEffect(() => {
    let active = true;
    setSession(null);
    setPhase('loading');
    void source
      .current()
      .then((prepared) => {
        if (active) setSession({ id: crypto.randomUUID(), prepared });
      })
      .catch(() => {
        if (active) setPhase('load-failed');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!session || !iframe.current) return;
    const controller = connectScenarioImageEditor({
      frame: iframe.current,
      session,
      callbacks,
      onPhase: setPhase,
    });
    connection.current = controller;
    return () => {
      controller.dispose();
      connection.current = null;
    };
  }, [session]);
  return (
    <main className="guide-page guide-image-editor">
      {phase === 'review' ? (
        <ProductModal
          role="alertdialog"
          onClose={() => connection.current?.cancelReview()}
          maxWidth={480}
        >
          <ProductModalHeader title={t('scenario.editor.tourImageReviewTitle')} />
          <ProductModalBody>
            <p>{t('scenario.editor.tourImageReviewHint')}</p>
          </ProductModalBody>
          <ProductModalFooter>
            <ProductActionButton
              compact
              tone="secondary"
              autoFocus
              onClick={() => connection.current?.cancelReview()}
            >
              {t('scenario.editor.tourImageKeepEditing')}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="primary"
              onClick={() => connection.current?.confirmReview()}
            >
              {t('scenario.editor.tourImageApplyReview')}
            </ProductActionButton>
          </ProductModalFooter>
        </ProductModal>
      ) : (
        <GuideImageEditorFeedback
          phase={phase}
          t={t}
          onClose={onClose}
          onRetry={() => setAttempt((current) => current + 1)}
        />
      )}
      {session && (
        <iframe
          ref={iframe}
          key={session.id}
          title={t('scenario.editor.guideEditImage')}
          src={buildScenarioImageEditorUrl(session.id)}
          inert={phase === 'applying' || phase === 'load-failed' || phase === 'review'}
        />
      )}
    </main>
  );
}

/** Only loading and recovery feedback occupy the host; normal controls belong to the editor. */
function GuideImageEditorFeedback({
  phase,
  t,
  onClose,
  onRetry,
}: {
  phase: ImageEditorPhase;
  t: Translate;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (phase === 'ready') return null;
  const unavailable = phase === 'loading' || phase === 'load-failed';
  return (
    <div className="guide-image-editor-feedback">
      {unavailable && (
        <ProductActionButton tone="secondary" compact type="button" autoFocus onClick={onClose}>
          {t('scenario.editor.guideImageBack')}
        </ProductActionButton>
      )}
      <p role={phase.endsWith('failed') ? 'alert' : 'status'}>
        {t(
          phase === 'loading'
            ? 'scenario.editor.loading'
            : phase === 'applying'
              ? 'scenario.editor.guideSaving'
              : phase === 'load-failed'
                ? 'scenario.editor.guideImageLoadFailed'
                : 'scenario.editor.guideImageApplyFailed'
        )}
      </p>
      {phase === 'load-failed' && (
        <ProductActionButton tone="secondary" compact type="button" onClick={onRetry}>
          {t('scenario.editor.guideRetry')}
        </ProductActionButton>
      )}
    </div>
  );
}
