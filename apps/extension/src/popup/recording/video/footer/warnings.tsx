export function VideoSetupWarnings({ startError }: { startError: string | null }) {
  return (
    <>
      {startError && (
        <div className="popup-error-message mt-2.5 mr-1" role="alert">
          {startError}
        </div>
      )}
    </>
  );
}
