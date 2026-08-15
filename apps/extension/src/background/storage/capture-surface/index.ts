// policyStateId: capture-surface-leases - durable write-ahead journal for privileged surface mutations.
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import type {
  CaptureSurfaceJournalEntry,
  CaptureSurfaceJournalPhase,
  CaptureSurfaceOwner,
  CaptureSurfaceSnapshot,
} from './contracts';

const JOURNAL_KEY = 'capture-surface-journal-v1';
const owners = new Set<CaptureSurfaceOwner>(['screenshot', 'quick-action', 'video']);
const phases = new Set<CaptureSurfaceJournalPhase>([
  'prepared',
  'applied',
  'suspended',
  'releasing',
  'conflict',
]);
const windowStates = new Set([
  'normal',
  'minimized',
  'maximized',
  'fullscreen',
  'locked-fullscreen',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function parseSnapshot(value: unknown): CaptureSurfaceSnapshot | null {
  if (!isRecord(value)) return null;
  if (
    value['type'] === 'window' &&
    isInteger(value['left']) &&
    isInteger(value['top']) &&
    isInteger(value['width']) &&
    isInteger(value['height']) &&
    typeof value['state'] === 'string' &&
    windowStates.has(value['state'])
  ) {
    return {
      type: 'window',
      left: value['left'],
      top: value['top'],
      width: value['width'],
      height: value['height'],
      state: value['state'] as Extract<CaptureSurfaceSnapshot, { type: 'window' }>['state'],
    };
  }
  return null;
}

function parseEntry(value: unknown): CaptureSurfaceJournalEntry | null {
  if (!isRecord(value)) return null;
  const prior = parseSnapshot(value['prior']);
  const applied = parseSnapshot(value['applied']);
  if (
    value['version'] !== 1 ||
    typeof value['sessionId'] !== 'string' ||
    typeof value['leaseId'] !== 'string' ||
    !isInteger(value['generation']) ||
    typeof value['owner'] !== 'string' ||
    !owners.has(value['owner'] as CaptureSurfaceOwner) ||
    !isInteger(value['tabId']) ||
    !isInteger(value['windowId']) ||
    typeof value['presetId'] !== 'string' ||
    value['target'] !== 'window' ||
    !prior ||
    !applied ||
    typeof value['phase'] !== 'string' ||
    !phases.has(value['phase'] as CaptureSurfaceJournalPhase) ||
    (value['parentLeaseId'] !== null && typeof value['parentLeaseId'] !== 'string') ||
    !isInteger(value['updatedAt']) ||
    !Number.isSafeInteger(value['updatedAt']) ||
    value['updatedAt'] < 0
  ) {
    return null;
  }
  return {
    version: 1,
    sessionId: value['sessionId'],
    leaseId: value['leaseId'],
    generation: value['generation'],
    owner: value['owner'] as CaptureSurfaceOwner,
    tabId: value['tabId'],
    windowId: value['windowId'],
    presetId: value['presetId'],
    target: 'window',
    prior,
    applied,
    phase: value['phase'] as CaptureSurfaceJournalPhase,
    parentLeaseId: value['parentLeaseId'],
    updatedAt: value['updatedAt'],
  };
}

function snapshotIdentityMatches(entry: CaptureSurfaceJournalEntry): boolean {
  return entry.presetId.length > 0;
}

function snapshotsEqual(left: CaptureSurfaceSnapshot, right: CaptureSurfaceSnapshot): boolean {
  if (left.type !== right.type) return false;
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height &&
    left.state === right.state
  );
}

function hasValidTabStacks(entries: readonly CaptureSurfaceJournalEntry[]): boolean {
  const stacks = new Map<number, CaptureSurfaceJournalEntry[]>();
  for (const entry of entries) {
    const stack = stacks.get(entry.tabId) ?? [];
    stack.push(entry);
    stacks.set(entry.tabId, stack);
  }
  for (const stack of stacks.values()) {
    stack.sort((left, right) => left.updatedAt - right.updatedAt);
    for (const [index, entry] of stack.entries()) {
      const parent = index === 0 ? null : stack[index - 1]!;
      if (entry.parentLeaseId !== (parent?.leaseId ?? null)) return false;
      if (parent && parent.updatedAt >= entry.updatedAt) return false;
      if (parent?.target === entry.target && !snapshotsEqual(parent.applied, entry.prior)) {
        return false;
      }
      if (index < stack.length - 1 && entry.phase !== 'suspended') return false;
    }
  }
  return true;
}

function hasCrossTabWindowConflict(entries: readonly CaptureSurfaceJournalEntry[]): boolean {
  return entries.some((left, index) =>
    entries
      .slice(index + 1)
      .some((right) => left.tabId !== right.tabId && left.windowId === right.windowId && true)
  );
}

function isValidJournalGraph(entries: readonly CaptureSurfaceJournalEntry[]): boolean {
  const leaseIds = new Set<string>();
  for (const entry of entries) {
    if (leaseIds.has(entry.leaseId) || !snapshotIdentityMatches(entry)) return false;
    leaseIds.add(entry.leaseId);
  }
  return hasValidTabStacks(entries) && !hasCrossTabWindowConflict(entries);
}

export async function readCaptureSurfaceJournal(): Promise<CaptureSurfaceJournalEntry[]> {
  if (!browserStorage.session.isAvailable()) return [];
  const stored = await browserStorage.session.get([JOURNAL_KEY]);
  const value = stored[JOURNAL_KEY];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Capture surface journal is invalid');
  const parsed = value.map(parseEntry);
  if (parsed.some((entry) => entry === null)) {
    throw new Error('Capture surface journal contains an invalid entry');
  }
  const entries = parsed as CaptureSurfaceJournalEntry[];
  if (!isValidJournalGraph(entries)) {
    throw new Error('Capture surface journal contains an invalid graph');
  }
  return entries;
}

export async function writeCaptureSurfaceJournal(
  entries: readonly CaptureSurfaceJournalEntry[]
): Promise<void> {
  if (!browserStorage.session.isAvailable()) {
    throw new Error('Session storage is unavailable for capture surface recovery');
  }
  await browserStorage.session.set({ [JOURNAL_KEY]: entries });
}

export async function clearCaptureSurfaceJournal(): Promise<void> {
  if (browserStorage.session.isAvailable()) {
    await browserStorage.session.remove(JOURNAL_KEY);
  }
}
