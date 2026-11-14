import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { getIconData } from '@iconify/utils/lib/icon-set/get-icon';
import { iconToSVG } from '@iconify/utils/lib/svg/build';
import { prepareEditorVectorDefinition } from './prepare';

type IconifyData = Parameters<typeof getIconData>[0];
type Icon = IconifyData['icons'][string];
type Alias = NonNullable<IconifyData['aliases']>[string];
type Properties = Omit<Icon, 'body'> & { hidden?: boolean };
type IssueCode = 'invalid-collection' | 'budget-exceeded' | 'invalid-alias' | 'missing-icon';

const NAME = /^[a-z0-9-]+$/u;
const MAX_NAMES = 20000;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_BODY = 2 * 1024 * 1024;

/** Import failures contain fixed codes, never imported markup or server error bodies. */
class EditorIconifyImportError extends Error {
  constructor(public readonly code: IssueCode) {
    super(`Iconify import refused: ${code}.`);
    this.name = 'EditorIconifyImportError';
  }
}

interface EditorIconifySet {
  readonly data: IconifyData;
  readonly name: string;
  readonly author: string | null;
  readonly authorUrl: string | null;
  readonly license: string | null;
  readonly licenseUrl: string | null;
  readonly names: readonly string[];
  readonly categories: Readonly<Record<string, readonly string[]>>;
  readonly issues: readonly { name: string; code: IssueCode }[];
}

function refuse(code: IssueCode): never {
  throw new EditorIconifyImportError(code);
}

function validName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 128 &&
    NAME.test(value) &&
    !value.startsWith('-') &&
    !value.endsWith('-') &&
    !value.includes('--')
  );
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 2048) refuse('invalid-collection');
  for (let index = 0; index < value.length; index++)
    if (value.charCodeAt(index) < 32) refuse('invalid-collection');
  return value;
}

function properties(value: Record<string, unknown>): Properties {
  const result: Properties = {};
  for (const key of ['width', 'height', 'left', 'top', 'rotate'] as const) {
    const number = value[key];
    if (number === undefined) continue;
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      Math.abs(number) > 131072 ||
      ((key === 'width' || key === 'height') && number <= 0) ||
      (key === 'rotate' && !Number.isInteger(number))
    )
      refuse('invalid-collection');
    result[key] = key === 'rotate' ? number % 4 : number;
  }
  for (const key of ['hFlip', 'vFlip', 'hidden'] as const) {
    const boolean = value[key];
    if (boolean === undefined) continue;
    if (typeof boolean !== 'boolean') refuse('invalid-collection');
    result[key] = boolean;
  }
  return result;
}

function resolve(set: IconifyData, name: string): NonNullable<ReturnType<typeof getIconData>> {
  if (!validName(name)) refuse('missing-icon');
  const visited = new Set<string>();
  let current = name;
  while (!Object.hasOwn(set.icons, current)) {
    if (visited.has(current) || visited.size >= 40) refuse('invalid-alias');
    visited.add(current);
    const alias =
      set.aliases && Object.hasOwn(set.aliases, current) ? set.aliases[current] : undefined;
    if (!alias) refuse(current === name ? 'missing-icon' : 'invalid-alias');
    current = alias.parent;
  }
  const icon = getIconData(set, name);
  if (!icon) refuse('missing-icon');
  return icon;
}

interface IconifyEnvelope {
  root: Record<string, unknown>;
  prefix: string;
  icons: Array<[string, unknown]>;
  aliases: Array<[string, unknown]>;
}

type ImportIssue = { name: string; code: IssueCode };

function admitIconifyEnvelope(input: unknown): IconifyEnvelope {
  if (!isRecord(input) || !validName(input['prefix']) || !isRecord(input['icons']))
    refuse('invalid-collection');
  let bytes: number;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(input)).length;
  } catch {
    return refuse('invalid-collection');
  }
  if (bytes > MAX_BYTES) refuse('budget-exceeded');
  const icons = Object.entries(input['icons']);
  const aliases =
    input['aliases'] === undefined
      ? []
      : isRecord(input['aliases'])
        ? Object.entries(input['aliases'])
        : refuse('invalid-collection');
  if (icons.length + aliases.length > MAX_NAMES) refuse('budget-exceeded');
  return { root: input, prefix: input['prefix'], icons, aliases };
}

function parseIconRows(
  rows: Array<[string, unknown]>,
  issues: ImportIssue[]
): Record<string, Icon> {
  const icons: Record<string, Icon> = {};
  // Iconify resolution uses property lookup. Imported names must not resolve Object.prototype.
  Object.setPrototypeOf(icons, null);
  for (const [name, raw] of rows) {
    try {
      if (!validName(name) || !isRecord(raw) || typeof raw['body'] !== 'string')
        refuse('invalid-collection');
      if (new TextEncoder().encode(raw['body']).length > MAX_BODY) refuse('budget-exceeded');
      icons[name] = Object.freeze({ ...properties(raw), body: raw['body'] });
    } catch (error) {
      if (!(error instanceof EditorIconifyImportError)) throw error;
      issues.push({ name, code: error.code });
    }
  }
  return icons;
}

function parseAliasRows(
  rows: Array<[string, unknown]>,
  icons: Record<string, Icon>,
  issues: ImportIssue[]
): Record<string, Alias> {
  const aliases: Record<string, Alias> = {};
  Object.setPrototypeOf(aliases, null);
  for (const [name, raw] of rows) {
    try {
      if (
        !validName(name) ||
        Object.hasOwn(icons, name) ||
        !isRecord(raw) ||
        !validName(raw['parent'])
      )
        refuse('invalid-alias');
      aliases[name] = Object.freeze({ ...properties(raw), parent: raw['parent'] });
    } catch (error) {
      if (!(error instanceof EditorIconifyImportError)) throw error;
      issues.push({ name, code: error.code });
    }
  }
  return aliases;
}

function collectVisibleNames(data: IconifyData, issues: ImportIssue[]): string[] {
  const names: string[] = [];
  for (const name of [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})]) {
    try {
      if (!resolve(data, name).hidden) names.push(name);
    } catch (error) {
      if (!(error instanceof EditorIconifyImportError)) throw error;
      issues.push({ name, code: error.code });
    }
  }
  return names;
}

function projectCategories(
  rawCategories: unknown,
  names: readonly string[]
): Readonly<Record<string, readonly string[]>> {
  const categories: Record<string, readonly string[]> = {};
  Object.setPrototypeOf(categories, null);
  const visible = new Set(names);
  if (rawCategories !== undefined) {
    if (!isRecord(rawCategories) || Object.keys(rawCategories).length > 256)
      refuse('invalid-collection');
    let references = 0;
    for (const [name, entries] of Object.entries(rawCategories)) {
      if (!name || name.length > 256 || !Array.isArray(entries)) refuse('invalid-collection');
      references += entries.length;
      if (references > 100000) refuse('budget-exceeded');
      categories[name] = Object.freeze([
        ...new Set(
          entries.filter(
            (entry): entry is string => typeof entry === 'string' && visible.has(entry)
          )
        ),
      ]);
    }
  }
  return Object.freeze(categories);
}

function projectAttribution(
  value: unknown,
  prefix: string
): Pick<EditorIconifySet, 'name' | 'author' | 'authorUrl' | 'license' | 'licenseUrl'> {
  const info = isRecord(value) ? value : {};
  const author = isRecord(info['author']) ? info['author'] : {};
  const license = isRecord(info['license']) ? info['license'] : {};
  return {
    name: text(info['name']) ?? prefix,
    author: text(author['name']),
    authorUrl: text(author['url']),
    license: text(license['title']) ?? text(license['spdx']),
    licenseUrl: text(license['url']),
  };
}

/** Parse a bounded container; each accepted body still requires the canonical SVG admission. */
export function parseEditorIconifySet(input: unknown): EditorIconifySet {
  const envelope = admitIconifyEnvelope(input);
  const issues: ImportIssue[] = [];
  const icons = parseIconRows(envelope.icons, issues);
  const aliases = parseAliasRows(envelope.aliases, icons, issues);
  const data: IconifyData = Object.freeze({
    prefix: envelope.prefix,
    ...properties(envelope.root),
    icons: Object.freeze(icons),
    aliases: Object.freeze(aliases),
  });
  const names = collectVisibleNames(data, issues);
  const categories = projectCategories(envelope.root['categories'], names);
  const attribution = projectAttribution(envelope.root['info'], data.prefix);
  return Object.freeze({
    data,
    ...attribution,
    names: Object.freeze(names),
    categories,
    issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
  });
}

/** Resolve official alias/rotation semantics, then admit the complete materialized SVG. */
export async function prepareEditorIconifyDefinition(
  set: EditorIconifySet,
  name: string,
  sourceId: string
) {
  const icon = resolve(set.data, name);
  const output = iconToSVG(icon, { width: 'auto', height: 'auto' });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${output.attributes.viewBox}">${output.body}</svg>`;
  return prepareEditorVectorDefinition(svg, {
    sourceId,
    prefix: set.data.prefix,
    name,
    author: set.author,
    authorUrl: set.authorUrl,
    license: set.license,
    licenseUrl: set.licenseUrl,
  });
}
