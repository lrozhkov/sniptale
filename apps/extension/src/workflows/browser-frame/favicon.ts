import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';
import { isWindowHeaderFavicon } from '../../features/browser-frame/header';

const MAX_PAGE_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 256 * 1024;

function publicUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      isPrivateNetworkHost(url.hostname)
    )
      return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

async function readBounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || !response.body) throw new Error('Favicon response unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Favicon response too large');
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function fetchPublic(url: URL, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url.href, {
    signal,
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Favicon request failed');
  return response;
}

async function rasterIcon(url: URL, signal: AbortSignal): Promise<string | null> {
  const response = await fetchPublic(url, signal);
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (
    !mime ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(
      mime
    )
  )
    return null;
  const bytes = await readBounded(response, MAX_ICON_BYTES);
  signal.throwIfAborted();
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const image = new Image();
  try {
    image.src = blobUrl;
    await image.decode();
    signal.throwIfAborted();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth > 4096 ||
      image.naturalHeight > 4096
    )
      return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const scale = Math.min(64 / image.naturalWidth, 64 / image.naturalHeight);
    const width = image.naturalWidth * scale,
      height = image.naturalHeight * scale;
    context.drawImage(image, (64 - width) / 2, (64 - height) / 2, width, height);
    const result = canvas.toDataURL('image/png');
    return isWindowHeaderFavicon(result) ? result : null;
  } finally {
    image.src = '';
    URL.revokeObjectURL(blobUrl);
  }
}

/** Explicit opt-in acquisition only. The caller stores the returned raster in its project. */
export async function acquireWindowHeaderFavicon(
  address: string,
  signal: AbortSignal
): Promise<string | null> {
  const url = publicUrl(address.includes('://') ? address.trim() : `https://${address.trim()}`);
  if (!url) return null;
  const timeout = AbortSignal.timeout(10_000);
  const combined = AbortSignal.any([signal, timeout]);
  const candidates: URL[] = [];
  try {
    const response = await fetchPublic(url, combined);
    if (response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
      const html = new TextDecoder().decode(await readBounded(response, MAX_PAGE_BYTES));
      const document = new DOMParser().parseFromString(html, 'text/html');
      for (const link of document.querySelectorAll('link[href]')) {
        const rel = link.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? [];
        if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue;
        const candidate = publicUrl(link.getAttribute('href') ?? '', url.href);
        if (candidate && !candidates.some((item) => item.href === candidate.href))
          candidates.push(candidate);
        if (candidates.length === 4) break;
      }
    } else {
      await response.body?.cancel();
    }
  } catch {
    combined.throwIfAborted();
  }
  const fallback = publicUrl('/favicon.ico', url.href);
  if (fallback) candidates.push(fallback);
  for (const candidate of candidates) {
    try {
      const result = await rasterIcon(candidate, combined);
      if (result) return result;
    } catch {
      combined.throwIfAborted();
    }
  }
  return null;
}
