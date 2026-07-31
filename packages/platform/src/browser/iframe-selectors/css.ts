export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export function escapeCssString(value: string): string {
  if (/^[\w-]+$/u.test(value)) {
    return value;
  }

  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0xfffd;
    return `\\${codePoint === 0 ? 'fffd' : codePoint.toString(16)} `;
  }).join('');
}
