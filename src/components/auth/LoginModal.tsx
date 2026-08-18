import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { ApiService } from '../../services/api';
import { LogIn, ShieldAlert, X, Eye, EyeOff, Loader2, Search, Check, Sparkles } from 'lucide-react';
import { SchoolLogo } from '../common/SchoolLogo';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  onQuickRole?: (role: 'PUBLIC' | 'TEACHER' | 'COORDINATOR' | 'ADMIN') => void;
  onGoToPublicProgress?: () => void;
}

interface AccountSuggestion {
  username: string;
  display_name: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onGoToPublicProgress
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
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const suggestionsContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Debounced search for accounts
  useEffect(() => {
    if (!isOpen) {
      setSuggestions([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await ApiService.searchLoginAccounts(trimmed);
        // Sort results by relevance (exact > starts with > contains)
        const q = trimmed.toLowerCase();
        const sorted = [...(results || [])].sort((a, b) => {
          const aUser = a.username.toLowerCase();
          const aDisplay = a.display_name.toLowerCase();
          const bUser = b.username.toLowerCase();
          const bDisplay = b.display_name.toLowerCase();

          const aExact = aUser === q || aDisplay === q;
          const bExact = bUser === q || bDisplay === q;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          const aStarts = aUser.startsWith(q) || aDisplay.startsWith(q) || aDisplay.split(/\s+/).some(p => p.startsWith(q));
          const bStarts = bUser.startsWith(q) || bDisplay.startsWith(q) || bDisplay.split(/\s+/).some(p => p.startsWith(q));
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;

          return aDisplay.localeCompare(bDisplay);
        });

        setSuggestions(sorted);
        setShowDropdown(sorted.length > 0);
        setHighlightedIndex(-1);
      } catch (e) {
        setSuggestions([]);
        setShowDropdown(false);
        setHighlightedIndex(-1);
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
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Visual ordering for UPWARD opening dropdown:
  // Reversing the array places the highest-priority item at the bottom of the dropdown, directly above the search field.
  const displaySuggestions = [...suggestions].reverse();

  // Ensure scroll position is near the bottom when suggestions appear so most relevant items are immediately visible
  useEffect(() => {
    if (showDropdown && suggestionsContainerRef.current) {
      suggestionsContainerRef.current.scrollTop = suggestionsContainerRef.current.scrollHeight;
    }
  }, [showDropdown, suggestions]);

  // Scroll highlighted item into view if keyboard navigation occurs
  useEffect(() => {
    if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest'
      });
    }
  }, [highlightedIndex]);

  if (!isOpen) return null;

  const handleSelectAccount = (account: AccountSuggestion) => {
    setUsername(account.username);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    // Focus password input after selecting account
    const passInput = document.getElementById('login-password');
    if (passInput) {
      passInput.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || displaySuggestions.length === 0) {
      if (e.key === 'ArrowUp' && suggestions.length > 0) {
        setShowDropdown(true);
        e.preventDefault();
      }
      return;
    }

    const displayLength = displaySuggestions.length;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        if (prev === -1) return displayLength - 1; // start closest to input
        return prev > 0 ? prev - 1 : 0;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        if (prev === -1) return displayLength - 1;
        if (prev < displayLength - 1) return prev + 1;
        return -1; // return focus to input
      });
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < displayLength) {
        e.preventDefault();
        handleSelectAccount(displaySuggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setErrorMsg('');
    setShowDropdown(false);
    setHighlightedIndex(-1);

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
    setHighlightedIndex(-1);
    onClose();
  };

  return (
    <div id="login-modal-overlay" className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div id="login-modal-container" className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 relative overflow-visible">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800 rounded-t-2xl">
          <div className="flex items-center space-x-3.5 min-w-0">
            <SchoolLogo size="lg" className="w-12 h-12 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/60 shadow-sm shrink-0" />
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base tracking-tight text-white leading-tight">
                Rumah Tahfidz Al-Wildan 10
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-300 font-medium leading-snug mt-0.5 break-words">
                Sistem Informasi Terpadu Rumah Tahfidz
              </p>
            </div>
          </div>
          <button
            id="login-close-btn"
            type="button"
            disabled={loading}
            onClick={handleClose}
            aria-label="Tutup modal login"
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 sm:space-y-5">
          
          {errorMsg && (
            <div id="login-error-banner" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2.5 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Form Login */}
          <form id="login-form" onSubmit={handleLoginSubmit} className="space-y-4">
            
            {/* Account Field with Search Suggestions */}
            <div className="space-y-1.5" ref={dropdownRef}>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
                <label htmlFor="login-username">Pilih Akun / Username</label>
                {isSearching && (
                  <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                    Mencari...
                  </span>
                )}
              </div>
              
              <div className="relative flex items-center account-search-wrapper">
                {/* Suggestions Dropdown OPENING UPWARD */}
                {showDropdown && displaySuggestions.length > 0 && (
                  <div 
                    id="login-account-suggestions"
                    ref={suggestionsContainerRef}
                    className="account-suggestions absolute left-0 right-0 bottom-[calc(100%+6px)] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-150"
                    style={{ maxHeight: 'min(260px, 42vh)' }}
                  >
                    <div className="sticky top-0 bg-slate-50/95 backdrop-blur-xs px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between z-10">
                      <span>Pilih Akun Terdaftar ({displaySuggestions.length})</span>
                      <span className="text-[9px] font-normal text-slate-400">↑ ↓ Pilih • Enter</span>
                    </div>
                    {displaySuggestions.map((acc, index) => {
                      const isSelected = username.trim().toLowerCase() === acc.username.toLowerCase();
                      const isHighlighted = highlightedIndex === index;
                      return (
                        <button
                          key={acc.username}
                          ref={el => { itemRefs.current[index] = el; }}
                          type="button"
                          onClick={() => handleSelectAccount(acc)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={`w-full text-left px-3.5 py-2.5 transition flex items-center justify-between text-xs cursor-pointer ${
                            isHighlighted
                              ? 'bg-blue-50 text-blue-950 font-medium'
                              : isSelected
                              ? 'bg-blue-50/60 text-blue-900 font-bold'
                              : 'text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-semibold text-slate-900 truncate">{acc.display_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              Username: <span className="font-bold text-blue-700">{acc.username}</span>
                            </div>
                          </div>
                          {(isSelected || isHighlighted) && (
                            <Check className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600 font-bold' : 'text-blue-400'}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <input
                  id="login-username"
                  type="text"
                  required
                  disabled={loading}
                  value={username}
                  onChange={e => {
                    setUsername(e.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowDropdown(true);
                  }}
                  placeholder="Cari nama atau username..."
                  autoComplete="username"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
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

            <div className="pt-1">
              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs md:text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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

          {/* Public Access Option Below Login */}
          <div className="pt-3 border-t border-slate-200 text-center space-y-2.5">
            <div className="relative flex py-0.5 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">ATAU</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>
            
            <div className="space-y-1 px-1">
              <h4 className="text-xs font-bold text-slate-800">
                Ingin melihat perkembangan hafalan siswa?
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed max-w-sm mx-auto">
                Orang tua/wali dapat melihat perkembangan siswa menggunakan <strong>Kode Akses Siswa</strong> yang diberikan oleh Admin.
              </p>
            </div>

            <button
              id="login-public-progress-btn"
              type="button"
              onClick={() => {
                if (onGoToPublicProgress) {
                  onGoToPublicProgress();
                } else {
                  onClose();
                }
              }}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-2 border border-slate-200 shadow-2xs cursor-pointer"
            >
              <Search className="w-4 h-4 text-slate-600" />
              <span>Lihat Progress Siswa</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
