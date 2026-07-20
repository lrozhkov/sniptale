import { ImageEditorControllerHelperActions } from './controller-helper-actions';

export abstract class ImageEditorControllerBase extends ImageEditorControllerHelperActions {
  abstract zoomToFit(): void;
  abstract clearCropSelection(): void;
}
