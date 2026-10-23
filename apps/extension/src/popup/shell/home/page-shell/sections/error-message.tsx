export function PopupHomeErrorMessage({ message }: { message: string }) {
  return (
    <div className="popup-error-message" role="alert">
      {message}
    </div>
  );
}
