import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { ApiService } from './services/api';
import { StudentProgressLookup } from './components/public/StudentProgressLookup';
import { MyHalaqah } from './components/teacher/MyHalaqah';
import { SessionAssessment } from './components/teacher/SessionAssessment';
import { FinalEvaluation } from './components/teacher/FinalEvaluation';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { EventManagement } from './components/admin/EventManagement';
import { StudentManagement } from './components/admin/StudentManagement';
import { HalaqahManagement } from './components/admin/HalaqahManagement';
import { TeacherAssignment } from './components/admin/TeacherAssignment';
import { HalaqahStudentAssignment } from './components/admin/HalaqahStudentAssignment';
import { CompletenessChecker } from './components/admin/CompletenessChecker';
import { ExecutiveAnalytics } from './components/analytics/ExecutiveAnalytics';
import { Administration } from './components/admin/Administration';
import { DatabaseConnectionModal } from './components/admin/DatabaseConnectionModal';
import { LoginModal } from './components/auth/LoginModal';
import { TeacherWorkspaceProvider } from './context/TeacherWorkspaceContext';
import {
  BarChart3, Search, Users, Calendar, BookOpen, UserCheck,
  TrendingUp, Settings, Layers, Menu, X, Shield,
  Activity, CheckCircle2, ShieldAlert, Database, Wifi, LogOut
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => ApiService.getStoredUser());
  const [currentRole, setCurrentRole] = useState<UserRole | 'PUBLIC'>('PUBLIC');
  const [activeTab, setActiveTab] = useState<string>('student-progress');
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState<boolean>(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState<boolean>(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [assessmentNavState, setAssessmentNavState] = useState<{ studentId?: string; sessionNo?: number }>({});
  const [evaluationNavState, setEvaluationNavState] = useState<{ studentId?: string; sessionConfigId?: string }>({});
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<'VALID' | 'INVALID' | 'CHECKING' | 'GUEST'>(() => {
    return ApiService.getAuthToken() ? 'CHECKING' : 'GUEST';
  });
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string }>({
    connected: false,
    message: 'Memeriksa database...'
  });

  // Startup Session Verification (Persistent Authentication Store)
  useEffect(() => {
    const token = ApiService.getAuthToken();
    if (token) {
      setAuthStatus('CHECKING');
      ApiService.validateSession().then(res => {
        if (res.valid && res.user) {
          setCurrentUser(res.user);
          setAuthStatus('VALID');
        } else {
          setCurrentUser(null);
          setCurrentRole('PUBLIC');
          setActiveTab('student-progress');
          setAuthStatus('INVALID');
        }
      }).catch(() => {
        // Keep offline cached user if temporary network issue, do not abruptly logout
        setAuthStatus('VALID');
      });
    } else {
      setAuthStatus('GUEST');
    }
  }, []);

  // Health check on mount
  useEffect(() => {
    ApiService.checkHealth().then(res => {
      setDbStatus(res);
    }).catch(() => {
      setDbStatus({ connected: false, message: 'Database Tidak Terhubung' });
    });
  }, []);

  // Tab wake / window focus revalidation with debouncing
  useEffect(() => {
    let lastRevalidationTime = Date.now();

    const handleTabResume = async () => {
      const now = Date.now();
      // Throttle to avoid spamming Apps Script (min 30 seconds interval)
      if (now - lastRevalidationTime < 30000) return;
      lastRevalidationTime = now;

      // 1. Re-check health in background
      ApiService.checkHealth().then(res => {
        setDbStatus(res);
      }).catch(() => {
        setDbStatus({ connected: false, message: 'Database Tidak Terhubung' });
      });

      // 2. Re-verify session if logged in
      const token = ApiService.getAuthToken();
      if (token) {
        setAuthStatus('CHECKING');
        try {
          const res = await ApiService.validateSession();
          if (res.valid && res.user) {
            setAuthStatus('VALID');
            // Notify active components to revalidate in background safely (stale-while-revalidate)
            window.dispatchEvent(new CustomEvent('rt_app_resumed'));
          } else {
            setAuthStatus('INVALID');
            setCurrentUser(null);
            setCurrentRole('PUBLIC');
            setActiveTab('student-progress');
            setAuthNotice('Sesi login telah berakhir. Silakan masuk kembali.');
          }
        } catch {
          // Transient network issue on wake, retain existing state
          setAuthStatus('VALID');
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleTabResume();
      }
    };

    const onFocus = () => {
      handleTabResume();
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Initialize role sync
  useEffect(() => {
    if (currentUser) {
      setCurrentRole(currentUser.role);
      setAuthStatus('VALID');
      if (currentUser.role === 'TEACHER') {
        setActiveTab('my-halaqah');
      } else if (currentUser.role === 'ADMIN' || currentUser.role === 'COORDINATOR') {
        setActiveTab('admin-dashboard');
      }
    } else {
      setCurrentRole('PUBLIC');
      setAuthStatus('GUEST');
      setActiveTab('student-progress');
    }
  }, [currentUser]);

  // Auth expiration listener
  useEffect(() => {
    const handleAuthExpired = (e: Event) => {
      const customEvent = e as CustomEvent;
      setCurrentUser(null);
      setCurrentRole('PUBLIC');
      setAuthStatus('INVALID');
      setActiveTab('student-progress');
      setAuthNotice(customEvent.detail?.message || 'Sesi login telah berakhir. Silakan masuk kembali.');
    };

    window.addEventListener('rt_auth_expired', handleAuthExpired);
    return () => window.removeEventListener('rt_auth_expired', handleAuthExpired);
  }, []);

  const handleSelectRole = async (role: 'PUBLIC' | 'TEACHER' | 'COORDINATOR' | 'ADMIN', userObj?: User) => {
    if (role === 'PUBLIC') {
      await ApiService.logout();
      setCurrentUser(null);
      setCurrentRole('PUBLIC');
      setActiveTab('student-progress');
      setAuthNotice(null);
    } else {
      const mockUser: User = userObj || {
        user_id: `USR-${role}-01`,
        username: role.toLowerCase(),
        display_name: role === 'TEACHER' ? 'Ust. Ahmad Dahlan' : role === 'COORDINATOR' ? 'Ust. Farhan Lc.' : 'Administrator Tahfidz',
        role: role,
        teacher_id: role === 'TEACHER' ? 'TCH000001' : undefined,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      ApiService.setStoredUser(mockUser);
      setCurrentUser(mockUser);
      setCurrentRole(role);
      setAuthNotice(null);
      if (role === 'TEACHER') {
        setActiveTab('my-halaqah');
      } else {
        setActiveTab('admin-dashboard');
      }
    }
  };

  const handleNavigateToAssessment = (studentId?: string, sessionNo?: number) => {
    setAssessmentNavState({ studentId, sessionNo });
    setActiveTab('session-assessment');
  };

  const handleNavigateToEvaluation = (studentId?: string, sessionConfigId?: string) => {
    setEvaluationNavState({ studentId, sessionConfigId });
    setActiveTab('final-evaluation');
  };

  // Frontend Role Guard logic
  const isAdminRole = currentRole === 'ADMIN' || currentRole === 'COORDINATOR';
  const isTeacherRole = currentRole === 'TEACHER' || isAdminRole;

  const canAccessTab = (tab: string) => {
    if (isAdminRole) return true;
    if (isTeacherRole) return ['student-progress', 'my-halaqah', 'session-assessment', 'final-evaluation'].includes(tab);
    return tab === 'student-progress';
  };

  const getBreadcrumb = () => {
    switch (activeTab) {
      case 'student-progress': return 'Konsol Publik / Cek Perkembangan Hafalan Siswa';
      case 'my-halaqah': return 'Portal Guru / Halaqah Saya';
      case 'session-assessment': return 'Portal Guru / Input Penilaian Sesi';
      case 'final-evaluation': return 'Portal Guru / Evaluasi Akhir Event';
      case 'admin-dashboard': return 'Command Center / Operational Dashboard';
      case 'event-mgmt': return 'Manajemen Event / Konfigurasi Acara & Sesi';
      case 'student-mgmt': return 'Manajemen Master Data / Data Siswa & Target';
      case 'halaqah-mgmt': return 'Manajemen Master Data / Kelompok Halaqah & Guru';
      case 'teacher-assignment': return 'Manajemen Operasional / Penugasan Guru';
      case 'assignments-mgmt': return 'Manajemen Operasional / Penempatan Siswa';
      case 'completeness-checker': return 'Data & Laporan / Completeness Checker';
      case 'analytics': return 'Data & Laporan / Analytics Eksekutif';
      case 'administration': return 'Sistem & Administrasi / Pengaturan Pengguna';
      default: return 'Rumah Tahfidz LMS';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* SIDEBAR BACKDROP OVERLAY FOR MOBILE */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 transform lg:relative lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        
        {/* Brand Header */}
        <div className="p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-extrabold text-white text-sm shadow-sm">
              RT
            </div>
            <div>
              <span className="text-white font-bold text-base tracking-tight block leading-tight">Rumah Tahfidz</span>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">LMS Console</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Section Links */}
        <nav className="mt-4 flex-1 overflow-y-auto px-3 space-y-6">
          
          {/* Public Views */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
              Konsol Publik
            </div>
            <div className="space-y-1">
              <button
                onClick={() => { setActiveTab('student-progress'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                  activeTab === 'student-progress'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Search className="w-4 h-4" />
                <span>Cek Perkembangan Hafalan Siswa</span>
              </button>
            </div>
          </div>

          {/* Teacher Navigation */}
          {isTeacherRole && (
            <div>
              <div className="px-3 mb-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                Modul Guru & Assessment
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => { setActiveTab('my-halaqah'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'my-halaqah'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Halaqah Saya</span>
                </button>

                <button
                  onClick={() => { setActiveTab('session-assessment'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'session-assessment'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Penilaian Sesi</span>
                </button>

                <button
                  onClick={() => { setActiveTab('final-evaluation'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'final-evaluation'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Evaluasi Akhir</span>
                </button>
              </div>
            </div>
          )}

          {/* Management / Admin Navigation */}
          {isAdminRole && (
            <div>
              <div className="px-3 mb-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                Sistem & Admin
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => { setActiveTab('admin-dashboard'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'admin-dashboard'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>Dashboard Ops</span>
                </button>

                <button
                  onClick={() => { setActiveTab('event-mgmt'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'event-mgmt'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>Manajemen Event</span>
                </button>

                <button
                  onClick={() => { setActiveTab('student-mgmt'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'student-mgmt'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Master Siswa</span>
                </button>

                <button
                  onClick={() => { setActiveTab('halaqah-mgmt'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'halaqah-mgmt'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Kelompok Halaqah</span>
                </button>

                <button
                  onClick={() => { setActiveTab('teacher-assignment'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'teacher-assignment'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Penugasan Guru</span>
                </button>

                <button
                  onClick={() => { setActiveTab('assignments-mgmt'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'assignments-mgmt'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Penempatan Siswa</span>
                </button>

                <button
                  onClick={() => { setActiveTab('completeness-checker'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'completeness-checker'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Completeness Checker</span>
                </button>

                <button
                  onClick={() => { setActiveTab('analytics'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'analytics'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Executive Analytics</span>
                </button>

                <button
                  onClick={() => { setActiveTab('administration'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    activeTab === 'administration'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Administrasi & Users</span>
                </button>
              </div>
            </div>
          )}

        </nav>

        {/* System Footprint / Data Storage Status */}
        <div className="p-4 mt-auto border-t border-slate-800 space-y-2">
          <div 
            onClick={() => { if (isAdminRole) setIsDbModalOpen(true); }}
            className={`bg-slate-800/80 rounded p-3 space-y-2 border border-slate-700/60 transition ${
              isAdminRole ? 'cursor-pointer hover:border-emerald-500/50 hover:bg-slate-800' : ''
            }`}
            title={isAdminRole ? 'Klik untuk membuka pengaturan Database Connection' : dbStatus.message}
          >
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-400" />
                <span>Data Storage</span>
              </span>
              <span className={`text-[10px] font-bold ${dbStatus.connected ? 'text-emerald-400' : 'text-amber-400'}`}>
                {dbStatus.connected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full w-full ${dbStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
            </div>
            <div className="text-[10px] text-slate-400 font-mono truncate">
              {dbStatus.message}
            </div>
          </div>

          {currentUser && (
            <button
              id="sidebar-logout-btn"
              onClick={() => { setSidebarOpen(false); setIsLogoutConfirmOpen(true); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded text-xs font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar ({currentUser.display_name?.split(' ')[0] || currentUser.username})</span>
            </button>
          )}
        </div>

      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* TOP HEADER BAR */}
        <header className="h-14 sm:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-2.5 sm:px-6 lg:px-8 shrink-0 gap-2 w-full max-w-full overflow-hidden box-border">
          
          <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs sm:text-sm min-w-0 flex-1 overflow-hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 sm:p-2 text-slate-600 hover:text-slate-900 rounded-lg bg-slate-100 hover:bg-slate-200 transition shrink-0"
              aria-label="Buka Menu"
            >
              <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <span className="text-slate-400 font-medium hidden lg:inline shrink-0">Rumah Tahfidz LMS</span>
            <span className="text-slate-300 hidden lg:inline shrink-0">/</span>
            <span className="font-semibold text-slate-800 truncate block">{getBreadcrumb()}</span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            
            {/* Database Connection Status Badge */}
            <button
              id="topbar-db-status-badge"
              onClick={() => { if (isAdminRole) setIsDbModalOpen(true); }}
              disabled={!isAdminRole}
              className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border transition shrink-0 ${
                dbStatus.connected
                  ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                  : 'text-rose-800 bg-rose-50 border-rose-200 hover:bg-rose-100'
              } ${isAdminRole ? 'cursor-pointer' : 'cursor-default'}`}
              title={isAdminRole ? 'Klik untuk konfigurasi Database Connection' : dbStatus.message}
            >
              <div className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse shrink-0`}></div>
              <span className="font-semibold truncate max-w-[140px]">{dbStatus.message}</span>
              {isAdminRole && <Settings className="w-3 h-3 text-slate-500 ml-0.5 shrink-0" />}
            </button>

            {/* Auth Session Status Indicator */}
            {currentUser && (
              <div
                className={`hidden lg:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition shrink-0 ${
                  authStatus === 'VALID'
                    ? 'text-blue-800 bg-blue-50 border-blue-200'
                    : authStatus === 'CHECKING'
                    ? 'text-amber-800 bg-amber-50 border-amber-200'
                    : 'text-rose-800 bg-rose-50 border-rose-200'
                }`}
                title={authStatus === 'VALID' ? 'Sesi login terverifikasi aktif' : authStatus === 'CHECKING' ? 'Memverifikasi status sesi...' : 'Sesi tidak valid'}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  authStatus === 'VALID' ? 'bg-blue-500' : authStatus === 'CHECKING' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
                }`} />
                <span className="font-semibold truncate">
                  {authStatus === 'VALID' ? 'Sesi: Aktif' : authStatus === 'CHECKING' ? 'Sesi: Memeriksa...' : 'Sesi: Expired'}
                </span>
              </div>
            )}

            {/* Quick Role Switcher / Login Button */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                id="topbar-role-btn"
                onClick={() => setIsLoginOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-2 sm:px-3 py-1.5 rounded-lg transition shadow-xs flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="hidden sm:inline">Akses:</span>
                <span className="font-bold text-amber-300 uppercase">{currentRole}</span>
              </button>

              {currentUser && (
                <button
                  id="topbar-logout-btn"
                  onClick={() => setIsLogoutConfirmOpen(true)}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs px-2 sm:px-3 py-1.5 rounded-lg transition shadow-xs flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap"
                  title="Keluar dari akun"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              )}
            </div>

          </div>

        </header>

        {/* PAGE CONTENT CONTAINER WITH FRONTEND ROLE GUARD */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-2.5 sm:p-5 md:p-6 w-full max-w-full box-border">
          
          {authNotice && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
              <div className="flex items-center gap-3 text-xs md:text-sm font-medium">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                <span>{authNotice}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setAuthNotice(null); setIsLoginOpen(true); }}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  Login Sekarang
                </button>
                <button
                  onClick={() => setAuthNotice(null)}
                  className="p-1.5 text-amber-700 hover:text-amber-900 rounded transition"
                  title="Tutup Pesan"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {!canAccessTab(activeTab) ? (
            <div className="p-8 max-w-lg mx-auto text-center mt-12 bg-white rounded-2xl border border-slate-200 shadow-lg space-y-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Akses Dibatasi</h2>
              <p className="text-xs text-slate-500">
                Peran Anda ({currentRole}) tidak memiliki akses untuk membuka halaman ini. Silakan pilih menu lain atau ganti role akses Anda.
              </p>
              <button
                onClick={() => setActiveTab(currentRole === 'PUBLIC' ? 'student-progress' : currentRole === 'TEACHER' ? 'my-halaqah' : 'admin-dashboard')}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Kembali ke Halaman Utama
              </button>
            </div>
          ) : (
            <TeacherWorkspaceProvider currentUser={currentUser}>
              {activeTab === 'student-progress' && <StudentProgressLookup />}

              {activeTab === 'my-halaqah' && (
                <MyHalaqah
                  currentUser={currentUser}
                  onNavigateToAssessment={handleNavigateToAssessment}
                  onNavigateToEvaluation={handleNavigateToEvaluation}
                />
              )}

              {activeTab === 'session-assessment' && (
                <SessionAssessment
                  currentUser={currentUser}
                  initialStudentId={assessmentNavState.studentId}
                  initialSessionNo={assessmentNavState.sessionNo}
                  onNavigateToEvaluation={handleNavigateToEvaluation}
                />
              )}

              {activeTab === 'final-evaluation' && (
                <FinalEvaluation
                  currentUser={currentUser}
                  initialStudentId={evaluationNavState.studentId}
                />
              )}

              {activeTab === 'admin-dashboard' && (
                <AdminDashboard onNavigateTab={(tab) => setActiveTab(tab)} />
              )}

              {activeTab === 'event-mgmt' && <EventManagement currentUser={currentUser} />}
              {activeTab === 'student-mgmt' && <StudentManagement />}
              {activeTab === 'halaqah-mgmt' && <HalaqahManagement />}
              {activeTab === 'teacher-assignment' && <TeacherAssignment />}
              {activeTab === 'assignments-mgmt' && <HalaqahStudentAssignment />}
              {activeTab === 'completeness-checker' && <CompletenessChecker />}
              {activeTab === 'analytics' && <ExecutiveAnalytics />}
              {activeTab === 'administration' && <Administration />}
            </TeacherWorkspaceProvider>
          )}

        </div>

      </main>

      {/* LOGIN & SIMULATION MODAL */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(u) => setCurrentUser(u)}
        onQuickRole={(r) => handleSelectRole(r)}
      />

      {/* DATABASE CONNECTION MODAL (ADMIN & COORDINATOR) */}
      {isAdminRole && (
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

      {/* LOGOUT CONFIRMATION MODAL */}
      {isLogoutConfirmOpen && (
        <div id="logout-confirm-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Keluar dari Sistem?</h3>
              <p className="text-xs text-slate-500">Anda akan keluar dari akun ini.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                id="logout-cancel-btn"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Batal
              </button>
              <button
                id="logout-confirm-btn"
                onClick={async () => {
                  setIsLogoutConfirmOpen(false);
                  await ApiService.logout();
                  setCurrentUser(null);
                  setCurrentRole('PUBLIC');
                  setActiveTab('student-progress');
                  setAuthNotice(null);
                }}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
