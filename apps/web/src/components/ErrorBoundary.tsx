'use client';

import React from 'react';
import { logError } from '@/lib/logger';

interface State {
  hasError: boolean;
  errorId:  string | null;
}

interface Props {
  children:  React.ReactNode;
  name?:     string;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorId: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const errorId = `err_${Date.now().toString(36)}`;
    this.setState({ errorId });

    logError(error, {
      layer:     'Component',
      source:    'ErrorBoundary',
      component: this.props.name ?? 'Unknown',
      meta: {
        errorId,
        componentStack: info.componentStack,
      },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-4 max-w-xs">
          An unexpected error occurred. Please refresh the page or contact support if the problem persists.
        </p>
        {this.state.errorId && (
          <p className="text-[11px] text-gray-300 font-mono mb-4">
            Error ID: {this.state.errorId}
          </p>
        )}
        <button
          onClick={() => this.setState({ hasError: false, errorId: null })}
          className="px-4 py-2 text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}

// Inline wrapper for simpler use: <WithErrorBoundary name="MyCard"><MyCard /></WithErrorBoundary>
export function WithErrorBoundary({
  name,
  children,
  fallback,
}: Props) {
  return (
    <ErrorBoundary name={name} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}
