export function decodeEffectV1EmbeddedAsset(asset: {
  dataUrl?: unknown;
  svgText?: unknown;
}): Uint8Array {
  if (typeof asset.svgText === 'string') {
    return new TextEncoder().encode(asset.svgText);
  }
  const value = String(asset.dataUrl ?? '');
  const separator = value.indexOf(',');
  if (separator < 0 || !/;base64$/i.test(value.slice(0, separator))) {
    throw new Error('Expected a base64 data URL.');
  }
  const binary = atob(value.slice(separator + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256EffectV1Bytes(bytes: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function assertEffectV1AssetSignature(
  bytes: Uint8Array,
  mimeType: unknown,
  assetId: unknown
): void {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  const matches =
    mimeType === 'image/png'
      ? bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 3) === 'PNG'
      : mimeType === 'image/jpeg'
        ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : mimeType === 'image/webp'
          ? ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
          : mimeType === 'image/svg+xml'
            ? hasSvgRoot(new TextDecoder().decode(bytes.subarray(0, 1024)))
            : mimeType === 'video/mp4'
              ? ascii(4, 4) === 'ftyp'
              : mimeType === 'video/webm'
                ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
                : mimeType === 'audio/ogg'
                  ? ascii(0, 4) === 'OggS'
                  : mimeType === 'audio/wav'
                    ? ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE'
                    : mimeType === 'audio/mpeg'
                      ? ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
                      : false;
  if (!matches) {
    throw new Error(`Asset "${String(assetId)}" content does not match ${String(mimeType)}.`);
  }
}

function hasSvgRoot(value: string): boolean {
  let candidate = value.trimStart();
  if (candidate.slice(0, 5).toLowerCase() === '<?xml') {
    const declarationEnd = candidate.indexOf('>');
    if (declarationEnd === -1) return false;
    candidate = candidate.slice(declarationEnd + 1).trimStart();
  }
  if (candidate.slice(0, 4).toLowerCase() !== '<svg') return false;
  const boundary = candidate[4];
  return (
    boundary === '>' ||
    boundary === ' ' ||
    boundary === '\n' ||
    boundary === '\r' ||
    boundary === '\t'
  );
}
