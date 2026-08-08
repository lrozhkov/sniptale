import { createLogger } from '@sniptale/platform/observability/logger';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import type { ToolbarFutureFrameStyle } from '../types';
import {
  parseAnnotationForkDraftPayload,
  serializeAnnotationForkDraftPayload,
  type AnnotationForkDrafts,
} from '../../../../features/highlighter/frame-annotation/annotation-fork-payload';

const logger = createLogger({ namespace: 'AnnotationForkSession' });
let writeChain: Promise<void> = Promise.resolve();
let sessionRevision = 0;

export function parseAnnotationForkDrafts(payload: string): AnnotationForkDrafts | null {
  return parseAnnotationForkDraftPayload(payload);
}

export function selectAnnotationForkDrafts(style: ToolbarFutureFrameStyle): AnnotationForkDrafts {
  return {
    ...(style.borderSettings.sourcePresetId === undefined
      ? {
          frame: {
            blurSettings: structuredClone(style.blurSettings),
            borderSettings: structuredClone(style.borderSettings),
            effectMode: style.effectMode,
            focusSettings: structuredClone(style.focusSettings),
          },
        }
      : {}),
    ...(style.futureCallout?.sourcePresetId === undefined && style.futureCallout
      ? { callout: structuredClone(style.futureCallout) }
      : {}),
    ...(style.futureStepBadge?.sourcePresetId === undefined && style.futureStepBadge
      ? { stepBadge: structuredClone(style.futureStepBadge) }
      : {}),
  };
}

export function applyAnnotationForkDrafts(
  style: ToolbarFutureFrameStyle,
  drafts: AnnotationForkDrafts
): ToolbarFutureFrameStyle {
  return {
    ...style,
    ...(drafts.frame ? structuredClone(drafts.frame) : {}),
    ...(drafts.callout ? { futureCallout: structuredClone(drafts.callout) } : {}),
    ...(drafts.stepBadge ? { futureStepBadge: structuredClone(drafts.stepBadge) } : {}),
  };
}

export async function loadAnnotationForkDrafts(): Promise<AnnotationForkDrafts> {
  try {
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
      operation: 'read',
      type: MessageType.ANNOTATION_FORK_SESSION,
    });
    if (!response?.success || typeof response.revision !== 'number') return {};
    sessionRevision = response.revision;
    if (typeof response.payload !== 'string') return {};
    return parseAnnotationForkDrafts(response.payload) ?? {};
  } catch (error) {
    logger.warn('Failed to restore annotation fork drafts', error);
    return {};
  }
}

export function persistAnnotationForkDrafts(drafts: AnnotationForkDrafts): Promise<void> {
  const operation = Object.keys(drafts).length ? 'write' : 'clear';
  const write = writeChain
    .catch(() => undefined)
    .then(async () => {
      const payload =
        operation === 'write' ? serializeAnnotationForkDraftPayload(drafts) : undefined;
      const send = async (mayRetryRevision: boolean): Promise<void> => {
        const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
          expectedRevision: sessionRevision,
          operation,
          ...(payload === undefined ? {} : { payload }),
          type: MessageType.ANNOTATION_FORK_SESSION,
        });
        if (!response?.success) {
          throw new Error('Annotation fork session owner rejected the update');
        }
        if (typeof response.revision === 'number') sessionRevision = response.revision;
        if (response.result === 'stale-document') {
          logger.warn('Rejected an annotation fork update from a stale document');
          return;
        }
        if (response.result === 'stale' && mayRetryRevision) {
          await send(false);
        } else if (response.result === 'stale') {
          logger.warn('Skipped an annotation fork draft update after revision reconciliation');
        }
      };
      await send(true);
    });
  writeChain = write.then(
    () => undefined,
    () => undefined
  );
  return write.catch((error) => {
    logger.warn('Failed to persist annotation fork drafts', error);
  });
}
