import { usePageStyleDraftState } from './draft';
import { usePageStyleCommentDraft } from './comment-draft';
import { useInspectorOpenState, useInspectorSelection } from './hooks';
import { usePageStyleValueActions } from '../value-editing/actions';

interface UsePageStyleInspectorControllerParams {
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
}

export function usePageStyleInspectorController(params: UsePageStyleInspectorControllerParams) {
  const openState = useInspectorOpenState(params.quickEditDocumentMode);
  const inspectorOpen = openState.open && params.quickEditMode && !params.quickEditDocumentMode;
  const { selection } = useInspectorSelection({
    open: openState.open,
    quickEditDocumentMode: params.quickEditDocumentMode,
    quickEditMode: params.quickEditMode,
  });
  const commentDraft = usePageStyleCommentDraft({ open: inspectorOpen, selection });
  const draftState = usePageStyleDraftState(selection);
  const valueActions = usePageStyleValueActions({
    defaultValues: draftState.defaultValues,
    selection,
    setValues: draftState.setValues,
  });
  return {
    actions: {
      close: () => {
        if (commentDraft.closeComment()) {
          openState.setOpen(false);
        }
      },
      comment: {
        commit: commentDraft.commitComment,
        endComposition: commentDraft.endCommentComposition,
        startComposition: commentDraft.startCommentComposition,
        updateDraft: commentDraft.updateCommentDraft,
      },
      resetValue: valueActions.resetValue,
      setSideFieldLinked: draftState.setSideFieldLinked,
      updateValue: valueActions.updateValue,
      updateValues: valueActions.updateValues,
    },
    inspectorOpen,
    toggleInspector: () => {
      if (params.quickEditDocumentMode) {
        return;
      }
      if (openState.open && !commentDraft.closeComment()) {
        return;
      }
      openState.setOpen((current) => !current);
    },
    viewState: {
      comment: {
        commitFailed: commentDraft.commentCommitFailed,
        draft: commentDraft.commentDraft,
        marker: commentDraft.commentMarker,
      },
      defaultValues: draftState.defaultValues,
      draftPatch: draftState.draftPatch,
      modifiedProperties: draftState.modifiedProperties,
      selection,
      sideFieldLinks: draftState.sideFieldLinks,
      values: draftState.values,
    },
  };
}
