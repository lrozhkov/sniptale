import React from 'react';
import { translate } from '../../platform/i18n';

interface PageBootstrapErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface PageBootstrapErrorBoundaryState {
  hasError: boolean;
}

const fallbackShellStyle: React.CSSProperties = {
  alignItems: 'center',
  background: 'linear-gradient(180deg, #f7f8fb 0%, #eef2f7 100%)',
  color: '#172033',
  display: 'flex',
  fontFamily: '"Segoe UI", sans-serif',
  inset: 0,
  justifyContent: 'center',
  padding: '24px',
  position: 'fixed',
  textAlign: 'center',
};

const fallbackPanelStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.92)',
  border: '1px solid rgba(23, 32, 51, 0.12)',
  borderRadius: '16px',
  boxShadow: '0 18px 50px rgba(23, 32, 51, 0.12)',
  maxWidth: '420px',
  padding: '24px',
};

const fallbackTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
};

const fallbackBodyStyle: React.CSSProperties = {
  color: '#43506a',
  fontSize: '14px',
  lineHeight: 1.5,
  margin: '12px 0 0',
};

export class PageBootstrapErrorBoundary extends React.Component<
  PageBootstrapErrorBoundaryProps,
  PageBootstrapErrorBoundaryState
> {
  state: PageBootstrapErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): PageBootstrapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={fallbackShellStyle}>
        <div role="alert" style={fallbackPanelStyle}>
          <p style={fallbackTitleStyle}>{translate('common.bootstrap.errorTitle')}</p>
          <p style={fallbackBodyStyle}>{translate('common.bootstrap.errorBody')}</p>
        </div>
      </div>
    );
  }
}
