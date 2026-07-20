function decimalDigits(value) {
  return value.length > 0 && [...value].every((character) => character >= '0' && character <= '9');
}

function isCanonicalScoreString(value) {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  const parts = value.split('.');
  if (parts.length > 2 || !decimalDigits(parts[0])) return false;
  if (parts.length === 2 && !decimalDigits(parts[1])) return false;
  if (parts[0].length > 1 && parts[0].startsWith('0')) return false;
  const integer = Number(parts[0]);
  if (integer < 10) return true;
  if (integer > 10) return false;
  return parts.length === 1 || [...parts[1]].every((character) => character === '0');
}

export function isOsvGroupScore(value) {
  return value === undefined || value === '' || isCanonicalScoreString(value);
}

export function severityFromOsvGroupScore(value) {
  if (value === undefined || value === '') return null;
  if (!isOsvGroupScore(value)) {
    throw new TypeError(`Invalid OSV group severity: ${JSON.stringify(value)}`);
  }
  const score = Number(value);
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MODERATE';
  return score > 0 ? 'LOW' : null;
}
