import { readTourPreviewMessage } from '../features/scenario/tour-player/preview-contract';
import { admitSavedScenarioHtml } from '../features/scenario/tour-player/preview-document';

const nonce = location.hash.slice(1);
const expectedOrigin = new URL(location.href).origin;
let url: string | null = null;
let accepted = false;
let active = true;
if (/^[a-f0-9-]{36}$/i.test(nonce)) {
  window.addEventListener('message', async (event: MessageEvent<unknown>) => {
    if (accepted || event.source !== parent || event.origin !== expectedOrigin) return;
    const message = readTourPreviewMessage(event.data, nonce);
    if (!message) return;
    accepted = true;
    const report = (status: 'ready' | 'failed') =>
      parent.postMessage({ kind: 'scenario-preview-status', nonce, status }, expectedOrigin);
    try {
      if (
        message.scriptHash &&
        !(await admitSavedScenarioHtml(message.blob, message.mode, message.scriptHash))
      ) {
        report('failed');
        return;
      }
      if (!active) return;
      url = URL.createObjectURL(message.blob);
      const frame = document.createElement('iframe');
      frame.title = document.title;
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
      frame.allow = 'autoplay';
      frame.addEventListener('load', () => report('ready'), { once: true });
      frame.addEventListener('error', () => report('failed'), { once: true });
      frame.src = url;
      document.body.append(frame);
    } catch {
      report('failed');
    }
  });
}
window.addEventListener('pagehide', () => {
  active = false;
  if (url) URL.revokeObjectURL(url);
});
