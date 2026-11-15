import type {
  RuntimeMessageType,
  RuntimeRequestByType,
} from '../../contracts/messaging/contracts/runtime-message';
import type { VideoRecordingInterruptionReason } from '@sniptale/runtime-contracts/video/types/types';

export type ControlCapability = {
  controlToken: string;
  recordingId: string;
};

export type CameraRecorderRouteState = {
  failureReason?: VideoRecordingInterruptionReason;
  draft?: boolean;
  teleprompter?: boolean;
  registrationToken: string | null;
  recordingId: string | null;
  routeError: string | null;
};

export type DeviceLabelMap = {
  microphones: Map<string, string>;
  webcams: Map<string, string>;
};

export type RuntimeControlMessage = RuntimeRequestByType[RuntimeMessageType];

export type RuntimeResponseFailure = {
  error?: string | undefined;
  success?: boolean | undefined;
};
