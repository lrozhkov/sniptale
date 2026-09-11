import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createScenarioEditorEmbedInitMessage,
  isEditorEmbedMessage,
} from '../../features/editor/contracts/embed';
import { buildScenarioImageEditorUrl } from '../../platform/navigation/extension-pages';
import { prepareScenarioImageEditorPayload } from '../../workflows/scenario-capture-edit/source';
import type { applyScenarioImageEdit } from '../../workflows/scenario-capture-edit/edits';
import type { Translate } from '../../platform/i18n';

type EditInput = Omit<Parameters<typeof applyScenarioImageEdit>[0], 'project' | 'baseUpdatedAt'>;
type ImageEditorPhase = 'loading' | 'ready' | 'load-failed' | 'applying' | 'apply-failed';
type Prepared = Awaited<ReturnType<typeof prepareScenarioImageEditorPayload>>;

/** Owns entering/leaving image mode and returning focus after the new image URL becomes available. */
export function useGuideImageEditorMode(images: Record<string, string | null>) {
  const [selection, setSelection] = useState<{ itemId: string; blockId: string } | null>(null);
  const returnBlock = useRef<string | null>(null);
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
    open: (itemId: string, blockId: string) => setSelection({ itemId, blockId }),
    close: () => {
      returnBlock.current = selection?.blockId ?? null;
      setSelection(null);
    },
  };
}

/** Owns one disposable iframe session bound to its source window, origin, and image identity. */
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
  const iframe = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<{ id: string; prepared: Prepared } | null>(null);
  const [phase, setPhase] = useState<ImageEditorPhase>('loading');
  const callbacks = useRef({ onApply, onClose });
  callbacks.current = { onApply, onClose };
  const source = useRef({ project, itemId, blockId });
  useEffect(() => {
    let active = true;
    setSession(null);
    setPhase('loading');
    const input = source.current;
    void prepareScenarioImageEditorPayload(input.project, input.itemId, input.blockId)
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
    if (!session) return;
    let active = true;
    let initialized = false;
    let applying = false;
    let failed = false;
    const timeout = window.setTimeout(() => {
      if (!initialized) {
        failed = true;
        setPhase('load-failed');
      }
    }, 15_000);
    const receive = (event: MessageEvent<unknown>) => {
      const child = iframe.current?.contentWindow;
      if (
        !active ||
        !child ||
        event.source !== child ||
        event.origin !== window.location.origin ||
        !isEditorEmbedMessage(event.data) ||
        event.data.sessionId !== session.id
      )
        return;
      const message = event.data;
      if (message.type === 'scenario-ready' && !initialized && !failed) {
        initialized = true;
        window.clearTimeout(timeout);
        child.postMessage(
          createScenarioEditorEmbedInitMessage(session.id, session.prepared.payload),
          window.location.origin
        );
        setPhase('ready');
      } else if (message.type === 'scenario-error') {
        failed = true;
        setPhase('load-failed');
      } else if (message.type === 'scenario-close' && !applying) callbacks.current.onClose();
      else if (message.type === 'scenario-apply' && initialized && !applying && !failed) {
        applying = true;
        setPhase('applying');
        void callbacks.current
          .onApply({
            target: session.prepared.target,
            dataUrl: message.dataUrl,
            document: message.document,
          })
          .then((accepted) => {
            if (!active) return;
            if (accepted) callbacks.current.onClose();
            else {
              applying = false;
              setPhase('apply-failed');
            }
          })
          .catch(() => {
            if (active) {
              applying = false;
              setPhase('apply-failed');
            }
          });
      }
    };
    window.addEventListener('message', receive);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
  }, [session]);
  return (
    <main className="guide-page guide-image-editor">
      <GuideImageEditorHeader
        phase={phase}
        t={t}
        onClose={onClose}
        onRetry={() => setAttempt((current) => current + 1)}
      />
      {session && (
        <iframe
          ref={iframe}
          key={session.id}
          title={t('scenario.editor.guideEditImage')}
          src={buildScenarioImageEditorUrl(session.id)}
          inert={phase === 'applying' || phase === 'load-failed'}
        />
      )}
    </main>
  );
}

/** Session feedback and navigation remain visible above the embedded editor. */
function GuideImageEditorHeader({
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
  return (
    <header>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        autoFocus
        disabled={phase === 'applying'}
        onClick={onClose}
      >
        {t('scenario.editor.guideImageBack')}
      </ProductActionButton>
      <h1>{t('scenario.editor.guideEditImage')}</h1>
      <p role={phase.endsWith('failed') ? 'alert' : 'status'}>
        {t(
          phase === 'loading'
            ? 'scenario.editor.loading'
            : phase === 'applying'
              ? 'scenario.editor.guideSaving'
              : phase === 'load-failed'
                ? 'scenario.editor.guideImageLoadFailed'
                : phase === 'apply-failed'
                  ? 'scenario.editor.guideImageApplyFailed'
                  : 'scenario.editor.guideImageApplyHint'
        )}
      </p>
      {phase === 'load-failed' && (
        <ProductActionButton tone="secondary" compact type="button" onClick={onRetry}>
          {t('scenario.editor.guideRetry')}
        </ProductActionButton>
      )}
    </header>
  );
}
