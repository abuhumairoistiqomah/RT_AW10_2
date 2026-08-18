import React, { useState, useEffect } from 'react';
import { ApiService, validateApiUrl, resolveApiUrl } from '../../services/api';
import { Database, Wifi, RefreshCw, CheckCircle2, AlertCircle, RotateCcw, Save, ShieldCheck, X } from 'lucide-react';

interface DatabaseConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionUpdated?: (connected: boolean, message: string) => void;
}

export const DatabaseConnectionModal: React.FC<DatabaseConnectionModalProps> = ({
  isOpen,
  onClose,
  onConnectionUpdated
}) => {
  const [urlInput, setUrlInput] = useState<string>('');
  const [status, setStatus] = useState<'IDLE' | 'CHECKING' | 'CONNECTED' | 'DISCONNECTED'>('IDLE');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastChecked, setLastChecked] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const currentUrl = resolveApiUrl();
      setUrlInput(currentUrl);
      setErrorMessage(null);
      setSuccessNotice(null);
      handleCheckCurrentHealth(currentUrl);
    }
  }, [isOpen]);

  const handleCheckCurrentHealth = async (targetUrl?: string) => {
    setStatus('CHECKING');
    setStatusMessage('Memeriksa status koneksi...');
    const result = await ApiService.testConnection(targetUrl || urlInput);
    const timeStr = new Date().toLocaleTimeString('id-ID');
    setLastChecked(timeStr);
    
    if (result.connected) {
      setStatus('CONNECTED');
      setStatusMessage('Terhubung (Database Google Sheets Terhubung)');
    } else {
      setStatus('DISCONNECTED');
      setStatusMessage(`Tidak Terhubung: ${result.message}`);
    }
    if (onConnectionUpdated) {
      onConnectionUpdated(result.connected, result.message);
    }
  };

  const handleTestConnection = async () => {
    setErrorMessage(null);
    setSuccessNotice(null);
    const validation = validateApiUrl(urlInput);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'URL Google Apps Script tidak valid.');
      setStatus('DISCONNECTED');
      setStatusMessage('Format URL tidak valid');
      return;
    }

    setIsProcessing(true);
    setStatus('CHECKING');
    setStatusMessage('Sedang menguji koneksi ke Web App...');

    try {
      const res = await ApiService.testConnection(urlInput);
      const timeStr = new Date().toLocaleTimeString('id-ID');
      setLastChecked(timeStr);

      if (res.connected) {
        setStatus('CONNECTED');
        setStatusMessage('Terhubung (Spreadsheet Connected)');
        setSuccessNotice('Koneksi berhasil! Database Google Sheets merespons dengan status OK.');
      } else {
        setStatus('DISCONNECTED');
        setStatusMessage(`Gagal terhubung: ${res.message}`);
        setErrorMessage(res.message);
      }
    } catch (e: any) {
      setStatus('DISCONNECTED');
      setStatusMessage('Koneksi bermasalah');
      setErrorMessage(e.message || 'Gagal menghubungi backend.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveAndConnect = async () => {
    setErrorMessage(null);
    setSuccessNotice(null);

    const validation = validateApiUrl(urlInput);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'URL Google Apps Script tidak valid.');
      return;
    }

    setIsProcessing(true);
    setStatus('CHECKING');

    try {
      // 1. Test health with the entered URL
      const testRes = await ApiService.testConnection(urlInput);
      if (!testRes.connected) {
        setStatus('DISCONNECTED');
        setErrorMessage(`Gagal menyimpan: ${testRes.message}. Pastikan Web App telah di-deploy dengan akses "Anyone".`);
        setIsProcessing(false);
        return;
      }

      // 2. Persist URL override
      ApiService.setRuntimeApiUrl(urlInput);

      // 3. Clear auth token (sessions belong to previous backend)
      ApiService.setAuthToken('');
      ApiService.setStoredUser(null);

      setStatus('CONNECTED');
      setStatusMessage('Database Google Sheets Terhubung');
      setSuccessNotice('Database berhasil dihubungkan! Sesi lama dibersihkan. Memuat ulang aplikasi...');

      if (onConnectionUpdated) {
        onConnectionUpdated(true, 'Database Google Sheets Terhubung');
      }

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      setStatus('DISCONNECTED');
      setErrorMessage(e.message || 'Gagal menyimpan konfigurasi.');
      setIsProcessing(false);
    }
  };

  const handleRefreshDatabase = async () => {
    setErrorMessage(null);
    setSuccessNotice(null);
    setIsProcessing(true);
    await handleCheckCurrentHealth();
    setIsProcessing(false);
    setSuccessNotice('Status database berhasil diperbarui.');
  };

  const handleResetToDefault = async () => {
    if (!window.confirm('Reset koneksi ke URL default dan bersihkan sesi aktif?')) {
      return;
    }
    setErrorMessage(null);
    setSuccessNotice(null);
    setIsProcessing(true);

    ApiService.clearRuntimeApiUrl();
    ApiService.setAuthToken('');
    ApiService.setStoredUser(null);

    const defaultUrl = resolveApiUrl();
    setUrlInput(defaultUrl);
    await handleCheckCurrentHealth(defaultUrl);

    setSuccessNotice('URL koneksi berhasil dikembalikan ke default. Memuat ulang...');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div 
      id="db-connection-modal" 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      aria-labelledby="db-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 id="db-modal-title" className="text-base font-bold tracking-tight">Database Connection</h3>
              <p className="text-xs text-slate-400">Konfigurasi URL Google Apps Script Web App Runtime</p>
            </div>
          </div>
          <button 
            id="btn-close-db-modal"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs text-slate-700">
          
          {/* Status Banner */}
          <div className={`p-4 rounded-xl border flex items-start space-x-3 ${
            status === 'CONNECTED' 
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : status === 'CHECKING'
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}>
            <div className="mt-0.5">
              {status === 'CONNECTED' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              {status === 'CHECKING' && <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />}
              {status === 'DISCONNECTED' && <AlertCircle className="w-4 h-4 text-red-600" />}
              {status === 'IDLE' && <Wifi className="w-4 h-4 text-slate-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs">
                  {status === 'CONNECTED' && 'Status: Terhubung'}
                  {status === 'CHECKING' && 'Status: Sedang Mengecek'}
                  {status === 'DISCONNECTED' && 'Status: Tidak Terhubung'}
                  {status === 'IDLE' && 'Status: Belum Diperiksa'}
                </span>
                {lastChecked && (
                  <span className="text-[11px] text-slate-500 font-mono">Last checked: {lastChecked}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs opacity-90 break-words">{statusMessage}</p>
            </div>
          </div>

          {/* Alert Notices */}
          {errorMessage && (
            <div className="p-3 bg-red-100 border border-red-200 text-red-800 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Form Input */}
          <div className="space-y-2">
            <label htmlFor="input-gas-url" className="block font-bold text-slate-800 text-xs">
              Google Apps Script Web App URL (/exec)
            </label>
            <div className="relative">
              <input
                id="input-gas-url"
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Format URL harus diawali <span className="font-mono text-slate-700">https://script.google.com/macros/s/</span> dan diakhiri dengan <span className="font-mono text-slate-700">/exec</span>.
            </p>
          </div>

          {/* Role & Security info */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-2.5 text-[11px] text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              Konfigurasi ini hanya dapat diakses oleh role <strong className="text-slate-800">ADMIN</strong> dan <strong className="text-slate-800">COORDINATOR</strong>. Kunci rahasia dan kata sandi tetap aman di server.
            </span>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <button
              id="btn-reset-db-default"
              type="button"
              onClick={handleResetToDefault}
              disabled={isProcessing}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition flex items-center space-x-1.5"
              title="Hapus override dan gunakan URL bawaan"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset ke Default</span>
            </button>
            <button
              id="btn-refresh-db"
              type="button"
              onClick={handleRefreshDatabase}
              disabled={isProcessing}
              className="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition flex items-center space-x-1.5"
              title="Periksa ulang status koneksi database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>Refresh Database</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-test-db-connection"
              type="button"
              onClick={handleTestConnection}
              disabled={isProcessing}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition shadow-sm flex items-center space-x-1.5"
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span>Test Connection</span>
            </button>
            <button
              id="btn-save-db-connection"
              type="button"
              onClick={handleSaveAndConnect}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-md flex items-center space-x-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan & Hubungkan</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
