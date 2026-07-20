import type { Canvas, FabricObject } from 'fabric';

import type { SourceState } from '../../../document/model/source-state';

type EditorInsertionLabelKind = 'image' | 'rich-shape' | 'text';

interface EditorInsertionLayerSourceApi {
  canvas: Canvas | null;
  source: SourceState | null;
}

interface EditorInsertionPrepareApi {
  prepareObject: (object: FabricObject) => void;
}

interface EditorInsertionLabelApi {
  nextLabelIndex: (type: EditorInsertionLabelKind) => number;
}

interface EditorInsertionMutationApi {
  commitHistory: () => void;
  syncRuntimeState: () => void;
}

/**
 * Narrow controller surface required by public insertion wrappers before
 * ownership passes to public action insertion handlers.
 */
export type EditorInsertionControllerApi = EditorInsertionLayerSourceApi &
  EditorInsertionPrepareApi &
  EditorInsertionLabelApi &
  EditorInsertionMutationApi;
