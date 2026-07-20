import {
  ACTIVE_ERROR_CLASS_NAME,
  ACTIVE_ERROR_SURFACE_CLASS_NAME,
  ACTIVE_ERROR_TONE_CLASS_NAME,
} from '../styles';

export function VideoActiveError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      className={[
        ACTIVE_ERROR_CLASS_NAME,
        ACTIVE_ERROR_TONE_CLASS_NAME,
        ACTIVE_ERROR_SURFACE_CLASS_NAME,
      ].join(' ')}
    >
      {error}
    </div>
  );
}
