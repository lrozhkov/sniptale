import { createEffectBundleFailure } from '../../diagnostics';
import { importEffectArtifactInCurrentThread } from '../artifact';
import {
  collectEffectImportResultTransferables,
  createEffectImportWorkerResponse,
  parseEffectImportWorkerRequest,
} from './protocol';

let consumed = false;

self.onmessage = (event: MessageEvent<unknown>) => {
  if (event.origin !== '' || consumed || event.ports.length !== 0) {
    self.close();
    return;
  }
  consumed = true;
  const request = parseEffectImportWorkerRequest(event.data);
  if (!request) {
    self.close();
    return;
  }
  void executeImport(request);
};

async function executeImport(
  request: NonNullable<ReturnType<typeof parseEffectImportWorkerRequest>>
): Promise<void> {
  let result;
  try {
    result = await importEffectArtifactInCurrentThread(request.kind, request.bytes);
  } catch {
    result = createEffectBundleFailure('BUNDLE_IMPORT_WORKER_FAILURE', '$worker');
  }
  const response = createEffectImportWorkerResponse(request.requestId, result);
  const transferables = collectEffectImportResultTransferables(result);
  self.postMessage(response, { transfer: transferables });
  self.close();
}
