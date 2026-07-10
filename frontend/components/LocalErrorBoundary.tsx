'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { detectAppSection, reportFrontendError } from '@/lib/frontend-error-reporting';

type LocalErrorBoundaryRenderProps = {
  error: Error;
  retry: () => void;
};

type LocalErrorBoundaryProps = {
  children: ReactNode;
  boundaryName: string;
  fallback: (props: LocalErrorBoundaryRenderProps) => ReactNode;
};

type LocalErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  recoveryKey: number;
};

export default class LocalErrorBoundary extends Component<LocalErrorBoundaryProps, LocalErrorBoundaryState> {
  constructor(props: LocalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      recoveryKey: 0,
    };
  }

  static getDerivedStateFromError(error: Error): LocalErrorBoundaryState {
    return {
      hasError: true,
      error,
      recoveryKey: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
    const section = detectAppSection(pathname);

    void reportFrontendError({
      scope: 'widget',
      boundary: this.props.boundaryName,
      pathname,
      section,
      message: error.message || 'Unknown widget error',
      stack: error.stack || null,
      componentStack: errorInfo.componentStack || null,
      digest: null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      timestamp: new Date().toISOString(),
    });

    if (process.env.NODE_ENV !== 'production') {
      console.error(`[${this.props.boundaryName}] caught error:`, error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      recoveryKey: prev.recoveryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback({
        error: this.state.error,
        retry: this.handleRetry,
      });
    }

    return <React.Fragment key={this.state.recoveryKey}>{this.props.children}</React.Fragment>;
  }
}
