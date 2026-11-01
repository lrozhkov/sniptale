const MAX_BYTES = 65_536;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const integerToken = /^(0|[1-9][0-9]*)$/;
const integerPrefix = /^-?(?:0|[1-9][0-9]*)/;
const fractionPrefix = /^\.[0-9]+/;
const exponentPrefix = /^[eE][+-]?[0-9]+/;
function numberToken(text: string): string | undefined {
  let token = integerPrefix.exec(text)?.[0];
  if (!token) return undefined;
  token += fractionPrefix.exec(text.slice(token.length))?.[0] ?? '';
  token += exponentPrefix.exec(text.slice(token.length))?.[0] ?? '';
  return token;
}
const scrollFields = new Set(['deltaX', 'deltaY', 'deltaZ', 'scrollX', 'scrollY']);

function permitsFloat(path: readonly string[]): boolean {
  const key = path.at(-1);
  const parent = path.at(-2);
  return (
    ((parent === 'point' || parent === 'upPoint') && (key === 'x' || key === 'y')) ||
    (parent === 'data' && key !== undefined && scrollFields.has(key))
  );
}

/** Checks original tokens before JSON.parse can round numbers or discard duplicate keys. */
export function decodeRecordingEventsJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return undefined;
  try {
    const text = utf8.decode(bytes);
    let offset = 0;
    const reject = (): never => {
      throw new Error('Invalid recording event JSON.');
    };
    const string = (): string => {
      const start = offset;
      if (text[offset++] !== '"') return reject();
      while (offset < text.length) {
        const char = text[offset++];
        if (char === '\\') offset++;
        else if (char === '"') {
          const value: unknown = JSON.parse(text.slice(start, offset));
          if (typeof value !== 'string') return reject();
          return value;
        }
      }
      return reject();
    };
    const value = (path: readonly string[], depth: number): void => {
      if (depth > 16) reject();
      const char = text[offset];
      if (char === '{') {
        offset++;
        const keys = new Set<string>();
        if (text[offset] === '}') {
          offset++;
          return;
        }
        while (offset < text.length) {
          const key = string();
          if (keys.has(key)) reject();
          keys.add(key);
          if (text[offset++] !== ':') reject();
          value([...path, key], depth + 1);
          const separator = text[offset++];
          if (separator === '}') return;
          if (separator !== ',') reject();
        }
        reject();
      } else if (char === '[') {
        offset++;
        if (text[offset] === ']') {
          offset++;
          return;
        }
        while (offset < text.length) {
          value([...path, '[]'], depth + 1);
          const separator = text[offset++];
          if (separator === ']') return;
          if (separator !== ',') reject();
        }
        reject();
      } else if (char === '"') {
        string();
      } else {
        for (const literal of ['true', 'false', 'null']) {
          if (text.startsWith(literal, offset)) {
            offset += literal.length;
            return;
          }
        }
        const token = numberToken(text.slice(offset));
        if (!token) return reject();
        const number = Number(token);
        if (!Number.isFinite(number)) reject();
        if (!permitsFloat(path) && (!integerToken.test(token) || !Number.isSafeInteger(number)))
          reject();
        offset += token.length;
      }
    };
    value([], 0);
    if (offset !== text.length) return undefined;
    const result: unknown = JSON.parse(text);
    return result;
  } catch {
    return undefined;
  }
}
