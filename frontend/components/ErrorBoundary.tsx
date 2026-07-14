'use client';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import ErrorRecoveryView from '@/components/ErrorRecoveryView';
import {
    clearCrashLoopState,
    detectAppSection,
    getSafeHomeRoute,
    getSectionLabel,
    recordCrashLoop,
    reportFrontendError,
} from '@/lib/frontend-error-reporting';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    loopDetected: boolean;
    recoveryKey: number;
    safeHomeHref: string;
    sectionLabel: string;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child component tree and displays a fallback UI.
 * Prevents entire app from crashing due to a single component error.
 */
class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            loopDetected: false,
            recoveryKey: 0,
            safeHomeHref: '/',
            sectionLabel: 'App',
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
            loopDetected: false,
            recoveryKey: 0,
            safeHomeHref: '/',
            sectionLabel: 'App',
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const pathname = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search || ''}`
            : '/';
        const section = detectAppSection(pathname);
        const crashState = recordCrashLoop();

        this.setState({
            loopDetected: crashState.loopDetected,
            safeHomeHref: getSafeHomeRoute(pathname),
            sectionLabel: getSectionLabel(section),
        });

        void reportFrontendError({
            scope: 'root',
            boundary: 'root-error-boundary',
            pathname,
            section,
            message: error.message || 'Unknown root error',
            stack: error.stack || null,
            componentStack: errorInfo.componentStack || null,
            digest: null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            timestamp: new Date().toISOString(),
        });

        if (process.env.NODE_ENV === 'development') {
            console.error('ErrorBoundary caught:', error, errorInfo);
        }
    }

    handleRetry = () => {
        clearCrashLoopState();
        this.setState((prev) => ({
            hasError: false,
            error: null,
            loopDetected: false,
            recoveryKey: prev.recoveryKey + 1,
            safeHomeHref: prev.safeHomeHref,
            sectionLabel: prev.sectionLabel,
        }));
    };

    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <ErrorRecoveryView
                    title="Something went wrong"
                    description={
                        this.state.loopDetected
                            ? 'This screen keeps crashing. Open a safe section home or refresh the app before trying again.'
                            : 'We encountered an unexpected error. Try recovering the app or open a safe home route.'
                    }
                    sectionLabel={this.state.sectionLabel}
                    errorMessage={this.state.error?.message || null}
                    fullScreen
                    retryLabel={this.state.loopDetected ? 'Retry App' : 'Try Again'}
                    onRetry={this.handleRetry}
                    retryDisabled={false}
                    secondaryLabel="Go to Safe Home"
                    onSecondaryAction={() => window.location.assign(this.state.safeHomeHref || '/')}
                    tertiaryLabel="Refresh Page"
                    onTertiaryAction={() => window.location.reload()}
                />
            );
        }

        return <React.Fragment key={this.state.recoveryKey}>{this.props.children}</React.Fragment>;
    }
}

export default ErrorBoundary;
