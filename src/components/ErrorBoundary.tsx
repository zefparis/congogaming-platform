import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
    const search = typeof window !== 'undefined' ? window.location.search : '';

    console.error('[ErrorBoundary] Caught render error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      route: `${pathname}${search}`,
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#0f0f0f',
            color: '#fff',
            textAlign: 'center',
            gap: 16,
          }}
        >
          <p style={{ fontSize: 18, fontWeight: 600 }}>
            Une erreur est survenue.
          </p>
          <p style={{ fontSize: 14, color: '#a0a0a0', maxWidth: 320 }}>
            L'application a rencontré un problème inattendu. Vous pouvez
            réessayer ou revenir à l'accueil.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: '1px solid #333',
                background: 'transparent',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Accueil
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
