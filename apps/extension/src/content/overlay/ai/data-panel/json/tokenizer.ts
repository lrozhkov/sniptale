type JsonPreviewTokenType = 'boolean' | 'key' | 'null' | 'number' | 'string';

function findJsonStringEnd(json: string, startIndex: number): number {
  let index = startIndex + 1;

  while (index < json.length) {
    if (json[index] === '\\') {
      index += 2;
      continue;
    }

    if (json[index] === '"') {
      return index;
    }

    index += 1;
  }

  return json.length - 1;
}

function findJsonNumberEnd(json: string, startIndex: number): number {
  let index = startIndex;

  while (index < json.length && isJsonNumberCharacter(json[index] ?? '')) {
    index += 1;
  }

  return index;
}

function skipJsonWhitespace(json: string, startIndex: number): number {
  let index = startIndex;

  while (index < json.length && /\s/.test(json[index] ?? '')) {
    index += 1;
  }

  return index;
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isJsonNumberCharacter(char: string): boolean {
  return (
    isDigit(char) || char === '-' || char === '+' || char === '.' || char === 'e' || char === 'E'
  );
}

function wrapJsonToken(type: JsonPreviewTokenType, value: string): string {
  return `<span class="sniptale-json-${type}">${value}</span>`;
}

export function tokenizeJsonForPreview(json: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < json.length) {
    const char = json[index] ?? '';

    if (char === '"') {
      const endIndex = findJsonStringEnd(json, index);
      const value = json.slice(index, endIndex + 1);
      const nextTokenIndex = skipJsonWhitespace(json, endIndex + 1);
      const isKey = (json[nextTokenIndex] ?? '') === ':';

      tokens.push(wrapJsonToken(isKey ? 'key' : 'string', value));
      index = endIndex + 1;
      continue;
    }

    if (char === '-' || isDigit(char)) {
      const endIndex = findJsonNumberEnd(json, index);
      tokens.push(wrapJsonToken('number', json.slice(index, endIndex)));
      index = endIndex;
      continue;
    }

    if (json.startsWith('true', index) || json.startsWith('false', index)) {
      const value = json.startsWith('true', index) ? 'true' : 'false';
      tokens.push(wrapJsonToken('boolean', value));
      index += value.length;
      continue;
    }

    if (json.startsWith('null', index)) {
      tokens.push(wrapJsonToken('null', 'null'));
      index += 4;
      continue;
    }

    tokens.push(char);
    index += 1;
  }

  return tokens;
}
