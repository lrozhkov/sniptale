import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { normalizeEditorFrameSettings } from '../../../features/editor/document/constants';
import { reportEditorActionFailure } from '../../runtime/async-actions';

type FrameApplyOptions = {
  preview?: boolean;
  quality?: 'preview' | 'final';
  signal?: AbortSignal;
};
type FrameDraftArgs = {
  frame: EditorFrameSettings;
  setDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  active?: boolean;
  onPreviewActivityChange?(active: boolean): void;
  apply(
    frame: EditorFrameSettings,
    options?: FrameApplyOptions
  ): void | boolean | Promise<void | boolean>;
};
type FrameJob = { frame: EditorFrameSettings; kind: 'preview' | 'commit' | 'restore' };

function sameFrame(left: EditorFrameSettings, right: EditorFrameSettings) {
  return (Object.keys(left) as (keyof EditorFrameSettings)[]).every((key) => {
    const value = left[key];
    const other = right[key];
    // Image bytes remain primitive strings. Only bounded settings objects are serialized.
    return (
      value === other ||
      (typeof value === 'object' &&
        typeof other === 'object' &&
        JSON.stringify(value) === JSON.stringify(other))
    );
  });
}

class FrameDraftScheduler {
  private draft: EditorFrameSettings;
  private baseline: EditorFrameSettings;
  private observedFrame: EditorFrameSettings;
  private mounted = true;
  private enabled: boolean;
  private epoch = 0;
  private animation: number | undefined;
  private pending: EditorFrameSettings | undefined;
  private previewReady = false;
  private restore = false;
  private previewChangedCanvas = false;
  private previewActivity = false;
  private readonly commits: EditorFrameSettings[] = [];
  private readonly publications: EditorFrameSettings[] = [];
  private running: { job: FrameJob; abort: AbortController } | undefined;

  constructor(private readonly readArgs: () => FrameDraftArgs) {
    this.draft = normalizeEditorFrameSettings(readArgs().frame);
    this.baseline = this.draft;
    this.observedFrame = readArgs().frame;
    this.enabled = readArgs().active !== false;
  }
  private setPreviewActivity(active: boolean) {
    if (this.previewActivity === active) return;
    this.previewActivity = active;
    this.readArgs().onPreviewActivityChange?.(active);
  }

  private cancelPreview() {
    if (this.animation !== undefined) cancelAnimationFrame(this.animation);
    this.animation = undefined;
    this.pending = undefined;
    this.previewReady = false;
    if (this.running?.job.kind !== 'commit') this.running?.abort.abort();
  }

  private pump() {
    if (this.running) return;
    const commit = this.commits.shift();
    let job: FrameJob;
    if (commit) {
      job = { frame: commit, kind: 'commit' };
    } else if (this.pending && this.previewReady && this.mounted && this.enabled) {
      job = { frame: this.pending, kind: 'preview' };
      this.pending = undefined;
      this.previewReady = false;
    } else if (this.restore) {
      this.restore = false;
      job = { frame: this.baseline, kind: 'restore' };
    } else {
      if (!this.pending && !this.previewChangedCanvas) this.setPreviewActivity(false);
      return;
    }
    const abort = new AbortController();
    const jobEpoch = this.epoch;
    this.running = { job, abort };
    if (job.kind === 'commit') this.publications.push(job.frame);
    if (job.kind === 'preview') this.previewChangedCanvas = true;
    const apply = this.readArgs().apply;
    void (async () => {
      try {
        const applied = await apply(job.frame, {
          preview: job.kind !== 'commit',
          quality:
            job.kind === 'preview' && !sameFrame(job.frame, this.baseline) ? 'preview' : 'final',
          signal: abort.signal,
        });
        if (applied === false) {
          this.handleUnapplied(job, jobEpoch, abort.signal);
          return;
        }
        if (jobEpoch === this.epoch && !abort.signal.aborted) {
          if (job.kind === 'commit') this.baseline = job.frame;
          this.previewChangedCanvas =
            job.kind === 'preview' && !sameFrame(job.frame, this.baseline);
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          if (this.previewActivity) this.previewChangedCanvas = true;
          reportEditorActionFailure('frame-settings', error);
          if (job.kind !== 'restore' && jobEpoch === this.epoch && this.previewActivity)
            this.restore = true;
          if (job.kind === 'commit') {
            const index = this.publications.indexOf(job.frame);
            if (index >= 0) this.publications.splice(index, 1);
          }
        }
      } finally {
        this.running = undefined;
        this.pump();
      }
    })();
  }

  private handleUnapplied(job: FrameJob, jobEpoch: number, signal: AbortSignal) {
    if (job.kind === 'commit') {
      const index = this.publications.indexOf(job.frame);
      if (index >= 0) this.publications.splice(index, 1);
    }
    if (jobEpoch !== this.epoch || signal.aborted) return;
    this.previewChangedCanvas = true;
    this.setPreviewActivity(true);
    if (job.kind === 'restore') return;
    this.baseline = normalizeEditorFrameSettings(this.readArgs().frame);
    this.restore = true;
    if (job.kind === 'commit' && this.mounted) {
      reportEditorActionFailure(
        'frame-settings',
        new Error('Frame settings application was canceled')
      );
    }
  }

  private updateDraft(update: SetStateAction<EditorFrameSettings>) {
    this.draft = normalizeEditorFrameSettings(
      typeof update === 'function' ? update(this.draft) : update
    );
    this.readArgs().setDraft(this.draft);
    return this.draft;
  }

  setFrameDraft = (update: SetStateAction<EditorFrameSettings>) => {
    if (!this.mounted) return;
    const next = this.updateDraft(update);
    this.cancelPreview();
    this.commits.push(next);
    this.pump();
  };
  previewFrameDraft = (update: SetStateAction<EditorFrameSettings>) => {
    if (!this.mounted || !this.enabled) return;
    this.setPreviewActivity(true);
    const next = this.updateDraft(update);
    if (this.running?.job.kind !== 'commit') this.running?.abort.abort();
    this.pending = next;
    this.previewReady = false;
    if (this.animation !== undefined) cancelAnimationFrame(this.animation);
    this.animation = requestAnimationFrame(() => {
      this.animation = undefined;
      this.previewReady = true;
      this.pump();
    });
  };
  sync() {
    this.mounted = true;
    const args = this.readArgs();
    if (args.frame !== this.observedFrame) {
      this.observedFrame = args.frame;
      const accepted = normalizeEditorFrameSettings(args.frame);
      const ownPublication = this.publications.findIndex((frame) => sameFrame(frame, accepted));
      if (ownPublication >= 0) {
        this.publications.splice(0, ownPublication + 1);
        this.baseline = accepted;
        // This runs after the existing draft owner's authoritative synchronization.
        args.setDraft(this.draft);
      } else {
        this.epoch += 1;
        this.cancelPreview();
        this.running?.abort.abort();
        this.commits.length = 0;
        this.publications.length = 0;
        this.baseline = accepted;
        this.draft = accepted;
        args.setDraft(this.draft);
        this.restore = this.previewChangedCanvas;
      }
    }
    const nextEnabled = args.active !== false;
    if (this.enabled && !nextEnabled) {
      this.cancelPreview();
      this.restore = this.previewChangedCanvas;
      this.draft = this.baseline;
      args.setDraft(this.draft);
    }
    this.enabled = nextEnabled;
    this.pump();
  }
  dispose() {
    this.mounted = false;
    this.cancelPreview();
    this.restore = this.previewChangedCanvas;
    this.pump();
  }
}

/** Keep controls immediate, serialize scene work, and record completed edits exactly once. */
export function useCommittedFrameDraft(args: FrameDraftArgs): {
  setFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  previewFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
} {
  const latest = useRef(args);
  latest.current = args;
  const scheduler = useRef<FrameDraftScheduler | null>(null);
  if (!scheduler.current) scheduler.current = new FrameDraftScheduler(() => latest.current);
  const owner = scheduler.current;
  useLayoutEffect(() => owner.sync(), [owner, args.frame, args.active]);
  useLayoutEffect(() => () => owner.dispose(), [owner]);
  return { setFrameDraft: owner.setFrameDraft, previewFrameDraft: owner.previewFrameDraft };
}
