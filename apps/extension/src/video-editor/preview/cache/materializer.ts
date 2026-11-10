import { loadVideoEditorAssetBlob } from '../../runtime/session/asset-urls';
import { createNativeCompositionMaterializer } from '../../../workflows/video/native-composition/materializer';
export type {
  MaterializedPreviewFrame,
  VideoPreviewFrameMaterializer,
} from '../../../workflows/video/native-composition/materializer';
/** The editor supplies its asset reader; the common materializer owns composition resources. */
export function createVideoPreviewFrameMaterializer(
  params: Omit<Parameters<typeof createNativeCompositionMaterializer>[0], 'readAsset'>
) {
  return createNativeCompositionMaterializer({ ...params, readAsset: loadVideoEditorAssetBlob });
}
