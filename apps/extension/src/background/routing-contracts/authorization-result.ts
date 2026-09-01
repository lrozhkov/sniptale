import type { ProjectExportPreauthorization } from './project-export-preauthorization';
import type { BackgroundOwnedRoutePreauthorization } from './owned-route-context';
import type { PreauthorizedContentActionBinding } from './capabilities/content-action/route';

type PrivilegedTabRoutePreauthorization = {
  readonly kind: 'privileged-tab-route';
  readonly senderBinding: PreauthorizedContentActionBinding;
};

type IpcPreauthorization =
  | BackgroundOwnedRoutePreauthorization
  | PrivilegedTabRoutePreauthorization
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
