import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  TourNarration,
  TourObjectNarration,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import {
  applyTourCommands,
  getTourImages,
  getTourAudioResources,
  getTourNarrationTarget,
} from '../../../../features/scenario/project/public';
import { publishMediaHubLibraryChanged } from '../../../../features/media-hub/events';
import {
  assertSafeScenarioAssetStorageInput,
  isSafeScenarioAssetAudioMimeType,
} from '../projects/guards/asset-policy';
import { commitScenarioAggregateMutation } from '../aggregate-mutations';
import { rejectScenarioMutationBeforeHandoff } from '../asset-staging';
import type { PreparedScenarioAssetEntry } from '../contracts';
import { createScenarioAudioAssetEntry } from './capture-step/asset-entry';

/** One local audio acquisition and publication; the page owns the source-bound edit intent. */
export async function importScenarioNarration(args: {
  project: GuideProject;
  baseUpdatedAt: number;
  slideId: string | null;
  objectId?: string | null;
  expectedNarration: TourNarration | TourObjectNarration | null;
  blob: Blob;
  signal: AbortSignal;
}): Promise<GuideProject> {
  args.signal.throwIfAborted();
  const parsed = parseGuideProject(args.project);
  if (parsed.status !== 'ok') throw new Error('Invalid scenario project.');
  const project = parsed.project;
  const tour = project.tour;
  const slide = tour?.slides.find((entry) => entry.id === args.slideId);
  const target = slide ? getTourNarrationTarget(slide, args.objectId ?? null) : undefined;
  if (
    !tour ||
    project.purpose === 'step-template' ||
    (args.slideId === null
      ? args.objectId != null || args.expectedNarration !== null
      : !target ||
        narrationIdentity(target.narration ?? null) !== narrationIdentity(args.expectedNarration))
  )
    throw new Error('The narration target has changed.');
  assertSafeScenarioAssetStorageInput(args.blob, args.blob.type);
  if (!isSafeScenarioAssetAudioMimeType(args.blob.type)) throw new Error('Unsupported audio.');
  const duration = await decodeNarrationDuration(args.blob);
  args.signal.throwIfAborted();
  const assets: PreparedScenarioAssetEntry[] = [];
  let handedOff = false;
  try {
    const { assetEntry } = await createScenarioAudioAssetEntry({
      blob: args.blob,
      projectId: project.id,
      duration,
    });
    assets.push(assetEntry);
    args.signal.throwIfAborted();
    const narration = {
      assetId: assetEntry.id,
      duration,
      trimStart: 0,
      trimEnd: duration,
      gain: 1,
      transcript: '',
    };
    const next = applyTourCommands(
      project,
      [
        {
          kind: 'replace-tour',
          tour: {
            ...tour,
            audioResources: [
              ...getTourAudioResources(tour),
              {
                assetId: narration.assetId,
                duration,
                name:
                  args.blob instanceof File
                    ? args.blob.name.slice(0, GUIDE_LIMITS.maxLabelLength)
                    : narration.assetId,
              },
            ],
          },
        },
        ...(slide
          ? [
              {
                kind: 'set-narration' as const,
                slideId: slide.id,
                objectId: args.objectId ?? null,
                narration:
                  args.objectId != null &&
                  args.expectedNarration &&
                  'trigger' in args.expectedNarration
                    ? { ...narration, trigger: args.expectedNarration.trigger }
                    : narration,
              },
            ]
          : []),
      ],
      {
        images: getTourImages(tour),
        audio: [...getTourAudioResources(tour), narration],
      }
    );
    args.signal.throwIfAborted();
    handedOff = true;
    const result = await commitScenarioAggregateMutation(next, {
      expectedUpdatedAt: args.baseUpdatedAt,
      children: { assetPuts: assets },
    });
    publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);
    return result.project;
  } catch (error) {
    if (!handedOff) return rejectScenarioMutationBeforeHandoff({ assetPuts: assets }, error);
    throw error;
  }
}
function narrationIdentity(value: TourNarration | TourObjectNarration | null): string {
  return JSON.stringify(
    value && [
      value.assetId,
      value.duration,
      value.trimStart,
      value.trimEnd,
      value.gain,
      value.transcript,
      'trigger' in value ? value.trigger : null,
    ]
  );
}
async function decodeNarrationDuration(blob: Blob): Promise<number> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 3600)
      throw new Error('Unsupported narration duration.');
    return audio.duration;
  } finally {
    await context.close();
  }
}
