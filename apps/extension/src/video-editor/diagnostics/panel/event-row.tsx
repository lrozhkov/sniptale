import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DiagnosticEvent } from '@sniptale/platform/observability/diagnostics/types';
import { formatTs, getEventColor, getEventIcon, getHumanReadableAction } from './helpers';
import { diagnosticsPanelStyles as styles } from './styles';

interface DiagnosticsPanelEventRowProps {
  event: DiagnosticEvent;
  expanded: boolean;
  onToggle: () => void;
}

export function DiagnosticsPanelEventRow({
  event,
  expanded,
  onToggle,
}: DiagnosticsPanelEventRowProps) {
  const Icon = getEventIcon(event);
  const color = getEventColor(event);
  const humanAction = getHumanReadableAction(event, formatTs);
  const rowStyles = {
    eventRow: styles['eventRow'],
    eventChevron: styles['eventChevron'],
    eventIcon: styles['eventIcon'],
    eventContent: styles['eventContent'],
    eventTs: styles['eventTs'],
    eventKind: styles['eventKind'],
    eventMessage: styles['eventMessage'],
    eventData: styles['eventData'],
    eventDataPre: styles['eventDataPre'],
  };

  return (
    <div>
      <button onClick={onToggle} style={rowStyles.eventRow}>
        <div style={{ ...rowStyles.eventChevron, color }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div style={{ ...rowStyles.eventIcon, color }}>
          <Icon size={14} />
        </div>
        <div style={rowStyles.eventContent}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={rowStyles.eventTs}>{formatTs(event.tsMs)}</span>
            <span style={{ ...rowStyles.eventKind, color }}>{humanAction?.kind || event.kind}</span>
          </div>
          <p style={rowStyles.eventMessage}>{humanAction?.displayText || event.message}</p>
        </div>
      </button>

      {expanded && event.data !== undefined ? (
        <div style={rowStyles.eventData}>
          <pre style={rowStyles.eventDataPre}>{JSON.stringify(event.data, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}
