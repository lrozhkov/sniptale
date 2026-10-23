import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { editReviewTextFragment, splitReviewTextFragment } from '../../review/text-document';
import {
  applyVideoProjectTextEdit,
  addVideoProjectVoiceTake,
  addVideoProjectManualText,
  videoProjectTextPlayhead,
} from './authoring';

function fixture() {
  const project = createEmptyVideoProject('Text');
  const added = addVideoProjectManualText(project, {
    documentId: 'doc',
    fragmentId: 'phrase',
    start: 1,
  });
  if (!added.ok) throw new Error('Text creation failed');
  return added;
}
it('creates independent text with shared defaults and edits without touching source data', () => {
  const { project, entry } = fixture();
  expect(entry.binding).toEqual({ kind: 'project' });
  expect(entry.captions?.enabled).toBe(false);
  expect(entry.document.fragments[0]).toMatchObject({ start: 1, end: 4, timeDomain: 'result' });
  const result = editReviewTextFragment(entry.document, 'phrase', { text: 'Authored' });
  if (!result.ok) throw new Error('Edit failed');
  const edit = applyVideoProjectTextEdit(project, entry, { document: result.document });
  expect(edit.ok).toBe(true);
  expect(project.textDocuments![0]!.document.fragments[0]!.text).toBe('');
  if (edit.ok) {
    expect(edit.project.version).toBe(5);
    expect(edit.entry.document.fragments[0]).toMatchObject({ text: 'Authored', revision: 1 });
  }
});
it('refuses a removed or recreated document basis and accepts an explicit retry with the current basis', () => {
  const { project, entry } = fixture();
  const recreated = { ...project, textDocuments: [structuredClone(entry)] };
  expect(applyVideoProjectTextEdit(recreated, entry, {})).toEqual({ ok: false, reason: 'stale' });
  expect(
    addVideoProjectManualText(
      { ...project, textDocuments: [] },
      {
        documentId: 'doc',
        fragmentId: 'next',
        start: 2,
        target: entry,
      }
    )
  ).toEqual({ ok: false, reason: 'stale' });
  const retry = addVideoProjectManualText(recreated, {
    documentId: 'unused',
    fragmentId: 'next',
    start: 4,
    target: recreated.textDocuments[0]!,
  });
  expect(retry.ok && retry.entry.document.fragments.map((fragment) => fragment.id)).toEqual([
    'phrase',
    'next',
  ]);
});
it('rejects a complete edit or add above aggregate budget without losing admitted content', () => {
  const { project, entry } = fixture();
  const fragments = Array.from({ length: 2_000 }, (_, index) => ({
    ...entry.document.fragments[0]!,
    id: `text-${index}`,
  }));
  const full = { ...entry, document: { ...entry.document, fragments } };
  project.textDocuments = [full];
  expect(
    addVideoProjectManualText(project, { documentId: 'next', fragmentId: 'new', start: 0 })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    applyVideoProjectTextEdit(project, full, {
      document: {
        ...full.document,
        fragments: [...fragments, { ...fragments[0]!, id: 'overflow' }],
      },
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(full.document.fragments).toHaveLength(2_000);
});
it('does not guess native time in gaps or conflicting placements and respects source speed', () => {
  const { project, entry } = fixture();
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'asset' },
    {
      duration: 10,
      width: 640,
      height: 360,
      hasAudio: false,
      mimeType: 'video/mp4',
      size: 1,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 2);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const source = {
    ...entry,
    binding: { kind: 'source' as const, assetId: asset.id, sourceInstanceId: clip.id },
  };
  project.clips = [{ ...clip, sourceStart: 3, sourceDuration: 4, duration: 2, playbackRate: 2 }];
  expect(videoProjectTextPlayhead(project, source, 2.5)).toBe(4);
  if (project.clips[0]!.type !== 'VIDEO') throw new Error('Expected source video');
  project.clips[0]!.cameraTiming = { offsetSeconds: 2, transitions: 'bounded' };
  expect(videoProjectTextPlayhead(project, source, 2.5)).toBe(4);
  delete project.clips[0]!.cameraTiming;
  expect(videoProjectTextPlayhead(project, source, 4)).toBeNull();
  project.clips.push({
    ...clip,
    duration: 2,
    sourceDuration: 4,
    playbackRate: 2,
    id: 'second',
    sourceInstanceId: clip.id,
    sourceStart: 5,
  });
  expect(videoProjectTextPlayhead(project, source, 2.5)).toBeNull();
  expect(videoProjectTextPlayhead(project, entry, 8)).toBe(8);
  expect(
    addVideoProjectManualText(project, {
      documentId: 'new',
      fragmentId: 'new',
      start: 1,
      target: source,
    })
  ).toEqual({ ok: false, reason: 'stale' });
});

it('splits source text at the retained window playhead and preserves audio progression', () => {
  const { project, entry } = fixture();
  const asset = createVideoProjectAsset(
    'Windowed source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'windowed' },
    {
      duration: 10,
      width: 640,
      height: 360,
      hasAudio: true,
      mimeType: 'video/mp4',
      size: 1,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 2);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const source = {
    ...entry,
    binding: { kind: 'source' as const, assetId: asset.id, sourceInstanceId: clip.id },
    document: {
      ...entry.document,
      fragments: entry.document.fragments.map((fragment) => ({
        ...fragment,
        text: 'Left right',
        start: 4,
        end: 6,
        timeDomain: 'source' as const,
      })),
    },
  };
  project.textDocuments = [source];
  project.clips = [
    {
      ...clip,
      sourceStart: 2,
      sourceDuration: 8,
      duration: 2,
      playbackWindow: { offset: 2, extent: 4 },
    },
  ];
  const playhead = videoProjectTextPlayhead(project, source, 2.75);
  expect(playhead).toBe(4.75);
  if (playhead === null) throw new Error('Missing source playhead');
  const split = splitReviewTextFragment(source.document, 'phrase', {
    id: 'right',
    position: 5,
    time: playhead,
  });
  if (!split.ok) throw new Error('Text split refused');
  const edited = applyVideoProjectTextEdit(project, source, { document: split.document });
  expect(edited.ok && edited.entry.document.fragments).toMatchObject([
    { text: 'Left', start: 4, end: 4.75 },
    { text: 'right', start: 4.75, end: 6 },
  ]);
  expect(source.document.fragments).toHaveLength(1);
  const windowed = project.clips[0]!;
  if (windowed.type !== 'VIDEO') throw new Error('Expected windowed video');
  project.clips = [{ ...windowed, playbackWindow: { offset: 2, extent: 4, holdAt: 2.5 } }];
  expect(videoProjectTextPlayhead(project, source, 2.75)).toBe(4.5);
  project.clips = [
    { ...windowed, type: 'AUDIO', playbackWindow: { offset: 2, extent: 4, holdAt: 2.5 } },
  ];
  expect(videoProjectTextPlayhead(project, source, 2.75)).toBe(4.75);
  project.clips = [{ ...windowed, sourceDuration: 2.5 }];
  expect(videoProjectTextPlayhead(project, source, 2.75)).toBe(4.5);
  expect(videoProjectTextPlayhead(project, source, 4)).toBeNull();
  project.clips.push({ ...windowed, id: 'conflicting', sourceInstanceId: clip.id, sourceStart: 3 });
  expect(videoProjectTextPlayhead(project, source, 2.75)).toBeNull();
});

function voiceAsset() {
  return createVideoProjectAsset(
    'Historical phrase',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice' },
    {
      duration: 12,
      width: 0,
      height: 0,
      mimeType: 'audio/mpeg',
      size: 4,
      hasAudio: true,
      audioPeaks: null,
    }
  );
}
function voiceSnapshot() {
  return {
    version: 1 as const,
    documentId: 'removed-document',
    binding: { kind: 'project' as const },
    basisHash: `sha256:${'a'.repeat(64)}`,
    text: {
      kind: 'ai' as const,
      textId: 'removed-phrase',
      revision: 1,
      timingRevision: 1,
      text: 'Historical phrase',
      start: 1,
      end: 2,
      timeDomain: 'result' as const,
      profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' as const },
    },
  };
}
it('adds the complete voice take to a separate track without moving existing content', () => {
  const { project } = fixture();
  const before = structuredClone(project);
  const snapshot = voiceSnapshot();
  const accepted = addVideoProjectVoiceTake(project, voiceAsset(), snapshot, { start: 7 });
  expect(accepted).not.toBeNull();
  expect(accepted!.project.duration).toBe(19);
  expect(accepted!.project.tracks).toHaveLength(project.tracks.length + 1);
  expect(accepted!.clip).toMatchObject({
    type: 'AUDIO',
    startTime: 7,
    duration: 12,
    sourceDuration: 12,
    playbackRate: 1,
  });
  expect(accepted!.clip.textSnapshot).toEqual(snapshot);
  snapshot.text.text = 'New words';
  expect(accepted!.clip.textSnapshot?.text.text).toBe('Historical phrase');
  expect(project).toEqual(before);
});
it('uses an explicit audio lane and refuses overlap without ripple or overwrite', () => {
  const initial = addVideoProjectVoiceTake(fixture().project, voiceAsset(), voiceSnapshot(), {
    start: 7,
  })!;
  const trackId = initial.clip.trackId;
  const overlapping = voiceAsset();
  expect(
    addVideoProjectVoiceTake(initial.project, overlapping, voiceSnapshot(), { start: 8, trackId })
  ).toBeNull();
  const later = addVideoProjectVoiceTake(initial.project, overlapping, voiceSnapshot(), {
    start: 19,
    trackId,
  });
  expect(later!.project.tracks).toEqual(initial.project.tracks);
  expect(later!.project.clips.find((clip) => clip.id === initial.clip.id)).toEqual(initial.clip);
  expect(later!.clip.startTime).toBe(19);
  const multiple = {
    ...initial.project,
    tracks: initial.project.tracks.map((track) =>
      track.id === trackId
        ? { ...track, logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }] }
        : track
    ),
  };
  expect(
    addVideoProjectVoiceTake(multiple, voiceAsset(), voiceSnapshot(), {
      start: 8,
      trackId,
      timelineLaneId: 'line-2',
    })!.clip.timelineLaneId
  ).toBe('line-2');
});
it('rejects locked, missing, non-audio or unknown-lane destinations', () => {
  const initial = addVideoProjectVoiceTake(fixture().project, voiceAsset(), voiceSnapshot(), {
    start: 0,
  })!;
  const locked = {
    ...initial.project,
    tracks: initial.project.tracks.map((track) => ({ ...track, locked: true })),
  };
  for (const project of [locked, initial.project]) {
    expect(
      addVideoProjectVoiceTake(project, voiceAsset(), voiceSnapshot(), {
        start: 20,
        trackId: project.tracks[0]!.id,
      })
    ).toBeNull();
  }
  expect(
    addVideoProjectVoiceTake(initial.project, voiceAsset(), voiceSnapshot(), {
      start: 20,
      trackId: 'missing',
    })
  ).toBeNull();
  expect(
    addVideoProjectVoiceTake(initial.project, voiceAsset(), voiceSnapshot(), {
      start: 20,
      trackId: initial.clip.trackId,
      timelineLaneId: 'unknown',
    })
  ).toBeNull();
});
it('preserves short audio duration and admits no invalid placement or snapshot', () => {
  const { project } = fixture();
  const asset = voiceAsset();
  asset.metadata.duration = 0.01;
  expect(
    addVideoProjectVoiceTake(project, asset, voiceSnapshot(), { start: 0 })!.clip.duration
  ).toBe(0.01);
  for (const start of [-1, NaN, Infinity, 86_400]) {
    expect(addVideoProjectVoiceTake(project, asset, voiceSnapshot(), { start })).toBeNull();
  }
  expect(
    addVideoProjectVoiceTake(
      project,
      asset,
      { ...voiceSnapshot(), basisHash: 'invalid' },
      { start: 0 }
    )
  ).toBeNull();
});

it('admits only explicit current original targets and freezes them separately from the text snapshot', () => {
  const { project } = fixture();
  const asset = voiceAsset();
  const source = createVideoClipFromAsset(
    project.tracks[0]!.id,
    { ...asset, id: 'source-asset', type: 'VIDEO' },
    640,
    360
  );
  project.assets.push({ ...asset, id: source.assetId, type: 'VIDEO' });
  project.clips.push(source);
  const originalAudioMute = {
    volume: 0.25,
    targets: [{ assetId: source.assetId, sourceInstanceId: source.id }],
  };
  const added = addVideoProjectVoiceTake(project, asset, voiceSnapshot(), {
    start: 0,
    originalAudioMute,
  });
  expect(added).not.toBeNull();
  expect(added?.project.version).toBe(6);
  expect(added?.clip.originalAudioMute).toEqual(originalAudioMute);
  const snapshot = voiceSnapshot();
  expect(
    addVideoProjectVoiceTake(
      project,
      asset,
      {
        ...snapshot,
        binding: { kind: 'source', assetId: source.assetId, sourceInstanceId: source.id },
        text: { ...snapshot.text, timeDomain: 'source' },
      },
      { start: 0, originalAudioMute }
    )
  ).not.toBeNull();
  originalAudioMute.targets[0]!.sourceInstanceId = 'changed';
  expect(added?.clip.originalAudioMute?.targets[0]?.sourceInstanceId).toBe(source.id);
  for (const invalid of [
    { ...originalAudioMute, targets: [] },
    originalAudioMute,
    { ...originalAudioMute, volume: -1 },
    {
      volume: 0,
      targets: Array.from({ length: 513 }, (_, index) => ({
        assetId: source.assetId,
        sourceInstanceId: `instance-${index}`,
      })),
    },
  ]) {
    expect(
      addVideoProjectVoiceTake(project, asset, voiceSnapshot(), {
        start: 0,
        originalAudioMute: invalid,
      })
    ).toBeNull();
  }
});

it('retains a project-time tail through montage sync, growth, shortening, captions, and reopen', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const { syncProjectDuration } = await import('../timeline/basics');
  const { projectVideoProjectTextFragment } = await import('./projection');
  const { videoProjectCaptionInput, hasVideoProjectCaptions } = await import('./captions');
  const { exportVideoProjectSubtitles } = await import('./subtitle-export');
  const { parseHydratableVideoProject, isExportReadyVideoProject } =
    await import('../validation/root');
  const { applyVideoProjectMutationPatch } = await import('../mutation');
  const base = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Video.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const added = addVideoProjectManualText(base, {
    documentId: 'retained',
    fragmentId: 'tail',
    start: 7,
  });
  if (!added.ok) throw new Error('Text creation failed');
  added.entry.document.fragments[0]!.text = 'Retained phrase';
  const before = structuredClone(added.project);
  const authored = applyVideoProjectTextEdit(added.project, added.entry, {
    durationMode: 'project',
    captions: { ...added.entry.captions!, enabled: true },
  });
  if (!authored.ok) throw new Error('Duration mode edit failed');
  expect(authored.project.version).toBe(29);
  expect(authored.entry.document.fragments[0]!.end).toBe(10);
  const synced = syncProjectDuration(authored.project);
  expect(synced.duration).toBe(8);
  expect(isExportReadyVideoProject(synced)).toBe(true);
  expect(
    projectVideoProjectTextFragment(synced, authored.entry, authored.entry.document.fragments[0]!)
      .ranges
  ).toEqual([{ start: 7, end: 8 }]);
  const captionInput = videoProjectCaptionInput(synced);
  expect(captionInput.project(captionInput.document.fragments[0]!).ranges).toEqual([
    { start: 7, end: 8 },
  ]);
  expect(hasVideoProjectCaptions(synced, { start: 7, end: 8 })).toBe(true);
  expect(hasVideoProjectCaptions(synced, { start: 8, end: 10 })).toBe(false);
  for (const format of ['srt', 'vtt'] as const) {
    const subtitles = exportVideoProjectSubtitles(synced, { format });
    if (!subtitles.ok) throw new Error(subtitles.reason);
    expect(subtitles.text).toContain(
      format === 'srt' ? '00:00:07,000 --> 00:00:08,000' : '00:00:07.000 --> 00:00:08.000'
    );
    expect(subtitles.text).toContain('Retained phrase');
  }
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(synced)));
  expect(reopened?.textDocuments).toEqual(synced.textDocuments);
  expect(syncProjectDuration(reopened!).duration).toBe(8);
  const second = { ...structuredClone(synced.clips[0]!), id: 'second', startTime: 8 };
  const grown = syncProjectDuration({ ...synced, clips: [...synced.clips, second] });
  expect(grown.duration).toBe(16);
  expect(
    projectVideoProjectTextFragment(grown, authored.entry, authored.entry.document.fragments[0]!)
      .ranges
  ).toEqual([{ start: 7, end: 10 }]);
  const shortened = syncProjectDuration({ ...grown, clips: synced.clips });
  expect(shortened.duration).toBe(8);
  expect(shortened.textDocuments).toEqual(synced.textDocuments);
  const extended = applyVideoProjectTextEdit(shortened, authored.entry, {
    durationMode: 'content',
  });
  if (!extended.ok) throw new Error('Content mode edit failed');
  expect(syncProjectDuration(extended.project).duration).toBe(10);
  expect(applyVideoProjectMutationPatch(extended.project, { textDocuments: [] }).version).toBe(29);
  expect(added.project).toEqual(before);
});

it('refuses invalid source-duration mode edits and allows a current-basis retry without losing text', () => {
  const { project, entry } = fixture();
  const stale = { ...project, textDocuments: [structuredClone(entry)] };
  expect(applyVideoProjectTextEdit(stale, entry, { durationMode: 'project' })).toEqual({
    ok: false,
    reason: 'stale',
  });
  const retried = applyVideoProjectTextEdit(stale, stale.textDocuments[0]!, {
    durationMode: 'project',
  });
  expect(retried.ok).toBe(true);
  if (!retried.ok) throw new Error('Retry refused');
  expect(retried.entry.document).toEqual(entry.document);
  const source = {
    ...entry,
    binding: { kind: 'source' as const, assetId: 'asset', sourceInstanceId: 'source' },
    document: {
      ...entry.document,
      fragments: entry.document.fragments.map((fragment) => ({
        ...fragment,
        timeDomain: 'source' as const,
      })),
    },
  };
  const sourceProject = { ...project, textDocuments: [source] };
  const before = structuredClone(sourceProject);
  expect(applyVideoProjectTextEdit(sourceProject, source, { durationMode: 'project' })).toEqual({
    ok: false,
    reason: 'invalid',
  });
  expect(sourceProject).toEqual(before);
});
