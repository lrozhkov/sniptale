import {
  ALLOWED_SVG_ATTRIBUTES,
  COMMON_SVG_ATTRIBUTES,
  getSvgAttributeCharacterLimit,
  SVG_LIMITS,
  SVG_NAME,
} from './preflight-policy';

export { SVG_LIMITS } from './preflight-policy';

export type SvgPreflightErrorCode =
  | 'attribute'
  | 'declaration'
  | 'depth'
  | 'element'
  | 'entity'
  | 'nodes'
  | 'size'
  | 'syntax'
  | 'text'
  | 'url';

export class SvgPreflightError extends Error {
  readonly code: SvgPreflightErrorCode;

  constructor(code: SvgPreflightErrorCode) {
    super(`SVG structural preflight failed: ${code}`);
    this.name = 'SvgPreflightError';
    this.code = code;
  }
}

interface SvgPreflightProfile {
  nodes: number;
  sourceCharacters: number;
}

interface SvgScanState {
  cursor: number;
  nodes: number;
  rootClosed: boolean;
  stack: string[];
}

export function inspectEffectSvgBeforeDom(source: string): SvgPreflightProfile {
  if (source.length === 0 || source.length > SVG_LIMITS.maxSourceCharacters) {
    throw new SvgPreflightError('size');
  }
  if (/<!\s*(?:doctype|entity)|<!\[cdata\[/i.test(source) || /<\?/.test(source)) {
    throw new SvgPreflightError('declaration');
  }
  if (source.includes('&')) throw new SvgPreflightError('entity');

  const state = scanSvgStructure(source);
  if (state.nodes === 0 || state.stack.length !== 0 || !state.rootClosed) {
    throw new SvgPreflightError('syntax');
  }
  return { nodes: state.nodes, sourceCharacters: source.length };
}

function scanSvgStructure(source: string): SvgScanState {
  const state: SvgScanState = { cursor: 0, nodes: 0, rootClosed: false, stack: [] };
  while (state.cursor < source.length) {
    const opening = source.indexOf('<', state.cursor);
    if (opening < 0) {
      assertWhitespace(source.slice(state.cursor));
      break;
    }
    assertWhitespace(source.slice(state.cursor, opening));
    if (source.startsWith('<!--', opening)) {
      state.cursor = consumeComment(source, opening);
      continue;
    }
    const end = findTagEnd(source, opening + 1);
    const token = source.slice(opening + 1, end).trim();
    consumeTag(token, state);
    state.cursor = end + 1;
  }
  return state;
}

function consumeComment(source: string, opening: number): number {
  const end = source.indexOf('-->', opening + 4);
  if (
    end < 0 ||
    end - opening - 4 > SVG_LIMITS.maxCommentCharacters ||
    source.slice(opening + 4, end).includes('--')
  ) {
    throw new SvgPreflightError('syntax');
  }
  return end + 3;
}

function consumeTag(token: string, state: SvgScanState): void {
  if (token.length === 0 || token.startsWith('!')) throw new SvgPreflightError('syntax');
  if (token.startsWith('/')) {
    const name = token.slice(1).trim().toLowerCase();
    if (!SVG_NAME.test(name) || state.stack.pop() !== name) throw new SvgPreflightError('syntax');
    if (state.stack.length === 0) state.rootClosed = true;
    return;
  }
  if (state.rootClosed) throw new SvgPreflightError('syntax');
  const selfClosing = token.endsWith('/');
  const content = selfClosing ? token.slice(0, -1).trimEnd() : token;
  const separator = content.search(/\s/);
  const rawName = separator < 0 ? content : content.slice(0, separator);
  const name = rawName.toLowerCase();
  if (!SVG_NAME.test(rawName) || !ALLOWED_SVG_ATTRIBUTES.has(name)) {
    throw new SvgPreflightError('element');
  }
  if (state.nodes === 0 && name !== 'svg') throw new SvgPreflightError('syntax');
  state.nodes += 1;
  if (state.nodes > SVG_LIMITS.maxNodes) throw new SvgPreflightError('nodes');
  parseAttributes(name, separator < 0 ? '' : content.slice(separator));
  if (!selfClosing) {
    state.stack.push(name);
    if (state.stack.length > SVG_LIMITS.maxDepth) throw new SvgPreflightError('depth');
  } else if (name === 'svg') state.rootClosed = true;
}

function parseAttributes(tag: string, source: string): void {
  const allowed = ALLOWED_SVG_ATTRIBUTES.get(tag)!;
  const names = new Set<string>();
  let cursor = 0;
  let count = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const nameStart = cursor;
    while (cursor < source.length && /[A-Za-z0-9-]/.test(source[cursor]!)) cursor += 1;
    const name = source.slice(nameStart, cursor);
    if (
      !SVG_NAME.test(name) ||
      names.has(name) ||
      (!COMMON_SVG_ATTRIBUTES.has(name) && !allowed.has(name))
    ) {
      throw new SvgPreflightError('attribute');
    }
    names.add(name);
    count += 1;
    if (count > SVG_LIMITS.maxAttributesPerNode) throw new SvgPreflightError('attribute');
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    if (source[cursor] !== '=') throw new SvgPreflightError('attribute');
    cursor += 1;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new SvgPreflightError('attribute');
    const valueStart = ++cursor;
    const valueEnd = source.indexOf(quote, valueStart);
    if (valueEnd < 0 || valueEnd - valueStart > getSvgAttributeCharacterLimit(name)) {
      throw new SvgPreflightError('attribute');
    }
    const value = source.slice(valueStart, valueEnd);
    if (
      (name === 'xmlns' && value !== 'http://www.w3.org/2000/svg') ||
      (name !== 'xmlns' && /url\s*\(|(?:https?|data|javascript):/i.test(value))
    ) {
      throw new SvgPreflightError('url');
    }
    if ([...value].some(isForbiddenControlCharacter)) {
      throw new SvgPreflightError('attribute');
    }
    cursor = valueEnd + 1;
  }
}

function isForbiddenControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code === 0x7f || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d);
}

function findTagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  throw new SvgPreflightError('syntax');
}

function assertWhitespace(value: string): void {
  if (!/^\s*$/.test(value)) throw new SvgPreflightError('text');
}
