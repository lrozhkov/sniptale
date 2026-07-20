import type { ScenarioRuntimeCapturePayload } from '../../../../contracts/messaging/contracts/types';
import type { CaptureResponse } from '../../../../contracts/messaging/contracts/response-types';
import type { ScenarioCaptureSurface } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { PendingPointerCapture } from './metadata';

export type PendingReplayClick = {
  clientPoint: ScenarioPoint;
  modifiers: Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'button' | 'detail'>;
  target: HTMLElement;
};

export type ScenarioAutoClickListenerHandlers = {
  clickReplayHandler: (event: MouseEvent) => void;
  keyboardCaptureHandler: (event: KeyboardEvent, iframe?: HTMLIFrameElement) => void;
  pointerDownHandler: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
  pointerMoveHandler: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
  pointerUpHandler: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
};

export type BuildScenarioCapturePayload = (
  captureSurface: ScenarioCaptureSurface,
  sourceKind: 'manual' | 'auto-click',
  target?: HTMLElement | null,
  interactionPoint?: ScenarioPoint | null,
  cursorPoint?: ScenarioPoint | null,
  captureMetadata?: ScenarioCaptureMetadata
) => ScenarioRuntimeCapturePayload | null;

export type ScenarioAutoClickCaptureTransport = (
  payload: ScenarioRuntimeCapturePayload,
  options?: { contentIntentSource?: ContentPrivilegedActionIntentSource | undefined }
) => Promise<CaptureResponse>;

export type ScenarioAutoClickListenerRegistry = (
  args: ScenarioAutoClickListenerHandlers
) => () => void;

export type ScenarioAutoClickRefs = {
  blockedRef: { current: boolean };
  buildCapturePayloadRef: { current: BuildScenarioCapturePayload };
  captureTransportRef: { current: ScenarioAutoClickCaptureTransport };
  clickCapturePromiseRef: { current: Promise<boolean> | null };
  pendingPointerCaptureRef: { current: PendingPointerCapture | null };
  pendingReplayClickRef: { current: PendingReplayClick | null };
  refreshSessionRef: { current: () => Promise<void> };
  replayingClickRef: { current: boolean };
  sessionRef: { current: ScenarioSessionState };
  setIsCompletelyHiddenRef: { current: (hidden: boolean) => void };
};
