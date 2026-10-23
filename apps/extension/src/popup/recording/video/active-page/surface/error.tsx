export function VideoActiveError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="popup-error-message" role="alert">
      {error}
    </div>
  );
}
