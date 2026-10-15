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

it('requires completed admission without queuing cold or terminated connections', async () => {
  const f = fixture();
  expect(() => f.service.requireAdmission()).toThrow('Offscreen data is not admitted');
  expect(f.admit).not.toHaveBeenCalled();
  let complete!: () => void;
  f.admit.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  const pending = f.service.ensureAdmission();
  expect(() => f.service.requireAdmission()).toThrow('Offscreen data is not admitted');
  complete();
  await pending;
  expect(() => f.service.requireAdmission()).not.toThrow();
  f.terminate();
  expect(() => f.service.requireAdmission()).toThrow('Offscreen data is not admitted');
  expect(f.admit).toHaveBeenCalledOnce();
  await f.service.ensureAdmission();
  expect(() => f.service.requireAdmission()).not.toThrow();
  expect(f.recover).not.toHaveBeenCalled();
});

it('prepares a new recording without entering whole-library recovery', async () => {
  const { offscreenDataReadiness, prepareOffscreenRecordingData } =
    await import('./data-readiness');
  const admission = vi.spyOn(offscreenDataReadiness, 'ensureAdmission').mockResolvedValue();
  const recovery = vi
    .spyOn(offscreenDataReadiness, 'ensureAssets')
    .mockRejectedValue(new Error('global maintenance must not block capture'));
  const outbox = await import('../recording/post-record-publication');
  const reconcile = vi.spyOn(outbox, 'reconcileRecordingCompletionOutbox').mockResolvedValue(false);
  try {
    await expect(prepareOffscreenRecordingData()).resolves.toBeUndefined();
    expect(admission).toHaveBeenCalledOnce();
    expect(recovery).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledOnce();
  } finally {
    admission.mockRestore();
    recovery.mockRestore();
    reconcile.mockRestore();
  }
});

it('requires recovered assets without joining a lock wait on a cold or terminated connection', async () => {
  const f = fixture();
  expect(() => f.service.requireAssets()).toThrow('Offscreen assets are not prepared');
  expect(f.admit).not.toHaveBeenCalled();
  await f.service.ensureAdmission();
  expect(() => f.service.requireAssets()).toThrow('Offscreen assets are not prepared');
  f.recover.mockRejectedValueOnce(new Error('recovery failed'));
  await expect(f.service.ensureAssets()).rejects.toThrow('recovery failed');
  expect(() => f.service.requireAssets()).toThrow('Offscreen assets are not prepared');
  await f.service.ensureAssets();
  expect(() => f.service.requireAssets()).not.toThrow();
  f.terminate();
  expect(() => f.service.requireAssets()).toThrow('Offscreen assets are not prepared');
  expect(f.admit).toHaveBeenCalledOnce();
});

it('does not admit assets from recovery that finished after connection termination', async () => {
  const f = fixture();
  let finish!: () => void;
  f.recover.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const old = f.service.ensureAssets();
  await vi.waitFor(() => expect(f.recover).toHaveBeenCalledOnce());
  f.terminate();
  finish();
  await expect(old).rejects.toThrow('Offscreen data connection changed');
  expect(() => f.service.requireAssets()).toThrow('Offscreen assets are not prepared');
  await f.service.ensureAssets();
  expect(() => f.service.requireAssets()).not.toThrow();
});

it('rejects termination between admission and the queued recovery continuation', async () => {
  const f = fixture();
  await f.service.ensureAdmission();
  const pending = f.service.ensureAssets();
  f.terminate();
  await expect(pending).rejects.toThrow('Offscreen data is not admitted');
  expect(f.recover).not.toHaveBeenCalled();
  expect(() => f.service.requireAssets()).toThrow('Offscreen assets are not prepared');
  await f.service.ensureAssets();
  expect(() => f.service.requireAssets()).not.toThrow();
});
