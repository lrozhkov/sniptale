import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { createPageStyleCommentDraftModel } from './comment-draft-model';

type CommentDraftModel = ReturnType<typeof createPageStyleCommentDraftModel>;
type CommentDraftResult = ReturnType<CommentDraftModel['commit']>;

function applyCommentDraftResult(
  result: CommentDraftResult,
  setView: (view: NonNullable<CommentDraftResult['view']>) => void
): boolean {
  if (result.view) {
    setView(result.view);
  }
  return result.success;
}

function useBrowserAnnotationSessionRevision(): number {
  return useSyncExternalStore(
    browserAnnotationSession.subscribe,
    () => browserAnnotationSession.getState().revision,
    () => 0
  );
}

export function usePageStyleCommentDraft(args: {
  open: boolean;
  selection: PageStyleSelectionSnapshot | null;
}) {
  const modelRef = useRef<CommentDraftModel | null>(null);
  if (!modelRef.current) {
    modelRef.current = createPageStyleCommentDraftModel();
  }
  const model = modelRef.current;
  const [view, setView] = useState(() => model.readView());
  const previousOpenRef = useRef(args.open);
  const sessionRevision = useBrowserAnnotationSessionRevision();

  const commitComment = useCallback(
    () => applyCommentDraftResult(model.commit(), setView),
    [model]
  );
  const closeComment = useCallback(() => applyCommentDraftResult(model.close(), setView), [model]);
  const updateCommentDraft = useCallback(
    (value: string) => setView(model.updateDraft(value)),
    [model]
  );
  const startCommentComposition = useCallback(() => model.startComposition(), [model]);
  const endCommentComposition = useCallback(
    (value: string) => applyCommentDraftResult(model.endComposition(value), setView),
    [model]
  );

  useLayoutEffect(() => {
    applyCommentDraftResult(model.select(args.selection), setView);
  }, [args.selection, model]);

  useLayoutEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = args.open;
    if (wasOpen && !args.open) {
      applyCommentDraftResult(model.close(), setView);
    }
  }, [args.open, model]);

  useEffect(() => {
    const nextView = model.syncCommittedComment();
    if (nextView) {
      setView(nextView);
    }
  }, [model, sessionRevision]);

  useEffect(
    () => () => {
      model.close();
    },
    [model]
  );

  return {
    commentCommitFailed: view.commitFailed,
    commentDraft: view.draft,
    commentMarker: view.marker,
    closeComment,
    commitComment,
    endCommentComposition,
    startCommentComposition,
    updateCommentDraft,
  };
}
