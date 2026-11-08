import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';
import { ensurePublicHttpsHeadGuard } from './https-redirect-guard';

function validatePublicHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    isPrivateNetworkHost(url.hostname)
  )
    throw new Error('Unsupported HTTPS redirect destination');
  url.hash = '';
  return url;
}

/** Resolve a canonical URL without downloading a body. Offscreen injects background guard readiness. */
export async function resolvePublicHttpsRedirect(
  address: URL,
  signal: AbortSignal,
  ensureGuardInstalled: () => Promise<void> = ensurePublicHttpsHeadGuard
): Promise<URL> {
  const target = validatePublicHttpsUrl(address.href);
  signal.throwIfAborted();
  await ensureGuardInstalled();
  signal.throwIfAborted();
  const response = await fetch(target.href, {
    method: 'HEAD',
    credentials: 'omit',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    signal,
  });
  await response.body?.cancel();
  signal.throwIfAborted();
  if (!response.ok || !response.url) throw new Error('HTTPS redirect resolution failed');
  const canonical = validatePublicHttpsUrl(response.url);
  return canonical;
}
