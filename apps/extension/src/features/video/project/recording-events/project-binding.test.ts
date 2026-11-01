import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isExportReadyVideoProject } from '../validation/root';
import type { RecordingEventsDescriptor } from './types';

const events: RecordingEventsDescriptor = {
  format: 'recording-events-v1',
  formatVersion: 1,
  algorithm: 'lossless-v1',
  encoding: 'json-utf8-v1',
  eventStreamId: 'a'.repeat(32),
  finalized: true,
  state: 'complete',
  totalBlocks: 10000,
  totalRecords: 1000000,
  totalBytes: 50000000,
  streamSha256: 'b'.repeat(64),
};
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sourceNormalizedActionEvents: [],
    recordingSignals: [],
  });
  const group = project.actionFeedback![0]!;
  return applyVideoProjectMutationPatch(project, {
    actionFeedback: [{ ...group, events }],
  });
}

it('stores a compact million-record event reference in schema 50 and retains its fence', () => {
  const project = fixture();
  expect(project.version).toBe(50);
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(isExportReadyVideoProject(JSON.parse(JSON.stringify(project)))).toBe(true);
  expect(isExportReadyVideoProject({ ...project, version: 49 })).toBe(false);
  expect(project.actionEvents).toEqual([]);
  expect(project.actionFeedback?.[0]?.signals).toEqual([]);
  expect(JSON.stringify(project).length).toBeLessThan(10000);
  expect(applyVideoProjectMutationPatch(project, { actionFeedback: [] }).version).toBe(50);
});

it('refuses provisional and malformed source descriptors', () => {
  const project = fixture();
  const group = project.actionFeedback![0]!;
  for (const invalid of [
    { ...events, finalized: false },
    { ...events, totalRecords: 0 },
    { ...events, writerGeneration: 'private' },
  ]) {
    expect(
      isExportReadyVideoProject({ ...project, actionFeedback: [{ ...group, events: invalid }] })
    ).toBe(false);
  }
});

it('refuses mixed inline source history and mismatched recording ownership', () => {
  const project = fixture();
  const group = project.actionFeedback![0]!;
  const signal = {
    id: 'signal',
    kind: 'static-frame',
    startTime: 0,
    endTime: 1,
    point: null,
    data: {},
  };
  expect(
    isExportReadyVideoProject({ ...project, actionFeedback: [{ ...group, signals: [signal] }] })
  ).toBe(false);
  const action = {
    id: 'captured',
    kind: 'CLICK',
    label: '',
    point: null,
    data: {},
    capturedDuration: 0,
    anchor: {
      kind: 'recording-source',
      recordingId: group.recordingId,
      sourceInstanceId: group.sourceInstanceId,
      sourceEventId: 'source-click',
      sourceTime: 1,
    },
  };
  const { events: _events, ...inlineGroup } = group;
  expect(
    isExportReadyVideoProject({ ...project, actionFeedback: [inlineGroup], actionEvents: [action] })
  ).toBe(true);
  expect(isExportReadyVideoProject({ ...project, actionEvents: [action] })).toBe(false);
  expect(
    isExportReadyVideoProject({
      ...project,
      actionFeedback: [{ ...group, recordingId: 'another-recording' }],
    })
  ).toBe(false);
  expect(
    isExportReadyVideoProject({
      ...project,
      actionFeedback: [{ ...group, sourceInstanceId: 'another-instance' }],
    })
  ).toBe(false);
});

it('retains compact authored overrides and refuses malformed source presentation', () => {
  const project = fixture();
  const group = project.actionFeedback![0]!;
  const actionOverrides = [{ id: 'source-action', presentation: { enabled: false, offset: 0.5 } }];
  const changed = { ...project, actionFeedback: [{ ...group, actionOverrides }] };
  expect(isExportReadyVideoProject(changed)).toBe(true);
  for (const invalid of [
    [...actionOverrides, ...actionOverrides],
    [{ id: 'source-action', presentation: { enabled: false, secret: 'raw' } }],
    [{ id: 'source-action', presentation: { point: { x: 2, y: 0 } } }],
    [{ id: '', presentation: { enabled: false } }],
    Array.from({ length: 10001 }, (_, index) => ({
      id: `action-${index}`,
      presentation: { enabled: false },
    })),
  ]) {
    expect(
      isExportReadyVideoProject({
        ...project,
        actionFeedback: [{ ...group, actionOverrides: invalid }],
      })
    ).toBe(false);
  }
  const { events: _events, ...legacy } = group;
  expect(
    isExportReadyVideoProject({ ...project, actionFeedback: [{ ...legacy, actionOverrides }] })
  ).toBe(false);
});
