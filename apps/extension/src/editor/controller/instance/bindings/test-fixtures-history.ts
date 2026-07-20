import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';

export function createMockHistory() {
  return new SnapshotHistory<string>('initial', { limit: 2 });
}
