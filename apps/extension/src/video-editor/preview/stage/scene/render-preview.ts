export { PreviewGpuSerialFallback } from '../../../../workflows/video/native-composition/render-scene';
import { loadVideoEditorAssetBlob } from '../../../runtime/session/asset-urls';
import { renderNativeCompositionScene } from '../../../../workflows/video/native-composition/render-scene';
import type { PreviewSceneRenderInput } from './types';
/** Runtime-local watermark access is separate from shared image construction. */
export function renderPreviewScene(input: PreviewSceneRenderInput) {
  return renderNativeCompositionScene({ ...input, readAsset: loadVideoEditorAssetBlob });
}
