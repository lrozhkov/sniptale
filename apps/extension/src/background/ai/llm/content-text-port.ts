import { registerTextJobPort } from './text-job-port';
import {
  CONTENT_TEXT_PORT_NAME,
  parseContentTextClientMessage,
} from '../../../contracts/ai/content-text';
import { isContentTextSender } from './authorization/content-text';
import type { ContentTextJobService } from './content-text-job';

/** Each admitted Port owns one parsed request and cancels it on malformed input or disconnect. */
export function registerContentTextPorts(service: ContentTextJobService): () => void {
  return registerTextJobPort({
    name: CONTENT_TEXT_PORT_NAME,
    isSender: isContentTextSender,
    parse: parseContentTextClientMessage,
    connect: (sender, send) => service.connect(sender, send),
  });
}
