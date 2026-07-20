interface ParsedRgbColor {
  red: number;
  green: number;
  blue: number;
  alpha: number | null;
}

export function parseRgbColor(color: string): ParsedRgbColor | null {
  const normalized = color.trim().toLowerCase();
  const isRgba = normalized.startsWith('rgba(');
  const isRgb = normalized.startsWith('rgb(');
  if ((!isRgb && !isRgba) || !normalized.endsWith(')')) {
    return null;
  }

  const rawComponents = normalized.slice(normalized.indexOf('(') + 1, -1);
  const components = tokenizeColorComponents(rawComponents);
  if (components.length < 3 || components.length > 4) {
    return null;
  }

  const [rawRed, rawGreen, rawBlue] = components.slice(0, 3).map(parseFiniteColorNumber);
  if ([rawRed, rawGreen, rawBlue].some((value) => value === null)) {
    return null;
  }

  const red = rawRed as number;
  const green = rawGreen as number;
  const blue = rawBlue as number;

  const alphaToken = components[3];
  const alpha = alphaToken === undefined ? null : parseFiniteColorNumber(alphaToken);
  if (alphaToken !== undefined && alpha === null) {
    return null;
  }

  return {
    red,
    green,
    blue,
    alpha,
  };
}

export function extractBrowserVersion(agent: string, token: string): string | null {
  const tokenIndex = agent.indexOf(token);
  if (tokenIndex === -1) {
    return null;
  }

  const versionStart = tokenIndex + token.length;
  let version = '';
  for (const char of agent.slice(versionStart)) {
    const isDigit = char >= '0' && char <= '9';
    if (!isDigit && char !== '.') {
      break;
    }
    version += char;
  }

  return version.length > 0 ? version : null;
}

function tokenizeColorComponents(value: string): string[] {
  return value
    .split(',')
    .join(' ')
    .split('/')
    .join(' ')
    .split(' ')
    .map((token: string) => token.trim())
    .filter((token: string) => token.length > 0);
}

function parseFiniteColorNumber(value: string): number | null {
  if (value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
