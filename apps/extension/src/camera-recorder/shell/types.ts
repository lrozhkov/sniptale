import type {
  RuntimeMessageType,
  RuntimeRequestByType,
} from '../../contracts/messaging/contracts/runtime-message';

export type ControlCapability = {
  controlToken: string;
  recordingId: string;
};

export type CameraRecorderRouteState = {
  launchToken: string;
  recordingId: string;
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
