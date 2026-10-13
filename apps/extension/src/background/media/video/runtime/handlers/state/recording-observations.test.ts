import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleRecordingObservations } from './recording-observations';
import { runtimeVideoSessionMessageContracts } from '../../../../../../contracts/messaging/contracts/runtime/video/session';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const owner = vi.hoisted(() => ({ lease: vi.fn(), append: vi.fn(), tab: vi.fn() }));
vi.mock('../../../recording-control-lease', () => ({
  getActiveVideoRecordingLeaseSnapshot: owner.lease,
}));
vi.mock('../../../session-state', () => ({
  appendControlledCursorTelemetry: owner.append,
  getVideoRecordingTabId: owner.tab,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', { runtime: { id: 'extension' } });
  owner.lease.mockReturnValue({ recordingId: 'recording', recordingTabId: 7 });
  owner.tab.mockReturnValue(7);
});
afterEach(() => vi.unstubAllGlobals());
const snapshot = {
  viewport: null,
  cursorTrack: null,
  actionEvents: [],
  signals: [],
  provenance: {
    source: 'browser' as const,
    normalizationVersion: 1 as const,
    timeUnit: 'seconds' as const,
    coordinateSpace: 'client-css' as const,
  },
  observationClock: { version: 1 as const, domain: 'observation' as const, segments: [] },
};
const sender = {
  id: 'extension',
  frameId: 0,
  documentId: 'document',
  documentLifecycle: 'active' as const,
  tab: {
    id: 7,
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: true,
    frozen: false,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    lastAccessed: 0,
  },
};
it.each(['active', 'pending_deletion'] as const)(
  'admits outgoing source document in %s lifecycle synchronously',
  (documentLifecycle) => {
    const response = vi.fn();
    expect(
      handleRecordingObservations({ recordingId: 'recording', telemetry: snapshot }, response, {
        ...sender,
        documentLifecycle,
      })
    ).toEqual({ handled: true, keepChannelOpen: false });
    expect(response).toHaveBeenCalledWith({ success: true });
    expect(owner.append).toHaveBeenCalledWith(snapshot);
  }
);
it.each([
  { ...sender, id: 'foreign' },
  { ...sender, frameId: 1 },
  { ...sender, documentId: '' },
  { ...sender, documentLifecycle: 'cached' as const },
  { ...sender, tab: { ...sender.tab, id: 8 } },
  undefined,
])('rejects a non-source sender', (candidate) => {
  const response = vi.fn();
  handleRecordingObservations(
    { recordingId: 'recording', telemetry: snapshot },
    response,
    candidate
  );
  expect(response).toHaveBeenCalledWith({
    success: false,
    error: 'RECORDING_OBSERVATIONS_SOURCE_UNAVAILABLE',
  });
  expect(owner.append).not.toHaveBeenCalled();
});
it('rejects a completed/foreign recording and non-observation provenance', () => {
  const response = vi.fn();
  handleRecordingObservations({ recordingId: 'foreign', telemetry: snapshot }, response, sender);
  owner.lease.mockReturnValue(null);
  handleRecordingObservations({ recordingId: 'recording', telemetry: snapshot }, response, sender);
  owner.lease.mockReturnValue({ recordingId: 'recording', recordingTabId: 7 });
  handleRecordingObservations(
    {
      recordingId: 'recording',
      telemetry: {
        ...snapshot,
        observationClock: { ...snapshot.observationClock, domain: 'media' },
      },
    },
    response,
    sender
  );
  const { provenance: _provenance, ...withoutProvenance } = snapshot;
  handleRecordingObservations(
    { recordingId: 'recording', telemetry: withoutProvenance },
    response,
    sender
  );
  expect(owner.append).not.toHaveBeenCalled();
});
it('refuses malformed telemetry at its receiving boundary', () => {
  const parse =
    runtimeVideoSessionMessageContracts[VideoMessageType.RECORDING_OBSERVATIONS].parseRequest;
  expect(() =>
    parse({
      type: VideoMessageType.RECORDING_OBSERVATIONS,
      recordingId: 'recording',
      telemetry: { ...snapshot, actionEvents: [{ time: -1 }] },
    })
  ).toThrow();
});

it('denies incomplete live snapshots while retaining legacy storage compatibility', () => {
  const incomplete = structuredClone(snapshot);
  Reflect.deleteProperty(incomplete, 'signals');
  const parse =
    runtimeVideoSessionMessageContracts[VideoMessageType.RECORDING_OBSERVATIONS].parseRequest;
  expect
    .soft(() =>
      parse({
        type: VideoMessageType.RECORDING_OBSERVATIONS,
        recordingId: 'recording',
        telemetry: incomplete,
      })
    )
    .toThrow();
  const response = vi.fn();
  handleRecordingObservations(
    { recordingId: 'recording', telemetry: incomplete },
    response,
    sender
  );
  expect.soft(owner.append).not.toHaveBeenCalled();
  expect
    .soft(response)
    .toHaveBeenCalledWith({ success: false, error: 'RECORDING_OBSERVATIONS_SOURCE_UNAVAILABLE' });
});
