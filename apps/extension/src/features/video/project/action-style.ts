import type { VideoActionClickStyle, VideoActionKeyStyle } from './types';

/** Authored sizes are logical source pixels, independent of preview DPR. */
export function getActionClickStyle(style?: VideoActionClickStyle): VideoActionClickStyle {
  return style ?? { color: '#f97316', size: 40, opacity: 0.8, strokeWidth: 3 };
}

export function getActionKeyStyle(style?: VideoActionKeyStyle): VideoActionKeyStyle {
  return (
    style ?? {
      position: 'bottom-center',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#ffffff',
      background: '#18202c',
      opacity: 0.92,
      cornerRadius: 8,
      margin: 24,
      entrance: 'fade',
    }
  );
}
