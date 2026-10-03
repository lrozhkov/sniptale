import { expect, it, vi } from 'vitest';
import { createOffscreenDataReadiness } from './data-readiness';

function fixture() {
  let terminate: () => void = () => undefined;
  const admit = vi.fn(async (): Promise<void> => undefined);
  const recover = vi.fn(async (): Promise<void> => undefined);
  const unsubscribe = vi.fn();
  const service = createOffscreenDataReadiness({
    admit,
    recover,
    subscribeTermination: (listener) => {
      terminate = listener;
      return unsubscribe;
    },
  });
  return { service, admit, recover, terminate: () => terminate(), unsubscribe };
}

it('is lazy, coalesces parallel admission/recovery and caches only for this connection', async () => {
  const f = fixture();
  expect(f.admit).not.toHaveBeenCalled();
  await Promise.all([
    f.service.ensureAssets(),
    f.service.ensureAssets(),
    f.service.ensureAdmission(),
  ]);
  expect(f.admit).toHaveBeenCalledOnce();
  expect(f.recover).toHaveBeenCalledOnce();
  f.terminate();
  await f.service.ensureAssets();
  expect(f.admit).toHaveBeenCalledTimes(2);
  expect(f.recover).toHaveBeenCalledTimes(2);
  f.service.dispose();
  expect(f.unsubscribe).toHaveBeenCalledOnce();
});
it('keeps a failed admission retryable without running recovery', async () => {
  const f = fixture();
  const error = new Error('admission');
  f.admit.mockRejectedValueOnce(error);
  await expect(f.service.ensureAssets()).rejects.toBe(error);
  expect(f.recover).not.toHaveBeenCalled();
  await f.service.ensureAssets();
  expect(f.recover).toHaveBeenCalledOnce();
});
it('retries recovery without reopening an admitted connection', async () => {
  const f = fixture();
  f.recover.mockRejectedValueOnce(new Error('recovery'));
  await expect(f.service.ensureAssets()).rejects.toThrow('recovery');
  await f.service.ensureAssets();
  expect(f.admit).toHaveBeenCalledOnce();
  expect(f.recover).toHaveBeenCalledTimes(2);
});
it('rejects stale completion after termination without clearing a replacement flight', async () => {
  const f = fixture();
  let resolve!: () => void;
  f.admit.mockImplementationOnce(
    () =>
      new Promise<void>((yes) => {
        resolve = yes;
      })
  );
  const old = f.service.ensureAssets().catch((error) => error);
  f.terminate();
  await f.service.ensureAssets();
  resolve();
  expect(await old).toMatchObject({ message: 'Offscreen data connection changed' });
  await f.service.ensureAssets();
  expect(f.admit).toHaveBeenCalledTimes(2);
});
