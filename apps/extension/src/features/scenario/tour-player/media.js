/** Decode one current image without network APIs or a retained whole-tour decoded cache. */
export function waitForTourImage(source, signal) {
  if (!source) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    let finished = false;
    const timeout = setTimeout(() => finish(new Error('Tour image load timed out.')), 15000);
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    }
    function abort() {
      finish(new DOMException('Aborted', 'AbortError'));
      image.src = '';
    }
    image.onerror = () => finish(new Error('Tour image could not be decoded.'));
    image.onload = () => {
      if (image.decode) image.decode().then(() => finish(), finish);
      else finish();
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else image.src = source;
  });
}
