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
        enableCursor: () => enableSelectionModeCursor(args.state),
        getIsActive: args.getIsActive,
        prepareUi: () => args.uiRuntime.prepare(),
        setCurrentState: args.setCurrentState,
        setIsActive: args.setIsActive,
        setRejectCallback: args.setRejectCallback,
        setResolveCallback: args.setResolveCallback,
        setupEventListeners: args.setupRuntimeListeners,
      }),
    disableSelectionMode: (): void =>
      disableSelectionModeApi({
        cleanup: args.cleanup,
        getRejectCallback: args.getRejectCallback,
        setAspectRatio: args.setAspectRatio,
        setCurrentSelection: args.setCurrentSelection,
        setCurrentState: args.setCurrentState,
        setIsActive: args.setIsActive,
        setMaintainAspectRatio: args.setMaintainAspectRatio,
        setRejectCallback: args.setRejectCallback,
        setResolveCallback: args.setResolveCallback,
      }),
    isSelectionModeActive: (): boolean => isSelectionModeActiveApi(args.getIsActive()),
    disableCursor: (): void => disableSelectionModeCursor(args.state),
  };
}
