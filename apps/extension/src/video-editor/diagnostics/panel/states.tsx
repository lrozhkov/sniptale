import { AlertCircle, Bug } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { Skeleton } from '@sniptale/ui/skeleton';
import { COLORS, diagnosticsPanelStyles as styles } from './styles';

export function DiagnosticsPanelLoadingState() {
  return (
    <div style={styles['card']}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <Skeleton shape="circle" className="h-8 w-8 shrink-0" />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[72%]" />
          </div>
        </div>
        <span style={{ marginTop: '2px', fontSize: '13px', color: COLORS.secondary }}>
          {translate('videoEditor.diagnostics.loading')}
        </span>
      </div>
    </div>
  );
}

interface DiagnosticsPanelErrorStateProps {
  error: string;
}

export function DiagnosticsPanelErrorState({ error }: DiagnosticsPanelErrorStateProps) {
  return (
    <div
      style={{
        ...styles['card'],
        border:
          '1px solid color-mix(in srgb, var(--sniptale-color-danger) 24%, var(--sniptale-color-border-soft) 76%)',
        background:
          'color-mix(in srgb, var(--sniptale-color-danger-soft) 44%, var(--sniptale-color-surface-panel) 56%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: COLORS.error }}>
        <AlertCircle size={18} />
        <span style={{ fontSize: '13px' }}>{error}</span>
      </div>
    </div>
  );
}

export function DiagnosticsPanelEmptyState() {
  return (
    <div style={styles['card']}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: COLORS.tertiary }}>
        <Bug size={18} />
        <span style={{ fontSize: '13px' }}>{translate('videoEditor.diagnostics.empty')}</span>
      </div>
    </div>
  );
}
