import { IMAGE_JOB_PORT_NAME, parseImageJobClientMessage } from '../../../contracts/ai/image';
import { resolveLlmSessionSenderKey } from '../llm/session-tokens';
import { registerTextJobPort } from '../llm/text-job-port';
import type { ImageJobService } from './service';

/** Accepts image commands only from the owned editor document, including its embedded mode. */
export function registerImageJobPort(service: ImageJobService): () => void {
  return registerTextJobPort({
    name: IMAGE_JOB_PORT_NAME,
    isSender: (sender): sender is chrome.runtime.MessageSender =>
      sender !== undefined && resolveLlmSessionSenderKey('image-editor', sender) !== null,
    parse: parseImageJobClientMessage,
    connect: (sender, send) => service.connect(sender, send),
  });
}
