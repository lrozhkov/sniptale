import type { VideoExportDetailMode } from '../../project/types/export';

export function parseEnhancementMode(value: unknown): VideoExportDetailMode {
  if (value === undefined) return 'off';
  if (value === 'off' || value === 'bicubic-sharpen' || value === 'clark-x2') return value;
  throw new TypeError('Invalid enhancement mode');
}
