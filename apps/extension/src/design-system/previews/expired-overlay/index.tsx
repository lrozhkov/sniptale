import { translate } from '../../../platform/i18n';

export type ExpiredOverlayProps = {
  dataUi?: string;
  title?: string;
  message?: string;
};

export function ExpiredOverlay({
  dataUi,
  title = translate('popup.common.expiredTitle'),
  message = translate('popup.common.expiredDescription'),
}: ExpiredOverlayProps) {
  return (
    <div className="sniptale-expired-overlay" data-ui={dataUi ?? 'shared.ui.expired-overlay'}>
      <div className="sniptale-expired-content">
        <div className="sniptale-expired-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="sniptale-expired-title">{title}</h2>
        <p className="sniptale-expired-message">{message}</p>
      </div>
    </div>
  );
}
