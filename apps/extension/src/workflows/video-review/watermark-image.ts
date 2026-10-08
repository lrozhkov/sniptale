import {
  prepareProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import { readVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
import { reviewWorkspaceHasWatermarkImage } from '../../composition/persistence/review-workspaces/asset-refs';

/** One explicit, already-admitted static logo acquisition with durable publication retry. */
export function createReviewWatermarkImageAttachment(args: {
  file: File;
  originMediaId?: string;
  aggregateId: string;
  signal: AbortSignal;
  assertCurrentTarget(): void;
  attach(assetId: string): Promise<void>;
}) {
  let prepared: PreparedProjectAsset | null = null;
  let attached = false;
  let uncertain = false;
  let complete = false;
  let flight: Promise<{ assetId: string }> | null = null;
  const retained = async (assetId: string) => {
    const snapshot = await readVideoWorkspace(args.aggregateId);
    return !!snapshot && reviewWorkspaceHasWatermarkImage(snapshot.workspace, assetId);
  };
  const current = () => {
    args.signal.throwIfAborted();
    args.assertCurrentTarget();
  };
  const perform = async () => {
    current();
    prepared ??= await prepareProjectAsset(
      args.file,
      args.file.type,
      args.file.name,
      undefined,
      undefined,
      undefined,
      {
        publishToLibrary: false,
        ...(args.originMediaId ? { originMediaId: args.originMediaId } : {}),
        requiredReviewResource: { aggregateId: args.aggregateId, slot: 'watermark' },
      }
    );
    const asset = prepared;
    const assetId = `project-asset:${asset.id}`;
    return withVoiceoverAttachmentLock(assetId, async () => {
      if (complete) return { assetId };
      try {
        if (uncertain) {
          attached = await retained(assetId);
          uncertain = false;
        }
        if (!attached) {
          current();
          await asset.protect();
          current();
          await args.attach(assetId);
          attached = true;
        }
        await asset.publish();
        complete = true;
        return { assetId };
      } finally {
        if (!attached) {
          // A thrown commit may already be durable. Unknown retention keeps the ready claim.
          let adopted: boolean | null = null;
          try {
            adopted = await retained(assetId);
          } catch {
            /* Keep recovery evidence. */
          }
          if (adopted === true) attached = true;
          else if (adopted === false) {
            await asset.cancel();
            prepared = null;
            uncertain = false;
          } else uncertain = true;
        }
      }
    });
  };
  return {
    hasRetainedAsset: () => prepared !== null,
    run(): Promise<{ assetId: string }> {
      if (flight) return flight;
      const pending = perform();
      flight = pending;
      void pending
        .finally(() => {
          if (flight === pending) flight = null;
        })
        .catch(() => undefined);
      return pending;
    },
  };
}
