import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  loadingText = 'Menyimpan...',
  icon,
  variant = 'primary',
  children,
  className = '',
  disabled,
  ...props
}) => {
  const isDisabled = disabled || loading;

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700';
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-700 text-white';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white';
      case 'outline':
        return 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300';
      case 'primary':
      default:
        return 'bg-blue-600 hover:bg-blue-500 text-white';
    }
  };

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center space-x-2 font-bold transition rounded-xl text-xs shadow-sm min-h-[38px] px-5 py-2 select-none disabled:opacity-60 disabled:cursor-not-allowed ${getVariantStyles()} ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="truncate">{loadingText}</span>
        </>
      ) : (
        <>
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{children}</span>
        </>
      )}
    </button>
  );
};
