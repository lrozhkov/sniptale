export type AIProviderBaseUrlPolicyResult =
  | 'allowed'
  | 'embedded-credentials-not-allowed'
  | 'https-required'
  | 'invalid-url'
  | 'query-or-fragment-not-allowed';

function isLoopbackHost(hostname: string): boolean {
  const isNumericSegment = (segment: string) =>
    segment.length > 0 &&
    Array.from(segment).every((character) => character >= '0' && character <= '9');
  const ipv4Segments = hostname.split('.');
  const isIpv4Loopback =
    ipv4Segments.length === 4 &&
    ipv4Segments[0] === '127' &&
    ipv4Segments.every(
      (segment) => isNumericSegment(segment) && Number(segment) >= 0 && Number(segment) <= 255
    );

  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    isIpv4Loopback
  );
}

export function resolveAIProviderBaseUrlPolicy(url: string): AIProviderBaseUrlPolicyResult {
  try {
    const parsed = new URL(url);

    if (parsed.username || parsed.password) {
      return 'embedded-credentials-not-allowed';
    }

    if (parsed.search || parsed.hash) {
      return 'query-or-fragment-not-allowed';
    }

    if (parsed.protocol === 'https:') {
      return 'allowed';
    }

    return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)
      ? 'allowed'
      : 'https-required';
  } catch {
    return 'invalid-url';
  }
}

export function isAllowedAIProviderBaseUrl(url: string): boolean {
  return resolveAIProviderBaseUrlPolicy(url) === 'allowed';
}

export function resolveAIProviderCanonicalOrigin(url: string): string | null {
  if (!isAllowedAIProviderBaseUrl(url)) {
    return null;
  }

  return new URL(url).origin;
}

export function resolveAIProviderChatCompletionsUrl(baseUrl: string): string | null {
  if (!isAllowedAIProviderBaseUrl(baseUrl)) {
    return null;
  }

  const parsed = new URL(baseUrl);
  const basePath = parsed.pathname.replace(/\/+$/u, '');
  parsed.pathname = `${basePath}/chat/completions`;
  return parsed.toString();
}
