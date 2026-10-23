import {
  addVideoProjectCommentDocument,
  applyVideoProjectCommentEdit,
} from '../../../features/video/project/comments/authoring';
import type { VideoEditorAnnotationActions } from '../../contracts/commands/annotation';
import type { VideoEditorProjectSliceSet } from './contracts';
import { applyProjectUpdate } from './helpers';

/** The existing project updater remains the sole accepted mutation and history owner. */
export function createVideoEditorProjectCommentActions(
  set: VideoEditorProjectSliceSet
): Pick<VideoEditorAnnotationActions, 'addCommentDocument' | 'editCommentDocument'> {
  return {
    addCommentDocument(expectedProject, input) {
      let id: string | null = null;
      set((state) =>
        state.project !== expectedProject
          ? state
          : applyProjectUpdate(state, (project) => {
              const result = addVideoProjectCommentDocument(project, {
                id: input.id,
                target: input.target,
                note: input.note,
              });
              if (!result.ok) return project;
              id = result.document?.id ?? null;
              return result.project;
            })
      );
      return id;
    },
    editCommentDocument(expectedProject, documentId, edit) {
      if (!['add-note', 'note', 'remove-note', 'remove-document'].includes(edit.kind)) return false;
      let accepted = false;
      set((state) =>
        state.project !== expectedProject
          ? state
          : applyProjectUpdate(state, (project) => {
              const basis = project.commentDocuments?.find(
                (document) => document.id === documentId
              );
              if (!basis) return project;
              const result = applyVideoProjectCommentEdit(project, basis, edit);
              if (!result.ok) return project;
              accepted = true;
              return result.project;
            })
      );
      return accepted;
    },
  };
}
