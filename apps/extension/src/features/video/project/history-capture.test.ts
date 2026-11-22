import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from './factories/creation';
import { createVideoProjectCursorTrack } from './defaults';
import { VideoProjectActionEventKind, VideoProjectAssetType } from './types';
import { collectVideoProjectHistorySources } from './history-capture';

it('retains typed source identities independently of clip placement and deduplicates shared recordings', () => {
  const project = createEmptyVideoProject('Sources');
  project.source = { kind: 'scenario', scenarioProjectId: 'guide' };
  project.baseRecordingId = 'recording';
  const metadata = {
    width: 10,
    height: 10,
    duration: null,
    mimeType: 'image/png',
    size: 12,
    hasAudio: false,
    audioPeaks: null,
  };
  project.assets = [
    createVideoProjectAsset(
      'Private',
      VideoProjectAssetType.IMAGE,
      {
        kind: 'project-asset',
        projectAssetId: 'private',
        originMediaId: 'origin',
        originRecordingId: 'recording',
      },
      metadata
    ),
    createVideoProjectAsset(
      'Owned',
      VideoProjectAssetType.IMAGE,
      { kind: 'project-asset', projectAssetId: 'owned' },
      metadata
    ),
    createVideoProjectAsset(
      'Library',
      VideoProjectAssetType.IMAGE,
      { kind: 'library-asset', mediaId: 'library' },
      metadata
    ),
    createVideoProjectAsset(
      'Guide',
      VideoProjectAssetType.IMAGE,
      { kind: 'scenario-asset', scenarioAssetId: 'child' },
      metadata
    ),
    createVideoProjectAsset(
      'Recording',
      VideoProjectAssetType.RECORDING,
      { kind: 'recording', recordingId: 'recording' },
      metadata
    ),
  ];
  project.assets[0]!.recordingPart = { recordingId: 'part-recording', role: 'primary' };
  const before = structuredClone(project);
  const sources = collectVideoProjectHistorySources(project);
  expect(project).toEqual(before);
  expect(new Set(sources.map((source) => JSON.stringify(source))).size).toBe(sources.length);
  expect(sources).toEqual(
    expect.arrayContaining([
      { kind: 'scenario-project', id: 'guide' },
      { kind: 'project-asset', id: 'private' },
      { kind: 'library-asset', id: 'origin' },
      { kind: 'library-asset', id: 'library' },
      { kind: 'scenario-asset', id: 'child' },
      { kind: 'recording', id: 'recording' },
      { kind: 'recording', id: 'part-recording' },
    ])
  );
  expect(sources.filter((source) => source.id === 'recording')).toHaveLength(1);
  project.assets.length = 0;
  expect(sources.some((source) => source.id === 'private')).toBe(true);
  expect(Object.isFrozen(sources)).toBe(true);
  expect(sources.every(Object.isFrozen)).toBe(true);
});

it('retains captured source facts when they no longer have a visible clip', () => {
  const project = createEmptyVideoProject('Facts');
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(),
    samples: [
      {
        id: 'sample',
        time: 0,
        x: 0.5,
        y: 0.5,
        visible: true,
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'facts',
          sourceClipId: 'clip',
          sourceTime: 0,
        },
      },
    ],
  };
  expect(collectVideoProjectHistorySources(project)).toContainEqual({
    kind: 'recording',
    id: 'facts',
  });
  expect(collectVideoProjectHistorySources(createEmptyVideoProject('Empty'))).toEqual([]);
});

it('does not encode the same source locator for every captured cursor sample', () => {
  const project = createEmptyVideoProject('Repeated source facts');
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(),
    samples: Array.from({ length: 5000 }, (_, index) => ({
      id: `sample-${index}`,
      time: index / 100,
      x: 0.5,
      y: 0.5,
      visible: true,
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'facts',
        sourceClipId: 'clip',
        sourceTime: index / 100,
      },
    })),
  };
  const encode = vi.spyOn(JSON, 'stringify');
  try {
    const sources = collectVideoProjectHistorySources(project);
    expect(sources).toHaveLength(1);
    expect(encode).toHaveBeenCalledTimes(1);
  } finally {
    encode.mockRestore();
  }
});

it('retains recording facts for authored feedback and focus after visible clips are removed', () => {
  const project = createEmptyVideoProject('Source facts without clips');
  project.source = { kind: 'recording', recordingId: 'root-recording' };
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(),
    sourceObservations: [
      { recordingId: 'observation', sourceInstanceId: 'source-instance', samples: [] },
    ],
    samples: [{ id: 'project-sample', time: 0, x: 0.5, y: 0.5, visible: true }],
  };
  project.cursorFocusPath = {
    version: 1,
    smoothing: 0.3,
    sensitivity: 0.6,
    mode: 'follow',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'focus',
        binding: {
          kind: 'recording-source',
          recordingId: 'focus-recording',
          sourceInstanceId: 'focus-instance',
        },
        start: 0,
        end: 1,
        keys: [],
      },
      { id: 'project-focus', binding: { kind: 'project' }, start: 0, end: 1, keys: [] },
    ],
  };
  project.actionFeedback = [
    { recordingId: 'feedback', sourceInstanceId: 'feedback-instance', settings: [], signals: [] },
  ];
  project.actionEvents = [
    {
      id: 'recorded-action',
      kind: VideoProjectActionEventKind.CLICK,
      label: '',
      data: {},
      point: null,
      anchor: {
        kind: 'recording-source',
        recordingId: 'action-recording',
        sourceInstanceId: 'action-instance',
        sourceEventId: 'source-event',
        sourceTime: 0,
      },
    },
    {
      id: 'project-action',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'unrelated-label',
      data: { recordingId: 'unrelated-data' },
      point: null,
      anchor: { kind: 'project', time: 0 },
    },
  ];
  expect(project.clips).toEqual([]);
  expect(collectVideoProjectHistorySources(project)).toEqual([
    { kind: 'recording', id: 'root-recording' },
    { kind: 'recording', id: 'observation' },
    { kind: 'recording', id: 'focus-recording' },
    { kind: 'recording', id: 'feedback' },
    { kind: 'recording', id: 'action-recording' },
  ]);
});
