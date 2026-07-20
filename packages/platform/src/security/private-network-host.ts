function parseIpv4Address(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = parseIpv4Address(hostname);
  if (!octets) {
    return false;
  }

  const [first = 0, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseIpv4MappedIpv6(hostname: string): number[] | null {
  if (!hostname.startsWith('::ffff:')) {
    return null;
  }

  const mappedValue = hostname.slice('::ffff:'.length);
  const dottedAddress = parseIpv4Address(mappedValue);
  if (dottedAddress) {
    return dottedAddress;
  }

  const hextets = mappedValue.split(':');
  if (hextets.length !== 2) {
    return null;
  }

  const high = Number.parseInt(hextets[0] ?? '', 16);
  const low = Number.parseInt(hextets[1] ?? '', 16);
  if (![high, low].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff)) {
    return null;
  }

  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '').replace(/\.$/u, '');
}

function parseFirstIpv6Hextet(hostname: string): number | null {
  const [firstHextet = ''] = hostname.split(':', 1);
  if (!firstHextet) {
    return null;
  }

  const value = Number.parseInt(firstHextet, 16);
  return Number.isInteger(value) && value >= 0 && value <= 0xffff ? value : null;
}

function isLocalIpv6(hostname: string): boolean {
  if (hostname === '::' || hostname === '::1') {
    return true;
  }

  const firstHextet = parseFirstIpv6Hextet(hostname);
  return (
    firstHextet !== null &&
    ((firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
      (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
      (firstHextet >= 0xfec0 && firstHextet <= 0xfeff))
  );
}

export function isPrivateNetworkHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  const mappedIpv4 = parseIpv4MappedIpv6(normalized);
  const isIpv6 = normalized.includes(':');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    (isIpv6 && isLocalIpv6(normalized)) ||
    isPrivateIpv4(normalized) ||
    (mappedIpv4 !== null && isPrivateIpv4(mappedIpv4.join('.')))
  );
}
