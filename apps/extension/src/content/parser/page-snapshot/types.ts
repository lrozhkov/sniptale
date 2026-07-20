import type { AccessibleIframeReadyResult } from '../../platform/frame';
import type { PageProfile, RootSelectionTrace } from '@sniptale/runtime-contracts/dom-tree';

type SnapshotOriginalElementResolver = (virtualElement: Node) => Node | null;

export interface SnapshotPayloadBlob {
  id: string;
  kind: 'json' | 'json-ld' | 'script';
  locator: string;
  source: 'script-tag';
  schemaTextHint?: boolean;
  textLength: number;
}

export interface CapturedPageSnapshot {
  iframeReadiness: AccessibleIframeReadyResult;
  liveRoot: HTMLElement;
  virtualRoot: HTMLElement;
  resolveOriginalElement?: SnapshotOriginalElementResolver;
  pageUrl: string;
  pageTitle: string;
  pageHostname: string;
  payloads: SnapshotPayloadBlob[];
  schemaTextHint?: string;
  pageProfile: PageProfile;
  profileTrace: PageProfile['matchedSignals'];
  rootCandidates: string[];
  preferredRoot?: HTMLElement;
  rootSelectionTrace: RootSelectionTrace;
}
