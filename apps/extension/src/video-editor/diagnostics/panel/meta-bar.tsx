import { AlertTriangle, Clock, Globe } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { safeHostname } from './helpers';
import { COLORS, diagnosticsPanelStyles as styles } from './styles';
import type { DiagnosticsPanelData } from './types';

interface DiagnosticsPanelMetaBarProps {
  meta: DiagnosticsPanelData['meta'];
}

export function DiagnosticsPanelMetaBar({ meta }: DiagnosticsPanelMetaBarProps) {
  if (!meta?.meta) {
    return null;
  }

  return (
    <div style={styles['metaBar']}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '11px',
          color: COLORS.tertiary,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Globe size={12} />
          {safeHostname(meta.meta.url)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={12} />
          {meta.meta.viewportWidth}×{meta.meta.viewportHeight}
        </span>
        {meta.meta.interrupted ? (
          <span
            style={{ color: COLORS.warning, display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <AlertTriangle size={12} />
            {translate('videoEditor.diagnostics.interruptedBadge')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
