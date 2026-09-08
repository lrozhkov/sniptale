import { expect, it } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createVideoReviewReport } from './report';

it('exports exact times and excluded comments, without leaking draft or undo text through hostile fences', () => {
  const annotation = {
    id: 'a',
    text: 'Look here\n```json\n{"fake":true}\n```\n<img src=x>',
    anchor: { kind: 'point' as const, time: 2.123456 },
    region: { x: 0.25, y: 0, width: 0.5, height: 1 },
  };
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'private-local-object',
      formatVersion: 1,
      source: { duration: 10, width: 800, height: 400, size: 12, mimeType: 'video/webm' },
      revision: 4,
      cursor: 2,
      createdAt: 1,
      updatedAt: 4,
      history: [
        { id: 'a1', at: 1, target: 'annotation', before: null, after: annotation },
        {
          id: 'c1',
          at: 2,
          target: 'edit',
          before: null,
          after: {
            id: 'cut',
            kind: 'cut',
            start: 2,
            end: 4,
            requestedStart: 1.9,
            requestedEnd: 4.1,
          },
        },
        {
          id: 'a2',
          at: 3,
          target: 'annotation',
          before: annotation,
          after: { ...annotation, text: 'UNDO_PRIVATE' },
        },
      ],
    },
    draft: {
      aggregateId: 'recording:r',
      revision: 1,
      before: annotation,
      annotation: { ...annotation, text: 'DRAFT_PRIVATE' },
      updatedAt: 4,
    },
  };
  const report = createVideoReviewReport({
    snapshot,
    filename: 'clip.webm',
    telemetry: null,
    labels: {
      title: 'Review',
      source: 'Source',
      timeline: 'Timeline',
      machineData: 'Machine data',
      comment: 'Comment',
      cut: 'Cut',
      speed: 'Speed',
      telemetry: 'Telemetry',
      excluded: 'Excluded',
      empty: 'Empty',
    },
  });
  expect(report).not.toContain('DRAFT_PRIVATE');
  expect(report).not.toContain('UNDO_PRIVATE');
  expect(report).not.toContain('private-local-object');
  const json = report.slice(report.indexOf('````json\n') + 9).split('\n````')[0]!;
  const payload = JSON.parse(json);
  expect(payload.timeUnit).toBe('us');
  expect(payload.annotations[0]).toMatchObject({
    anchor: { timeUs: 2123456 },
    excludedFromResult: true,
    regionPixels: { x: 200, y: 0, width: 400, height: 400 },
  });
  expect(payload.annotations[0].text).toBe(annotation.text);
  expect(payload.edits[0]).toMatchObject({ requestedStartUs: 1900000, endUs: 4000000 });
  expect(payload.exported).toBe(false);
});

it('serializes full native telemetry and speed intent in microseconds, retaining mapped range comments', () => {
  const source = { duration: 4, width: 320, height: 180, size: 5, mimeType: 'video/webm' };
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'private',
      formatVersion: 1,
      source,
      revision: 3,
      cursor: 2,
      createdAt: 1,
      updatedAt: 2,
      history: [
        {
          id: 'comment',
          at: 1,
          target: 'annotation',
          before: null,
          after: {
            id: 'range',
            text: 'Read while typing',
            anchor: { kind: 'range', start: 0, end: 3 },
          },
        },
        {
          id: 'speed',
          at: 2,
          target: 'edit',
          before: null,
          after: {
            id: 'fast',
            kind: 'speed',
            rate: 2,
            audio: 'mute',
            start: 1,
            end: 3,
            requestedStart: 1,
            requestedEnd: 3,
          },
        },
      ],
    },
    draft: null,
  };
  const labels = {
    title: 'Review',
    source: 'Source',
    timeline: 'Timeline',
    machineData: 'Data',
    comment: 'Comment',
    cut: 'Cut',
    speed: 'Speed',
    telemetry: 'Telemetry',
    excluded: 'Excluded',
    empty: 'Empty',
  };
  const sourceAnchor = {
    kind: 'recording-source' as const,
    recordingId: 'r',
    sourceClipId: 'clip',
    sourceTime: 1.25,
  };
  const report = createVideoReviewReport({
    snapshot,
    filename: 'video.webm',
    labels,
    telemetry: {
      recordingId: 'r',
      createdAt: 1,
      updatedAt: 1,
      captureMode: null,
      viewport: null,
      provenance: {
        source: 'native',
        normalizationVersion: 1,
        timeUnit: 'seconds',
        coordinateSpace: 'desktop',
      },
      actionEvents: [
        {
          id: 'click',
          kind: 'CLICK',
          time: 1.25,
          duration: 0.1,
          animation: { start: 1.25, end: 1.35, duration: 0.1 },
          timeBasis: 'project',
          sourceAnchor,
          point: { x: -200, y: 100 },
          label: 'Click',
          data: {},
          preset: 'NONE',
        },
      ],
      signals: [
        { id: 'typing', kind: 'typing', startTime: 1, endTime: 2, point: null, data: { count: 4 } },
      ],
      cursorTrack: {
        captureMode: 'separate',
        skin: {
          animationPreset: 'NONE',
          color: '#fff',
          hidden: false,
          preset: 'ARROW',
          scale: 1,
          shadow: false,
        },
        samples: [
          { id: 'cursor', time: 1.25, x: -200, y: 100, visible: true, sourceAnchor },
          { id: 'next', time: 1.5, x: 10, y: 20, visible: false },
        ],
      },
    },
  });
  const payload = JSON.parse(report.split('```json\n')[1]!.split('\n```')[0]!);
  expect(payload.telemetry.actionEvents[0]).toMatchObject({
    id: 'click',
    timeUs: 1250000,
    durationUs: 100000,
    preset: 'NONE',
    timeBasis: 'project',
    animation: { startUs: 1250000, endUs: 1350000, durationUs: 100000 },
    sourceAnchor: {
      kind: 'recording-source',
      recordingId: 'r',
      sourceClipId: 'clip',
      sourceTimeUs: 1250000,
    },
  });
  expect(payload.telemetry.actionEvents[0]).not.toHaveProperty('anchor');
  expect(payload.telemetry.actionEvents[0]).not.toHaveProperty('time');
  expect(payload.telemetry.actionEvents[0]).not.toHaveProperty('duration');
  expect(payload.telemetry.cursorTrack.samples[0].sourceAnchor.sourceTimeUs).toBe(1250000);
  expect(payload.telemetry.cursorTrack.samples).toHaveLength(2);
  expect(payload.annotations[0].anchor).toEqual({ kind: 'range', startUs: 0, endUs: 3000000 });
  expect(payload.annotations[0].excludedFromResult).toBe(false);
  expect(payload.edits[0]).toMatchObject({ kind: 'speed', rate: 2, audio: 'mute' });
  expect(report).toContain('2×');
  const empty = createVideoReviewReport({
    snapshot: { ...snapshot, workspace: { ...snapshot.workspace, history: [], cursor: 0 } },
    filename: 'video.webm',
    labels,
    telemetry: null,
  });
  expect(empty).toContain('Empty');
});

it('binds actual export timing to its revision without claiming later edits were exported', () => {
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'private',
      formatVersion: 1,
      source: { duration: 8, width: 160, height: 90, size: 100, mimeType: 'video/webm' },
      revision: 2,
      cursor: 1,
      createdAt: 1,
      updatedAt: 2,
      history: [
        {
          id: 'op',
          at: 2,
          target: 'edit',
          before: null,
          after: {
            id: 'cut',
            kind: 'cut',
            start: 2,
            end: 4,
            requestedStart: 1.9,
            requestedEnd: 4.1,
          },
        },
      ],
    },
    draft: null,
  };
  const args = {
    snapshot,
    filename: 'source.webm',
    telemetry: null,
    labels: {
      title: 'Review',
      source: 'Source',
      timeline: 'Timeline',
      machineData: 'Data',
      comment: 'Comment',
      cut: 'Cut',
      speed: 'Speed',
      telemetry: 'Telemetry',
      excluded: 'Excluded',
      empty: 'Empty',
    },
    exportReceipt: {
      revision: 2,
      mediaId: 'recording:copy',
      filename: 'copy.webm',
      createdAt: 1000,
      videoPackets: 60,
      audioPackets: 300,
      resultDuration: 6,
      audioRanges: [{ sourceStart: 4.001, sourceEnd: 8.001, resultStart: 2, resultEnd: 6 }],
    },
  };
  const report = createVideoReviewReport(args);
  expect(report).toContain('"exported": true');
  expect(report).toContain('"sourceStartUs": 4001000');
  expect(report).toContain('"resultDurationUs": 6000000');
  expect(report).not.toContain('private');
  snapshot.workspace.revision = 3;
  const later = createVideoReviewReport(args);
  expect(later).toContain('"exported": false');
  expect(later).toContain('"matchesCurrentRevision": false');
  expect(later).toContain('"mediaId": "recording:copy"');
});
