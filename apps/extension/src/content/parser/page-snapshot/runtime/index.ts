import {
  waitForAccessibleIframeReady,
  type AccessibleIframeReadyResult,
} from '../../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import { buildVirtualDomSnapshot } from '../../dom-tree-parser/traversal';
import { resolvePageProfile } from '../../page-profile';
import { extractSchemaTextHint, extractSnapshotPayloads } from '../payloads';
import { resolvePreferredRoot } from '../root-selection';
import { resolvePageSnapshotSource, type PageSnapshotSource } from '../source';
import type { CapturedPageSnapshot } from '../types';
import { normalizeGenericVirtualDom } from './normalize-virtual-dom';

const logger = createLogger({ namespace: 'ContentPageSnapshot' });

function buildTracedPayloads(
  payloads: ReturnType<typeof extractSnapshotPayloads>,
  schemaTextHint: string | undefined
) {
  return payloads.map((payload) => ({
    ...payload,
    schemaTextHint: schemaTextHint !== undefined && payload.kind === 'json-ld',
  }));
}

function logSnapshotCompleted(props: {
  contextLabel: string;
  iframeReadiness: AccessibleIframeReadyResult;
  pipelineId: string;
  selectedRoot?: string;
}): void {
  logger.debug('Snapshot preflight completed', {
    contextLabel: props.contextLabel,
    pipelineId: props.pipelineId,
    timedOut: props.iframeReadiness.timedOut,
    totalIframes: props.iframeReadiness.totalIframes,
    pendingIframes: props.iframeReadiness.pendingIframes.length,
    selectedRoot: props.selectedRoot ?? 'none',
  });
}

function createCapturedPageSnapshot(args: {
  iframeReadiness: AccessibleIframeReadyResult;
  preferredRoot: ReturnType<typeof resolvePreferredRoot>;
  profileResult: ReturnType<typeof resolvePageProfile>;
  schemaTextHint: string | undefined;
  snapshotSource: ReturnType<typeof resolvePageSnapshotSource>;
  tracedPayloads: ReturnType<typeof buildTracedPayloads>;
  virtualDomSnapshot: ReturnType<typeof buildVirtualDomSnapshot>;
  virtualRoot: ReturnType<typeof normalizeGenericVirtualDom>;
}): CapturedPageSnapshot {
  return {
    iframeReadiness: args.iframeReadiness,
    liveRoot: args.snapshotSource.root,
    virtualRoot: args.virtualRoot,
    pageUrl: args.snapshotSource.pageUrl,
    pageTitle: args.snapshotSource.pageTitle,
    pageHostname: args.snapshotSource.pageHostname,
    payloads: args.tracedPayloads,
    pageProfile: args.profileResult.profile,
    profileTrace: args.profileResult.matchedSignals,
    rootCandidates: args.preferredRoot.candidateSelectors,
    rootSelectionTrace: args.preferredRoot.trace,
    ...(typeof args.virtualDomSnapshot.resolveOriginalElement === 'undefined'
      ? {}
      : { resolveOriginalElement: args.virtualDomSnapshot.resolveOriginalElement }),
    ...(typeof args.schemaTextHint === 'undefined' ? {} : { schemaTextHint: args.schemaTextHint }),
    ...(typeof args.preferredRoot.element === 'undefined'
      ? {}
      : { preferredRoot: args.preferredRoot.element }),
  };
}

export async function buildPageSnapshot(
  contextLabel: string,
  source?: PageSnapshotSource
): Promise<CapturedPageSnapshot> {
  logger.debug('Snapshot preflight started', { contextLabel });
  const snapshotSource = resolvePageSnapshotSource(source);
  const iframeReadiness: AccessibleIframeReadyResult = await waitForAccessibleIframeReady({
    contextLabel,
    rootDocument: snapshotSource.document,
  });

  const profileResult = resolvePageProfile(snapshotSource.document, {
    pageUrl: snapshotSource.pageUrl,
  });
  const virtualDomSnapshot = buildVirtualDomSnapshot({
    documentRoot: snapshotSource.document,
    root: snapshotSource.root,
  });
  const virtualRoot = normalizeGenericVirtualDom(virtualDomSnapshot.root, profileResult.profile);
  const payloads = extractSnapshotPayloads(snapshotSource.document);
  const schemaTextHint = extractSchemaTextHint(snapshotSource.document);
  const tracedPayloads = buildTracedPayloads(payloads, schemaTextHint);
  const preferredRoot = resolvePreferredRoot(profileResult.profile, {
    liveRoot: snapshotSource.document,
    virtualRoot,
    ...(schemaTextHint === undefined ? {} : { schemaTextHint }),
  });

  logSnapshotCompleted({
    contextLabel,
    iframeReadiness,
    pipelineId: profileResult.profile.pipelineId,
    ...(preferredRoot.selector === undefined ? {} : { selectedRoot: preferredRoot.selector }),
  });

  return createCapturedPageSnapshot({
    iframeReadiness,
    preferredRoot,
    profileResult,
    schemaTextHint,
    snapshotSource,
    tracedPayloads,
    virtualDomSnapshot,
    virtualRoot,
  });
}
