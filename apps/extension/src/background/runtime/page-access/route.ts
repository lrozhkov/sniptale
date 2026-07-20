import type {
  PageAccessMessage,
  PageAccessResponse,
} from '@sniptale/runtime-contracts/messaging/page-access';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { pageAccessRuntimeContracts } from '../../../contracts/messaging/contracts/runtime/actions/page-access';
import { respondAsyncRoute } from '../../routing-contracts/response';
import { handlePageAccessMessage } from './service';

function parsePageAccessMessage(message: unknown): PageAccessMessage | null {
  try {
    return pageAccessRuntimeContracts.parseRequest(message);
  } catch {
    return null;
  }
}

export function routePageAccessMessage(
  message: unknown,
  sendResponse: ResponseSender<PageAccessResponse>
): boolean {
  const parsedMessage = parsePageAccessMessage(message);
  if (!parsedMessage) {
    return false;
  }

  respondAsyncRoute(handlePageAccessMessage(parsedMessage), sendResponse);
  return true;
}
