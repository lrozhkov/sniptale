import type { translate } from '../../../../platform/i18n';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { getCaptureSource } from '../capture-source';
import type { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import type { notifyRecordingStartFailed } from '../runtime/manager';
import type { requestDesktopMedia, requestDisplayMediaSource } from '../ui/desktop-media';
import type { requestRegionSelection } from '../ui/region-selection';
import type { ensureOffscreenDocumentReady } from './preflight.offscreen';

export type ResolveCaptureSourceDeps = {
  ensureOffscreenDocumentReady: typeof ensureOffscreenDocumentReady;
  getCaptureSource: typeof getCaptureSource;
  localize: typeof translate;
  logger: Pick<Logger, 'debug' | 'warn'>;
  notifyStartFailed: typeof notifyRecordingStartFailed;
  requestDesktopMedia: typeof requestDesktopMedia;
  requestDisplayMediaSource: typeof requestDisplayMediaSource;
  requestRegionSelection: typeof requestRegionSelection;
  sendRuntimeMessage: ReturnType<typeof getBackgroundRuntimeMessaging>['sendRuntimeMessage'];
};
