import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  id?: string;
  type?: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
  duration?: number; // duration in ms, default 3500
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  type = 'success',
  message,
  detail,
  duration = 3500,
  onClose
}) => {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const isSuccess = type === 'success';
  const isError = type === 'error';

  return (
    <div
      id="teacher-floating-toast"
      role="alert"
      aria-live="assertive"
      className="fixed top-4 left-1/2 -translate-x-1/2 sm:right-6 sm:left-auto sm:translate-x-0 z-[9999] pointer-events-none w-[92vw] max-w-md animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div
        className={`pointer-events-auto rounded-xl shadow-xl border p-4 flex items-start gap-3.5 transition-all ${
          isSuccess
            ? 'bg-emerald-950 text-emerald-50 border-emerald-500/80 shadow-emerald-950/40 ring-1 ring-emerald-400/20'
            : isError
            ? 'bg-rose-950 text-rose-50 border-rose-500/80 shadow-rose-950/40 ring-1 ring-rose-400/20'
            : 'bg-slate-900 text-slate-50 border-slate-700 shadow-slate-950/40 ring-1 ring-slate-400/20'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {isSuccess && (
            <div className="w-6 h-6 rounded-full bg-emerald-500 text-emerald-950 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-950 stroke-[3]" />
            </div>
          )}
          {isError && (
            <div className="w-6 h-6 rounded-full bg-rose-500 text-rose-950 flex items-center justify-center shadow-xs">
              <AlertCircle className="w-4 h-4 text-rose-950 stroke-[3]" />
            </div>
          )}
          {!isSuccess && !isError && (
            <div className="w-6 h-6 rounded-full bg-blue-500 text-blue-950 flex items-center justify-center shadow-xs">
              <Info className="w-4 h-4 text-blue-950 stroke-[3]" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <p className="text-xs md:text-sm font-bold leading-snug tracking-tight text-white">
            {message}
          </p>
          {detail && (
            <p
              className={`text-[11px] md:text-xs mt-0.5 leading-relaxed font-medium ${
                isSuccess
                  ? 'text-emerald-200/90'
                  : isError
                  ? 'text-rose-200/90'
                  : 'text-slate-300'
              }`}
            >
              {detail}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className={`shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg transition text-slate-400 hover:text-white ${
            isSuccess
              ? 'hover:bg-emerald-900/60'
              : isError
              ? 'hover:bg-rose-900/60'
              : 'hover:bg-slate-800'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
