import { prepareReviewProjectVoiceSnapshots } from './project-audio';
import { editReviewTextFragment } from './text-document';
import { applyVideoProjectTextEdit } from '../project/text/authoring';
import { getProjectAssetUseCounts } from '../project/media-usage';
import { anchorReviewVoiceoverAtSource, projectReviewVoiceover } from './voiceover-edits';
import { buildQuickEditAudioPlan } from './advanced/audio-plan';
import {
  resolveQuickEditEffectiveFeatures,
  resolveQuickEditEffectiveState,
} from './advanced/effective';
import { createQuickEditAdvancedState } from './advanced/defaults';
import { planProjectSourceVoiceoverPlayback } from '../project/source-voiceover-playback';
import { getProjectOriginalAudioRanges } from '../project/timeline/original-audio';
import { reviewSpeechTextSignature } from './speech-transcript';
import { expect, it } from 'vitest';
import { isExportReadyVideoProject } from '../project/validation/root';
import { buildReviewTimeMap } from './timeline';
import { parseHydratableVideoProject } from '../project/validation/root';
import { planReviewProjectConversion } from './project-conversion';

import { fixture, externalAudioFixture } from './project-conversion.test-support';

function wholeAudioFixture(tempo = 1) {
  const input = externalAudioFixture();
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 0,
    end: 2,
    requestedStart: 0,
    requestedEnd: 2,
    rate: 2,
    audio: 'speed',
  });
  const audio = input.document.advancedContent.audio;
  audio.voiceoverSegments = buildReviewTimeMap(input.source.duration, input.document.edits);
  audio.voiceover[0] = anchorReviewVoiceoverAtSource(
    { ...audio.voiceover[0]!, duration: 2, tempo, timelineStart: 0 },
    audio.voiceoverSegments
  );
  audio.original.mutes = [{ id: 'mute-take', kind: 'take', clipId: audio.voiceover[0]!.id }];
  const replacement = {
    ...structuredClone(input.externalAudio.assets[0]!),
    reviewAssetId: 'project-asset:replacement',
    asset: {
      ...structuredClone(input.externalAudio.assets[0]!.asset),
      id: 'project-asset:native-replacement',
    },
  };
  input.externalAudio.assets.push(replacement);
  const profile = { modelId: 'speech', voiceId: 'voice', responseFormat: 'wav' as const };
  audio.voiceover[0]!.transcript = {
    version: 1,
    phrases: [],
    replacements: [
      {
        id: 'retained-replacement',
        start: 0,
        end: 1,
        duration: 0.5,
        assetId: replacement.reviewAssetId,
        phraseId: 'deleted-phrase',
        revision: 1,
        text: 'Retained',
        textSignature: reviewSpeechTextSignature('Retained', profile),
        profile,
      },
    ],
  };
  audio.voiceover[0]!.textSnapshot = {
    kind: 'microphone',
    textId: 'text',
    revision: 0,
    timingRevision: 0,
    text: 'Accepted script',
    start: 0,
    end: 2,
    timeDomain: 'source',
  };
  return input;
}

it.each([0.25, 1, 4])(
  'converts complete source takes at tempo %s with matching Gallery playback and paired ducking',
  (tempo) => {
    const input = wholeAudioFixture(tempo);
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const project = result.project;
    const document = project.sourceVoiceoverDocuments![0]!;
    const raw = input.document.advancedContent.audio.voiceover[0]!;
    expect(project.version).toBe(37);
    expect(isExportReadyVideoProject(project)).toBe(true);
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(document.binding).toEqual({
      kind: 'source',
      assetId: input.seed.assets[0]!.id,
      sourceInstanceId: result.timeline.sourceInstanceId,
    });
    expect(document.originalAudioSourceInstanceId).toBe(result.timeline.audioSourceInstanceId);
    expect(document.originalAudioMuteVolume).toBe(0);
    expect(document.reference).toEqual(input.document.advancedContent.audio.voiceoverSegments);
    expect(document.reference).not.toBe(input.document.advancedContent.audio.voiceoverSegments);
    expect({
      ...document.take,
      id: raw.id,
      assetId: raw.assetId,
      transcript: raw.transcript,
    }).toEqual(raw);
    expect(document.take.transcript!.replacements[0]!.assetId).toBe(
      'project-asset:native-replacement'
    );
    expect(document.take.assetId).toBe(input.externalAudio.assets[0]!.asset.id);
    expect(document.take.textSnapshot!.textId).toBe('text');
    expect(project.assets.some((asset) => asset.id === 'project-asset:native-replacement')).toBe(
      true
    );
    expect(project.clips.filter((clip) => clip.trackId === document.trackId)).toEqual([]);
    const actual = planProjectSourceVoiceoverPlayback(project).map(
      ({ entry: { clipId: _clipId, ...entry } }) => entry
    );
    const expected = buildQuickEditAudioPlan({
      voiceover: projectReviewVoiceover([raw], document.reference).map((take) => ({
        ...take,
        volume: take.volume * 2,
        assetId: input.externalAudio.assets[0]!.asset.id,
      })),
      music: [],
    }).map(({ clipId: _clipId, ...entry }) => entry);
    expect(actual).toEqual(expected);
    const ranges = result.timeline.audioClips.flatMap((clip) =>
      getProjectOriginalAudioRanges(project, clip)
    );
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) {
      expect(range.volume).toBe(0);
      expect(
        expected.some(
          (entry) =>
            range.start >= entry.timelineStart && range.end <= entry.timelineStart + entry.duration
        )
      ).toBe(true);
    }
    expect(
      result.timeline.videoClips.flatMap((clip) => getProjectOriginalAudioRanges(project, clip))
    ).toEqual([]);
    const original = result.timeline.audioClips[0]!;
    expect(
      getProjectOriginalAudioRanges(project, { ...original, sourceInstanceId: 'other-insertion' })
    ).toEqual([]);
    expect(planReviewProjectConversion(input)).toEqual(result);
    expect(input).toEqual(before);
  }
);

it.each(['basic', 'voice-off', 'music-off', 'original-off'] as const)(
  'retains raw content and applies existing Gallery audio policy for %s',
  (mode) => {
    const input = wholeAudioFixture();
    const state = { ...createQuickEditAdvancedState(), ...input.document.advancedContent };
    state.ui.mode = mode === 'basic' ? 'basic' : 'advanced';
    state.ui.tracks.audio = true;
    state.ui.tracks.voiceover = mode !== 'voice-off';
    state.ui.tracks.music = mode !== 'music-off';
    state.ui.tracks.originalAudio = mode !== 'original-off';
    input.ui = state.ui;
    const application = resolveQuickEditEffectiveFeatures(state);
    const effective = resolveQuickEditEffectiveState(state);
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(isExportReadyVideoProject(result.project)).toBe(true);
    expect(result.project.sourceVoiceoverDocuments).toHaveLength(1);
    const document = result.project.sourceVoiceoverDocuments![0]!;
    expect(document.enabled).toBe(true);
    expect(result.project.tracks.find((track) => track.id === document.trackId)!.visible).toBe(
      application.voiceoverApplied
    );
    expect(result.project.clips.some((clip) => clip.trackId === 'music-track')).toBe(true);
    expect(result.project.tracks.find((track) => track.id === 'music-track')!.visible).toBe(
      application.musicApplied
    );
    expect(planProjectSourceVoiceoverPlayback(result.project)).toHaveLength(
      effective.voiceover.length ? 1 : 0
    );
    if (!application.voiceoverApplied)
      expect(
        result.timeline.audioClips.flatMap((clip) =>
          getProjectOriginalAudioRanges(result.project, clip)
        )
      ).toEqual([]);
    const originals = result.project.clips.filter(
      (clip) => clip.type === 'AUDIO' && clip.assetId === input.seed.assets[0]!.id
    );
    expect(originals.every((clip) => clip.type === 'AUDIO' && !clip.muted)).toBe(true);
    expect(
      originals.every(
        (clip) =>
          result.project.tracks.find((track) => track.id === clip.trackId)?.visible ===
          !effective.originalAudio.muted
      )
    ).toBe(true);
    expect(input).toEqual(before);
  }
);

it('keeps whole-take mute and zero master independent from live original suppression', () => {
  const input = wholeAudioFixture();
  input.document.advancedContent.audio.voiceover[0]!.muted = true;
  input.document.advancedContent.audio.laneVolumes!.voiceover = 0;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(
    planProjectSourceVoiceoverPlayback(result.project).every(({ entry }) => entry.volume === 0)
  ).toBe(true);
  expect(
    result.timeline.audioClips.flatMap((clip) =>
      getProjectOriginalAudioRanges(result.project, clip)
    ).length
  ).toBeGreaterThan(0);
});

it.each(['dormant', 'cut-hidden'] as const)(
  'retains %s content and all resources without creating audible views',
  (kind) => {
    const input = wholeAudioFixture();
    const audio = input.document.advancedContent.audio;
    const take = audio.voiceover[0]!;
    if (kind === 'dormant') {
      take.dormant = true;
      delete take.sourceAnchor;
      delete audio.voiceoverSegments;
      delete audio.original.mutes;
    } else {
      audio.voiceoverSegments = buildReviewTimeMap(input.source.duration, []);
      take.timelineStart = 3;
      take.duration = 1;
      take.sourceAnchor = [{ start: 3, end: 4, offset: 0, duration: 1 }];
    }
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.sourceVoiceoverDocuments).toHaveLength(1);
    expect(isExportReadyVideoProject(result.project)).toBe(true);
    expect(planProjectSourceVoiceoverPlayback(result.project)).toEqual([]);
    expect(
      result.project.assets.some((asset) => asset.id === 'project-asset:native-replacement')
    ).toBe(true);
    expect(input).toEqual(before);
  }
);

it('uses direct VIDEO original sound when the seed has no separate AUDIO placement', () => {
  const input = wholeAudioFixture();
  input.seed.clips = input.seed.clips.filter((clip) => clip.type !== 'AUDIO');
  const video = input.seed.clips.find((clip) => clip.type === 'VIDEO');
  if (!video || video.type !== 'VIDEO') throw new Error('Missing video');
  video.muted = false;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sourceVoiceoverDocuments![0]).not.toHaveProperty(
    'originalAudioSourceInstanceId'
  );
  expect(
    result.timeline.videoClips.flatMap((clip) =>
      getProjectOriginalAudioRanges(result.project, clip)
    ).length
  ).toBeGreaterThan(0);
});

it('rejects a seed that already owns unrelated whole source takes instead of inheriting them', () => {
  const input = wholeAudioFixture();
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  input.seed.version = 31;
  input.seed.sourceVoiceoverDocuments = result.project.sourceVoiceoverDocuments!;
  input.seed.tracks.push(...result.project.tracks.filter((track) => track.id === 'voice-track'));
  input.seed.assets.push(
    ...result.project.assets.filter((asset) =>
      input.externalAudio.assets.some((entry) => entry.asset.id === asset.id)
    )
  );
  const before = structuredClone(input);
  expect(planReviewProjectConversion(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'invalid-seed' }],
  });
  expect(input).toEqual(before);
});

it('refuses missing editor application settings instead of enabling authored features by default', () => {
  const input = wholeAudioFixture();
  Reflect.deleteProperty(input, 'ui');
  expect(planReviewProjectConversion(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'invalid-document', field: 'ui' }],
  });
});

it('retains the paired target before the first original-level inspector edit', async () => {
  const input = wholeAudioFixture();
  delete input.document.advancedContent.audio.original.mutes;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const document = result.project.sourceVoiceoverDocuments![0]!;
  expect(document).not.toHaveProperty('originalAudioMuteVolume');
  expect(document.originalAudioSourceInstanceId).toBe(result.timeline.audioSourceInstanceId);
  const { applyProjectSourceVoiceoverEdit } = await import('../project/source-voiceover');
  const edited = applyProjectSourceVoiceoverEdit(result.project, document, {
    originalAudioMuteVolume: 0.25,
  });
  if (!edited.ok) throw new Error('Expected original level edit');
  expect(
    result.timeline.audioClips.flatMap((clip) =>
      getProjectOriginalAudioRanges(edited.project, clip)
    )
  ).toEqual([
    { start: 0, end: 1, volume: 0.25 },
    { start: 1, end: 2, volume: 0.25 },
  ]);
});

it.each([false, true])(
  'retains original recognition and alpha replacements without creating sound or gain: enabled=%s',
  (enabled) => {
    const input = externalAudioFixture();
    const audio = input.document.advancedContent.audio;
    audio.voiceover = [];
    audio.music = [];
    delete audio.laneVolumes;
    audio.original.ranges = [{ id: 'manual', start: 0, end: 2, volume: 0.5 }];
    const baseline = planReviewProjectConversion(input);
    if (baseline.status !== 'prepared') throw new Error(JSON.stringify(baseline));
    const profile = { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' as const };
    input.externalAudio.assets[0]!.asset.id = 'project-asset:native-original';
    audio.originalSpeech = {
      enabled,
      transcript: {
        version: 1,
        profile,
        transcriptionModelId: 'stt',
        phrases: [
          {
            id: 'retained-phrase',
            start: 10,
            end: 12,
            originalText: 'Old',
            text: 'Edited',
            revision: 1,
            alignment: 'segment',
          },
        ],
        replacements: [
          {
            id: 'alpha',
            assetId: 'project-asset:gallery',
            start: 10,
            end: 12,
            duration: 1,
            phraseId: 'retained-phrase',
            revision: 0,
            text: 'Accepted',
            profile,
            textSignature: reviewSpeechTextSignature('Accepted', profile),
            enabled: true,
            originalVolume: 0,
          },
        ],
      },
    };
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.version).toBe(37);
    expect(isExportReadyVideoProject(result.project)).toBe(true);
    expect(result.project.sourceAudioDocuments).toHaveLength(1);
    const document = result.project.sourceAudioDocuments![0]!;
    expect(document.binding.sourceInstanceId).toBe(result.timeline.audioSourceInstanceId);
    expect(document.ranges).toEqual(audio.original.ranges);
    expect(document.mutes).toEqual([]);
    expect(document.speech!.enabled).toBe(enabled);
    expect(document.speech!.transcript.phrases).toEqual(audio.originalSpeech.transcript.phrases);
    expect(document.speech!.transcript.replacements[0]!.assetId).toBe(
      'project-asset:native-original'
    );
    expect(result.project.clips).toEqual(baseline.project.clips);
    expect(planProjectSourceVoiceoverPlayback(result.project)).toEqual([]);
    expect(
      result.timeline.audioClips.flatMap((clip) =>
        getProjectOriginalAudioRanges(result.project, clip)
      )
    ).toEqual([]);
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))).toEqual(
      result.project
    );
    expect(planReviewProjectConversion(input)).toEqual(result);
    expect(input).toEqual(before);
  }
);

it('retains original recognition with a VIDEO source fallback and no external bytes', () => {
  const input = fixture();
  input.seed.clips = input.seed.clips.filter((clip) => clip.type !== 'AUDIO');
  input.document.advancedContent.audio.originalSpeech = {
    enabled: false,
    transcript: { version: 1, phrases: [], replacements: [] },
  };
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sourceAudioDocuments![0]!.binding.sourceInstanceId).toBe(
    result.timeline.sourceInstanceId
  );
  expect(result.project.sourceAudioDocuments![0]!.speech).toEqual(
    input.document.advancedContent.audio.originalSpeech
  );
  expect(result.project.assets).toEqual(input.seed.assets);
  expect(result.project.sourceVoiceoverDocuments).toBeUndefined();
});

it('transfers detached result speech metadata without reviving replacements or depending on live text', async () => {
  const input = externalAudioFixture();
  const audio = input.document.advancedContent.audio;
  const take = audio.voiceover[0]!;
  const profile = { modelId: 'legacy-model', voiceId: 'voice', responseFormat: 'wav' as const };
  const replacement = structuredClone(input.externalAudio.assets[0]!);
  replacement.reviewAssetId = 'project-asset:retained-only';
  replacement.asset.id = 'project-asset:native-retained-only';
  replacement.asset.source = { kind: 'project-asset', projectAssetId: 'retained-only' };
  input.externalAudio.assets.push(replacement);
  take.transcript = {
    version: 1,
    phrases: [
      {
        id: 'legacy-phrase',
        start: 0.5,
        end: 1.5,
        originalText: 'Recorded',
        text: 'Retained legacy',
        revision: 2,
        alignment: 'manual',
      },
    ],
    replacements: [
      {
        id: 'legacy-replacement',
        start: 0.5,
        end: 1.5,
        duration: 0.25,
        assetId: replacement.reviewAssetId,
        phraseId: 'legacy-phrase',
        revision: 2,
        text: 'Retained legacy',
        textSignature: reviewSpeechTextSignature('Retained legacy', profile),
        profile,
      },
    ],
  };
  take.textSnapshot = {
    kind: 'microphone',
    textId: 'deleted-phrase',
    revision: 1,
    timingRevision: 2,
    text: 'Accepted historical words',
    start: 1,
    end: 3,
    timeDomain: 'result',
  };
  const text = input.document.advancedContent.text!;
  text.fragments[0] = { ...text.fragments[0]!, timeDomain: 'result', text: 'Current words' };
  const voiceSnapshots = await prepareReviewProjectVoiceSnapshots(input.seed.id, audio);
  const args = { ...input, externalAudio: { ...input.externalAudio, voiceSnapshots } };
  const before = structuredClone(args);
  const result = planReviewProjectConversion(args);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.version).toBe(44);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  expect(result.project.sourceVoiceoverDocuments).toBeUndefined();
  const converted = result.project.clips.find((clip) => clip.trackId === 'voice-track');
  if (converted?.type !== 'AUDIO') throw new Error('Missing result take');
  expect(converted).toMatchObject({
    startTime: 1,
    sourceStart: 0.5,
    sourceDuration: 1,
    duration: 4,
    playbackRate: 0.25,
    linkMode: 'DETACHED',
    transcript: { replacements: [{ assetId: 'project-asset:native-retained-only' }] },
    textSnapshot: { binding: { kind: 'project' }, text: take.textSnapshot },
  });
  expect(
    result.project.clips.some(
      (clip) => 'assetId' in clip && clip.assetId === 'project-asset:native-retained-only'
    )
  ).toBe(false);
  expect(getProjectAssetUseCounts(result.project).get('project-asset:native-retained-only')).toBe(
    1
  );
  const current = result.project.textDocuments!.find((entry) => entry.binding.kind === 'project')!;
  const change = editReviewTextFragment(current.document, 'text', { text: 'Changed later' });
  if (!change.ok) throw new Error('Text edit refused');
  const edited = applyVideoProjectTextEdit(result.project, current, { document: change.document });
  if (!edited.ok) throw new Error('Document edit refused');
  expect(edited.project.clips.find((clip) => clip.id === converted.id)).toEqual(converted);
  const removed = { ...edited.project, textDocuments: [] };
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(removed)));
  expect(reopened?.clips.find((clip) => clip.id === converted.id)).toEqual(converted);
  expect(isExportReadyVideoProject(removed)).toBe(true);
  expect(args).toEqual(before);
});
