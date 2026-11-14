import { useRef, useState } from 'react';
import { useEditorController } from '../../application/controller-context';
import type {
  EditorVectorStyleEdit,
  EditorVectorStylePatch,
} from '../../controller/public-api/vector-elements';

export function useVectorStyleTransaction() {
  const controller = useEditorController();
  const pending = useRef<Promise<EditorVectorStyleEdit | null> | null>(null),
    owned = useRef<EditorVectorStyleEdit | null>(null),
    generation = useRef(0);
  const [draft, setDraft] = useState<EditorVectorStylePatch>({}),
    [error, setError] = useState(false);
  function begin() {
    if (!pending.current) {
      const current = generation.current;
      pending.current = controller
        .beginVectorStyleEdit()
        .then((edit) => {
          if (current !== generation.current) {
            edit?.cancel();
            return null;
          }
          owned.current = edit;
          return edit;
        })
        .catch(() => {
          if (current === generation.current) setError(true);
          return null;
        });
    }
    return pending.current;
  }
  function cancel() {
    generation.current++;
    const old = pending.current;
    pending.current = null;
    owned.current?.cancel();
    owned.current = null;
    void old?.then((edit) => edit?.cancel());
    setDraft({});
  }
  function preview(patch: EditorVectorStylePatch) {
    setDraft((current) => ({ ...current, ...patch }));
    void begin().then((edit) => {
      if (edit && !edit.preview(patch)) setError(true);
    });
  }
  async function commit(patch: EditorVectorStylePatch) {
    const edit = await begin();
    if (!edit) return;
    if (!edit.preview(patch)) {
      cancel();
      setError(true);
      return;
    }
    edit.commit();
    owned.current = null;
    pending.current = null;
    setDraft({});
    setError(false);
  }
  return {
    draft,
    error,
    preview,
    commit,
    cancel,
    prepare: () => {
      void begin();
    },
    fail: () => setError(true),
  };
}
export type EditorVectorStyleTransaction = ReturnType<typeof useVectorStyleTransaction>;
