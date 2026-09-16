import { readTourPreviewMessage } from '../features/scenario/tour-player/preview-contract';

const nonce = location.hash.slice(1);
const expectedOrigin = new URL(location.href).origin;
let url: string | null = null;
let accepted = false;
if (/^[a-f0-9-]{36}$/i.test(nonce)) {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (accepted || event.source !== parent || event.origin !== expectedOrigin) return;
    const message = readTourPreviewMessage(event.data, nonce);
    if (!message) return;
    accepted = true;
    url = URL.createObjectURL(message.blob);
    const frame = document.createElement('iframe');
    frame.title = document.title;
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    frame.allow = 'autoplay';
    frame.src = url;
    document.body.append(frame);
  });
}
window.addEventListener('pagehide', () => {
  if (url) URL.revokeObjectURL(url);
});
