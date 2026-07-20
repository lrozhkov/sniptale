export interface GradientColorStop {
  color: string;
  offset: number;
  opacity?: number | undefined;
}

export function clampGradientOffset(offset: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }
  return Math.min(1, Math.max(0, offset));
}

export function clampGradientOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) {
    return 1;
  }
  return Math.min(1, Math.max(0, opacity));
}

export function resolveGradientStopOpacity(stop: GradientColorStop): number {
  return typeof stop.opacity === 'number' ? clampGradientOpacity(stop.opacity) : 1;
}

export function createGradientFallbackStops(from: string, to: string): GradientColorStop[] {
  return [
    { color: from, offset: 0 },
    { color: to, offset: 1 },
  ];
}

export function normalizeGradientStops(
  stops: readonly GradientColorStop[] | null | undefined,
  fallback: readonly GradientColorStop[]
): GradientColorStop[] {
  const sourceStops = stops ? [...stops] : [];
  const normalized = sourceStops
    .filter((stop) => typeof stop.color === 'string' && stop.color.length > 0)
    .map((stop, index) => ({
      color: stop.color,
      offset: clampGradientOffset(
        typeof stop.offset === 'number'
          ? stop.offset
          : resolveGradientFallbackOffset(index, sourceStops.length)
      ),
      opacity: typeof stop.opacity === 'number' ? clampGradientOpacity(stop.opacity) : null,
      sourceIndex: index,
    }))
    .sort((left, right) => left.offset - right.offset || left.sourceIndex - right.sourceIndex)
    .map(({ color, offset, opacity }) => ({
      color,
      offset,
      ...(opacity === null ? {} : { opacity }),
    }));

  if (normalized.length >= 2) {
    return normalized;
  }

  return fallback.map((stop, index) => ({
    color: stop.color,
    offset: clampGradientOffset(
      Number.isFinite(stop.offset)
        ? stop.offset
        : resolveGradientFallbackOffset(index, fallback.length)
    ),
  }));
}

export function resolveGradientFallbackOffset(index: number, length: number): number {
  return length <= 1 ? 0 : index / (length - 1);
}

export function addGradientStop(
  stops: readonly GradientColorStop[],
  selectedIndex: number,
  fallback: readonly GradientColorStop[]
): GradientColorStop[] {
  const normalized = normalizeGradientStops(stops, fallback);
  const index = Math.min(Math.max(selectedIndex, 0), normalized.length - 1);
  const selected = normalized[index] ?? normalized[0] ?? { color: '#ffffff', offset: 0 };
  const next = normalized[index + 1];
  const offset = next ? (selected.offset + next.offset) / 2 : (selected.offset + 1) / 2;
  return normalizeGradientStops(
    [
      ...normalized.slice(0, index + 1),
      { color: selected.color, offset },
      ...normalized.slice(index + 1),
    ],
    normalized
  );
}

export function removeGradientStop(
  stops: readonly GradientColorStop[],
  selectedIndex: number,
  fallback: readonly GradientColorStop[]
): GradientColorStop[] {
  if (stops.length <= 2) {
    return normalizeGradientStops(stops, fallback);
  }
  return normalizeGradientStops(
    stops.filter((_, index) => index !== selectedIndex),
    fallback
  );
}

export function reverseGradientStops(
  stops: readonly GradientColorStop[],
  fallback: readonly GradientColorStop[]
): GradientColorStop[] {
  return normalizeGradientStops(
    stops.map((stop) => ({ ...stop, offset: 1 - clampGradientOffset(stop.offset) })),
    fallback
  );
}

export function createGradientColorStopColor(
  stop: GradientColorStop,
  opacityMultiplier = 1
): string {
  const opacity = clampGradientOpacity(resolveGradientStopOpacity(stop) * opacityMultiplier);
  if (opacity >= 1 || stop.color.trim().toLowerCase() === 'transparent') {
    return stop.color;
  }

  const rgb = parseHexColor(stop.color);
  return rgb ? `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${trimOpacity(opacity)})` : stop.color;
}

function parseHexColor(color: string): { blue: number; green: number; red: number } | null {
  const normalized = color.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const [, red = '0', green = '0', blue = '0'] = normalized;
    return {
      blue: Number.parseInt(`${blue}${blue}`, 16),
      green: Number.parseInt(`${green}${green}`, 16),
      red: Number.parseInt(`${red}${red}`, 16),
    };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return {
      blue: Number.parseInt(normalized.slice(5, 7), 16),
      green: Number.parseInt(normalized.slice(3, 5), 16),
      red: Number.parseInt(normalized.slice(1, 3), 16),
    };
  }
  return null;
}

function trimOpacity(opacity: number): string {
  return String(Number(opacity.toFixed(3)));
}
