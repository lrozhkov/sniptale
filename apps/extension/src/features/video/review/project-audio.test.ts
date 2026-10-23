import { reviewSpeechTextSignature } from './speech-transcript';
import { parseVideoProjectSourceVoiceoverDocuments } from '../project/source-voiceover';
import { buildReviewTimeMap } from './timeline';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { getClipCompositeAudioGain } from '../project/timeline/presentation.gain';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../project/validation/root';
import type { VideoProject, VideoProjectAsset } from '../project/types/model';
import type { VideoProjectTrack } from '../project/types/layout';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import { buildQuickEditAudioPlan, buildQuickEditClipEnvelope } from './advanced/audio-plan';
import { projectReviewVoiceover } from './voiceover-edits';
import { planReviewProjectAudio, prepareReviewProjectVoiceSnapshots } from './project-audio';

function fixture() {
  const asset: VideoProjectAsset = {
    id: 'native-audio',
    type: 'AUDIO',
    name: 'Recording.wav',
    source: { kind: 'project-asset', projectAssetId: 'owned-audio' },
    metadata: {
      width: 0,
      height: 0,
      duration: 12,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    },
    createdAt: 1,
  };
  const track = (id: string): VideoProjectTrack => ({
    id,
    name: id,
    order: id === 'voice' ? 3 : 4,
    visible: true,
    locked: false,
    kind: 'AUDIO',
    logicalLanes: [{ id: 'lane' }],
  });
  const audio = createQuickEditAdvancedContent().audio;
  audio.voiceover = [
    {
      id: 'take',
      assetId: 'project-asset:gallery-audio',
      timelineStart: 1,
      sourceOffset: 2,
      duration: 4,
      volume: 1.7,
      muted: false,
      fadeIn: 3,
      fadeOut: 3,
    },
  ];
  audio.laneVolumes = { voiceover: 1.8, music: 0.4 };
  return {
    operationId: 'conversion-1',
    application: { originalAudioApplied: true, voiceoverApplied: true, musicApplied: true },
    mainDuration: 20,
    audio,
    resources: {
      assets: [{ reviewAssetId: 'project-asset:gallery-audio', asset }],
      tracks: { voiceover: track('voice'), music: track('music') },
    },
  };
}

it('admits result-only takes while retaining passive transcript data', () => {
  const input = fixture();
  const transcript = {
    version: 1 as const,
    phrases: [
      {
        id: 'historical',
        start: 2,
        end: 6,
        originalText: 'Recorded',
        text: 'Edited',
        revision: 1,
        alignment: 'manual' as const,
      },
    ],
    replacements: [],
  };
  input.audio.voiceover[0]!.transcript = transcript;
  const before = structuredClone(input);
  const result = planReviewProjectAudio(input);
  expect(result.status).toBe('prepared');
  if (result.status === 'prepared') {
    expect(result.clips[0]).toMatchObject({
      transcript,
      linkMode: 'DETACHED',
      sourceStart: 2,
      sourceDuration: 4,
    });
    expect(result.clips[0]!.transcript).not.toBe(transcript);
    expect(result.sourceVoiceoverDocuments).toEqual([]);
  }
  expect(input).toEqual(before);
});

it.each([0.25, 1, 4])(
  'preserves actual Gallery own-tempo fade phase and independent masters at %s',
  (tempo) => {
    const input = fixture();
    input.audio.voiceover[0]!.tempo = tempo;
    const before = structuredClone(input);
    const result = planReviewProjectAudio(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
    const clip = result.clips[0]!;
    const project: VideoProject = {
      ...createVideoProjectFromRecording({
        recordingId: 'recording',
        filename: 'Original.webm',
        width: 640,
        height: 360,
        duration: 20,
        mimeType: 'video/webm',
        size: 100,
        hasAudio: true,
      }),
      version: 30,
      assets: result.assets,
      tracks: result.tracks,
      clips: result.clips,
    };
    expect(isExportReadyVideoProject(project)).toBe(true);
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(project)))?.clips).toEqual(
      result.clips
    );
    const entry = buildQuickEditAudioPlan({
      voiceover: projectReviewVoiceover(input.audio.voiceover).map((take) => ({
        ...take,
        volume: take.volume * input.audio.laneVolumes!.voiceover,
      })),
      music: [],
    })[0]!;
    expect(clip).toMatchObject({
      sourceStart: 2,
      sourceDuration: 4,
      duration: 4 / tempo,
      playbackRate: tempo,
      fadeInMs: 3000 / tempo,
      fadeOutMs: 3000 / tempo,
      volume: 1.7,
    });
    expect(result.tracks.find((track) => track.id === clip.trackId)?.audioVolume).toBe(1.8);
    for (const nativeElapsed of [0, 0.1, 0.7, 1, 1.99, 2, 2.01, 3.9, 4]) {
      const elapsed = nativeElapsed / tempo;
      const expected = buildQuickEditClipEnvelope({
        entry,
        duration: entry.duration,
        elapsed,
      })[0]![1];
      expect(getClipCompositeAudioGain(project, clip, clip.startTime + elapsed)).toBeCloseTo(
        expected,
        12
      );
      expect(clip.sourceStart + elapsed * tempo).toBeCloseTo(
        entry.sourceOffset + elapsed * (entry.playbackRate ?? 1),
        12
      );
    }
    expect(planReviewProjectAudio(input)).toEqual(result);
    expect(input).toEqual(before);
    result.assets[0]!.name = 'Changed';
    result.tracks[0]!.name = 'Changed';
    expect(input).toEqual(before);
  }
);

it('uses one resource for two lanes while preserving independent clip identities, silence, and music fades', () => {
  const input = fixture();
  input.audio.voiceover[0]!.muted = true;
  input.audio.music = [
    { ...input.audio.voiceover[0]!, muted: false, timelineStart: 6, fadeIn: 0.5, fadeOut: 1 },
  ];
  const result = planReviewProjectAudio(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.assets).toHaveLength(1);
  expect(result.clips).toHaveLength(2);
  expect(new Set(result.clips.map((clip) => clip.id)).size).toBe(2);
  expect(new Set(result.clips.map((clip) => clip.sourceInstanceId)).size).toBe(2);
  expect(result.clips[0]).toMatchObject({ muted: true, startTime: 1 });
  expect(result.clips[1]).toMatchObject({
    trackId: 'music',
    startTime: 6,
    duration: 4,
    sourceStart: 2,
    fadeInMs: 500,
    fadeOutMs: 1000,
  });
  expect(result.tracks.map((track) => track.audioVolume)).toEqual([1.8, 0.4]);
});

it('retains explicit masters on empty lanes without publishing unused resources', () => {
  const input = fixture();
  input.audio.voiceover = [];
  const result = planReviewProjectAudio(input);
  expect(result).toEqual({
    status: 'prepared',
    sourceVoiceoverDocuments: [],
    assets: [],
    clips: [],
    tracks: [
      { ...input.resources.tracks.voiceover, audioVolume: 1.8 },
      { ...input.resources.tracks.music, audioVolume: 0.4 },
    ],
  });
  delete input.audio.laneVolumes;
  expect(
    planReviewProjectAudio({
      application: input.application,
      operationId: input.operationId,
      mainDuration: input.mainDuration,
      audio: input.audio,
    })
  ).toEqual({
    status: 'prepared',
    sourceVoiceoverDocuments: [],
    assets: [],
    tracks: [],
    clips: [],
  });
});

it.each([
  'missing',
  'duplicate-review-id',
  'duplicate-native-id',
  'wrong-type',
  'unknown-duration',
  'silent-resource',
  'source-overrun',
] as const)('refuses %s without a partial plan or input changes', (failure) => {
  const input = fixture();
  const resource = input.resources.assets[0]!;
  if (failure === 'missing') input.resources.assets = [];
  if (failure === 'duplicate-review-id') input.resources.assets.push(structuredClone(resource));
  if (failure === 'duplicate-native-id')
    input.resources.assets.push({ ...structuredClone(resource), reviewAssetId: 'another' });
  if (failure === 'wrong-type') resource.asset.type = 'VIDEO';
  if (failure === 'unknown-duration') resource.asset.metadata.duration = null;
  if (failure === 'silent-resource') resource.asset.metadata.hasAudio = false;
  if (failure === 'source-overrun') input.audio.voiceover[0]!.sourceOffset = 11;
  const before = structuredClone(input);
  const result = planReviewProjectAudio(input);
  expect(result.status).toBe('blocked');
  expect(result).not.toHaveProperty('clips');
  expect(result).not.toHaveProperty('assets');
  expect(input).toEqual(before);
});

it.each(['locked', 'hidden', 'wrong-kind', 'same-id', 'non-neutral-master'] as const)(
  'refuses %s track templates',
  (failure) => {
    const input = fixture();
    const voice = input.resources.tracks.voiceover;
    if (failure === 'locked') voice.locked = true;
    if (failure === 'hidden') voice.visible = false;
    if (failure === 'wrong-kind') voice.kind = 'PRIMARY';
    if (failure === 'same-id') input.resources.tracks.music.id = voice.id;
    if (failure === 'non-neutral-master') voice.audioVolume = 0.5;
    expect(planReviewProjectAudio(input).status).toBe('blocked');
  }
);

it.each(['dormant', 'sourceAnchor'] as const)(
  'keeps unmapped %s metadata blocked without a source binding',
  (field) => {
    const input = fixture();
    const clip = input.audio.voiceover[0]!;
    if (field === 'dormant') clip.dormant = true;
    else {
      clip.sourceAnchor = [{ start: 1, end: 5, offset: 0, duration: 4 }];
      input.audio.voiceoverSegments = [
        { kind: 'keep', sourceStart: 0, sourceEnd: 20, resultStart: 0, resultEnd: 20, rate: 1 },
      ];
    }
    expect(planReviewProjectAudio(input)).toEqual({
      status: 'blocked',
      issues: [
        { kind: 'audio-resources', lane: 'voiceover', clipId: 'take', field: 'source-binding' },
      ],
    });
  }
);

it('preserves a historical result snapshot without requiring current text', async () => {
  const input = fixture();
  const snapshot = {
    kind: 'microphone' as const,
    textId: 'removed-text',
    revision: 2,
    timingRevision: 3,
    text: 'Historical words',
    start: 1,
    end: 2,
    timeDomain: 'result' as const,
  };
  input.audio.voiceover[0]!.textSnapshot = snapshot;
  const voiceSnapshots = await prepareReviewProjectVoiceSnapshots(input.operationId, input.audio);
  const args = {
    ...input,
    textDocumentIds: { source: 'source-text', result: 'result-text' },
    resources: { ...input.resources, voiceSnapshots },
  };
  const result = planReviewProjectAudio(args);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.clips[0]!.textSnapshot).toEqual({
    version: 1,
    documentId: 'result-text',
    binding: { kind: 'project' },
    basisHash: voiceSnapshots[0]!.basisHash,
    text: snapshot,
  });
  expect(result.sourceVoiceoverDocuments).toEqual([]);
  expect(await prepareReviewProjectVoiceSnapshots(input.operationId, input.audio)).toEqual(
    voiceSnapshots
  );
  input.audio.voiceover[0]!.textSnapshot!.text = 'Different snapshot';
  expect(await prepareReviewProjectVoiceSnapshots(input.operationId, input.audio)).not.toEqual(
    voiceSnapshots
  );
  expect(result.clips[0]!.textSnapshot!.text.text).toBe('Historical words');
  for (const supplied of [
    undefined,
    [],
    [{ ...voiceSnapshots[0]!, basisHash: 'invalid' }],
    [voiceSnapshots[0]!, voiceSnapshots[0]!],
  ]) {
    expect(
      planReviewProjectAudio({
        ...args,
        resources: {
          ...input.resources,
          ...(supplied === undefined ? {} : { voiceSnapshots: supplied }),
        },
      }).status
    ).toBe('blocked');
  }
});

it('retains an authored tail and refuses missing resources', () => {
  const input = fixture();
  input.audio.voiceover[0]!.timelineStart = 19;
  const before = structuredClone(input);
  const retained = planReviewProjectAudio(input);
  expect(retained.status).toBe('prepared');
  if (retained.status === 'prepared')
    expect(retained.clips[0]).toMatchObject({
      durationMode: 'project',
      sourceDuration: input.audio.voiceover[0]!.duration,
      startTime: input.audio.voiceover[0]!.timelineStart,
    });
  expect(input).toEqual(before);
  expect(
    planReviewProjectAudio({
      application: input.application,
      operationId: input.operationId,
      mainDuration: input.mainDuration,
      audio: input.audio,
    })
  ).toEqual({
    status: 'blocked',
    issues: [{ kind: 'audio-resources' }],
  });
});

it('validates raw scalar boundaries through the existing Gallery audio codec', () => {
  const input = fixture();
  input.audio.voiceover[0]!.volume = NaN;
  expect(planReviewProjectAudio(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'audio-input' }],
  });
});

it('retains boundary arithmetic without rounding samples while refusing a material overrun', () => {
  const input = fixture();
  input.mainDuration = 0.3;
  input.resources.assets[0]!.asset.metadata.duration = 0.3;
  const clip = input.audio.voiceover[0]!;
  clip.timelineStart = 0.1;
  clip.sourceOffset = 0.1;
  clip.duration = 0.2;
  clip.fadeIn = 0;
  clip.fadeOut = 0;
  const result = planReviewProjectAudio(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.clips[0]).toMatchObject({
    startTime: 0.1,
    sourceStart: 0.1,
    duration: 0.2,
    sourceDuration: 0.2,
  });
  expect(result.clips[0]!.sourceStart + result.clips[0]!.sourceDuration).toBe(0.1 + 0.2);
  clip.sourceOffset += 0.000001;
  expect(planReviewProjectAudio(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'audio-asset', lane: 'voiceover', clipId: 'take', field: 'source-end' }],
  });
  clip.sourceOffset = 0.1;
  clip.timelineStart += 0.000001;
  const retained = planReviewProjectAudio(input);
  expect(retained.status).toBe('prepared');
  if (retained.status === 'prepared')
    expect(retained.clips[0]).toMatchObject({
      durationMode: 'project',
      sourceDuration: input.audio.voiceover[0]!.duration,
      startTime: input.audio.voiceover[0]!.timelineStart,
    });
});

it('maps a live take binding to the exact Native original instance', () => {
  const input = {
    ...fixture(),
    originalAudioTarget: { assetId: 'original-asset', sourceInstanceId: 'original-instance' },
  };
  input.audio.voiceoverSegments = buildReviewTimeMap(20, []);
  input.audio.original.mutes = [{ id: 'linked-mute', kind: 'take', clipId: 'take' }];
  const before = structuredClone(input);
  const result = planReviewProjectAudio(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.clips[0]).toMatchObject({
    originalAudioMute: { volume: 0, targets: [input.originalAudioTarget] },
    sourceDuration: 4,
    sourceStart: 2,
  });
  expect(result.clips[0]!.originalAudioMute!.targets[0]).not.toBe(input.originalAudioTarget);
  expect(input).toEqual(before);
  expect(planReviewProjectAudio(input)).toEqual(result);
});

it('refuses missing or invalid original audio targets without partial output', () => {
  const input = fixture();
  input.audio.voiceoverSegments = buildReviewTimeMap(20, []);
  input.audio.original.mutes = [{ id: 'linked-mute', kind: 'take', clipId: 'take' }];
  const before = structuredClone(input);
  expect(planReviewProjectAudio(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'audio-resources', field: 'original-target' }],
  });
  for (const target of [
    { assetId: '', sourceInstanceId: 'original' },
    { assetId: ' source', sourceInstanceId: 'original' },
    { assetId: 'source', sourceInstanceId: '' },
    { assetId: 'source', sourceInstanceId: 'x'.repeat(257) },
    { assetId: 'source', sourceInstanceId: 'original', extra: true },
    { assetId: 'native-audio', sourceInstanceId: 'conversion-1:voiceover:0' },
  ]) {
    expect(planReviewProjectAudio({ ...input, originalAudioTarget: target })).toEqual({
      status: 'blocked',
      issues: [{ kind: 'audio-input', lane: 'voiceover', clipId: 'take' }],
    });
  }
  expect(input).toEqual(before);
  const accepted = {
    ...input,
    originalAudioTarget: { assetId: 'source', sourceInstanceId: 'original' },
  };
  expect(planReviewProjectAudio(accepted).status).toBe('prepared');
  input.audio.original.mutes[0] = { id: 'linked-mute', kind: 'take', clipId: 'missing' };
  expect(planReviewProjectAudio(accepted)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'audio-input' }],
  });
  expect(input.audio.original.mutes[0].clipId).toBe('missing');
});

function wholeFixture() {
  const input = fixture();
  input.audio.voiceoverSegments = buildReviewTimeMap(20, [
    {
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
      rate: 2,
      audio: 'speed',
    },
    { id: 'cut', kind: 'cut', start: 5, end: 7, requestedStart: 5, requestedEnd: 7 },
  ]);
  const take = input.audio.voiceover[0]!;
  take.tempo = 0.5;
  take.muted = true;
  take.sourceAnchor = [
    { start: 1, end: 2, offset: 0, duration: 1 },
    { start: 4, end: 7, offset: 1, duration: 3 },
  ];
  take.textSnapshot = {
    kind: 'microphone',
    textId: 'retained-fragment',
    revision: 2,
    timingRevision: 3,
    text: 'Accepted historical script',
    start: 1,
    end: 7,
    timeDomain: 'source',
  };
  const profile = {
    modelId: 'retained-model',
    voiceId: 'retained-voice',
    responseFormat: 'wav' as const,
  };
  take.transcript = {
    version: 1,
    phrases: [
      {
        id: 'phrase',
        start: 1,
        end: 2,
        text: 'Edited',
        originalText: 'Original',
        revision: 1,
        alignment: 'word',
        words: [{ text: 'Original', start: 1, end: 2 }],
      },
    ],
    replacements: [
      {
        id: 'historical-replacement',
        phraseId: 'removed-phrase',
        revision: 4,
        start: 1,
        end: 2,
        duration: 0.75,
        assetId: 'project-asset:gallery-replacement',
        text: 'History',
        profile,
        textSignature: reviewSpeechTextSignature('History', profile),
      },
    ],
  };
  const replacement = structuredClone(input.resources.assets[0]!);
  replacement.reviewAssetId = 'project-asset:gallery-replacement';
  replacement.asset.id = 'project-asset:native-replacement';
  replacement.asset.metadata.duration = 1;
  input.resources.assets.push(replacement);
  return {
    ...input,
    source: {
      binding: {
        kind: 'source' as const,
        assetId: 'source-asset',
        sourceInstanceId: 'source-video',
      },
      reference: buildReviewTimeMap(20, []),
    },
    originalAudioTarget: { assetId: 'source-asset', sourceInstanceId: 'source-original-audio' },
  };
}

it('retains a complete source take and capture clock rather than saving audible slices', () => {
  const input = wholeFixture();
  input.audio.original.mutes = [{ id: 'live-mute', kind: 'take', clipId: 'take' }];
  const before = structuredClone(input);
  const result = planReviewProjectAudio(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.clips).toEqual([]);
  expect(result.sourceVoiceoverDocuments).toHaveLength(1);
  const document = result.sourceVoiceoverDocuments[0]!;
  expect(document).toEqual({
    id: 'conversion-1:source-voiceover:0',
    binding: input.source.binding,
    trackId: input.resources.tracks.voiceover.id,
    enabled: true,
    originalAudioMuteVolume: 0,
    originalAudioSourceInstanceId: 'source-original-audio',
    reference: input.audio.voiceoverSegments,
    take: {
      ...input.audio.voiceover[0]!,
      id: 'conversion-1:take:0',
      assetId: 'native-audio',
      transcript: {
        ...input.audio.voiceover[0]!.transcript,
        replacements: input.audio.voiceover[0]!.transcript!.replacements.map((replacement) => ({
          ...replacement,
          assetId: 'project-asset:native-replacement',
        })),
      },
    },
  });
  expect(document.reference).not.toBe(input.audio.voiceoverSegments);
  expect(document.reference).not.toEqual(input.source.reference);
  expect(document.take.textSnapshot!.textId).toBe('retained-fragment');
  expect(result.assets.map((asset) => asset.id).sort()).toEqual([
    'native-audio',
    'project-asset:native-replacement',
  ]);
  expect(
    parseVideoProjectSourceVoiceoverDocuments(
      JSON.parse(JSON.stringify(result.sourceVoiceoverDocuments))
    )
  ).toEqual(result.sourceVoiceoverDocuments);
  expect(planReviewProjectAudio(input)).toEqual(result);
  document.take.sourceAnchor![0]!.duration = 100;
  document.take.transcript!.replacements[0]!.text = 'Changed';
  result.assets[0]!.name = 'Changed';
  expect(input).toEqual(before);
});

it('keeps dormant anchorless takes with their raw metadata and fallback review reference', () => {
  const input = wholeFixture();
  const take = input.audio.voiceover[0]!;
  take.dormant = true;
  delete take.sourceAnchor;
  delete input.audio.voiceoverSegments;
  const before = structuredClone(input);
  const result = planReviewProjectAudio(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.clips).toEqual([]);
  expect(result.sourceVoiceoverDocuments[0]).toMatchObject({
    enabled: true,
    reference: input.source.reference,
    take: {
      dormant: true,
      sourceOffset: 2,
      duration: 4,
      tempo: 0.5,
      muted: true,
      textSnapshot: take.textSnapshot,
    },
  });
  expect(result.sourceVoiceoverDocuments[0]!.take).not.toHaveProperty('sourceAnchor');
  expect(result.assets).toHaveLength(2);
  expect(input).toEqual(before);
});

it('retains hidden source and result audio under the explicit lane application snapshot', () => {
  const input = wholeFixture();
  input.application.voiceoverApplied = false;
  input.application.musicApplied = false;
  input.audio.music = [{ ...fixture().audio.voiceover[0]!, id: 'music' }];
  const before = structuredClone(input);
  const result = planReviewProjectAudio(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.tracks.map((track) => [track.visible, track.audioVolume])).toEqual([
    [false, 1.8],
    [false, 0.4],
  ]);
  expect(result.sourceVoiceoverDocuments[0]).toMatchObject({
    enabled: true,
    take: { muted: true, tempo: 0.5 },
  });
  expect(result.clips).toHaveLength(1);
  expect(result.clips[0]!.trackId).toBe(input.resources.tracks.music.id);
  expect(result.assets).toHaveLength(2);
  expect(input).toEqual(before);
});

it.each(['missing', 'prefix', 'end'] as const)(
  'refuses replacement %s atomically and retries after resource repair',
  (failure) => {
    const input = wholeFixture();
    const accepted = structuredClone(input);
    const replacement = input.resources.assets[1]!;
    if (failure === 'missing') input.resources.assets.pop();
    if (failure === 'prefix') replacement.asset.id = 'unprefixed-native-id';
    if (failure === 'end') replacement.asset.metadata.duration = 0.5;
    const before = structuredClone(input);
    const result = planReviewProjectAudio(input);
    expect(result).toEqual({
      status: 'blocked',
      issues: [
        {
          kind:
            failure === 'missing'
              ? 'audio-resources'
              : failure === 'prefix'
                ? 'audio-input'
                : 'audio-asset',
          lane: 'voiceover',
          clipId: 'take',
          ...(failure === 'missing'
            ? { field: 'project-asset:gallery-replacement' }
            : failure === 'end'
              ? { field: 'replacement-end' }
              : {}),
        },
      ],
    });
    expect(result).not.toHaveProperty('sourceVoiceoverDocuments');
    expect(result).not.toHaveProperty('assets');
    expect(input).toEqual(before);
    input.resources.assets = structuredClone(accepted.resources.assets);
    const retry = planReviewProjectAudio(input);
    expect(retry.status).toBe('prepared');
    expect(planReviewProjectAudio(input)).toEqual(retry);
    expect(input).toEqual(accepted);
  }
);

it.each([undefined, null, true, 1, 'advanced', {}])(
  'refuses malformed application %s without publishing audio',
  (application) => {
    const input = wholeFixture();
    Reflect.set(input, 'application', application);
    const before = structuredClone(input);
    expect(planReviewProjectAudio(input)).toEqual({
      status: 'blocked',
      issues: [{ kind: 'audio-input' }],
    });
    expect(input).toEqual(before);
  }
);

it.each(['originalAudioApplied', 'voiceoverApplied', 'musicApplied'] as const)(
  'requires a boolean %s application field',
  (field) => {
    const input = wholeFixture();
    Reflect.set(input.application, field, 'yes');
    expect(planReviewProjectAudio(input)).toEqual({
      status: 'blocked',
      issues: [{ kind: 'audio-input' }],
    });
  }
);

it('refuses invalid source binding and capture references without retaining a partial take', () => {
  for (const failure of ['binding', 'reference'] as const) {
    const input = wholeFixture();
    if (failure === 'binding') input.source.binding.sourceInstanceId = '';
    else input.audio.voiceoverSegments![0]!.sourceStart = 1;
    const before = structuredClone(input);
    expect(planReviewProjectAudio(input).status).toBe('blocked');
    expect(input).toEqual(before);
  }
});

function originalSpeechFixture() {
  const input = fixture();
  input.audio.voiceover = [];
  delete input.audio.laneVolumes;
  const profile = { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' as const };
  input.audio.originalSpeech = {
    enabled: true,
    transcript: {
      version: 1,
      profile,
      transcriptionModelId: 'stt',
      phrases: [],
      replacements: [
        {
          id: 'retained-alpha',
          phraseId: 'old-phrase',
          revision: 2,
          start: 1,
          end: 3,
          duration: 1,
          text: 'Retained',
          profile,
          textSignature: reviewSpeechTextSignature('Retained', profile),
          enabled: false,
          originalVolume: 0.25,
          assetId: 'project-asset:gallery-audio',
        },
      ],
    },
  };
  input.resources.assets[0]!.asset.id = 'project-asset:native-original';
  return input;
}

it('retains original speech resources without audio lanes and retries refused remaps', () => {
  const input = originalSpeechFixture();
  const before = structuredClone(input);
  const result = planReviewProjectAudio(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.clips).toEqual([]);
  expect(result.tracks).toEqual([]);
  expect(result.sourceVoiceoverDocuments).toEqual([]);
  expect(result.assets.map((asset) => asset.id)).toEqual(['project-asset:native-original']);
  expect(result.originalSpeech).toEqual({
    ...input.audio.originalSpeech,
    transcript: {
      ...input.audio.originalSpeech!.transcript,
      replacements: [
        {
          ...input.audio.originalSpeech!.transcript.replacements[0]!,
          assetId: 'project-asset:native-original',
        },
      ],
    },
  });
  expect(input).toEqual(before);
  for (const failure of ['missing', 'prefix', 'duration'] as const) {
    const refused = structuredClone(input);
    if (failure === 'missing') refused.resources.assets = [];
    if (failure === 'prefix') refused.resources.assets[0]!.asset.id = 'unprefixed';
    if (failure === 'duration') refused.resources.assets[0]!.asset.metadata.duration = 0.5;
    const unchanged = structuredClone(refused);
    const blocked = planReviewProjectAudio(refused);
    expect(blocked.status).toBe('blocked');
    expect(blocked).not.toHaveProperty('assets');
    expect(refused).toEqual(unchanged);
    refused.resources = structuredClone(input.resources);
    expect(planReviewProjectAudio(refused)).toEqual(result);
  }
  result.originalSpeech!.transcript.replacements[0]!.text = 'Changed';
  expect(input).toEqual(before);
});

it('keeps empty passive original recognition without requiring audio resources', () => {
  const input = originalSpeechFixture();
  input.audio.originalSpeech!.enabled = false;
  input.audio.originalSpeech!.transcript.replacements = [];
  const result = planReviewProjectAudio({
    operationId: input.operationId,
    mainDuration: input.mainDuration,
    audio: input.audio,
    application: input.application,
  });
  expect(result).toEqual({
    status: 'prepared',
    assets: [],
    tracks: [],
    clips: [],
    sourceVoiceoverDocuments: [],
    originalSpeech: input.audio.originalSpeech,
  });
});
