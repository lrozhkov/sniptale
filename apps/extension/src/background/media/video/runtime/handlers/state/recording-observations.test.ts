import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleRecordingObservations } from './recording-observations';
import { runtimeVideoSessionMessageContracts } from '../../../../../../contracts/messaging/contracts/runtime/video/session';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const owner = vi.hoisted(() => ({
  lease: vi.fn(),
  append: vi.fn(),
  tab: vi.fn(),
  send: vi.fn(),
  frames: vi.fn(),
}));
vi.mock('../../../../../routing-contracts/runtime-messaging/services', () => ({
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: owner.send }),
}));
vi.mock('@sniptale/platform/browser/web-navigation', () => ({
  browserWebNavigation: { getAllFrames: owner.frames },
}));
vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: object) => ({
    ...message,
    capabilityToken: 'private-capability',
  }),
}));
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
  owner.send.mockResolvedValue({ success: true, result: 'accepted' });
  owner.frames.mockResolvedValue([{ frameId: 0, documentId: 'document' }]);
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

function raw(recordingId: string) {
  return {
    type: VideoMessageType.RECORDING_OBSERVATIONS,
    recordingId,
    cursorPacket: {
      version: 1 as const,
      recordingId,
      batchSequence: 0,
      sourceClockId: 'phase-1',
      clockRevision: 0,
      clock: {
        source: 'dom-event-time' as const,
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
      viewport: {
        width: 1920,
        height: 1080,
        devicePixelRatio: 1,
        visualViewportScale: 1,
        visualViewportOffsetX: 0,
        visualViewportOffsetY: 0,
      },
      records: [
        {
          kind: 'sample' as const,
          localSequence: 0,
          activeTimeUs: 12345,
          x: 12,
          y: 34,
          observed: true,
          visible: true,
          event: 'move' as const,
          button: 'none' as const,
          relatedLocalSequence: null,
        },
      ],
    },
  };
}
function bind(recordingId: string) {
  owner.lease.mockReturnValue({
    recordingId,
    recordingTabId: 7,
    surfaceBinding: { generation: 4, streamInstanceId: 'stream-4' },
  });
}

it('forwards bounded raw packets with native source identity and current recording capability', async () => {
  bind('raw-forward');
  const message = raw('raw-forward');
  await new Promise<void>((resolve) => {
    expect(
      handleRecordingObservations(
        message,
        (value) => {
          expect(value).toEqual({ success: true });
          resolve();
        },
        sender
      )
    ).toEqual({ handled: true, keepChannelOpen: true });
  });
  expect(owner.send).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_OBSERVATIONS,
    recordingId: 'raw-forward',
    generation: 4,
    streamInstanceId: 'stream-4',
    nativeDocumentId: 'document',
    cursorPacket: message.cursorPacket,
    capabilityToken: 'private-capability',
  });
  expect(owner.append).not.toHaveBeenCalled();
});

it('rechecks recording authority after native document admission completes', async () => {
  bind('raw-stale');
  let release!: () => void;
  owner.frames.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve([{ frameId: 0, documentId: 'document' }]);
      })
  );
  const response = vi.fn();
  handleRecordingObservations(raw('raw-stale'), response, sender);
  await Promise.resolve();
  owner.lease.mockReturnValue(null);
  release();
  await vi.waitFor(() => expect(response).toHaveBeenCalled());
  expect(response).toHaveBeenCalledWith({
    success: false,
    error: 'RECORDING_OBSERVATIONS_UNAVAILABLE',
  });
  expect(owner.send).not.toHaveBeenCalled();
});

it('refuses a raw sender outside the top active document before forwarding', () => {
  bind('raw-denied');
  const response = vi.fn();
  handleRecordingObservations(raw('raw-denied'), response, {
    ...sender,
    documentLifecycle: 'pending_deletion',
  });
  expect(response).toHaveBeenCalledWith({
    success: false,
    error: 'RECORDING_OBSERVATIONS_SOURCE_UNAVAILABLE',
  });
  expect(owner.frames).not.toHaveBeenCalled();
  expect(owner.send).not.toHaveBeenCalled();
});

it('requires exactly one observation payload and matching recording identity', () => {
  const parse =
    runtimeVideoSessionMessageContracts[VideoMessageType.RECORDING_OBSERVATIONS].parseRequest;
  expect(parse(raw('raw-contract'))).toEqual(raw('raw-contract'));
  expect(() => parse({ ...raw('raw-contract'), telemetry: snapshot })).toThrow();
  expect(() => parse({ ...raw('raw-contract'), recordingId: 'foreign' })).toThrow();
});
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

function rawEvents(recordingId: string) {
  const header = raw(recordingId).cursorPacket;
  return {
    type: VideoMessageType.RECORDING_OBSERVATIONS,
    recordingId,
    eventPacket: {
      ...header,
      records: [
        {
          kind: 'segment' as const,
          recordSeq: 0,
          segmentId: 0,
          activeTimeUs: 12345,
          clock: header.clock,
          reason: 'start' as const,
        },
      ],
    },
  };
}

it('forwards event packets with the same native document and capability authority', async () => {
  bind('events-forward');
  const message = rawEvents('events-forward');
  const response = new Promise<void>((resolve) => {
    handleRecordingObservations(
      message,
      (value) => {
        expect(value).toEqual({ success: true });
        resolve();
      },
      sender
    );
  });
  message.eventPacket.records[0]!.activeTimeUs = 999;
  await response;
  expect(owner.send).toHaveBeenCalledWith(
    expect.objectContaining({
      nativeDocumentId: 'document',
      capabilityToken: 'private-capability',
      eventPacket: expect.objectContaining({
        records: [expect.objectContaining({ activeTimeUs: 12345 })],
      }),
    })
  );
  expect(owner.append).not.toHaveBeenCalled();
});

it('rejects mixed or foreign event payloads at the closed runtime boundary', () => {
  const parse =
    runtimeVideoSessionMessageContracts[VideoMessageType.RECORDING_OBSERVATIONS].parseRequest;
  expect(parse(rawEvents('events-contract'))).toEqual(rawEvents('events-contract'));
  expect(() =>
    parse({ ...rawEvents('events-contract'), cursorPacket: raw('events-contract').cursorPacket })
  ).toThrow();
  expect(() => parse({ ...rawEvents('events-contract'), telemetry: snapshot })).toThrow();
  expect(() => parse({ ...rawEvents('events-contract'), recordingId: 'foreign' })).toThrow();
  expect(() =>
    parse({ ...rawEvents('events-contract'), nativeDocumentId: 'claimed-by-packet' })
  ).toThrow();
});

it('bounds event forwarding independently so a blocked event write does not block cursor packets', async () => {
  bind('independent-block-streams');
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  owner.send.mockImplementation(async (message) => {
    if (message.eventPacket) await blocked;
    return { success: true, result: 'accepted' };
  });
  const first = vi.fn(),
    second = vi.fn(),
    third = vi.fn();
  handleRecordingObservations(rawEvents('independent-block-streams'), first, sender);
  handleRecordingObservations(rawEvents('independent-block-streams'), second, sender);
  handleRecordingObservations(rawEvents('independent-block-streams'), third, sender);
  expect(third).toHaveBeenCalledWith({
    success: false,
    error: 'RECORDING_OBSERVATIONS_BACKPRESSURE',
  });
  await new Promise<void>((resolve) =>
    handleRecordingObservations(
      raw('independent-block-streams'),
      (value) => {
        expect(value).toEqual({ success: true });
        resolve();
      },
      sender
    )
  );
  expect(first).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(second).toHaveBeenCalledWith({ success: true }));
});

it('rechecks event recording authority after asynchronous document admission', async () => {
  bind('events-stale');
  let release!: () => void;
  owner.frames.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve([{ frameId: 0, documentId: 'document' }]);
      })
  );
  const response = vi.fn();
  handleRecordingObservations(rawEvents('events-stale'), response, sender);
  await Promise.resolve();
  owner.lease.mockReturnValue(null);
  release();
  await vi.waitFor(() => expect(response).toHaveBeenCalled());
  expect(response).toHaveBeenCalledWith({
    success: false,
    error: 'RECORDING_OBSERVATIONS_UNAVAILABLE',
  });
  expect(owner.send).not.toHaveBeenCalled();
});
