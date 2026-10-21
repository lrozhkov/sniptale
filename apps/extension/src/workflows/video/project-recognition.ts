import {
  AUDIO_INPUT_MAX_SECONDS,
  validAudioInputDuration,
  type AudioRecognitionOptions,
} from '../../contracts/ai/audio';
import { getVideoProject } from '../../composition/persistence/projects';
import { readVideoProjectAudioSource } from '../../composition/persistence/projects/audio-source';
import type { VideoProject } from '../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../features/video/project/text/types';
import { createVideoProjectAudioScope } from '../../features/video/project/text/audio-scope';
import { applyVideoProjectRecognition } from '../../features/video/project/text/recognition';
import { getMediaClipSourceTime } from '../../features/video/project/timeline/rate';
import { parseVideoProjectTextDocuments } from '../../features/video/project/text/validation';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { parseReviewTextDocument } from '../../features/video/review/text-validation';
import {
  extractReviewSpeechWav,
  planReviewSpeechChunks,
  reviewSpeechWavIsSilent,
} from '../video-review/speech-audio';
import { runReviewSpeechJob } from '../audio-jobs/client';
import {
  recognitionFragments,
  reviewRecognitionPhrases,
  type RecognitionChunk,
  type ReviewRecognitionGrouping,
} from '../video-review/recognition-text';

/** The mounted editor retains its sole mutation/history/save authority. */
export interface ProjectRecognitionAccess {
  getProject(): VideoProject | null;
  save(): Promise<void>;
  update(updater: (project: VideoProject) => VideoProject): void;
}
export interface ProjectRecognitionOptions {
  clipId: string;
  modelId: string;
  approvedProviderId: string;
  start: number;
  end: number;
  grouping: ReviewRecognitionGrouping;
  recognition?: AudioRecognitionOptions;
}
export interface ProjectRecognitionJob {
  id: string;
  project: VideoProject;
  revision: number;
  localUpdatedAt: number;
  basis: string;
  identity: string;
  options: ProjectRecognitionOptions;
  source: Blob;
  chunks: RecognitionChunk[];
}
export interface ProjectRecognitionProposal {
  job: ProjectRecognitionJob;
  entry: VideoProjectTextDocument;
  /** An accepted local edit can retry its save acknowledgement without another mutation. */
  receipt?: VideoProjectTextDocument;
}

/** Intervals use authored source seconds, independent of montage start and rate. */
export function projectRecognitionRange(project: VideoProject, clipId: string) {
  const clip = project.clips.find((entry) => entry.id === clipId);
  if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'AUDIO')) return null;
  const asset = project.assets.find((entry) => entry.id === clip.assetId);
  if (!asset?.metadata.hasAudio) return null;
  const offset = clip.type === 'VIDEO' ? (clip.cameraTiming?.offsetSeconds ?? 0) : 0;
  const start = Math.max(clip.sourceStart, offset);
  const end = Math.min(
    clip.sourceStart + clip.sourceDuration,
    getMediaClipSourceTime(clip, clip.startTime + clip.duration) + offset,
    (asset.metadata.duration ?? Infinity) + offset
  );
  return end > start ? { start, end } : null;
}

function cameraOffset(project: VideoProject, clipId: string): number {
  const clip = project.clips.find((entry) => entry.id === clipId);
  return clip?.type === 'VIDEO' ? (clip.cameraTiming?.offsetSeconds ?? 0) : 0;
}

function basis(project: VideoProject, clipId: string) {
  const clip = project.clips.find((entry) => entry.id === clipId);
  if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'AUDIO')) throw new Error('stale');
  const asset = project.assets.find((entry) => entry.id === clip.assetId);
  return JSON.stringify([
    project.id,
    clip.id,
    clip.assetId,
    clip.sourceInstanceId ?? clip.id,
    clip.trackId,
    clip.startTime,
    clip.duration,
    clip.sourceStart,
    clip.sourceDuration,
    clip.playbackRate ?? 1,
    clip.type === 'VIDEO' ? clip.cameraTiming : undefined,
    asset?.source,
    asset
      ? [
          asset.metadata.width,
          asset.metadata.height,
          asset.metadata.duration,
          asset.metadata.mimeType,
          asset.metadata.size,
          asset.metadata.hasAudio,
          asset.metadata.audioPeaks,
        ]
      : null,
    parseVideoProjectTextDocuments(project.textDocuments ?? []),
  ]);
}

function assertCurrent(access: ProjectRecognitionAccess, job: ProjectRecognitionJob) {
  const current = access.getProject();
  if (
    !current ||
    current.updatedAt !== job.localUpdatedAt ||
    basis(current, job.options.clipId) !== job.basis
  )
    throw new Error('stale');
}

async function readSaved(projectId: string) {
  const saved = await getVideoProject(projectId);
  if (saved.status !== 'ready' || saved.lifecycle?.trashedAt !== undefined)
    throw new Error('stale');
  return saved;
}

/** Saves through the mounted writer before canonical source admission; failed work stays disposable. */
export async function prepareProjectRecognition(
  access: ProjectRecognitionAccess,
  options: ProjectRecognitionOptions,
  signal: AbortSignal,
  previous?: ProjectRecognitionJob
): Promise<ProjectRecognitionJob> {
  signal.throwIfAborted();
  const initial = access.getProject();
  if (!initial || !options.modelId.trim() || !options.approvedProviderId.trim())
    throw new Error('invalid-request');
  const originalBasis = basis(initial, options.clipId);
  const range = projectRecognitionRange(initial, options.clipId);
  if (
    !range ||
    !Number.isFinite(options.start) ||
    !Number.isFinite(options.end) ||
    options.start < range.start ||
    options.end > range.end ||
    options.end <= options.start
  )
    throw new Error('selection');
  if (options.recognition && !validAudioInputDuration(options.end - options.start))
    throw new Error('too-large');
  await access.save();
  signal.throwIfAborted();
  const current = access.getProject();
  if (!current || basis(current, options.clipId) !== originalBasis) throw new Error('stale');
  const saved = await readSaved(current.id);
  signal.throwIfAborted();
  if (basis(saved.project, options.clipId) !== originalBasis || access.getProject() !== current)
    throw new Error('stale');
  const scope = createVideoProjectAudioScope(
    saved.project,
    saved.workspaceRevision,
    options.clipId,
    options.start,
    Math.min(options.end, options.start + AUDIO_INPUT_MAX_SECONDS)
  );
  if (!scope) throw new Error('selection');
  const identity = JSON.stringify([originalBasis, saved.workspaceRevision, options]);
  if (previous?.identity === identity) return previous;
  const source = await readVideoProjectAudioSource(scope);
  signal.throwIfAborted();
  const offset = cameraOffset(saved.project, options.clipId);
  const ranges = options.recognition
    ? [{ start: options.start, end: options.end }]
    : (
        await planReviewSpeechChunks(
          source,
          [{ start: options.start - offset, end: options.end - offset }],
          signal
        )
      ).map((chunk) => ({ ...chunk, start: chunk.start + offset, end: chunk.end + offset }));
  const job: ProjectRecognitionJob = {
    id: crypto.randomUUID(),
    project: saved.project,
    revision: saved.workspaceRevision,
    localUpdatedAt: current.updatedAt,
    basis: originalBasis,
    identity,
    options: structuredClone(options),
    source,
    chunks: ranges.map((chunk) => ({ ...chunk, range: 0 })),
  };
  signal.throwIfAborted();
  assertCurrent(access, job);
  return job;
}

/** Uses the same extraction, paid-job client and phrase grouping as Gallery. */
export async function runProjectRecognition(
  access: ProjectRecognitionAccess,
  job: ProjectRecognitionJob,
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void
): Promise<ProjectRecognitionProposal> {
  const offset = cameraOffset(job.project, job.options.clipId);
  for (const chunk of job.chunks) {
    signal.throwIfAborted();
    assertCurrent(access, job);
    const saved = await readSaved(job.project.id);
    signal.throwIfAborted();
    assertCurrent(access, job);
    if (saved.workspaceRevision !== job.revision) throw new Error('stale');
    if (!chunk.result) {
      const scope = createVideoProjectAudioScope(
        job.project,
        job.revision,
        job.options.clipId,
        chunk.start,
        chunk.end
      );
      if (!scope) throw new Error('selection');
      const response = await runReviewSpeechJob(
        {
          type: 'start',
          operation: 'transcription',
          requestId: crypto.randomUUID(),
          modelId: job.options.modelId,
          approvedProviderId: job.options.approvedProviderId,
          scope,
          ...(job.options.recognition ? { recognition: job.options.recognition } : {}),
        },
        {
          signal,
          prepareInput: async (active) => {
            const wav = await extractReviewSpeechWav(
              job.source,
              chunk.start - offset,
              chunk.end - offset,
              active
            );
            return (await reviewSpeechWavIsSilent(wav, active)) ? null : wav;
          },
        }
      );
      signal.throwIfAborted();
      assertCurrent(access, job);
      if (response.type !== 'transcript') throw new Error('invalid-response');
      chunk.result = structuredClone(response.result);
    }
    onProgress?.(
      job.chunks.filter((entry) => entry.result !== undefined).length,
      job.chunks.length
    );
  }
  signal.throwIfAborted();
  assertCurrent(access, job);
  const document = parseReviewTextDocument({
    version: 1,
    fragments: recognitionFragments(
      { id: job.id, target: { kind: 'original' } },
      reviewRecognitionPhrases(job.chunks, job.options.grouping),
      []
    ),
  });
  if (!document) throw new Error('too-large');
  const clip = job.project.clips.find((entry) => entry.id === job.options.clipId);
  if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'AUDIO')) throw new Error('stale');
  return {
    job,
    entry: {
      id: job.id,
      binding: {
        kind: 'source',
        assetId: clip.assetId,
        sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      },
      document,
      captions: createReviewCaptionSettings(),
    },
  };
}

/** Retry acknowledges the same local edit; it never repeats recognition or resurrects removed text. */
export async function applyProjectRecognition(
  access: ProjectRecognitionAccess,
  proposal: ProjectRecognitionProposal,
  signal: AbortSignal,
  mode: 'add' | 'replace'
): Promise<void> {
  signal.throwIfAborted();
  if (!proposal.receipt) {
    assertCurrent(access, proposal.job);
    const saved = await readSaved(proposal.job.project.id);
    signal.throwIfAborted();
    assertCurrent(access, proposal.job);
    if (saved.workspaceRevision !== proposal.job.revision) throw new Error('stale');
    const current = access.getProject();
    let accepted = false;
    access.update((project) => {
      if (project !== current) throw new Error('stale');
      const next = applyVideoProjectRecognition(
        project,
        proposal.entry,
        proposal.job.options,
        mode
      );
      if (!next) throw new Error('too-large');
      const receipt = next.textDocuments?.find((entry) => entry.id === proposal.entry.id);
      if (!receipt) throw new Error('invalid-response');
      proposal.receipt = receipt;
      accepted = true;
      return next;
    });
    if (!accepted) throw new Error('stale');
  }
  const receipt = JSON.stringify(proposal.receipt);
  const matches = (project: VideoProject | null) =>
    project?.id === proposal.job.project.id &&
    JSON.stringify(project.textDocuments?.find((entry) => entry.id === proposal.entry.id)) ===
      receipt;
  if (!matches(access.getProject())) throw new Error('stale');
  await access.save();
  signal.throwIfAborted();
  const saved = await readSaved(proposal.job.project.id);
  signal.throwIfAborted();
  if (!matches(saved.project) || !matches(access.getProject())) throw new Error('stale');
}
