import {
  fingerprintNativeCapture,
  parseCapturedMediaRows,
  parseCapturedImageRows,
  parseCapturedVideoProjectRows,
} from '../guards';
import type { CapturedChange } from '../contracts';
/** Build current native test evidence explicitly; production readers never upgrade experiment rows. */
export function createNativeCapture(
  input: Omit<CapturedChange, 'phase' | 'sourceSha256' | 'source' | 'profileCreatedAt'> & {
    profileCreatedAt?: number;
  }
): CapturedChange {
  const change: CapturedChange['change'] =
    input.change.kind === 'media'
      ? { kind: 'media', rows: parseCapturedMediaRows(input.change.rows) ?? input.change.rows }
      : input.change.kind === 'image'
        ? { kind: 'image', rows: parseCapturedImageRows(input.change.rows) ?? input.change.rows }
        : input.change.kind === 'video-project'
          ? {
              kind: 'video-project',
              rows: parseCapturedVideoProjectRows(input.change.rows) ?? input.change.rows,
            }
          : input.change;
  const label =
    input.change.kind === 'media' || input.change.kind === 'image'
      ? input.change.rows.media.filename
      : input.change.kind === 'video-project'
        ? input.change.rows.project.project.name
        : input.rootId;
  const native = {
    ...input,
    change,
    phase: 'native' as const,
    profileCreatedAt: input.profileCreatedAt ?? 1,
    source: { changeKind: input.change.kind, label: label.trim() || input.rootId },
  };
  return { ...native, sourceSha256: fingerprintNativeCapture(native) };
}
