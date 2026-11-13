import { executeRasterCompute, rasterComputeFailure } from './compute';

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const value = event.data;
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    !('command' in value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id < 1
  )
    return;
  const id = value.id;
  void executeRasterCompute(value.command).then(
    (result) => self.postMessage({ id, ok: true, value: result }),
    (error: unknown) => self.postMessage({ id, ok: false, code: rasterComputeFailure(error) })
  );
});
