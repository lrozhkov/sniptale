import type { PageSnapshotSource } from '../../../../parser/page-snapshot/source';

export interface AiPickSourceAdapter {
  acceptsTarget?: (target: HTMLElement) => boolean;
  snapshotSource: PageSnapshotSource;
  targetIframe?: HTMLIFrameElement;
}

export type AiPickSourceResolver = () => AiPickSourceAdapter | null;

export interface AiPickEnableOptions {
  source?: AiPickSourceResolver;
}
