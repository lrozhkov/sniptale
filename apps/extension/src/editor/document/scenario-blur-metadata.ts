import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { parseBlurSettings } from '../../features/highlighter/frame-annotation/settings-parser';
import type { BlurSettings } from '../../features/highlighter/contracts';

/** Retains captured scenario blur modes without changing the shared drawing-tool format. */
export function parseScenarioBlurMetadata(
  value: unknown
): { id: string; settings: BlurSettings } | null {
  if (typeof value !== 'string' || value.length > 16_384) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('id' in parsed) ||
    typeof parsed.id !== 'string' ||
    !parsed.id ||
    parsed.id.length > 256 ||
    !('settings' in parsed)
  )
    return null;
  const settings = parseBlurSettings(parsed.settings);
  if (!settings || settings.amount < 0 || settings.amount > 25) return null;
  return { id: parsed.id, settings };
}

export function isValidScenarioBlurCanvasObject(value: Record<string, unknown>): boolean {
  const metadata = parseScenarioBlurMetadata(value['sniptaleScenarioBlurJson']);
  const source = value['sniptaleBlurSourceData'];
  return Boolean(
    metadata &&
    value['sniptaleId'] === metadata.id &&
    value['sniptaleType'] === 'blur' &&
    value['type'] === 'Rect' &&
    value['sniptaleRole'] === 'annotation' &&
    value['sniptaleDrawingJson'] === undefined &&
    value['objects'] === undefined &&
    value['clipPath'] === undefined &&
    typeof source === 'string' &&
    isImageDataUrl(source) &&
    [
      'sniptaleBlurSourceLeft',
      'sniptaleBlurSourceTop',
      'sniptaleBlurSourceWidth',
      'sniptaleBlurSourceHeight',
    ].every((key) => {
      const number = value[key];
      return (
        typeof number === 'number' &&
        Number.isFinite(number) &&
        Math.abs(number) <= 131_072 &&
        ((!key.endsWith('Width') && !key.endsWith('Height')) || number >= 0)
      );
    })
  );
}
