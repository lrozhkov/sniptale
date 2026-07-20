function isAsciiDigit(code) {
  return code >= 48 && code <= 57;
}

function isAsciiLowercase(code) {
  return code >= 97 && code <= 122;
}

function isAsciiUppercase(code) {
  return code >= 65 && code <= 90;
}

function isSeparator(code) {
  return code === 45 || code === 46 || code === 58 || code === 95;
}

function isIdentifier(value, { uppercase }) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false;
  const isAlphanumeric = (code) =>
    isAsciiDigit(code) || isAsciiLowercase(code) || (uppercase && isAsciiUppercase(code));
  if (!isAlphanumeric(value.charCodeAt(0))) return false;
  if (!isAlphanumeric(value.charCodeAt(value.length - 1))) return false;
  for (let index = 1; index < value.length - 1; index += 1) {
    const code = value.charCodeAt(index);
    if (!isAlphanumeric(code) && !isSeparator(code)) return false;
  }
  return true;
}

export function isStableId(value) {
  return isIdentifier(value, { uppercase: false });
}

export function isOpaqueIdentifier(value) {
  return isIdentifier(value, { uppercase: true });
}
