export function stripAsciiControlCharacters(value: string, replacement = ''): string {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    result += code <= 0x1f || code === 0x7f ? replacement : character;
  }
  return result;
}

export function hasAsciiControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}
