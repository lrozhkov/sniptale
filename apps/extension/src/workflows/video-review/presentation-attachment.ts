import { prepareProjectAsset } from '../../composition/persistence/projects';
import { prepareLibrarySceneBinding } from '../../composition/persistence/projects/library-scene-binding';
import type { LibrarySceneSource } from '../../composition/persistence/projects/library-scene-source';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import { readVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
import { reviewWorkspaceHasSceneResource } from '../../composition/persistence/review-workspaces/asset-refs';

type Acquisition =
  | { kind: 'private-upload' | 'private-frozen-image'; file: File; originMediaId?: string }
  | { kind: 'library-binding'; source: LibrarySceneSource };
interface AttachmentArgs {
  acquisition: Acquisition;
  aggregateId: string;
  slot: 'intro' | 'outro';
  kind: 'image' | 'video';
  signal: AbortSignal;
  assertCurrentTarget(): void;
  attach(assetId: string): Promise<void>;
}
interface PreparedResource {
  protect(): Promise<void>;
  publish(): Promise<void>;
  cancel(): Promise<void>;
}

/** One admitted acquisition owns preparation, durable attachment and publication retry. */
export function createReviewPresentationAttachment(args: AttachmentArgs) {
  const attachment = new PresentationAttachment(args);
  return {
    run: () => attachment.run(),
    hasRetainedAsset: () => attachment.hasRetainedAsset(),
  };
}

class PresentationAttachment {
  private prepared: PreparedResource | null = null;
  private attached = false;
  private uncertain = false;
  private complete = false;
  private flight: Promise<{ assetId: string }> | null = null;
  private readonly id: string;
  private readonly assetId: string;

  constructor(private readonly args: AttachmentArgs) {
    this.id =
      args.acquisition.kind === 'library-binding'
        ? (args.acquisition.source.entry?.id ?? crypto.randomUUID())
        : crypto.randomUUID();
    this.assetId = `project-asset:${this.id}`;
  }

  hasRetainedAsset(): boolean {
    return this.prepared !== null;
  }

  run(): Promise<{ assetId: string }> {
    if (this.flight) return this.flight;
    const pending = withVoiceoverAttachmentLock(this.assetId, () => this.perform());
    this.flight = pending;
    void pending
      .finally(() => {
        if (this.flight === pending) this.flight = null;
      })
      .catch(() => undefined);
    return pending;
  }

  private current(): void {
    this.args.signal.throwIfAborted();
    this.args.assertCurrentTarget();
  }

  private async retained(): Promise<boolean> {
    const snapshot = await readVideoWorkspace(this.args.aggregateId);
    return (
      !!snapshot &&
      reviewWorkspaceHasSceneResource(
        snapshot.workspace,
        this.args.slot,
        this.args.kind,
        this.assetId
      )
    );
  }

  private async prepare(): Promise<PreparedResource> {
    const acquisition = this.args.acquisition;
    const claim = {
      aggregateId: this.args.aggregateId,
      slot: this.args.slot,
      kind: this.args.kind,
    };
    if (acquisition.kind === 'library-binding') {
      const binding = await prepareLibrarySceneBinding(acquisition.source, claim, this.id);
      return { ...binding, protect: async () => undefined };
    }
    return prepareProjectAsset(
      acquisition.file,
      acquisition.file.type,
      acquisition.file.name,
      this.id,
      undefined,
      undefined,
      {
        publishToLibrary: false,
        ...(acquisition.originMediaId ? { originMediaId: acquisition.originMediaId } : {}),
        requiredReviewResource: { ...claim, acquisition: acquisition.kind },
      }
    );
  }

  private async perform(): Promise<{ assetId: string }> {
    if (this.complete) return { assetId: this.assetId };
    try {
      if (this.uncertain) {
        this.attached = await this.retained();
        this.uncertain = false;
      }
      if (!this.attached) {
        this.current();
        this.prepared ??= await this.prepare();
        await this.prepared.protect();
        this.current();
        await this.args.attach(this.assetId);
        this.attached = true;
      }
      if (!this.prepared) throw new Error('Presentation attachment lost its prepared resource.');
      await this.prepared.publish();
      this.complete = true;
      return { assetId: this.assetId };
    } finally {
      if (!this.attached && this.prepared) await this.reconcileFailure();
    }
  }

  private async reconcileFailure(): Promise<void> {
    let adopted: boolean | null = null;
    try {
      adopted = await this.retained();
    } catch {
      /* Keep ready evidence for retry/recovery. */
    }
    if (adopted === true) this.attached = true;
    else if (adopted === false) {
      await this.prepared!.cancel();
      this.prepared = null;
      this.uncertain = false;
    } else this.uncertain = true;
  }
}
