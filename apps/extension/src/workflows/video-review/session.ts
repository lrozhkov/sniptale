import { VideoWorkspaceError } from '../../composition/persistence/review-workspaces/store';
import { withReviewTrackEnabled } from '../../features/video/review/advanced/track-controls';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import { reviewSessionPersistence } from './session-durable-access';
import { createReviewAutosaveCaptures } from './session-autosave-captures';
import type {
  AutosaveKey,
  AutosaveCapture,
  Failure,
  ReviewSessionPersistence,
  ReviewSessionState,
  ReviewSpeechReceiptState,
  ReviewFailedTranscript,
  ReviewDurableAttempt,
  ReviewTypingAttempt,
  ReviewCommittedMutation,
} from './session-types';
import {
  failureCode,
  commitReviewWorkspace,
  createReviewAnnotationPublication,
  reviewPublicationReceiptAccepted,
  reviewWriteIdentity,
  projectReviewWorkspace,
  captureReviewSpeechPublicationChanges,
  reviewDurableWorkspaceAccess,
  reviewSnapshotSaveRequest,
  saveExplicitReviewBuffer,
} from './session-durable-access';
import { createAutosaveCoordinator, type AutosavePolicy } from '@sniptale/platform/data/autosave';
import {
  createReviewAnnotationResourceRetention,
  type ReviewPreparedAnnotationResource,
} from './annotation-resources';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';
import {
  loadQuickEditAdvancedContentState,
  loadQuickEditAdvancedState,
} from '../../features/video/review/advanced/validation';
import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import { parseReviewOriginalSpeechTranscript } from '../../features/video/review/original-speech';
import { collectReviewAssetReferences } from '../../composition/persistence/review-workspaces/asset-refs';
import { parseReviewSpeechTranscript } from '../../features/video/review/speech-validation';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import { applyLocalReviewChange, type LocalReviewChange } from './local-session';
import {
  prepareReviewSpeechPublication,
  rebaseReviewPublicationBuffer,
  reviewSpeechPublicationBasis,
  type ReviewPublicationFields,
  type ReviewSpeechPublicationChange,
  type ReviewSpeechPublicationReceipt,
} from './speech-publication-state';

import { parseVideoWorkspaceTypingChange } from '../../composition/persistence/review-workspaces/typing';
import { sameReviewWorkspaceValue } from '../../composition/persistence/review-workspaces/history-retention';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type {
  ReviewAnnotation,
  ReviewHistoryDirection,
  ReviewOperation,
} from '../../features/video/review/types';
import { createReviewAdvancedContentOperation } from '../../features/video/review/document';

/** Serializes one editor's durable operations; the only document authority is persisted history. */
export function createVideoReviewSession(
  initial: VideoWorkspaceSnapshot,
  deps: ReviewSessionPersistence = reviewSessionPersistence
) {
  return new VideoReviewSession(initial, deps).api();
}

/** One owner for the editor buffer, durable receipts, ordered writes and resource lifetime. */
class VideoReviewSession {
  private state: ReviewSessionState;
  private durable: VideoWorkspaceSnapshot;
  private failedHistory = false;
  private failedProjectCommand: 'rename' | 'create' | undefined;
  private failedSpeechSave: string | undefined;
  private disposed = false;
  private disposal: Promise<void> | undefined;
  private failedTranscript: ReviewFailedTranscript;
  private failedDurableAttempt: ReviewDurableAttempt;
  private readonly annotationResources: ReturnType<typeof createReviewAnnotationResourceRetention>;
  private readonly coordinator: ReturnType<
    typeof createAutosaveCoordinator<AutosaveKey, AutosaveCapture>
  >;
  private readonly speechReceipts = new WeakMap<
    ReviewSpeechPublicationReceipt,
    ReviewSpeechReceiptState
  >();
  private readonly listeners = new Set<() => void>();
  private readonly captures = createReviewAutosaveCaptures();
  private readonly typingAttempts = new WeakMap<AutosaveCapture, ReviewTypingAttempt>();

  constructor(
    private readonly initial: VideoWorkspaceSnapshot,
    private readonly deps: ReviewSessionPersistence
  ) {
    this.state = {
      snapshot: structuredClone(this.initial),
      document: projectReviewWorkspace(this.initial),
      autosaveEnabled: true,
      dirty: false,
      pending: 0,
      error: null as Failure | null,
    };
    this.durable = structuredClone(this.initial);
    this.annotationResources = createReviewAnnotationResourceRetention({
      readDurableReferences: async () => {
        const saved = await this.deps.readVideoWorkspace(this.initial.workspace.aggregateId);
        return saved ? collectReviewAssetReferences(saved.workspace) : new Set<string>();
      },
    });
    this.coordinator = createAutosaveCoordinator<AutosaveKey, AutosaveCapture>({
      now: () => Date.now(),
      schedule: (callback, delay) => {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
      capture: (key) => this.captures.capture(key),
      commit: (captured) => this.commitAutosaveCapture(captured),
      classifyFailure: (error) => (failureCode(error) === 'storage' ? 'retry' : 'stop'),
    });
  }

  api() {
    return {
      getSnapshot: () => this.captures.snapshot(this.state),
      stageAutosave: this.stageAutosave.bind(this),
      flushAutosave: (keys?: Iterable<AutosaveKey>) => this.coordinator.flushCaptured(keys),
      cancelAutosave: this.cancelAutosave.bind(this),
      ...reviewDurableWorkspaceAccess(
        this.initial.workspace.aggregateId,
        this.deps.readVideoWorkspace,
        projectReviewWorkspace
      ),
      setAutosaveEnabled: this.setAutosaveEnabled.bind(this),
      subscribe: this.subscribe.bind(this),
      saveAdvanced: this.saveAdvanced.bind(this),
      setTrackControl: this.setTrackControl.bind(this),
      saveDraft: this.saveDraft.bind(this),
      commit: this.commit.bind(this),
      applyAnnotationEffect: this.applyAnnotationEffect.bind(this),
      ownsAnnotationResource: this.annotationResources.has,
      readAnnotationResource: this.readAnnotationResource.bind(this),
      createSpeechPublicationReceipt: this.createSpeechPublicationReceipt.bind(this),
      recoverSpeechPublication: this.recoverSpeechPublication.bind(this),
      publishSpeechTranscripts: this.publishSpeechTranscripts.bind(this),
      saveSpeechTranscript: this.saveSpeechTranscript.bind(this),
      recoverDurableOperation: this.recoverDurableOperation.bind(this),
      commitDurable: this.commitDurable.bind(this),
      saveBuffered: () =>
        this.enqueue(() => saveExplicitReviewBuffer(this.state, this.persistBuffer.bind(this))),
      rename: this.rename.bind(this),
      createProject: this.createProject.bind(this),
      reset: this.reset.bind(this),
      history: this.history.bind(this),
      reload: this.reload.bind(this),
      flush: this.flush.bind(this),
      dispose: this.dispose.bind(this),
    };
  }

  private emit() {
    this.captures.snapshot(this.state);
    for (const listener of this.listeners) listener();
  }

  private async commitTypingCapture(
    captured: AutosaveCapture,
    content: QuickEditAdvancedContent,
    typing: NonNullable<Extract<AutosaveCapture['change'], { kind: 'content' }>['typing']>
  ) {
    let attempt = this.typingAttempts.get(captured);
    if (!attempt) {
      const change = parseVideoWorkspaceTypingChange({
        ...typing,
        at: Date.now(),
        before: this.state.document.advancedContent,
        after: content,
      });
      if (!change) throw new Error('Invalid typing capture.');
      attempt = { change, baseRevision: this.state.snapshot.workspace.revision, attempted: false };
      this.typingAttempts.set(captured, attempt);
    }
    const owned = attempt;
    if (owned.attempted && this.state.autosaveEnabled) {
      const canonical = await this.deps.readVideoWorkspace(this.initial.workspace.aggregateId);
      if (
        !canonical ||
        canonical.workspace.sourceAssetId !== this.state.snapshot.workspace.sourceAssetId ||
        !sameReviewWorkspaceValue(canonical.workspace.source, this.state.snapshot.workspace.source)
      )
        throw new Error('Typing source changed.');
      if (
        canonical.workspace.typing?.actionId === typing.actionId &&
        canonical.workspace.typing.writeId === typing.writeId &&
        sameReviewWorkspaceValue(
          projectReviewWorkspace(canonical).advancedContent,
          owned.change.after
        )
      ) {
        await this.execute(async () => canonical);
        return;
      }
      if (
        canonical.workspace.revision !== owned.baseRevision ||
        !sameReviewWorkspaceValue(
          projectReviewWorkspace(canonical).advancedContent,
          owned.change.before
        )
      )
        throw new Error('Typing acknowledgement is unknown.');
    }
    owned.attempted = true;
    await this.execute(
      () =>
        (this.deps.saveVideoWorkspaceTyping ?? reviewSessionPersistence.saveVideoWorkspaceTyping)({
          ...reviewWriteIdentity(this.state.snapshot),
          change: owned.change,
        }),
      { kind: 'typing', change: owned.change }
    );
  }

  private async persistBuffer() {
    if (this.state.dirty) {
      const expectedRevision = this.durable.workspace.revision;
      const snapshot = await this.deps.saveVideoWorkspaceSnapshot(
        reviewSnapshotSaveRequest(this.durable, this.state.snapshot)
      );
      this.noteAcknowledgedWrite(snapshot, expectedRevision);
      this.durable = snapshot;
      this.state = { ...this.state, snapshot, dirty: false };
    }
    try {
      await this.annotationResources.reconcile(
        collectReviewAssetReferences(this.state.snapshot.workspace),
        true
      );
    } catch (error) {
      this.state = { ...this.state, dirty: true };
      throw error;
    }
    return this.state.snapshot;
  }

  private async transition(
    action: () => Promise<ReviewCommittedMutation>,
    local?: LocalReviewChange,
    speechSaveKey?: string
  ) {
    try {
      if (this.disposed) throw new Error('Review session is closed.');
      if (local?.kind === 'advanced')
        local = { ...local, advanced: this.prepareAdvancedUi(local.advanced) };
      if (local && (!this.state.autosaveEnabled || (this.state.dirty && local.kind !== 'reset'))) {
        const snapshot = applyLocalReviewChange(this.state.snapshot, local);
        this.state = {
          ...this.state,
          snapshot,
          document: projectReviewWorkspace(snapshot),
          dirty: true,
        };
        if (!this.state.autosaveEnabled) {
          await this.annotationResources.reconcile(
            collectReviewAssetReferences(snapshot.workspace),
            false
          );
          return snapshot;
        }
        const committed = await this.persistBuffer();
        this.state = {
          ...this.state,
          snapshot: committed,
          document: projectReviewWorkspace(committed),
          error: null,
        };
        return committed;
      }
      const expectedRevision = this.state.snapshot.workspace.revision;
      const committed = await action();
      const snapshot = 'snapshot' in committed ? committed.snapshot : committed;
      if (local) this.noteAcknowledgedWrite(snapshot, expectedRevision);
      if (
        !local &&
        this.state.dirty &&
        (snapshot === this.state.snapshot || !this.state.autosaveEnabled)
      )
        return snapshot;
      this.durable = snapshot;
      this.failedSpeechSave = undefined;
      this.state = {
        ...this.state,
        snapshot,
        document: 'snapshot' in committed ? committed.document : projectReviewWorkspace(snapshot),
        dirty: false,
        error: null,
      };
      try {
        await this.annotationResources.reconcile(
          collectReviewAssetReferences(snapshot.workspace),
          true
        );
      } catch (error) {
        this.state = { ...this.state, dirty: true };
        throw error;
      }
      return snapshot;
    } catch (error) {
      this.failedHistory = local?.kind === 'history';
      if (!speechSaveKey || !this.state.error || this.failedSpeechSave === speechSaveKey)
        this.failedSpeechSave = speechSaveKey;
      this.state = { ...this.state, error: failureCode(error) };
      if (this.state.error !== 'storage') this.coordinator.suspend(error);
      throw error;
    } finally {
      this.state = { ...this.state, pending: this.state.pending - 1 };
      this.emit();
    }
  }

  private execute(
    action: () => Promise<ReviewCommittedMutation>,
    local?: LocalReviewChange,
    speechSaveKey?: string
  ) {
    this.state = { ...this.state, pending: this.state.pending + 1 };
    this.emit();
    return this.transition(action, local, speechSaveKey);
  }

  private enqueue(
    action: () => Promise<ReviewCommittedMutation>,
    local?: LocalReviewChange,
    speechSaveKey?: string
  ) {
    if (this.disposed) return Promise.reject(new Error('Review session is closed.'));
    this.state = { ...this.state, pending: this.state.pending + 1 };
    this.emit();
    return this.coordinator.runOrdered(() => this.transition(action, local, speechSaveKey));
  }

  private createSpeechPublicationReceipt(): ReviewSpeechPublicationReceipt {
    if (this.disposed) throw new Error('Review session is closed.');
    const receipt = Object.freeze({ id: crypto.randomUUID(), at: Date.now() });
    this.speechReceipts.set(receipt, {});
    return receipt;
  }

  private noteAcknowledgedWrite(snapshot: VideoWorkspaceSnapshot, expectedRevision: number) {
    const attempt = this.failedDurableAttempt;
    if (!attempt || snapshot.workspace.sourceAssetId !== this.durable.workspace.sourceAssetId)
      return;
    if (snapshot.workspace.history.some((entry) => entry.id === attempt.id)) {
      this.failedDurableAttempt = undefined;
    } else if (
      expectedRevision === attempt.baseRevision ||
      expectedRevision === attempt.confirmedAbsentRevision
    ) {
      // A successful CAS from the attempted revision proves that the earlier publication did not commit.
      attempt.confirmedAbsentRevision = snapshot.workspace.revision;
    }
  }

  private async recoverPublication(
    operation: ReviewOperation,
    baseRevision: number,
    fields: ReviewPublicationFields
  ): Promise<VideoWorkspaceSnapshot | null> {
    const canonical = await this.deps.readVideoWorkspace(this.initial.workspace.aggregateId);
    if (!canonical) throw new Error('Review session is unavailable.');
    if (
      !reviewPublicationReceiptAccepted(
        canonical,
        this.durable,
        operation,
        baseRevision,
        this.failedDurableAttempt
      )
    )
      return null;
    if (JSON.stringify(canonical) === JSON.stringify(this.durable)) return this.state.snapshot;
    const snapshot = this.state.dirty
      ? rebaseReviewPublicationBuffer(this.durable, this.state.snapshot, canonical, fields)
      : canonical;
    this.durable = canonical;
    this.failedSpeechSave = undefined;
    this.state = {
      ...this.state,
      snapshot,
      document: projectReviewWorkspace(snapshot),
      error: null,
    };
    this.coordinator.resume();
    if (this.failedDurableAttempt?.id === operation.id) this.failedDurableAttempt = undefined;
    if (this.state.dirty && this.state.autosaveEnabled) return this.persistBuffer();
    return snapshot;
  }

  private async publishSpeechTranscripts(
    changes: readonly ReviewSpeechPublicationChange[],
    receipt: ReviewSpeechPublicationReceipt
  ) {
    const owned = this.speechReceipts.get(receipt);
    if (!owned) throw new Error('Invalid speech publication receipt.');
    const captured = captureReviewSpeechPublicationChanges(changes);
    const intent = JSON.stringify(captured);
    if (owned.intent && owned.intent !== intent)
      throw new Error('Speech publication receipt changed.');
    owned.intent = intent;
    owned.changes = captured;
    if (!owned.operation) await this.coordinator.flushCaptured();
    return this.enqueue(
      async () => {
        if (this.state.error && this.failedSpeechSave !== receipt.id && !owned.operation)
          throw new Error(`Review ${this.state.error}.`);
        if (owned.operation && owned.baseRevision !== undefined) {
          const recovered = await this.recoverPublication(owned.operation, owned.baseRevision, {
            kind: 'speech',
            targets: captured.map((change) => change.target),
          });
          if (recovered) return recovered;
        }
        // Admission uses the current queue state; a target changed while waiting cannot be overwritten.
        prepareReviewSpeechPublication(this.state.snapshot, this.state.document, captured, receipt);
        await this.persistBuffer();
        const operation = prepareReviewSpeechPublication(
          this.state.snapshot,
          this.state.document,
          captured,
          receipt
        );
        if (!operation) return this.state.snapshot;
        owned.operation = operation;
        owned.baseRevision = this.state.snapshot.workspace.revision;
        this.failedDurableAttempt = { id: operation.id, baseRevision: owned.baseRevision };
        const snapshot = await this.deps.commitVideoWorkspace({
          ...reviewWriteIdentity(this.state.snapshot),
          operation,
        });
        this.failedDurableAttempt = undefined;
        return snapshot;
      },
      undefined,
      receipt.id
    );
  }

  private async commitAutosaveCapture(captured: AutosaveCapture) {
    try {
      const change = captured.change;
      if (change.kind === 'content') {
        const content = loadQuickEditAdvancedContentState(change.content);
        if (!content) throw new Error('Advanced content is invalid.');
        if (change.typing) {
          await this.commitTypingCapture(captured, content, change.typing);
          this.captures.acknowledge(captured);
          this.emit();
          return;
        }
        const operation = createReviewAdvancedContentOperation({
          id: crypto.randomUUID(),
          at: Date.now(),
          before: this.state.document.advancedContent,
          after: content,
        });
        if (operation) {
          await this.execute(
            () =>
              commitReviewWorkspace(this.deps, {
                ...reviewWriteIdentity(this.state.snapshot),
                operation,
              }),
            {
              kind: 'commit',
              operation,
              consumeDraft: false,
            }
          );
        }
      } else if (change.kind === 'advanced') {
        await this.execute(
          () =>
            this.deps.saveVideoWorkspaceAdvanced({
              ...reviewWriteIdentity(this.state.snapshot),
              advanced: this.prepareAdvancedUi(change.advanced),
            }),
          change
        );
      } else {
        await this.execute(
          () =>
            this.deps.saveVideoWorkspaceDraft({
              ...reviewWriteIdentity(this.state.snapshot),
              annotation: change.annotation,
              before: change.before,
              expectedDraftRevision: this.state.snapshot.draft?.revision ?? null,
            }),
          change
        );
      }
    } catch (error) {
      captured.fail(error);
      throw error;
    }
    this.captures.acknowledge(captured);
    this.emit();
  }

  /** Registers a lazy buffer capture; scheduling and admission belong to this session. */
  private stageAutosave(key: AutosaveKey, capture: () => AutosaveCapture, policy: AutosavePolicy) {
    if (this.disposed) return;
    this.captures.register(key, capture);
    this.coordinator.request(key, policy);
    this.emit();
  }

  private cancelAutosave(key: AutosaveKey) {
    this.coordinator.cancel(key);
    this.captures.cancel(key);
    this.emit();
  }

  private setAutosaveEnabled(enabled: boolean) {
    if (this.disposed) return;
    this.state = { ...this.state, autosaveEnabled: enabled };
    this.emit();
    if (enabled && this.state.dirty)
      void this.enqueue(async () => {
        if (!this.state.autosaveEnabled) return this.state.snapshot;
        return this.persistBuffer();
      }).catch(() => undefined);
  }

  private subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Callers drain accepted field captures before enqueueing a lane control transition. */
  private setTrackControl(track: QuickEditTrack | 'audio', control: { enabled: boolean }) {
    return this.enqueue(async () => {
      let next = this.state.snapshot;
      const current = { ...next.workspace.advanced, ...this.state.document.advancedContent };
      if (track === 'source') return next;
      const advanced = withReviewTrackEnabled(current, track, control.enabled);
      const { ui: _ui, recoveryV1: _recovery, ...content } = advanced;
      const operation = createReviewAdvancedContentOperation({
        id: crypto.randomUUID(),
        at: Date.now(),
        before: this.state.document.advancedContent,
        after: content,
      });
      if (operation)
        next = applyLocalReviewChange(next, { kind: 'commit', operation, consumeDraft: false });
      next = {
        ...next,
        workspace: {
          ...next.workspace,
          advanced: { ...next.workspace.advanced, ui: advanced.ui },
        },
      };

      this.state = {
        ...this.state,
        snapshot: next,
        document: projectReviewWorkspace(next),
        dirty: true,
      };
      return this.state.autosaveEnabled ? this.persistBuffer() : next;
    });
  }

  /** Delayed chrome captures cannot overwrite lane controls owned by ordered session commands. */
  private prepareAdvancedUi(raw: unknown) {
    const advanced = loadQuickEditAdvancedState(raw);
    if (!advanced) throw new VideoWorkspaceError('invalid');
    const current = this.state.snapshot.workspace.advanced.ui;
    const { lockedTracks: _capturedLocks, ...ui } = advanced.ui;
    const firstEntry =
      current.mode === 'basic' && ui.mode === 'advanced' && !current.advancedTracksInitialized;
    return {
      ...advanced,
      ui: {
        ...ui,
        ...(current.lockedTracks ? { lockedTracks: current.lockedTracks } : {}),
        tracks: firstEntry ? advanced.ui.tracks : current.tracks,
      },
    };
  }

  private saveAdvanced(advanced: unknown) {
    const captured = structuredClone(advanced);
    return this.enqueue(
      () =>
        this.deps.saveVideoWorkspaceAdvanced({
          ...reviewWriteIdentity(this.state.snapshot),
          advanced: this.prepareAdvancedUi(captured),
        }),
      { kind: 'advanced', advanced: captured }
    );
  }

  private saveDraft(annotation: ReviewAnnotation | null, before: ReviewAnnotation | null) {
    const captured = structuredClone({ annotation, before });
    return this.enqueue(
      () =>
        this.deps.saveVideoWorkspaceDraft({
          ...reviewWriteIdentity(this.state.snapshot),
          ...captured,
          expectedDraftRevision: this.state.snapshot.draft?.revision ?? null,
        }),
      { kind: 'draft', ...captured }
    );
  }

  private commit(operation: ReviewOperation, consumeDraft = false) {
    const captured = structuredClone(operation);
    return this.enqueue(
      () => {
        if (consumeDraft && !this.state.snapshot.draft)
          throw new Error('Review draft is unavailable.');
        return commitReviewWorkspace(this.deps, {
          ...reviewWriteIdentity(this.state.snapshot),
          operation: captured,
          ...(consumeDraft ? { consumeDraftRevision: this.state.snapshot.draft!.revision } : {}),
        });
      },
      { kind: 'commit', operation: captured, consumeDraft }
    );
  }

  /** Transfers leases only after atomic local admission; a failed Save retains authored content and retry. */
  private applyAnnotationEffect(args: {
    expectedSourceAssetId: string;
    snapshot: ReviewAnnotationEffectSnapshot;
    instance: ReviewAnnotationEffect;
    resources: readonly ReviewPreparedAnnotationResource[];
    signal?: AbortSignal;
  }) {
    const captured = structuredClone({
      snapshot: args.snapshot,
      instance: args.instance,
      expectedSourceAssetId: args.expectedSourceAssetId,
    });
    const resources = [...args.resources];
    const signal = args.signal;
    return this.enqueue(async () => {
      signal?.throwIfAborted();
      if (captured.expectedSourceAssetId !== this.state.snapshot.workspace.sourceAssetId)
        throw new Error('Annotation source changed.');
      const operation = createReviewAnnotationPublication(
        this.state.document.advancedContent,
        captured.instance
      );
      const snapshot = applyLocalReviewChange(this.state.snapshot, {
        kind: 'commit',
        operation,
        consumeDraft: false,
        effectSnapshots: [captured.snapshot],
      });
      this.annotationResources.admit(
        resources,
        new Set(captured.snapshot.assets.map((asset) => asset.assetId))
      );
      this.state = {
        ...this.state,
        snapshot,
        document: projectReviewWorkspace(snapshot),
        dirty: true,
      };
      if (this.state.autosaveEnabled) return this.persistBuffer();
      await this.annotationResources.reconcile(
        collectReviewAssetReferences(snapshot.workspace),
        false
      );
      return snapshot;
    });
  }

  /** Local preview/export reads use only admitted leases; publication uses the canonical reader. */
  private async readAnnotationResource(reference: string, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.disposed ? null : this.annotationResources.read(reference, signal);
  }

  /** Resolves a pending resource attachment; only proven absence may release its attempted metadata. */
  private async recoverSpeechPublication(
    receipt: ReviewSpeechPublicationReceipt,
    options?: { discardUncommittedAttempt: true }
  ) {
    const owned = this.speechReceipts.get(receipt);
    if (!owned) throw new Error('Invalid speech publication receipt.');
    if (this.disposed) throw new Error('Review session is closed.');
    this.state = { ...this.state, pending: this.state.pending + 1 };
    this.emit();
    try {
      return await this.coordinator.runOrdered(async () => {
        if (this.disposed) throw new Error('Review session is closed.');
        const accepted =
          owned.operation && owned.baseRevision !== undefined
            ? await this.recoverPublication(owned.operation, owned.baseRevision, {
                kind: 'speech',
                targets: owned.changes!.map((change) => change.target),
              })
            : null;
        if (!accepted && options?.discardUncommittedAttempt) {
          delete owned.operation;
          delete owned.baseRevision;
          delete owned.intent;
          delete owned.changes;
        }
        if (
          !accepted &&
          !options &&
          this.failedSpeechSave === receipt.id &&
          this.state.error === 'storage'
        ) {
          this.state = { ...this.state, error: null };
          this.failedSpeechSave = undefined;
          this.coordinator.resume();
        }
        return accepted !== null;
      });
    } finally {
      this.state = { ...this.state, pending: this.state.pending - 1 };
      this.emit();
    }
  }

  /** Builds speech history at queue execution time; jobs use a stable receipt for explicit retry. */
  private async saveSpeechTranscript(
    target: ReviewSpeechTarget,
    expectedAssetId: string,
    transcript: ReviewSpeechTranscript
  ) {
    const captured =
      target.kind === 'original'
        ? parseReviewOriginalSpeechTranscript(structuredClone(transcript))
        : parseReviewSpeechTranscript(structuredClone(transcript));
    if (!captured) throw new Error('Invalid speech transcript.');
    const basis = reviewSpeechPublicationBasis(this.state.snapshot, this.state.document, target);
    if (basis.expectedAssetId !== expectedAssetId) throw new Error('Speech target changed.');
    const key = JSON.stringify([target, expectedAssetId, captured]);
    const receipt =
      this.failedTranscript?.key === key
        ? this.failedTranscript.receipt
        : this.createSpeechPublicationReceipt();
    const previous = this.speechReceipts.get(receipt)?.changes;
    const changes = previous ?? [{ target, ...basis, expectedAssetId, transcript: captured }];
    this.failedTranscript = { key, receipt };
    await this.publishSpeechTranscripts(changes, receipt);
    if (this.failedTranscript?.receipt === receipt) this.failedTranscript = undefined;
    return this.state.snapshot;
  }

  /** Recovery acknowledges the exact accepted operation while preserving unrelated authored drafts. */
  private async recoverDurableOperation(
    operation: ReviewOperation,
    baseRevision: number,
    fields: ReviewPublicationFields
  ) {
    let recovered = false;
    await this.enqueue(async () => {
      const snapshot = await this.recoverPublication(operation, baseRevision, fields);
      recovered = snapshot !== null;
      return snapshot ?? this.state.snapshot;
    });
    return recovered;
  }

  /** Explicit Save persists buffered edits and this operation even with autosave disabled. */
  private commitDurable(operation: ReviewOperation, onAttempt?: (revision: number) => void) {
    const captured = structuredClone(operation);
    return this.enqueue(async () => {
      await this.persistBuffer();
      onAttempt?.(this.state.snapshot.workspace.revision);
      const baseRevision = this.state.snapshot.workspace.revision;
      this.failedDurableAttempt = { id: captured.id, baseRevision };
      const snapshot = await this.deps.commitVideoWorkspace({
        ...reviewWriteIdentity(this.state.snapshot),
        operation: captured,
      });
      this.failedDurableAttempt = undefined;
      return snapshot;
    });
  }

  /** Clears authored content atomically while preserving source identity and UI preferences. */
  private reset() {
    return this.enqueue(
      async () => {
        const next = applyLocalReviewChange(this.state.snapshot, { kind: 'reset' });
        return this.deps.saveVideoWorkspaceSnapshot(reviewSnapshotSaveRequest(this.durable, next));
      },
      { kind: 'reset' }
    );
  }

  private history(direction: ReviewHistoryDirection) {
    return this.enqueue(
      () =>
        this.deps.moveVideoWorkspaceHistory({
          ...reviewWriteIdentity(this.state.snapshot),
          direction,
        }),
      {
        kind: 'history',
        direction,
      }
    );
  }

  private resumeProjectStorageFailure() {
    if (this.failedProjectCommand && this.state.error === 'storage') {
      this.state = { ...this.state, error: null };
      this.coordinator.resume();
      this.emit();
    }
  }

  /** Saves every captured field before replacing the source's default project. */
  private async createProject(commandId: string) {
    await this.coordinator.flushCaptured();
    let created: VideoWorkspaceSnapshot | undefined;
    await this.enqueue(async () => {
      this.failedProjectCommand = undefined;
      await saveExplicitReviewBuffer(this.state, this.persistBuffer.bind(this));
      const current = this.state.snapshot.workspace;
      const sourceMediaId = current.sourceMediaId ?? current.aggregateId;
      const archiveId = `${sourceMediaId.split(':', 1)[0]}:quick-project:${commandId}`;
      try {
        created = await (
          this.deps.createVideoWorkspaceProject ??
          reviewSessionPersistence.createVideoWorkspaceProject
        )({
          aggregateId: current.aggregateId,
          expectedRevision: current.revision,
          expectedSourceAssetId: current.sourceAssetId,
          archiveId,
        });
        this.failedProjectCommand = undefined;
      } catch (error) {
        this.failedProjectCommand = 'create';
        throw error;
      }
      // The opening owner replaces this mounted session after successful publication.
      return this.state.snapshot;
    }).catch((error: unknown) => {
      this.resumeProjectStorageFailure();
      throw error;
    });
    if (!created) throw new VideoWorkspaceError('conflict');
    return created;
  }

  /** Metadata uses the same serialized writer and CAS as content, outside Undo history. */
  private async rename(name: string) {
    const retry = this.failedProjectCommand === 'rename';
    await this.coordinator.flushCaptured();
    return this.enqueue(async () => {
      this.failedProjectCommand = undefined;
      await saveExplicitReviewBuffer(this.state, this.persistBuffer.bind(this));
      const current = this.state.snapshot.workspace;
      try {
        if (retry) {
          const accepted = await this.deps.readVideoWorkspace(current.aggregateId);
          if (
            accepted?.workspace.project?.name === name.trim() &&
            accepted.workspace.sourceAssetId === current.sourceAssetId &&
            accepted.workspace.createdAt === current.createdAt &&
            accepted.workspace.revision === current.revision + 1
          ) {
            this.failedProjectCommand = undefined;
            return accepted;
          }
        }
        await (
          this.deps.renameVideoWorkspaceProject ??
          reviewSessionPersistence.renameVideoWorkspaceProject
        )(current.aggregateId, current.revision, name);
        const saved = await this.deps.readVideoWorkspace(current.aggregateId);
        if (!saved) throw new VideoWorkspaceError('conflict');
        this.failedProjectCommand = undefined;
        return saved;
      } catch (error) {
        this.failedProjectCommand = 'rename';
        throw error;
      }
    }).catch((error: unknown) => {
      this.resumeProjectStorageFailure();
      throw error;
    });
  }

  private reload() {
    for (const key of this.captures.keys()) this.coordinator.cancel(key);
    this.captures.invalidate();
    return this.enqueue(async () => {
      const snapshot = await this.deps.readVideoWorkspace(this.initial.workspace.aggregateId);
      if (!snapshot) throw new Error('Review session is unavailable.');
      this.captures.clear();
      this.state = { ...this.state, dirty: false };
      this.failedDurableAttempt = undefined;
      this.failedTranscript = undefined;
      this.coordinator.resume();
      return snapshot;
    });
  }

  private async flush(options?: { retryHistory: true }) {
    if (this.disposed) return;
    const hadPending = this.state.pending > 0;
    await this.coordinator.flushCaptured();
    await this.coordinator.runOrdered(async () => undefined);
    // Only a completed history failure may be retried; pending/content failures stay strict.
    if (this.state.error && !(options?.retryHistory && this.failedHistory && !hadPending))
      throw new Error(`Review ${this.state.error}.`);
  }

  /** Only the mounted source owner disposes the session; beforeunload cancellation leaves it alive. */
  private dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.failedDurableAttempt = undefined;
    this.failedTranscript = undefined;
    for (const key of this.captures.keys()) this.coordinator.cancel(key);
    this.captures.clear();
    this.disposal = this.coordinator
      .runOrdered(() => this.annotationResources.dispose())
      .finally(() => this.coordinator.dispose());
    return this.disposal;
  }
}
