import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { disableSelectionModeCursor, enableSelectionModeCursor } from '../../interaction/cursor';
import {
  disableSelectionModeApi,
  enableSelectionModeApi,
  isSelectionModeActiveApi,
} from '../../public-api';
import type { SelectionModePublicApiArgs } from './types';

export function createSelectionModePublicApi(args: SelectionModePublicApiArgs) {
  return {
    enableSelectionMode: (): Promise<CaptureArea> =>
      enableSelectionModeApi({
        cleanup: args.cleanup,
        createHoverElements: () => args.uiRuntime.createHoverElements(),
        createOverlayContainer: () => args.uiRuntime.createOverlayContainer(),
        enableCursor: () => enableSelectionModeCursor(args.session),
        prepareUi: () => args.uiRuntime.prepare(),
        session: args.session,
        setupEventListeners: args.setupRuntimeListeners,
      }),
    disableSelectionMode: (): void =>
      disableSelectionModeApi({
        cleanup: args.cleanup,
        session: args.session,
      }),
    isSelectionModeActive: (): boolean => isSelectionModeActiveApi(args.session.isActive),
    disableCursor: (): void => disableSelectionModeCursor(args.session),
  };
}
