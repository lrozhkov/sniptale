import type { EditorBuiltInShapePathCommand } from '../../../features/editor/document/rich-shape';

type PathCursor = {
  index: number;
  tokens: string[];
  x: number;
  y: number;
  command: string | null;
};

const COMMANDS = new Set([
  'A',
  'a',
  'C',
  'c',
  'H',
  'h',
  'L',
  'l',
  'M',
  'm',
  'Q',
  'q',
  'V',
  'v',
  'Z',
  'z',
]);
const PARAM_COUNTS: Record<string, number> = { A: 7, C: 6, H: 1, L: 2, M: 2, Q: 4, V: 1, Z: 0 };

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isWhitespaceOrComma(char: string | undefined): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === ',';
}

function readExponent(data: string, index: number): number {
  if (data[index] !== 'e' && data[index] !== 'E') {
    return index;
  }
  let next = index + 1;
  if (data[next] === '-' || data[next] === '+') {
    next += 1;
  }
  const digitStart = next;
  while (isDigit(data[next])) {
    next += 1;
  }
  return next > digitStart ? next : index;
}

function readNumberToken(data: string, start: number): string | null {
  let index = start;
  if (data[index] === '-' || data[index] === '+') {
    index += 1;
  }
  const integerStart = index;
  while (isDigit(data[index])) {
    index += 1;
  }
  if (data[index] === '.') {
    index += 1;
    while (isDigit(data[index])) {
      index += 1;
    }
  }
  if (index === integerStart || (index === integerStart + 1 && data[integerStart] === '.')) {
    return null;
  }
  index = readExponent(data, index);
  return data.slice(start, index);
}

function tokenizePathData(data: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < data.length; ) {
    const char = data[index];
    if (isWhitespaceOrComma(char)) {
      index += 1;
    } else if (char && COMMANDS.has(char)) {
      tokens.push(char);
      index += 1;
    } else {
      const token = readNumberToken(data, index);
      if (!token) {
        index += 1;
      } else {
        tokens.push(token);
        index += token.length;
      }
    }
  }
  return tokens;
}

function isCommandToken(token: string | undefined): boolean {
  return Boolean(token && /^[AaCcHhLlMmQqVvZz]$/.test(token));
}

function readNumber(cursor: PathCursor): number | null {
  const token = cursor.tokens[cursor.index];
  if (!token || isCommandToken(token)) {
    return null;
  }

  const value = Number(token);
  if (!Number.isFinite(value)) {
    return null;
  }

  cursor.index += 1;
  return value;
}

function readNumbers(cursor: PathCursor, count: number): number[] | null {
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = readNumber(cursor);
    if (value === null) {
      return null;
    }
    values.push(value);
  }
  return values;
}

function point(
  cursor: PathCursor,
  command: string,
  x: number,
  y: number
): readonly [number, number] {
  return command === command.toLowerCase() ? [cursor.x + x, cursor.y + y] : [x, y];
}

function appendCommand(
  cursor: PathCursor,
  commands: EditorBuiltInShapePathCommand[],
  command: string,
  values: number[]
): void {
  const upper = command.toUpperCase();
  if (upper === 'H') {
    const x = command === 'h' ? cursor.x + values[0]! : values[0]!;
    cursor.x = x;
    commands.push(['L', x, cursor.y]);
    return;
  }
  if (upper === 'V') {
    const y = command === 'v' ? cursor.y + values[0]! : values[0]!;
    cursor.y = y;
    commands.push(['L', cursor.x, y]);
    return;
  }
  appendPointCommand(cursor, commands, command, values);
}

function appendPointCommand(
  cursor: PathCursor,
  commands: EditorBuiltInShapePathCommand[],
  command: string,
  values: number[]
): void {
  const upper = command.toUpperCase();
  if (upper === 'M' || upper === 'L') {
    const [x, y] = point(cursor, command, values[0]!, values[1]!);
    cursor.x = x;
    cursor.y = y;
    commands.push([upper as 'M' | 'L', x, y]);
  } else if (upper === 'Q') {
    const [x1, y1] = point(cursor, command, values[0]!, values[1]!);
    const [x, y] = point(cursor, command, values[2]!, values[3]!);
    cursor.x = x;
    cursor.y = y;
    commands.push(['Q', x1, y1, x, y]);
  } else if (upper === 'C') {
    const [x1, y1] = point(cursor, command, values[0]!, values[1]!);
    const [x2, y2] = point(cursor, command, values[2]!, values[3]!);
    const [x, y] = point(cursor, command, values[4]!, values[5]!);
    cursor.x = x;
    cursor.y = y;
    commands.push(['C', x1, y1, x2, y2, x, y]);
  } else if (upper === 'A') {
    const [x, y] = point(cursor, command, values[5]!, values[6]!);
    cursor.x = x;
    cursor.y = y;
    commands.push([
      'A',
      values[0]!,
      values[1]!,
      values[2]!,
      values[3] ? 1 : 0,
      values[4] ? 1 : 0,
      x,
      y,
    ]);
  }
}

export function parseSvgPathData(data: string): EditorBuiltInShapePathCommand[] | null {
  const cursor: PathCursor = {
    command: null,
    index: 0,
    tokens: tokenizePathData(data),
    x: 0,
    y: 0,
  };
  const commands: EditorBuiltInShapePathCommand[] = [];
  while (cursor.index < cursor.tokens.length) {
    const token = cursor.tokens[cursor.index];
    if (isCommandToken(token)) {
      cursor.command = token!;
      cursor.index += 1;
    }
    if (!cursor.command) {
      return null;
    }

    const upper = cursor.command.toUpperCase();
    if (upper === 'Z') {
      commands.push(['Z']);
      cursor.command = null;
      continue;
    }

    const values = readNumbers(cursor, PARAM_COUNTS[upper] ?? 0);
    if (!values) {
      return null;
    }
    appendCommand(cursor, commands, cursor.command, values);
    if (upper === 'M') {
      cursor.command = cursor.command === 'm' ? 'l' : 'L';
    }
  }

  return commands.length > 0 ? commands : null;
}
