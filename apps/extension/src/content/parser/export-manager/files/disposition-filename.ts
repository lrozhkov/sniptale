const RFC2047_WORD_PATTERN = /=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g;

export function decodeContentDispositionFilenameValue(value: string): string | null {
  const normalizedValue = value.trim().replace(/^["']|["']$/g, '');
  if (normalizedValue.length === 0) {
    return null;
  }

  const rfc5987Match = normalizedValue.match(/^([^']*)''(.+)$/);
  if (rfc5987Match?.[2]) {
    try {
      return decodeURIComponent(rfc5987Match[2]);
    } catch {
      return rfc5987Match[2];
    }
  }

  if (normalizedValue.includes('=?')) {
    const decodedEncodedWords = decodeRfc2047EncodedWords(normalizedValue);
    if (decodedEncodedWords) {
      return decodedEncodedWords;
    }
  }

  try {
    return decodeURIComponent(normalizedValue);
  } catch {
    return normalizedValue;
  }
}

function decodeRfc2047EncodedWords(value: string): string | null {
  let matchedAnyWord = false;
  const decoded = value.replace(RFC2047_WORD_PATTERN, (...matchArgs: string[]) => {
    const charset = matchArgs[1] ?? '';
    const encoding = matchArgs[2] ?? '';
    const encodedText = matchArgs[3] ?? '';
    const decodedWord = decodeRfc2047Word(charset, encoding, encodedText);

    matchedAnyWord = matchedAnyWord || decodedWord !== null;
    return decodedWord ?? encodedText;
  });

  return matchedAnyWord ? decoded : null;
}

function decodeRfc2047Word(charset: string, encoding: string, encodedText: string): string | null {
  try {
    const bytes =
      encoding.toUpperCase() === 'B'
        ? Uint8Array.from(atob(encodedText), (char) => char.charCodeAt(0))
        : decodeRfc2047QuotedPrintable(encodedText);

    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return null;
  }
}

function decodeRfc2047QuotedPrintable(encodedText: string): Uint8Array {
  const bytes: number[] = [];
  const normalizedText = encodedText.replace(/_/g, ' ');

  for (let index = 0; index < normalizedText.length; index += 1) {
    const currentChar = normalizedText[index];

    if (currentChar === '=' && /[A-Fa-f0-9]{2}/.test(normalizedText.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(normalizedText.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    bytes.push(currentChar?.charCodeAt(0) ?? 0);
  }

  return Uint8Array.from(bytes);
}
