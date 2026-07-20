import {
  authorizeRegisteredIPCMessage,
  authorizeRegisteredProjectExportRuntimeMessage,
  type IpcAuthorizationRequest,
} from './policy-registry';
import type { IpcAuthorizationResult } from '../../../routing-contracts/authorization-result';

export const authorizeProjectExportRuntimeMessage = authorizeRegisteredProjectExportRuntimeMessage;

export function authorizeIPCMessage(request: IpcAuthorizationRequest): IpcAuthorizationResult {
  return authorizeRegisteredIPCMessage(request);
}
