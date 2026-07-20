import { Bug, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { COLORS, diagnosticsPanelStyles as styles } from './styles';

interface DiagnosticsPanelHeaderProps {
  eventsCount: number;
  isExporting: boolean;
  onExportJSON: () => void;
  onExportZIP: () => void;
  onClose?: () => void;
}

export function DiagnosticsPanelHeader({
  eventsCount,
  isExporting,
  onExportJSON,
  onExportZIP,
  onClose,
}: DiagnosticsPanelHeaderProps) {
  return (
    <div style={styles['header']}>
      <div>
        <DiagnosticsPanelTitle eventsCount={eventsCount} />
        <p style={styles['headerDisclosure']} data-ui="video-editor.diagnostics.export-disclosure">
          {translate('videoEditor.diagnostics.exportDisclosure')}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ProductActionButton
          compact
          type="button"
          onClick={onExportJSON}
          data-ui="video-editor.diagnostics.export-json"
          tone="secondary"
        >
          JSON
        </ProductActionButton>
        <ProductActionButton
          compact
          type="button"
          onClick={onExportZIP}
          disabled={isExporting}
          data-ui="video-editor.diagnostics.export-zip"
          tone="primary"
        >
          {isExporting ? translate('videoEditor.diagnostics.exporting') : 'ZIP'}
        </ProductActionButton>
        {onClose ? (
          <EditorIconButton
            title={translate('common.actions.close')}
            onClick={onClose}
            data-ui="video-editor.diagnostics.close"
          >
            <X size={14} />
          </EditorIconButton>
        ) : null}
      </div>
    </div>
  );
}

function DiagnosticsPanelTitle(props: { eventsCount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={styles['iconBox']}>
        <Bug size={16} style={{ color: COLORS.iconPurple }} />
      </div>
      <div>
        <h3 style={styles['title']}>{translate('videoEditor.diagnostics.title')}</h3>
        <p style={styles['subtitle']}>
          {props.eventsCount} {translate('videoEditor.diagnostics.eventsSuffix')}
        </p>
      </div>
    </div>
  );
}
