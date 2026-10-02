/** Product file categories share one template unless a category overrides it. */
export const FILENAME_CATEGORIES = [
  'images',
  'recordings',
  'documents',
  'archives',
  'resources',
] as const;
type FilenameCategory = (typeof FILENAME_CATEGORIES)[number];
export type FilenameRules = { template: string } & Partial<Record<FilenameCategory, string>>;
export const DEFAULT_FILENAME_TEMPLATE = 'Sniptale_{type}_{date}_{time}';
export const FILENAME_TOKENS = ['type', 'date', 'time', 'title', 'index'] as const;
const MAX_TEMPLATE_LENGTH = 200;
const MAX_FILENAME_BYTES = 200;
const encoder = new TextEncoder();

/** Empty values intentionally select the built-in rule or category inheritance. */
export function isValidFilenameTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_TEMPLATE_LENGTH) return false;
  const remainder = value.replace(/\{(type|date|time|title|index)\}/g, '');
  return !/[{}]/u.test(remainder);
}

/** Strict settings/import boundary; corrupt stored rules never execute expressions. */
export function parseFilenameRules(value: unknown): FilenameRules | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!('template' in value) || !isValidFilenameTemplate(value.template)) return null;
  const rules: FilenameRules = { template: value.template };
  for (const category of FILENAME_CATEGORIES) {
    if (!(category in value)) continue;
    const candidate: unknown = Reflect.get(value, category);
    if (!isValidFilenameTemplate(candidate)) return null;
    rules[category] = candidate;
  }
  return rules;
}

/** Frozen operation inputs. The pure resolver never reads clocks, randomness or storage. */
export interface FilenameContext {
  timestamp: number;
  timezoneOffset: number;
  operationId: string;
}
export interface FilenameRequest {
  category: FilenameCategory;
  type: string;
  extension: string;
  title?: string | undefined;
  index?: number | undefined;
  /** Related tracks retain a semantic suffix even when a template omits the index. */
  suffix?: string | undefined;
}

function truncateUtf8(value: string, budget: number): string {
  let result = '';
  let used = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (used + size > budget) break;
    result += character;
    used += size;
  }
  return result;
}

function cleanStem(value: string): string {
  const cleaned = Array.from(value.normalize('NFC'))
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return (
        code > 31 &&
        !(code >= 127 && code <= 159) &&
        !(code >= 0x202a && code <= 0x202e) &&
        !(code >= 0x2066 && code <= 0x2069)
      );
    })
    .join('')
    .replace(/[<>:"/\\|?*]/gu, '_')
    .trim()
    .replace(/[. ]+$/u, '');
  if (!cleaned || /^[._ ]+$/u.test(cleaned)) return '';
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(cleaned)
    ? `_${cleaned}`
    : cleaned;
}

/** Manual HTML renames retain the extension and the product's safe UTF-8 leaf-name policy. */
export function normalizeHtmlExportFilename(value: string, fallback: string): string {
  const stem = cleanStem(value.trim().replace(/\.html$/iu, ''));
  const previous = cleanStem(fallback.trim().replace(/\.html$/iu, ''));
  return `${cleanStem(truncateUtf8(stem || previous || 'export', MAX_FILENAME_BYTES - 5))}.html`;
}

function getTimestamp(value: number): number {
  return Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? value : 0;
}

/** Resolves one safe leaf filename, preserving the format owner's complete extension. */
export function resolveFilename(
  rules: unknown,
  request: FilenameRequest,
  context: FilenameContext
): { filename: string; fallback: boolean } {
  const rawExtension = request.extension === 'jpeg' ? 'jpg' : request.extension.replace(/^\./u, '');
  const extension =
    rawExtension.length <= 48 &&
    rawExtension.split(/[.-]/u).every((part) => /^[a-z0-9]+$/iu.test(part))
      ? rawExtension
      : 'bin';
  const timestamp = getTimestamp(context.timestamp);
  const offset =
    Number.isFinite(context.timezoneOffset) && Math.abs(context.timezoneOffset) <= 1440
      ? context.timezoneOffset
      : 0;
  const date = new Date(getTimestamp(timestamp - offset * 60_000)).toISOString();
  const index = Number.isSafeInteger(request.index) && request.index! > 0 ? request.index! : 1;
  const values = {
    type: truncateUtf8(cleanStem(request.type), 32) || 'file',
    date: date.slice(0, 10),
    time: date.slice(11, 23).replace(/[:.]/gu, '-'),
    title: request.title?.trim() ?? '',
    index: String(index),
  };
  const parsed = rules === undefined ? { template: '' } : parseFilenameRules(rules);
  const template = parsed
    ? parsed[request.category]?.trim() || parsed.template.trim() || DEFAULT_FILENAME_TEMPLATE
    : '';
  let applicable = Boolean(template);
  const rendered = template.replace(
    /\{(type|date|time|title|index)\}/g,
    (_match, token: keyof typeof values) => {
      if (!values[token]) applicable = false;
      return values[token];
    }
  );
  const suffix = request.suffix ? cleanStem(request.suffix) : '';
  const tail = `${suffix ? `_${truncateUtf8(suffix, 48)}` : ''}.${extension}`;
  const budget = MAX_FILENAME_BYTES - encoder.encode(tail).length;
  const candidate = cleanStem(truncateUtf8(cleanStem(rendered), budget));
  if (applicable && candidate) return { filename: `${candidate}${tail}`, fallback: false };
  const utc = new Date(timestamp).toISOString().replace(/[:.]/gu, '-');
  const identity = truncateUtf8(cleanStem(context.operationId) || 'operation', 32);
  const base = `Sniptale_${values.type}_${utc}_${identity}_${index}`;
  return {
    filename: `${cleanStem(truncateUtf8(base, budget)) || 'Sniptale_file'}${tail}`,
    fallback: true,
  };
}
