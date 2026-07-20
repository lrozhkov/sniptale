function isAsciiLetter(value) {
  const code = value.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(value) {
  const code = value.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isIdentifierStart(value) {
  return value === '$' || value === '_' || isAsciiLetter(value);
}

export function isIdentifierCharacter(value) {
  return isIdentifierStart(value) || isDigit(value);
}

export function isWhitespace(value) {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t';
}

export function readIdentifierAt(text, index) {
  const first = text[index] ?? '';
  if (!isIdentifierStart(first)) {
    return null;
  }

  let end = index + 1;
  while (isIdentifierCharacter(text[end] ?? '')) {
    end += 1;
  }

  return { end, value: text.slice(index, end) };
}
