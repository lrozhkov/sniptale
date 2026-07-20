const ARROW_POINT_CONTROL_PREFIX = 'point-';

export function getArrowControlKey(index: number, count: number): string {
  if (index === 0) {
    return 'start';
  }
  if (index === count - 1) {
    return 'end';
  }

  return `${ARROW_POINT_CONTROL_PREFIX}${index}`;
}

export function getArrowEndpointIndex(displayIndex: number, count: number): number | null {
  if (displayIndex === 0) {
    return 0;
  }
  if (displayIndex === count - 1) {
    return count - 1;
  }

  return null;
}
