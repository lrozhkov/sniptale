import { translate } from '../../../../platform/i18n';

const NOTICE_CLASS_NAME = ['rounded-[8px] border px-2 py-1.5', 'text-[11px] font-semibold'].join(
  ' '
);

export function RegistryStatusNotice(props: {
  error: string | null | undefined;
  loading: boolean | undefined;
}) {
  if (props.error) {
    const className = [
      NOTICE_CLASS_NAME,
      'border-[var(--sniptale-color-danger)] text-[var(--sniptale-color-danger)]',
    ].join(' ');

    return <div className={className}>{props.error}</div>;
  }

  if (props.loading) {
    const className = [
      NOTICE_CLASS_NAME,
      'border-[color:var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
    ].join(' ');

    return (
      <div className={className}>{translate('content.pageStyleInspector.registryLoading')}</div>
    );
  }

  return null;
}
