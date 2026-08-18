import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { ApiService } from '../../services/api';
import { DatabaseConnectionModal } from '../admin/DatabaseConnectionModal';
import { BookOpen, ShieldCheck, UserCheck, Wifi, RefreshCw, LogOut, ChevronDown, Database, Settings } from 'lucide-react';

interface HeaderProps {
  currentUser: User | null;
  onSelectRole: (role: 'PUBLIC' | 'TEACHER' | 'COORDINATOR' | 'ADMIN', userObj?: User) => void;
  onOpenLoginModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onSelectRole, onOpenLoginModal }) => {
  const [eventName, setEventName] = useState<string>('Loading...');
  const [showRoleDropdown, setShowRoleDropdown] = useState<boolean>(false);
  const [pendingDrafts, setPendingDrafts] = useState<number>(0);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string }>({ connected: false, message: 'Memeriksa database...' });
  const [isDbModalOpen, setIsDbModalOpen] = useState<boolean>(false);

  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR';

  const checkDb = () => {
    ApiService.checkHealth().then(res => {
      setDbStatus({
        connected: res.connected,
        message: res.connected 
          ? 'Database Google Sheets Terhubung' 
          : (ApiService.isMockMode ? 'Mode Mock' : 'Database Tidak Terhubung')
      });
    }).catch(() => {
      setDbStatus({
        connected: false,
        message: ApiService.isMockMode ? 'Mode Mock' : 'Database Tidak Terhubung'
      });
    });
  };

  useEffect(() => {
    ApiService.getCurrentEvent().then(evt => {
      if (evt) {
        setEventName(`${evt.event_name} (${evt.academic_year})`);
      }
    }).catch(() => {
      setEventName('Rumah Tahfidz LMS');
    });

    checkDb();
  }, [currentUser]);

  return (
    <header className="bg-emerald-900 text-white border-b border-emerald-800 shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-700/80 border border-emerald-500/30 flex items-center justify-center text-amber-300 shadow-inner">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">Rumah Tahfidz</span>
              <span className="bg-amber-400 text-emerald-950 font-bold text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">LMS</span>
            </div>
            <div className="text-xs text-emerald-200/90 flex items-center space-x-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{eventName}</span>
            </div>
          </div>
        </div>

        {/* Quick Role Switcher for Testing / Role Navigation & Auth */}
        <div className="flex items-center space-x-3">
          
          {/* Draft / Sync Status Badge */}
          {pendingDrafts > 0 ? (
            <div className="hidden md:flex items-center space-x-1 bg-amber-500/20 text-amber-200 border border-amber-500/30 text-xs px-2.5 py-1 rounded-full">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{pendingDrafts} Draft</span>
            </div>
          ) : (
            <button
              id="header-db-status-badge"
              onClick={() => {
                if (isPrivileged) setIsDbModalOpen(true);
              }}
              disabled={!isPrivileged}
              className={`hidden md:flex items-center space-x-1.5 border text-xs px-3 py-1 rounded-full transition ${
                dbStatus.connected 
                  ? 'bg-emerald-800/80 text-emerald-200 border-emerald-600/50 hover:bg-emerald-700' 
                  : 'bg-red-950/90 text-red-200 border-red-700 hover:bg-red-900'
              } ${isPrivileged ? 'cursor-pointer' : 'cursor-default'}`}
              title={isPrivileged ? 'Klik untuk membuka pengaturan Database Connection' : dbStatus.message}
            >
              <Wifi className={`w-3.5 h-3.5 ${dbStatus.connected ? 'text-emerald-400' : 'text-red-400'}`} />
              <span className="font-medium">{dbStatus.message}</span>
              {isPrivileged && <Settings className="w-3 h-3 text-emerald-300 ml-0.5 opacity-70" />}
            </button>
          )}

          {/* Quick Role Switcher Dropdown */}
          <div className="relative">
            <button
              id="btn-role-switcher"
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className="flex items-center space-x-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-700 transition shadow-sm"
              title="Ganti Mode / Role User"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">Role:</span>
              <span className="font-bold text-amber-200">
                {currentUser ? currentUser.role : 'PUBLIC (Umum)'}
              </span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showRoleDropdown && (
              <div 
                className="absolute right-0 mt-2 w-56 bg-white text-gray-800 rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2"
                onClick={() => setShowRoleDropdown(false)}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  Simulasi Akses User
                </div>
                
                <button
                  onClick={() => onSelectRole('PUBLIC')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between"
                >
                  <span className="font-medium text-gray-700">Public / Orang Tua</span>
                  <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">Tanpa Login</span>
                </button>

                <button
                  onClick={() => onSelectRole('TEACHER')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between"
                >
                  <span className="font-medium text-emerald-800">Guru / Ustaz (Halaqah 01)</span>
                  <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px]">TEACHER</span>
                </button>

                <button
                  onClick={() => onSelectRole('COORDINATOR')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between"
                >
                  <span className="font-medium text-blue-800">Koordinator Tahfidz</span>
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">COORDINATOR</span>
                </button>

                <button
                  onClick={() => onSelectRole('ADMIN')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between"
                >
                  <span className="font-medium text-purple-800">Administrator System</span>
                  <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">ADMIN</span>
                </button>
              </div>
            )}
          </div>

          {/* User Profile / Login Button */}
          {currentUser ? (
            <div className="flex items-center space-x-2 pl-2 border-l border-emerald-800">
              <div className="w-8 h-8 rounded-full bg-amber-400 text-emerald-950 flex items-center justify-center font-bold text-xs shadow-sm">
                {currentUser.display_name.charAt(0)}
              </div>
              <div className="hidden lg:block text-xs">
                <p className="font-semibold text-white leading-tight">{currentUser.display_name}</p>
                <p className="text-[10px] text-emerald-300 capitalize">{currentUser.role.toLowerCase()}</p>
              </div>
              <button
                onClick={() => onSelectRole('PUBLIC')}
                className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-800 rounded-lg transition"
                title="Keluar / Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLoginModal}
              className="bg-amber-400 hover:bg-amber-300 text-emerald-950 font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow transition flex items-center space-x-1.5"
            >
              <UserCheck className="w-4 h-4" />
              <span>Masuk Login</span>
            </button>
          )}

        </div>

      </div>

      {/* Database Connection Settings Modal (Admin/Coordinator Only) */}
      {isPrivileged && (
        <DatabaseConnectionModal
          isOpen={isDbModalOpen}
          onClose={() => setIsDbModalOpen(false)}
          onConnectionUpdated={(conn, msg) => {
            setDbStatus({
              connected: conn,
              message: conn ? 'Database Google Sheets Terhubung' : 'Database Tidak Terhubung'
            });
          }}
        />
      )}
    </header>
  );
};

