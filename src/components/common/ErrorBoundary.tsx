import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { t } from '../../i18n';
import { getUiLocale } from '../../stores/useLocaleStore';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  fallbackRender?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught exception]:', error, errorInfo);
  }

  private handleReset = () => {
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (e) {
        console.error('Error in ErrorBoundary onReset:', e);
      }
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender(this.state.error, this.handleReset);
      }
      const locale = getUiLocale();

      return (
        <div
          data-testid="error-boundary-fallback"
          className="w-full h-full min-h-[160px] flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-200 select-none"
        >
          <div className="max-w-md w-full bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-100">
                {this.props.fallbackTitle || t('app.errorBoundaryDefaultTitle', undefined, locale)}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {this.props.fallbackMessage || t('app.errorBoundaryDefaultMessage', undefined, locale)}
              </p>
            </div>

            <div className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 text-left overflow-hidden">
              <p className="font-mono text-[11px] text-rose-300 break-all line-clamp-3">
                {this.state.error.message || String(this.state.error)}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2 w-full justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition shadow"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('app.resetAndRetry', undefined, locale)}</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('app.refreshWindow', undefined, locale)}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
