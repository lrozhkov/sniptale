import { importAnimationArtifactBytes } from '../../lottie-profile';
import { parseAnimationImportWorkerRequest, createAnimationImportWorkerResponse } from './protocol';
import { createEffectBundleFailure } from '../../diagnostics';
let consumed = false;

self.onmessage = (event: MessageEvent<unknown>) => {
  if (event.origin !== '' || consumed || event.ports.length !== 0) {
    for (const port of event.ports) port.close();
    self.close();
    return;
  }
  consumed = true;
  const animation = parseAnimationImportWorkerRequest(event.data);
  if (animation) {
    void executeAnimationImport(animation);
    return;
  }
  self.close();
};

async function executeAnimationImport(
  request: NonNullable<ReturnType<typeof parseAnimationImportWorkerRequest>>
): Promise<void> {
  let result;
  try {
    result = await importAnimationArtifactBytes(request.bytes);
  } catch {
    result = createEffectBundleFailure('BUNDLE_IMPORT_WORKER_FAILURE', '$worker');
  }
  try {
    self.postMessage(createAnimationImportWorkerResponse(request.requestId, result));
  } finally {
    self.close();
  }
}
