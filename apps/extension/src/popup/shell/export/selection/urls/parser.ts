import {
  MAX_PAGE_PACKAGE_URL_SOURCES,
  normalizePagePackageCaptureUrl,
} from '@sniptale/runtime-contracts/page-package';

type ParsedPopupExportUrls = { invalid: string[]; overflowCount: number; urls: string[] };

function splitLine(line: string): string[] {
  const explicitUrl = /^https?:\/\//iu.test(line.trim());
  const delimiter = explicitUrl ? /[;,](?=\s|https?:\/\/|www\.|[^\s,;]+\.[^\s,;]+)/iu : /[;,]/u;
  return line.split(delimiter).flatMap((part) => {
    const tokens = part.trim().split(/\s+/u);
    return tokens.length > 1 && tokens.every((token) => normalizePagePackageCaptureUrl(token))
      ? tokens
      : [part];
  });
}

export function parsePopupExportUrls(text: string): ParsedPopupExportUrls {
  const invalid: string[] = [];
  const urls: string[] = [];
  let overflowCount = 0;
  const retained = new Set<string>();
  const tokens = text
    .split(/\r?\n/u)
    .flatMap(splitLine)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const normalized = normalizePagePackageCaptureUrl(token);
    if (!normalized) {
      invalid.push(token);
      continue;
    }
    if (retained.has(normalized)) continue;
    retained.add(normalized);
    if (urls.length < MAX_PAGE_PACKAGE_URL_SOURCES) urls.push(normalized);
    else overflowCount += 1;
  }
  return { invalid, overflowCount, urls };
}

export function removePopupExportUrl(text: string, url: string): string {
  return parsePopupExportUrls(text)
    .urls.filter((candidate) => candidate !== url)
    .join('\n');
}
