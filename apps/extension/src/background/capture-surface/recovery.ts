import { readCaptureSurfaceJournal } from '../storage/capture-surface';
import type { CaptureSurfaceLeaseState } from './types';
import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import {
  captureSurfaceSnapshotsEqual,
  readCurrentSurfaceSnapshot,
  restoreCaptureSurfaceSnapshot,
} from './restoration';

async function unwindRecoveredStack(
  registry: CaptureSurfaceLeaseRegistry,
  stack: CaptureSurfaceLeaseState[]
): Promise<void> {
  while (stack.length > 0) {
    const state = stack.at(-1)!;
    try {
      const observation = await readCurrentSurfaceSnapshot(state);
      try {
        if (captureSurfaceSnapshotsEqual(state.entry.applied, observation.current)) {
          await restoreCaptureSurfaceSnapshot(state);
        } else if (!captureSurfaceSnapshotsEqual(state.prior, observation.current)) {
          throw new Error('restore-conflict');
        }
        await observation.releaseAcquisition();
      } catch (error) {
        await observation.releaseAcquisition().catch(() => undefined);
        throw error;
      }
      registry.remove(state);
    } catch {
      state.entry.phase = 'conflict';
    }
    await registry.persist();
    if (state.entry.phase === 'conflict') return;
  }
}

export async function recoverCaptureSurfaceLeases(
  registry: CaptureSurfaceLeaseRegistry,
  liveSessionIds: ReadonlySet<string>
): Promise<void> {
  const journal = (await readCaptureSurfaceJournal()).sort(
    (left, right) => left.updatedAt - right.updatedAt
  );
  registry.clear();
  for (const entry of journal) registry.hydrate(entry);
  const invalidStacks = [...registry.stacks()].filter((stack) =>
    stack.some(
      (state) =>
        !liveSessionIds.has(state.entry.sessionId) ||
        (state.entry.phase !== 'applied' && state.entry.phase !== 'suspended')
    )
  );
  for (const stack of invalidStacks) await unwindRecoveredStack(registry, stack);
}
