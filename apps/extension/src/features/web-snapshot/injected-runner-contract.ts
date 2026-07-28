import type * as ContentActionContract from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { FullPageExportCaptureAction } from '../../contracts/full-page-capture';

export const WEB_SNAPSHOT_INJECTED_RUNNER_PATH = 'assets/webSnapshotInjectedRunner.js';
export const INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY = '__sniptaleWebSnapshotInjectedRunnerState';

export type InjectedWebSnapshotSaveRequest = {
  allowAnonymousCrossOriginAssets: boolean;
  allowAuthenticatedSameOriginAssets: boolean;
  contentIntentGrant?: ContentActionContract.ContentPrivilegedActionAutoStartGrant;
  fullPageCaptureAction?: FullPageExportCaptureAction;
  requestId: string;
};

export type InjectedWebSnapshotRunnerState = {
  request: InjectedWebSnapshotSaveRequest;
  result?: Promise<unknown> | unknown;
};
