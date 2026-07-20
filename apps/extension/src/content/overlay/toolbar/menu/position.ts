export function getToolbarMenuPosition(
  anchor: HTMLElement | null,
  menuHeight: number,
  fallback: 'up' | 'down' = 'down'
): 'up' | 'down' {
  if (!anchor) {
    return fallback;
  }

  const rect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  return spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'up' : 'down';
}
