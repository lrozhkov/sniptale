import { parseReviewOriginalSpeech, type ReviewOriginalSpeech } from './original-speech';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseVideoProjectTextBinding } from '../project/text/validation';
import {
  parseVideoProjectSourceVoiceoverDocuments,
  type VideoProjectSourceVoiceoverDocument,
} from '../project/source-voiceover';
import type { ReviewTimeSegment } from './time-segment';
import type { VideoProjectAsset, VideoProjectAudioClip } from '../project/types/model';
import type { VideoProjectTrack } from '../project/types/layout';
import { isVideoProjectAsset } from '../project/validation/assets';
import { isVideoProjectClip } from '../project/validation/clips';
import { isVideoProjectTrack } from '../project/validation/tracks';
import { MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../project/validation/primitives';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import type { QuickEditAudioClip, QuickEditAudioState } from './advanced/types';
import type { ReviewSpeechReplacement } from './speech-transcript';
import { loadQuickEditAdvancedContentState } from './advanced/validation';

type Lane = 'voiceover' | 'music';

/** The existing effective-features owner derives application before resource publication. */
interface ReviewProjectAudioApplication {
  originalAudioApplied: boolean;
  voiceoverApplied: boolean;
  musicApplied: boolean;
}

/** The workflow supplies admitted resource identities and neutral, localized track templates. */
export interface ReviewProjectAudioResources {
  assets: readonly { reviewAssetId: string; asset: VideoProjectAsset }[];
  tracks: Record<Lane, VideoProjectTrack>;
}

/** Refusals retain the complete source snapshot for the later publication workflow. */
export interface ReviewProjectAudioIssue {
  kind: 'audio-input' | 'audio-resources' | 'audio-track' | 'audio-asset' | 'audio-content';
  lane?: Lane;
  clipId?: string;
  field?: string;
}

/** Retains whole source takes and materializes result audio without acquiring or publishing bytes. */
export function planReviewProjectAudio(args: {
  operationId: string;
  audio: QuickEditAudioState;
  application: ReviewProjectAudioApplication;
  source?: {
    binding: VideoProjectSourceVoiceoverDocument['binding'];
    reference: readonly ReviewTimeSegment[];
  };
  mainDuration: number;
  originalAudioTarget?: NonNullable<VideoProjectAudioClip['originalAudioMute']>['targets'][number];
  resources?: ReviewProjectAudioResources;
}):
  | { status: 'blocked'; issues: ReviewProjectAudioIssue[] }
  | {
      status: 'prepared';
      assets: VideoProjectAsset[];
      tracks: VideoProjectTrack[];
      clips: VideoProjectAudioClip[];
      sourceVoiceoverDocuments: VideoProjectSourceVoiceoverDocument[];
      originalSpeech?: ReviewOriginalSpeech;
    } {
  const blocked = (...issues: ReviewProjectAudioIssue[]) => ({
    status: 'blocked' as const,
    issues,
  });
  const content = loadQuickEditAdvancedContentState({
    ...createQuickEditAdvancedContent(),
    audio: args.audio,
  });
  if (
    !content ||
    !isRecord(args.application) ||
    !['originalAudioApplied', 'voiceoverApplied', 'musicApplied'].every(
      (key) => typeof Reflect.get(args.application, key) === 'boolean'
    ) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(args.operationId) ||
    !Number.isFinite(args.mainDuration) ||
    args.mainDuration <= 0 ||
    args.mainDuration > MAX_VIDEO_PROJECT_DURATION_SECONDS
  )
    return blocked({ kind: 'audio-input' });
  const audio = content.audio;
  const mutedByTakes = new Set(
    (audio.original.mutes ?? []).flatMap((mute) => (mute.kind === 'take' ? [mute.clipId] : []))
  );
  if (mutedByTakes.size && !args.originalAudioTarget)
    return blocked({ kind: 'audio-resources', field: 'original-target' });
  const lanes = (['voiceover', 'music'] as const).filter(
    (lane) => audio[lane].length || audio.laneVolumes !== undefined
  );
  const originalSpeech =
    audio.originalSpeech === undefined ? undefined : structuredClone(audio.originalSpeech);
  if (!lanes.length && !originalSpeech?.transcript.replacements.length)
    return {
      ...(originalSpeech === undefined ? {} : { originalSpeech }),
      status: 'prepared',
      assets: [],
      tracks: [],
      clips: [],
      sourceVoiceoverDocuments: [],
    };
  const resources = args.resources;
  if (!resources) return blocked({ kind: 'audio-resources' });
  const assetsByReviewId = new Map<string, VideoProjectAsset>();
  const assetIds = new Set<string>();
  for (const binding of resources.assets) {
    const asset = binding.asset;
    if (
      !binding.reviewAssetId ||
      binding.reviewAssetId.trim() !== binding.reviewAssetId ||
      binding.reviewAssetId.length > 256 ||
      assetsByReviewId.has(binding.reviewAssetId) ||
      !isVideoProjectAsset(asset) ||
      asset.type !== 'AUDIO' ||
      !asset.metadata.hasAudio ||
      !asset.metadata.mimeType.startsWith('audio/') ||
      asset.metadata.duration === null ||
      asset.metadata.duration <= 0 ||
      assetIds.has(asset.id)
    )
      return blocked({ kind: 'audio-asset', field: binding.reviewAssetId });
    assetsByReviewId.set(binding.reviewAssetId, asset);
    assetIds.add(asset.id);
  }
  const tracks: VideoProjectTrack[] = [];
  const clips: VideoProjectAudioClip[] = [];
  const sourceVoiceoverDocuments: VideoProjectSourceVoiceoverDocument[] = [];
  const usedAssets = new Map<string, VideoProjectAsset>();
  const speechIssue = rebindReplacementAssets({
    replacements: originalSpeech?.transcript.replacements ?? [],
    assetsByReviewId,
    usedAssets,
    endField: 'original-speech-end',
  });
  if (speechIssue) return blocked(speechIssue);
  if (originalSpeech && !parseReviewOriginalSpeech(originalSpeech))
    return blocked({ kind: 'audio-input', field: 'original-speech' });
  for (const lane of lanes) {
    const track = resources.tracks[lane];
    if (
      !isVideoProjectTrack(track) ||
      track.kind !== 'AUDIO' ||
      !track.visible ||
      track.locked ||
      track.isRoot ||
      (track.audioVolume !== undefined && track.audioVolume !== 1) ||
      tracks.some((entry) => entry.id === track.id)
    )
      return blocked({ kind: 'audio-track', lane });
    tracks.push({
      ...structuredClone(track),
      audioVolume: audio.laneVolumes?.[lane] ?? 1,
      visible:
        lane === 'voiceover' ? args.application.voiceoverApplied : args.application.musicApplied,
    });
    for (const [index, clip] of audio[lane].entries()) {
      const whole = lane === 'voiceover' && (!!clip.sourceAnchor?.length || clip.dormant === true);
      const field = whole
        ? undefined
        : ((['sourceAnchor', 'transcript', 'textSnapshot'] as const).find(
            (key) => clip[key] !== undefined
          ) ?? (clip.dormant ? 'dormant' : undefined));
      if (field) return blocked({ kind: 'audio-content', lane, clipId: clip.id, field });
      const asset = assetsByReviewId.get(clip.assetId);
      if (!asset)
        return blocked({ kind: 'audio-resources', lane, clipId: clip.id, field: clip.assetId });
      // This tolerance matches retained source-boundary arithmetic, not an audio-sample trim.
      if (clip.sourceOffset + clip.duration > asset.metadata.duration! + 1e-7)
        return blocked({ kind: 'audio-asset', lane, clipId: clip.id, field: 'source-end' });
      if (whole) {
        const result = convertSourceTake({
          input: args,
          audio,
          clip,
          lane,
          index,
          asset,
          track,
          suppress: mutedByTakes.has(clip.id),
          assetsByReviewId,
          usedAssets,
        });
        if ('issue' in result) return blocked(result.issue);
        sourceVoiceoverDocuments.push(result.document);
        usedAssets.set(asset.id, asset);
        continue;
      }
      const converted = convertResultClip({
        input: args,
        clip,
        lane,
        index,
        asset,
        track,
        suppress: mutedByTakes.has(clip.id),
      });
      if (!converted) return blocked({ kind: 'audio-input', lane, clipId: clip.id });
      clips.push(converted);
      usedAssets.set(asset.id, asset);
    }
  }
  if (!parseVideoProjectSourceVoiceoverDocuments(sourceVoiceoverDocuments))
    return blocked({ kind: 'audio-input' });
  return {
    status: 'prepared',
    assets: structuredClone([...usedAssets.values()]),
    tracks,
    clips,
    sourceVoiceoverDocuments,
    ...(originalSpeech === undefined ? {} : { originalSpeech }),
  };
}

function rebindReplacementAssets(args: {
  replacements: readonly ReviewSpeechReplacement[];
  assetsByReviewId: ReadonlyMap<string, VideoProjectAsset>;
  usedAssets: Map<string, VideoProjectAsset>;
  endField: 'original-speech-end' | 'replacement-end';
  context?: Pick<ReviewProjectAudioIssue, 'lane' | 'clipId'>;
}): ReviewProjectAudioIssue | undefined {
  for (const replacement of args.replacements) {
    const asset = args.assetsByReviewId.get(replacement.assetId);
    if (!asset) return { kind: 'audio-resources', ...args.context, field: replacement.assetId };
    if (replacement.duration > asset.metadata.duration! + 1e-7)
      return { kind: 'audio-asset', ...args.context, field: args.endField };
    replacement.assetId = asset.id;
    args.usedAssets.set(asset.id, asset);
  }
  return undefined;
}

function convertSourceTake(args: {
  input: Pick<
    Parameters<typeof planReviewProjectAudio>[0],
    'source' | 'operationId' | 'originalAudioTarget'
  >;
  audio: Pick<QuickEditAudioState, 'voiceoverSegments'>;
  clip: QuickEditAudioClip;
  lane: Lane;
  index: number;
  asset: VideoProjectAsset;
  track: VideoProjectTrack;
  suppress: boolean;
  assetsByReviewId: ReadonlyMap<string, VideoProjectAsset>;
  usedAssets: Map<string, VideoProjectAsset>;
}): { document: VideoProjectSourceVoiceoverDocument } | { issue: ReviewProjectAudioIssue } {
  const { clip, lane, index, asset, track } = args;
  const source = args.input.source;
  const binding = source ? parseVideoProjectTextBinding(source.binding) : null;
  if (!source || !binding || binding.kind !== 'source')
    return {
      issue: {
        kind: 'audio-resources',
        lane,
        clipId: clip.id,
        field: 'source-binding',
      },
    };
  const take = structuredClone(clip);
  take.id = `${args.input.operationId}:take:${index}`;
  take.assetId = asset.id;
  const replacementIssue = rebindReplacementAssets({
    replacements: take.transcript?.replacements ?? [],
    assetsByReviewId: args.assetsByReviewId,
    usedAssets: args.usedAssets,
    endField: 'replacement-end',
    context: { lane, clipId: clip.id },
  });
  if (replacementIssue) return { issue: replacementIssue };
  const suppress = args.suppress;
  const target = args.input.originalAudioTarget
    ? parseVideoProjectTextBinding({ kind: 'source', ...args.input.originalAudioTarget })
    : null;
  if (
    (suppress || args.input.originalAudioTarget !== undefined) &&
    (!target || target.kind !== 'source' || target.assetId !== binding.assetId)
  )
    return {
      issue: {
        kind: 'audio-resources',
        lane,
        clipId: clip.id,
        field: 'original-target',
      },
    };
  const originalInstance = target?.kind === 'source' ? target.sourceInstanceId : undefined;
  const admitted = parseVideoProjectSourceVoiceoverDocuments([
    {
      id: `${args.input.operationId}:source-voiceover:${index}`,
      binding: structuredClone(binding),
      trackId: track.id,
      reference: structuredClone(args.audio.voiceoverSegments ?? source.reference),
      enabled: true,
      take,
      ...(suppress ? { originalAudioMuteVolume: 0 } : {}),
      ...(originalInstance !== undefined && originalInstance !== binding.sourceInstanceId
        ? { originalAudioSourceInstanceId: originalInstance }
        : {}),
    },
  ]);
  if (!admitted) return { issue: { kind: 'audio-input', lane, clipId: clip.id } };
  return { document: admitted[0]! };
}

function convertResultClip(args: {
  input: Pick<Parameters<typeof planReviewProjectAudio>[0], 'operationId' | 'originalAudioTarget'>;
  clip: QuickEditAudioClip;
  lane: Lane;
  index: number;
  asset: VideoProjectAsset;
  track: VideoProjectTrack;
  suppress: boolean;
}): VideoProjectAudioClip | null {
  const { clip, lane, index, asset, track } = args;
  const rate = clip.tempo ?? 1;
  const duration = clip.duration / rate;
  const id = `${args.input.operationId}:${lane}:${index}`;
  const converted: VideoProjectAudioClip = {
    id,
    sourceInstanceId: id,
    type: 'AUDIO',
    trackId: track.id,
    timelineLaneId: track.logicalLanes?.[0]?.id ?? null,
    assetId: asset.id,
    name: asset.name,
    groupId: null,
    linkMode: 'DETACHED',
    startTime: clip.timelineStart,
    duration,
    durationMode: 'project',
    ...(lane === 'voiceover' && args.suppress && args.input.originalAudioTarget
      ? {
          originalAudioMute: {
            volume: 0,
            targets: [structuredClone(args.input.originalAudioTarget)],
          },
        }
      : {}),
    sourceStart: clip.sourceOffset,
    sourceDuration: clip.duration,
    playbackRate: rate,
    muted: clip.muted,
    volume: clip.volume,
    audioGainStart: clip.volume,
    audioGainEnd: clip.volume,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: (clip.fadeIn / rate) * 1000,
    fadeOutMs: (clip.fadeOut / rate) * 1000,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 0, height: 0, rotation: 0, opacity: 1 },
  };
  return isVideoProjectClip(converted) ? converted : null;
}
