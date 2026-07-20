import type { CSSProperties } from 'react';

type PopoverAnchorPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const DEFAULT_POPOVER_ANCHOR_GRID: PopoverAnchorPosition[][] = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

export function getAnchorDotPosition(anchor: PopoverAnchorPosition): CSSProperties {
  const dotBase: CSSProperties = {
    width: 5,
    height: 5,
    borderRadius: '50%',
    backgroundColor: 'currentColor',
    position: 'absolute',
  };

  switch (anchor) {
    case 'top-left':
      return { ...dotBase, top: 5, left: 5 };
    case 'top-center':
      return { ...dotBase, top: 5, left: '50%', transform: 'translate(-50%, 0)' };
    case 'top-right':
      return { ...dotBase, top: 5, right: 5 };
    case 'middle-left':
      return { ...dotBase, top: '50%', left: 5, transform: 'translate(0, -50%)' };
    case 'center':
      return { ...dotBase, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'middle-right':
      return { ...dotBase, top: '50%', right: 5, transform: 'translate(0, -50%)' };
    case 'bottom-left':
      return { ...dotBase, bottom: 5, left: 5 };
    case 'bottom-center':
      return { ...dotBase, bottom: 5, left: '50%', transform: 'translate(-50%, 0)' };
    case 'bottom-right':
      return { ...dotBase, bottom: 5, right: 5 };
    default:
      return { ...dotBase, top: 5, left: 5 };
  }
}
