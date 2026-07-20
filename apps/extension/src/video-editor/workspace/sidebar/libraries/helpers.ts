import { translate } from '../../../../platform/i18n';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function getDiagnosticsToggleTitle(diagnosticsOpen: boolean): string {
  return diagnosticsOpen
    ? translate('videoEditor.sidebar.hideDiagnostics')
    : translate('videoEditor.sidebar.showDiagnostics');
}
