import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { ApiService } from '../../services/api';
import { LogIn, ShieldAlert, X, KeyRound, Eye, EyeOff, Loader2, Search, Check } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  onQuickRole?: (role: 'PUBLIC' | 'TEACHER' | 'COORDINATOR' | 'ADMIN') => void;
}

interface AccountSuggestion {
  username: string;
  display_name: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess
}) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Search suggestions state
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Debounced search for accounts
  useEffect(() => {
    if (!isOpen) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await ApiService.searchLoginAccounts(trimmed);
        setSuggestions(results);
        setShowDropdown(results.length > 0);
      } catch (e) {
        setSuggestions([]);
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [username, isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!isOpen) return null;

  const handleSelectAccount = (account: AccountSuggestion) => {
    setUsername(account.username);
    setShowDropdown(false);
    // Focus password input after selecting account
    const passInput = document.getElementById('login-password');
    if (passInput) {
      passInput.focus();
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setErrorMsg('');
    setShowDropdown(false);

    try {
      const res = await ApiService.login(username.trim(), password);
      if (res && res.user) {
        setPassword('');
        setUsername('');
        onLoginSuccess(res.user);
        onClose();
      } else {
        setErrorMsg('Username atau password tidak cocok.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Username atau password tidak cocok.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setErrorMsg('');
    setPassword('');
    setUsername('');
    setShowPassword(false);
    setShowDropdown(false);
    onClose();
  };

  return (
    <div id="login-modal-overlay" className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div id="login-modal-container" className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight text-white">Rumah Tahfidz LMS Console</h3>
              <p className="text-[11px] text-slate-400">Verifikasi Autentikasi & Hak Akses</p>
            </div>
          </div>
          <button
            id="login-close-btn"
            type="button"
            disabled={loading}
            onClick={handleClose}
            aria-label="Tutup modal login"
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          
          {errorMsg && (
            <div id="login-error-banner" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2.5 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Form Login */}
          <form id="login-form" onSubmit={handleLoginSubmit} className="space-y-4">
            
            {/* Account Field with Search Suggestions */}
            <div className="relative" ref={dropdownRef}>
              <label htmlFor="login-username" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center justify-between">
                <span>Pilih Akun / Username</span>
                {isSearching && (
                  <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                    Mencari...
                  </span>
                )}
              </label>
              
              <div className="relative flex items-center">
                <input
                  id="login-username"
                  type="text"
                  required
                  disabled={loading}
                  value={username}
                  onChange={e => {
                    setUsername(e.target.value);
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowDropdown(true);
                  }}
                  placeholder="Cari nama atau username..."
                  autoComplete="username"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Suggestions Dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div 
                  id="login-account-suggestions"
                  className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95"
                >
                  <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Pilih Akun Terdaftar ({suggestions.length})
                  </div>
                  {suggestions.map((acc) => {
                    const isSelected = username.trim().toLowerCase() === acc.username.toLowerCase();
                    return (
                      <button
                        key={acc.username}
                        type="button"
                        onClick={() => handleSelectAccount(acc)}
                        className={`w-full text-left px-3.5 py-2.5 hover:bg-blue-50 transition flex items-center justify-between text-xs ${
                          isSelected ? 'bg-blue-50 text-blue-900 font-bold' : 'text-slate-800'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="font-semibold text-slate-900 truncate">{acc.display_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">Username: <span className="font-bold text-blue-700">{acc.username}</span></div>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-blue-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Kata Sandi (Password)
              </label>
              <div className="relative flex items-center">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={loading}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-3.5 pr-11 py-2.5 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  id="toggle-password-visibility-btn"
                  disabled={loading}
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 focus:text-blue-600 focus:outline-none rounded-lg transition disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs md:text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifikasi...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Masuk Aplikasi</span>
                  </>
                )}
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
};
