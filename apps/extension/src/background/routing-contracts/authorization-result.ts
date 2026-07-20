import type { ProjectExportPreauthorization } from './project-export-preauthorization';
import type { BackgroundOwnedRoutePreauthorization } from './owned-route-context';

export type IpcPreauthorization =
  | BackgroundOwnedRoutePreauthorization
  | ProjectExportPreauthorization;

type AuthorizedIpcMessage = {
  authorized: true;
  preauthorization?: IpcPreauthorization;
};

type RejectedIpcMessage = {
  authorized: false;
  reason: string;
};

export type IpcAuthorizationResult = AuthorizedIpcMessage | RejectedIpcMessage;

export const AUTHORIZED: AuthorizedIpcMessage = { authorized: true };

export function authorize(preauthorization: IpcPreauthorization): AuthorizedIpcMessage {
  return { authorized: true, preauthorization };
}

export function reject(reason: string): RejectedIpcMessage {
  return { authorized: false, reason };
}
