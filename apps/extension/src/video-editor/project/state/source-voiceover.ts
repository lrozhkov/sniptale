import {
  addProjectSourceVoiceoverDocument,
  applyProjectSourceVoiceoverEdit,
} from '../../../features/video/project/source-voiceover';
import type { VideoEditorProjectActions } from '../../contracts/commands/project';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { VideoEditorProjectSliceSet } from './contracts';
import { applyProjectUpdate } from './helpers';

/** Adapts whole-take commands to the existing mutation, history and selection authorities. */
export function createVideoEditorSourceVoiceoverActions(
  set: VideoEditorProjectSliceSet
): Pick<
  VideoEditorProjectActions,
  'editSourceVoiceover' | 'deleteSourceVoiceover' | 'duplicateSourceVoiceover'
> {
  return {
    editSourceVoiceover(expectedProject, documentId, patch) {
      let accepted = false;
      set((state) =>
        state.project !== expectedProject
          ? state
          : applyProjectUpdate(state, (project) => {
              const basis = project.sourceVoiceoverDocuments?.find(
                (item) => item.id === documentId
              );
              if (!basis) return project;
              const result = applyProjectSourceVoiceoverEdit(project, basis, patch);
              if (!result.ok) return project;
              accepted = true;
              return result.project;
            })
      );
      return accepted;
    },
    deleteSourceVoiceover(documentId) {
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const basis = project.sourceVoiceoverDocuments?.find((item) => item.id === documentId);
          if (!basis) return project;
          const result = applyProjectSourceVoiceoverEdit(project, basis, null);
          return result.ok ? result.project : project;
        })
      );
    },
    duplicateSourceVoiceover(documentId) {
      let id: string | null = null;
      set((state) => {
        const project = state.project;
        const basis = project?.sourceVoiceoverDocuments?.find((item) => item.id === documentId);
        if (!project || !basis) return state;
        const copy = structuredClone(basis);
        copy.id = crypto.randomUUID();
        copy.take.id = crypto.randomUUID();
        const result = addProjectSourceVoiceoverDocument(project, copy);
        if (!result.ok) return state;
        id = copy.id;
        return {
          ...applyProjectUpdate(state, () => result.project),
          selection: { kind: VideoEditorSelectionKind.SOURCE_VOICEOVER, documentId: id },
          selectedTrackId: copy.trackId,
          placementMode: null,
        };
      });
      return id;
    },
  };
}
