import { useCallback, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import type { useReviewEditorState } from './use-editor-state';

type EditorState = ReturnType<typeof useReviewEditorState>;
type ProjectCommandState = Pick<EditorState, 'canStart' | 'setBusy' | 'beforeAction' | 'run'> & {
  session: Pick<EditorState['session'], 'rename' | 'createProject'>;
};

/** Project metadata commands retain one receipt and use the mounted session writer. */
export function useReviewProjectCommands(
  state: ProjectCommandState,
  flush: () => Promise<void>,
  onCreated: ((aggregateId: string) => void) | undefined
) {
  const receipt = useRef<string | null>(null);
  return {
    newProject: onCreated
      ? () => {
          state.beforeAction(
            () =>
              void state.run(async () => {
                await flush();
                receipt.current ??= crypto.randomUUID();
                const created = await state.session.createProject(receipt.current);
                receipt.current = null;
                onCreated(created.workspace.aggregateId);
              })
          );
        }
      : undefined,
    rename: async (name: string) => {
      if (!state.canStart()) throw new Error('Review is busy.');
      state.setBusy(true);
      try {
        await flush();
        await state.session.rename(name);
      } finally {
        state.setBusy(false);
      }
    },
  };
}

/** The header owns its rename draft; a refused save retains it for explicit retry. */
export function ReviewProjectTitle({
  name,
  busy,
  onRename,
}: {
  name: string;
  busy: boolean;
  onRename(name: string): Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const title = useRef<HTMLButtonElement>(null);
  const focusInput = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.focus();
      node.select();
    }
  }, []);
  const cancel = (restoreFocus: boolean) => {
    setDraft(null);
    setFailed(false);
    if (restoreFocus) requestAnimationFrame(() => title.current?.focus());
  };
  const accept = async (restoreFocus: boolean) => {
    if (submitting.current || draft === null) return;
    const value = draft.trim();
    if (!value || value === name) {
      cancel(restoreFocus);
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      await onRename(value);
      cancel(restoreFocus);
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  if (draft === null)
    return (
      <button
        ref={title}
        type="button"
        className="review-project-title w-full truncate text-left"
        disabled={busy}
        onClick={() => {
          setDraft(name);
          setFailed(false);
        }}
      >
        {name}
      </button>
    );
  return (
    <span className="flex min-w-0 flex-col">
      <input
        ref={focusInput}
        className="review-project-title w-full min-w-0"
        aria-label={translate('videoEditor.app.projectNameLabel')}
        aria-invalid={failed}
        aria-describedby={failed ? 'review-project-rename-error' : undefined}
        value={draft}
        maxLength={256}
        readOnly={pending}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setFailed(false);
        }}
        onBlur={() => {
          if (!failed) void accept(false);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && !pending) {
            event.preventDefault();
            event.stopPropagation();
            cancel(true);
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            void accept(true);
          }
        }}
      />
      {failed ? (
        <span
          id="review-project-rename-error"
          role="alert"
          className="whitespace-normal text-xs font-normal"
        >
          {translate('gallery.videoReview.saveFailed')}
        </span>
      ) : null}
    </span>
  );
}
