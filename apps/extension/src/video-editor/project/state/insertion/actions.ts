import type {
  VideoEditorProjectState,
  VideoEditorProjectSliceSet,
  VideoEditorProjectSliceGet,
} from '../contracts';
import {
  createAnnotationInsertionAction,
  createAssetInsertionAction,
  createShapeInsertionAction,
  createSubtitleInsertionAction,
  createTextInsertionAction,
  createVideoBlockInsertionAction,
} from './helpers';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;
type VideoEditorStoreGet = VideoEditorProjectSliceGet;

export function createVideoEditorProjectInsertionActions(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): Pick<
  VideoEditorProjectState,
  | 'addAssetClip'
  | 'addAnnotationOverlay'
  | 'addVideoBlock'
  | 'addTextOverlay'
  | 'addSubtitleOverlay'
  | 'addShapeOverlay'
> {
  return {
    addAssetClip: createAssetInsertionAction(set, get),
    addAnnotationOverlay: createAnnotationInsertionAction(set, get),
    addVideoBlock: createVideoBlockInsertionAction(set, get),
    addTextOverlay: createTextInsertionAction(set, get),
    addSubtitleOverlay: createSubtitleInsertionAction(set, get),
    addShapeOverlay: createShapeInsertionAction(set, get),
  };
}
