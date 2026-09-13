import {
  createScenarioEditorEmbedInitMessage,
  isEditorEmbedMessage,
} from '../../features/editor/contracts/embed';
import type { EditorBootstrapPayload } from '../../features/editor/contracts/bootstrap';
import type { EditorDocument } from '../../features/editor/document/public';

export type ImageEditorPhase =
  | 'loading'
  | 'ready'
  | 'load-failed'
  | 'applying'
  | 'apply-failed'
  | 'review';
export type ImageEditorApplyResult = boolean | 'requires-target-review';
export type ImageEditorApplyInput<Target> = {
  target: Target;
  dataUrl: string;
  document: EditorDocument;
  allowTargetReview: boolean;
};

/** One disposable, source-bound protocol session for both scenario representations. */
export function connectScenarioImageEditor<Target>({
  frame,
  session,
  callbacks,
  onPhase,
}: {
  frame: HTMLIFrameElement;
  session: { id: string; prepared: { target: Target; payload: EditorBootstrapPayload } };
  callbacks: {
    current: {
      onApply: (input: ImageEditorApplyInput<Target>) => Promise<ImageEditorApplyResult>;
      onClose: () => void;
    };
  };
  onPhase: (phase: ImageEditorPhase) => void;
}) {
  let active = true;
  let initialized = false;
  let applying = false;
  let failed = false;
  let pending: Pick<ImageEditorApplyInput<Target>, 'dataUrl' | 'document'> | null = null;
  const timeout = window.setTimeout(() => {
    if (!initialized) {
      failed = true;
      onPhase('load-failed');
    }
  }, 15_000);
  const apply = async (input: NonNullable<typeof pending>, allowTargetReview: boolean) => {
    applying = true;
    pending = null;
    onPhase('applying');
    try {
      const result = await callbacks.current.onApply({
        ...input,
        target: session.prepared.target,
        allowTargetReview,
      });
      if (!active) return;
      if (result === 'requires-target-review') {
        pending = input;
        onPhase('review');
      } else if (result) callbacks.current.onClose();
      else {
        applying = false;
        onPhase('apply-failed');
      }
    } catch {
      if (active) {
        applying = false;
        onPhase('apply-failed');
      }
    }
  };
  const receive = (event: MessageEvent<unknown>) => {
    const child = frame.contentWindow;
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
      onPhase('ready');
    } else if (message.type === 'scenario-error') {
      failed = true;
      onPhase('load-failed');
    } else if (message.type === 'scenario-close' && !applying) callbacks.current.onClose();
    else if (message.type === 'scenario-apply' && initialized && !applying && !failed)
      void apply({ dataUrl: message.dataUrl, document: message.document }, false);
  };
  window.addEventListener('message', receive);
  return {
    confirmReview() {
      if (!active || !pending || failed) return;
      void apply(pending, true);
    },
    cancelReview() {
      if (!active || !pending || failed) return;
      pending = null;
      applying = false;
      onPhase('ready');
    },
    dispose() {
      active = false;
      pending = null;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
    },
  };
}
