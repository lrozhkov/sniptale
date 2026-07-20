type ActionStatus = {
  message: string;
  state: 'error' | 'pending' | 'success' | 'warning';
};

export function ActionStatusBanner(props: { status: ActionStatus | null }) {
  if (!props.status) {
    return null;
  }

  const tone = {
    error: 'border-[var(--sniptale-color-danger)] text-[var(--sniptale-color-danger)]',
    pending:
      'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
    success:
      'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
    warning: 'border-[var(--sniptale-color-warning)] text-[var(--sniptale-color-warning)]',
  }[props.status.state];

  return (
    <div className={['rounded-[8px] border px-2 py-1.5 text-[11px] font-semibold', tone].join(' ')}>
      {props.status.message}
    </div>
  );
}
