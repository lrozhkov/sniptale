import { runTextRequestPort } from './text-request-port';
import {
  CONTENT_TEXT_PORT_NAME,
  CONTENT_TEXT_TIMEOUT_MS,
  CONTENT_TEXT_KEEPALIVE_MS,
  parseContentTextServerMessage,
  type ContentTextStart,
  type ContentTextServerMessage,
} from '../../contracts/ai/content-text';

/** Runs one explicit content request. Abort and interruption cannot resume the request. */
export function runContentTextJob(start: ContentTextStart, signal: AbortSignal): Promise<string> {
  return runTextRequestPort<ContentTextStart, ContentTextServerMessage, string>({
    name: CONTENT_TEXT_PORT_NAME,
    start,
    signal,
    timeoutMs: CONTENT_TEXT_TIMEOUT_MS,
    keepaliveMs: CONTENT_TEXT_KEEPALIVE_MS,
    cancelMessage: 'Request cancelled',
    parse: parseContentTextServerMessage,
    readResult: (message) => (message.type === 'result' ? message.text : null),
  });
}
