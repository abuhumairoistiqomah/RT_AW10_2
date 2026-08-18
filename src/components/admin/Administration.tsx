import React, { useState, useEffect } from 'react';
import { Teacher, User, AuditLog, UserRole } from '../../types';
import { ApiService } from '../../services/api';
import { DatabaseConnectionModal } from './DatabaseConnectionModal';
import { generateSecureRandomPassword } from '../../utils/passwordGenerator';
import {
  Users, UserCheck, Shield, Settings, Search, Plus, Edit2, CheckCircle2, RefreshCw, X, Database,
  KeyRound, Eye, EyeOff, Copy, Check, Lock, AlertTriangle, Loader2, Sparkles, UserX, Share2, MessageSquare
} from 'lucide-react';

export const Administration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'TEACHERS' | 'USERS' | 'AUDIT' | 'SETTINGS'>('TEACHERS');

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const currentUser = ApiService.getStoredUser();
  const isAdmin = currentUser?.role === 'ADMIN';

  // Search filters
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [teacherSearchTerm, setTeacherSearchTerm] = useState<string>('');

  // Modals
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState<boolean>(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState<boolean>(false);

  // Credential Success Modal State (For sharing newly created or reset credentials)
  const [credentialSuccessModal, setCredentialSuccessModal] = useState<{
    isOpen: boolean;
    title: string;
    displayName: string;
    username: string;
    password: string;
  } | null>(null);
  const [showCredentialPassword, setShowCredentialPassword] = useState<boolean>(true);
  const [copiedCredentialPasswordToast, setCopiedCredentialPasswordToast] = useState<boolean>(false);
  const [copiedLoginInfoToast, setCopiedLoginInfoToast] = useState<boolean>(false);

  // Global Notification Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Teacher Form State
  const [teacherFormData, setTeacherFormData] = useState<Partial<Teacher>>({
    teacher_id: '',
    full_name: '',
    short_name: '',
    gender: 'IKHWAN',
    phone: '',
    email: '',
    active: true
  });

  // User Form State (Add / Edit)
  const [userFormMode, setUserFormMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [userFormData, setUserFormData] = useState<{
    user_id: string;
    username: string;
    display_name: string;
    role: UserRole;
    teacher_id: string;
    active: boolean;
    password: string;
  }>({
    user_id: '',
    username: '',
    display_name: '',
    role: 'TEACHER',
    teacher_id: '',
    active: true,
    password: ''
  });
  const [showUserPassword, setShowUserPassword] = useState<boolean>(false);
  const [isDisplayNameManuallyEdited, setIsDisplayNameManuallyEdited] = useState<boolean>(false);
  const [isSavingUser, setIsSavingUser] = useState<boolean>(false);
  const [userFormError, setUserFormError] = useState<string>('');
  const [copiedUserPasswordToast, setCopiedUserPasswordToast] = useState<boolean>(false);

  // Reset Password Modal State
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState<string>('');
  const [showResetPassword, setShowResetPassword] = useState<boolean>(false);
  const [isSavingReset, setIsSavingReset] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string>('');
  const [copiedResetPasswordToast, setCopiedResetPasswordToast] = useState<boolean>(false);

  useEffect(() => {
    loadAllData();
  }, []);

  // Tab Resume listener
  useEffect(() => {
    const handleResume = () => {
      loadAllData();
    };
    window.addEventListener('rt_app_resumed', handleResume);
    return () => window.removeEventListener('rt_app_resumed', handleResume);
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [tList, uList, aList] = await Promise.all([
        ApiService.getTeachers(),
        ApiService.getUsers(),
        ApiService.getAuditLogs()
      ]);
      setTeachers(tList || []);
      setUsers(uList || []);
      setAuditLogs(aList || []);
    } catch (e: any) {
      showToast('Gagal memuat data administrasi: ' + (e?.message || 'Error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // TEACHER HANDLERS
  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherFormData.full_name) return;

    try {
      const teacherToSave: Teacher = {
        teacher_id: teacherFormData.teacher_id || `TCH${String(teachers.length + 1).padStart(6, '0')}`,
        full_name: teacherFormData.full_name.trim(),
        short_name: teacherFormData.short_name?.trim() || teacherFormData.full_name.trim().split(' ')[0],
        gender: teacherFormData.gender || 'IKHWAN',
        phone: teacherFormData.phone?.trim() || '',
        email: teacherFormData.email?.trim() || '',
        active: teacherFormData.active !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await ApiService.saveTeacher(teacherToSave, currentUser?.user_id);
      setIsTeacherModalOpen(false);
      showToast('Data guru tahfidz berhasil disimpan.');
      loadAllData();
    } catch (e: any) {
      alert('Gagal menyimpan guru: ' + (e?.message || 'Error'));
    }
  };

  // USER ADD / EDIT HANDLERS
  const handleOpenCreateUser = () => {
    const initialPass = generateSecureRandomPassword(10);
    setUserFormMode('CREATE');
    setUserFormData({
      user_id: `USR${Date.now().toString().slice(-6)}`,
      username: '',
      display_name: '',
      role: 'TEACHER',
      teacher_id: '',
      active: true,
      password: initialPass
    });
    setShowUserPassword(false);
    setIsDisplayNameManuallyEdited(false);
    setUserFormError('');
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (user: User) => {
    setUserFormMode('EDIT');
    setUserFormData({
      user_id: user.user_id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      teacher_id: user.teacher_id || '',
      active: user.active !== false,
      password: '' // No password field in edit profile mode
    });
    setShowUserPassword(false);
    setIsDisplayNameManuallyEdited(true);
    setUserFormError('');
    setIsUserModalOpen(true);
  };

  const handleTeacherSelect = (teacherId: string) => {
    const matched = teachers.find(t => t.teacher_id === teacherId);
    if (!matched) {
      setUserFormData(prev => ({ ...prev, teacher_id: '' }));
      return;
    }

    setUserFormData(prev => {
      const next = { ...prev, teacher_id: matched.teacher_id };
      // Auto-fill display name if not manually edited or empty
      if (!isDisplayNameManuallyEdited || !prev.display_name.trim()) {
        next.display_name = matched.full_name;
      }
      // If creating new user and username is empty, suggest teacher short name
      if (userFormMode === 'CREATE' && !prev.username.trim()) {
        const cleanShort = (matched.short_name || matched.full_name.split(' ')[0])
          .replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase();
        next.username = cleanShort;
      }
      return next;
    });
  };

  const handleGenerateUserPassword = () => {
    const newPass = generateSecureRandomPassword(10);
    setUserFormData(prev => ({ ...prev, password: newPass }));
  };

  const handleCopyPassword = async (pass: string, isResetModal = false) => {
    if (!pass) return;
    try {
      await navigator.clipboard.writeText(pass);
      if (isResetModal) {
        setCopiedResetPasswordToast(true);
        setTimeout(() => setCopiedResetPasswordToast(false), 2500);
      } else {
        setCopiedUserPasswordToast(true);
        setTimeout(() => setCopiedUserPasswordToast(false), 2500);
      }
    } catch (e) {
      // fallback
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingUser) return;

    setUserFormError('');

    const cleanUsername = userFormData.username.trim();
    const cleanDisplayName = userFormData.display_name.trim();

    if (!cleanUsername) {
      setUserFormError('Username wajib diisi.');
      return;
    }
    if (!cleanDisplayName) {
      setUserFormError('Nama tampilan wajib diisi.');
      return;
    }
    if (userFormData.role === 'TEACHER' && !userFormData.teacher_id) {
      setUserFormError('Akun dengan Peran Guru (TEACHER) wajib menghubungkan Guru Terkait dari Master Data Guru.');
      return;
    }
    if (userFormMode === 'CREATE' && !userFormData.password?.trim()) {
      setUserFormError('Password awal wajib diisi untuk akun baru.');
      return;
    }

    // Client-side uniqueness validation
    const usernameLower = cleanUsername.toLowerCase();
    const duplicate = users.find(u => u.user_id !== userFormData.user_id && u.username.toLowerCase() === usernameLower);
    if (duplicate) {
      setUserFormError(`Username "${cleanUsername}" sudah digunakan oleh akun lain (${duplicate.display_name}).`);
      return;
    }

    setIsSavingUser(true);

    try {
      const userToSave: User = {
        user_id: userFormData.user_id,
        username: cleanUsername,
        display_name: cleanDisplayName,
        role: userFormData.role,
        teacher_id: userFormData.role === 'TEACHER' ? userFormData.teacher_id : '',
        active: userFormData.active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const plainPasswordToShare = userFormMode === 'CREATE' ? userFormData.password.trim() : '';

      await ApiService.saveUser(
        userToSave,
        userFormMode === 'CREATE' ? plainPasswordToShare : undefined,
        currentUser?.user_id
      );

      setIsUserModalOpen(false);
      setUserFormData({
        user_id: '',
        username: '',
        display_name: '',
        role: 'TEACHER',
        teacher_id: '',
        active: true,
        password: ''
      });

      if (userFormMode === 'CREATE' && plainPasswordToShare) {
        setCredentialSuccessModal({
          isOpen: true,
          title: 'Akun Pengguna Berhasil Dibuat',
          displayName: cleanDisplayName,
          username: cleanUsername,
          password: plainPasswordToShare
        });
        setShowCredentialPassword(true);
      } else {
        showToast('Profil akun pengguna berhasil diperbarui.');
      }

      loadAllData();
    } catch (err: any) {
      setUserFormError(err.message || 'Gagal menyimpan akun pengguna.');
    } finally {
      setIsSavingUser(false);
    }
  };

  // RESET PASSWORD HANDLERS
  const handleOpenResetPassword = (user: User) => {
    setResetTargetUser(user);
    setResetNewPassword(generateSecureRandomPassword(10));
    setShowResetPassword(false);
    setResetError('');
    setIsResetModalOpen(true);
  };

  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingReset || !resetTargetUser) return;

    const cleanPass = resetNewPassword.trim();
    if (!cleanPass) {
      setResetError('Password baru tidak boleh kosong.');
      return;
    }

    setIsSavingReset(true);
    setResetError('');

    try {
      await ApiService.resetUserPassword(resetTargetUser.user_id, cleanPass, currentUser?.user_id);
      setIsResetModalOpen(false);
      
      const targetName = resetTargetUser.display_name;
      const targetUsername = resetTargetUser.username;
      
      setResetNewPassword('');
      setResetTargetUser(null);

      // Open credential success sharing modal
      setCredentialSuccessModal({
        isOpen: true,
        title: 'Password Berhasil Diperbarui',
        displayName: targetName,
        username: targetUsername,
        password: cleanPass
      });
      setShowCredentialPassword(true);

      loadAllData();
    } catch (err: any) {
      setResetError(err.message || 'Gagal mereset password.');
    } finally {
      setIsSavingReset(false);
    }
  };

  const handleCloseCredentialModal = () => {
    setCredentialSuccessModal(null);
    setCopiedCredentialPasswordToast(false);
    setCopiedLoginInfoToast(false);
  };

  // Lock background body scroll when credential modal is open
  useEffect(() => {
    if (credentialSuccessModal?.isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [credentialSuccessModal?.isOpen]);

  const getLoginCredentialMessageTemplate = (displayName: string, username: string, password: string) => {
    return `Assalamu'alaikum Ustadz/Ustadzah ${displayName}.

Berikut akun Rumah Tahfidz LMS:

Username: ${username}
Password: ${password}

Silakan digunakan untuk login ke Rumah Tahfidz LMS dengan alamat: https://rt-aw-10.vercel.app/ .
Mohon simpan informasi akun ini dan tidak membagikannya kepada orang lain.`;
  };

  const handleCopyCredentialOnlyPassword = async () => {
    if (!credentialSuccessModal?.password) return;
    try {
      await navigator.clipboard.writeText(credentialSuccessModal.password);
      setCopiedCredentialPasswordToast(true);
      showToast('Password berhasil disalin.');
      setTimeout(() => setCopiedCredentialPasswordToast(false), 2500);
    } catch (e) {
      // fallback
    }
  };

  const handleCopyLoginInfoTemplate = async () => {
    if (!credentialSuccessModal) return;
    const templateText = getLoginCredentialMessageTemplate(
      credentialSuccessModal.displayName,
      credentialSuccessModal.username,
      credentialSuccessModal.password
    );
    
    try {
      await navigator.clipboard.writeText(templateText);
      setCopiedLoginInfoToast(true);
      showToast('Info login berhasil disalin.');
      setTimeout(() => setCopiedLoginInfoToast(false), 2500);
    } catch (e) {
      // fallback
    }
  };

  const handleShareLoginInfo = async () => {
    if (!credentialSuccessModal) return;
    const templateText = getLoginCredentialMessageTemplate(
      credentialSuccessModal.displayName,
      credentialSuccessModal.username,
      credentialSuccessModal.password
    );
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Akun LMS - ${credentialSuccessModal.displayName}`,
          text: templateText
        });
      } catch (e) {
        // user cancelled or share failed, fallback to copy
        handleCopyLoginInfoTemplate();
      }
    } else {
      handleCopyLoginInfoTemplate();
    }
  };

  // Role Badge Renderer
  const renderRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            Administrator
          </span>
        );
      case 'COORDINATOR':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Koordinator
          </span>
        );
      case 'TEACHER':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Guru Tahfidz
          </span>
        );
      case 'VIEWER':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            Viewer
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
            {role}
          </span>
        );
    }
  };

  // Filtered lists
  const filteredUsers = users.filter(u => {
    const q = userSearchTerm.toLowerCase();
    const matchedTeacher = teachers.find(t => t.teacher_id === u.teacher_id);
    return (
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (matchedTeacher && matchedTeacher.full_name.toLowerCase().includes(q))
    );
  });

  const filteredTeachers = teachers.filter(t => {
    const q = teacherSearchTerm.toLowerCase();
    return (
      t.full_name.toLowerCase().includes(q) ||
      (t.short_name && t.short_name.toLowerCase().includes(q)) ||
      t.teacher_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-50 p-4 rounded-xl shadow-2xl border flex items-center space-x-3 text-xs font-semibold animate-in slide-in-from-top-4 ${
          toastMessage.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700' : 'bg-rose-900 text-rose-100 border-rose-700'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-xl border border-slate-800 w-full min-w-0">
        <div className="w-full min-w-0 max-w-full flex-1">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Shield className="w-4 h-4 shrink-0" />
            <span className="truncate">Sistem Administrasi Utama</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1 line-clamp-2 break-normal">Pengaturan Sistem & Pengguna</h1>
          <p className="text-slate-400 text-xs mt-1 break-normal">
            Pengelolaan data ustaz/ustazah, akun login pengguna, hak akses role, catatan audit transaksi, dan parameter aplikasi.
          </p>
        </div>

        {/* Subtab Buttons */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold w-full xl:w-auto xl:justify-end shrink-0">
          <button
            id="tab-btn-teachers"
            onClick={() => setActiveTab('TEACHERS')}
            className={`px-3 py-1.5 rounded-lg transition shrink-0 ${
              activeTab === 'TEACHERS' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
          >
            Guru Tahfidz
          </button>
          <button
            id="tab-btn-users"
            onClick={() => setActiveTab('USERS')}
            className={`px-3 py-1.5 rounded-lg transition shrink-0 ${
              activeTab === 'USERS' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
          >
            Pengguna Akun
          </button>
          <button
            id="tab-btn-audit"
            onClick={() => setActiveTab('AUDIT')}
            className={`px-3 py-1.5 rounded-lg transition shrink-0 ${
              activeTab === 'AUDIT' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
          >
            Audit Log
          </button>
          <button
            id="tab-btn-settings"
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-3 py-1.5 rounded-lg transition shrink-0 ${
              activeTab === 'SETTINGS' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* TEACHERS SUBPAGE */}
      {activeTab === 'TEACHERS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Daftar Ustaz & Ustazah Tahfidz ({teachers.length})
              </h3>
              <div className="relative w-48 sm:w-64">
                <input
                  type="text"
                  placeholder="Cari guru..."
                  value={teacherSearchTerm}
                  onChange={(e) => setTeacherSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {isAdmin && (
              <button
                id="btn-add-teacher"
                onClick={() => {
                  setTeacherFormData({
                    teacher_id: '',
                    full_name: '',
                    short_name: '',
                    gender: 'IKHWAN',
                    phone: '',
                    email: '',
                    active: true
                  });
                  setIsTeacherModalOpen(true);
                }}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Guru</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-200">
                  <th className="p-3">ID Guru</th>
                  <th className="p-3">Nama Lengkap</th>
                  <th className="p-3">Panggilan</th>
                  <th className="p-3">Gender</th>
                  <th className="p-3">Kontak Email / Telp</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTeachers.map((t) => (
                  <tr key={t.teacher_id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-600">{t.teacher_id}</td>
                    <td className="p-3 font-bold text-slate-900">{t.full_name}</td>
                    <td className="p-3 font-semibold text-slate-700">{t.short_name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.gender === 'IKHWAN' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {t.gender}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{t.email || t.phone || '-'}</td>
                    <td className="p-3">
                      <span className={`font-bold ${t.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {t.active ? 'Aktif' : 'Non-Aktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USERS SUBPAGE (PENGGUNA AKUN - NO PASSWORD HASH EXPOSED) */}
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Daftar Pengguna Akun Sistem ({users.length})
              </h3>
              <div className="relative w-48 sm:w-64">
                <input
                  type="text"
                  placeholder="Cari nama, username, role..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {isAdmin ? (
              <button
                id="btn-add-user"
                onClick={handleOpenCreateUser}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Akun</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-lg font-medium">
                Mode Lihat Saja (Read-Only)
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-200">
                  <th className="p-3">Nama Tampilan</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Peran / Role</th>
                  <th className="p-3">Guru Terkait</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Login Terakhir</th>
                  {isAdmin && <th className="p-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const linkedTeacher = teachers.find(t => t.teacher_id === u.teacher_id);
                  const isSelf = currentUser?.user_id === u.user_id;

                  return (
                    <tr key={u.user_id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-bold text-slate-900">
                        <div className="flex items-center space-x-2">
                          <span>{u.display_name}</span>
                          {isSelf && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-blue-100 text-blue-800 rounded font-bold">
                              Anda
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">
                        <span className="text-slate-400 font-normal">@</span>{u.username}
                      </td>
                      <td className="p-3">
                        {renderRoleBadge(u.role)}
                      </td>
                      <td className="p-3 text-slate-700">
                        {linkedTeacher ? (
                          <div className="text-[11px]">
                            <div className="font-semibold text-slate-900">{linkedTeacher.full_name}</div>
                            <div className="text-slate-400 font-mono text-[10px]">{linkedTeacher.teacher_id}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {u.active ? 'Aktif' : 'Non-Aktif'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString('id-ID') : '-'}
                      </td>
                      {isAdmin && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditUser(u)}
                              title="Edit Profil Akun"
                              className="px-2.5 py-1 text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg font-semibold text-[11px] border border-slate-200 hover:border-emerald-300 transition flex items-center space-x-1"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenResetPassword(u)}
                              title="Reset Kata Sandi"
                              className="px-2.5 py-1 text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-lg font-semibold text-[11px] border border-slate-200 hover:border-amber-300 transition flex items-center space-x-1"
                            >
                              <KeyRound className="w-3 h-3 text-amber-600" />
                              <span>Reset Sandi</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUDIT LOG SUBPAGE */}
      {activeTab === 'AUDIT' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Catatan Transaksi Audit Log Operasional ({auditLogs.length})
            </h3>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-200">
                  <th className="p-3">Waktu Transaksi</th>
                  <th className="p-3">Aksi</th>
                  <th className="p-3">Entity</th>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Deskripsi Perubahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.log_id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-[10px] text-slate-500">
                      {new Date(log.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 font-bold text-slate-800">{log.action}</td>
                    <td className="p-3 font-mono text-[10px] text-slate-600">{log.entity}</td>
                    <td className="p-3 font-mono text-slate-700">{log.user_id}</td>
                    <td className="p-3 text-slate-800">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* APP SETTINGS SUBPAGE */}
      {activeTab === 'SETTINGS' && (
        <div className="space-y-6 max-w-2xl">
          {/* Database Connection Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Koneksi Database Google Sheets</span>
              </h3>
              <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Google Apps Script Web App
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Atur dan uji koneksi langsung ke Google Apps Script Web App deployment URL. Konfigurasi tersimpan secara runtime dan dapat disesuaikan tanpa perlu rebuild aplikasi.
            </p>

            <div className="pt-1 flex items-center space-x-3">
              <button
                id="btn-open-db-settings-from-admin"
                type="button"
                onClick={() => setIsDbModalOpen(true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-sm flex items-center space-x-2 transition"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Buka Pengaturan Koneksi Database</span>
              </button>
            </div>
          </div>

          {/* Session & Security Administration */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <span>Sesi & Keamanan Autentikasi (16_SESSIONS)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Sistem autentikasi menggunakan Google Spreadsheet sheet <strong>16_SESSIONS</strong> sebagai authoritative store. Sesi tetap aktif hingga pengguna logout, password direset, atau status akun dinonaktifkan.
            </p>
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await ApiService.cleanupRevokedSessions();
                    showToast(`Pembersihan sesi selesai. ${res.deletedCount || 0} sesi lama berhasil dibersihkan.`);
                  } catch (e: any) {
                    showToast('Gagal membersihkan sesi: ' + (e?.message || 'Error'), 'error');
                  }
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Bersihkan Sesi Kedaluwarsa/Revoked (&gt; 30 hari)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Teacher Modal */}
      {isTeacherModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Tambah Guru Tahfidz</h3>
              <button onClick={() => setIsTeacherModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSaveTeacher} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap Guru</label>
                <input
                  type="text"
                  required
                  value={teacherFormData.full_name || ''}
                  onChange={(e) => setTeacherFormData({ ...teacherFormData, full_name: e.target.value })}
                  placeholder="mis: Ustadz Ahmad Fauzi, S.Pd.I"
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Panggilan</label>
                <input
                  type="text"
                  value={teacherFormData.short_name || ''}
                  onChange={(e) => setTeacherFormData({ ...teacherFormData, short_name: e.target.value })}
                  placeholder="mis: Ust. Ahmad"
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Gender</label>
                <select
                  value={teacherFormData.gender}
                  onChange={(e) => setTeacherFormData({ ...teacherFormData, gender: e.target.value as any })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="IKHWAN">Ikhwan</option>
                  <option value="AKHWAT">Akhwat</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-3">
                <button type="button" onClick={() => setIsTeacherModalOpen(false)} className="px-3 py-1.5 font-bold text-slate-600">Batal</button>
                <button type="submit" className="px-4 py-1.5 font-bold text-white bg-emerald-600 rounded-lg">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT USER MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    {userFormMode === 'CREATE' ? 'Tambah Pengguna Baru' : 'Edit Pengguna Akun'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {userFormMode === 'CREATE' ? 'Buat akun login baru dan tentukan hak akses peran' : `Kelola profil & hak akses @${userFormData.username}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingUser}
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveUser} className="p-6 space-y-4 text-xs">
              
              {userFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-start space-x-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span className="font-medium">{userFormError}</span>
                </div>
              )}

              {/* Role Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Peran / Hak Akses (Role) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  disabled={isSavingUser}
                  value={userFormData.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    setUserFormData(prev => ({
                      ...prev,
                      role: nextRole,
                      teacher_id: nextRole === 'TEACHER' ? prev.teacher_id : ''
                    }));
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="ADMIN">Administrator (Akses Penuh Sistem)</option>
                  <option value="COORDINATOR">Koordinator (Pengelolaan Kegiatan & Monitoring)</option>
                  <option value="TEACHER">Guru (Penilaian Sesi & Evaluasi Halaqah)</option>
                  <option value="VIEWER">Viewer (Akses Lihat Laporan)</option>
                </select>
              </div>

              {/* Linked Teacher (When Role === 'TEACHER') */}
              {userFormData.role === 'TEACHER' && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <label className="block font-bold text-emerald-900 flex items-center justify-between">
                    <span>Guru Terkait (Master Guru Tahfidz) <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] text-emerald-700 font-normal">Wajib untuk akun Guru</span>
                  </label>
                  <select
                    required
                    disabled={isSavingUser}
                    value={userFormData.teacher_id}
                    onChange={(e) => handleTeacherSelect(e.target.value)}
                    className="w-full p-2.5 bg-white border border-emerald-300 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Guru dari Master Data --</option>
                    {teachers.map((t) => (
                      <option key={t.teacher_id} value={t.teacher_id}>
                        {t.full_name} ({t.teacher_id}) {t.short_name ? `- ${t.short_name}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-emerald-800">
                    Akun ini akan otomatis terhubung dengan halaqah yang ditugaskan kepada guru ini.
                  </p>
                </div>
              )}

              {/* Display Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Tampilan (Display Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSavingUser}
                  value={userFormData.display_name}
                  onChange={(e) => {
                    setUserFormData(prev => ({ ...prev, display_name: e.target.value }));
                    setIsDisplayNameManuallyEdited(true);
                  }}
                  placeholder="mis: Ust. Ahmad Syauqi, S.Pd.I"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Username Login <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">Huruf/angka unik (tidak sensitif huruf besar/kecil)</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSavingUser}
                  value={userFormData.username}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="mis: ahmad.syauqi"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Status Aktif */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <div className="font-bold text-slate-800">Status Akun Aktif</div>
                  <div className="text-[11px] text-slate-500">
                    {userFormData.active ? 'Akun dapat masuk dan menggunakan aplikasi' : 'Akun dinonaktifkan (semua sesi login akan dicabut)'}
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isSavingUser}
                    checked={userFormData.active}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, active: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* PASSWORD AWAL SECTION (For CREATE mode only) */}
              {userFormMode === 'CREATE' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Password Awal <span className="text-rose-500">*</span></span>
                    </label>
                    
                    <button
                      type="button"
                      onClick={handleGenerateUserPassword}
                      className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition flex items-center space-x-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Generate Random</span>
                    </button>
                  </div>

                  <div className="relative flex items-center">
                    <input
                      type={showUserPassword ? 'text' : 'password'}
                      required
                      disabled={isSavingUser}
                      value={userFormData.password}
                      onChange={(e) => setUserFormData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Masukkan atau generate password..."
                      className="w-full pl-3 pr-20 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    
                    <div className="absolute right-1.5 flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setShowUserPassword(prev => !prev)}
                        title={showUserPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {showUserPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleCopyPassword(userFormData.password)}
                        title="Salin password ke clipboard"
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {copiedUserPasswordToast ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {copiedUserPasswordToast && (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center space-x-1 animate-in fade-in">
                      <Check className="w-3.5 h-3.5" />
                      <span>Password berhasil disalin ke clipboard.</span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500">
                    Password akan di-hash secara aman menggunakan salted SHA-256 dan tidak pernah disimpan dalam bentuk teks biasa.
                  </p>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isSavingUser}
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800 rounded-xl transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow flex items-center space-x-2 disabled:opacity-50"
                >
                  {isSavingUser ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>{userFormMode === 'CREATE' ? 'Simpan Akun' : 'Simpan Perubahan'}</span>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {isResetModalOpen && resetTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Reset Password Pengguna</h3>
                  <p className="text-[11px] text-slate-400">
                    Untuk akun <span className="text-amber-300 font-bold">{resetTargetUser.display_name}</span> (@{resetTargetUser.username})
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingReset}
                onClick={() => setIsResetModalOpen(false)}
                className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSaveResetPassword} className="p-6 space-y-4 text-xs">
              
              {resetError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-start space-x-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span className="font-medium">{resetError}</span>
                </div>
              )}

              <p className="text-slate-600 text-xs">
                Masukkan password baru atau klik <strong>Generate Random</strong> untuk membuat password acak yang aman. Setelah reset, semua sesi login lama akun ini akan otomatis dicabut.
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700">
                    Password Baru <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    disabled={isSavingReset}
                    onClick={() => setResetNewPassword(generateSecureRandomPassword(10))}
                    className="px-2 py-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition flex items-center space-x-1 disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Generate Random</span>
                  </button>
                </div>

                <div className="relative flex items-center">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    disabled={isSavingReset}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Masukkan password baru..."
                    className="w-full pl-3 pr-20 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  
                  <div className="absolute right-1.5 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(prev => !prev)}
                      title={showResetPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                    >
                      {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleCopyPassword(resetNewPassword, true)}
                      title="Salin password ke clipboard"
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                    >
                      {copiedResetPasswordToast ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {copiedResetPasswordToast && (
                  <div className="text-[11px] text-emerald-700 font-bold flex items-center space-x-1 animate-in fade-in">
                    <Check className="w-3.5 h-3.5" />
                    <span>Password berhasil disalin ke clipboard.</span>
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isSavingReset}
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800 rounded-xl transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingReset}
                  className="px-5 py-2 font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition shadow flex items-center space-x-2 disabled:opacity-50"
                >
                  {isSavingReset ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Password Baru</span>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* CREDENTIAL SUCCESS MODAL */}
      {credentialSuccessModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-[calc(100vw-24px)] max-w-[520px] max-h-[90vh] sm:max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            
            {/* Header (Fixed) */}
            <div className="bg-emerald-700 text-white px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 text-white flex items-center justify-center font-bold shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white leading-tight">{credentialSuccessModal.title}</h3>
                  <p className="text-[11px] text-emerald-100 leading-tight mt-0.5">
                    Informasi akun siap disalin dan dibagikan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCredentialModal}
                className="text-emerald-200 hover:text-white transition p-1.5 rounded-lg hover:bg-emerald-800/50 shrink-0 ml-2"
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-4 sm:p-5 space-y-3.5 text-xs overflow-y-auto flex-1 min-h-0">
              <p className="text-slate-600 text-xs leading-relaxed">
                Akun berhasil disimpan ke sistem. Silakan salin password atau bagikan template informasi login kepada Ustadz/Ustadzah terkait.
              </p>

              {/* Compact Credential Card (3 Rows) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/80">
                  <span className="text-slate-500 font-medium">Nama Pengguna</span>
                  <span className="font-bold text-slate-900 text-right truncate max-w-[240px]">
                    {credentialSuccessModal.displayName}
                  </span>
                </div>
                
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/80">
                  <span className="text-slate-500 font-medium">Username</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {credentialSuccessModal.username}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Password Baru</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 text-xs sm:text-sm tracking-wide select-all">
                      {showCredentialPassword ? credentialSuccessModal.password : '••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCredentialPassword(prev => !prev)}
                      title={showCredentialPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
                    >
                      {showCredentialPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Compact Message Template Preview (Bounded Height) */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Format Pesan Template WhatsApp / SMS:
                </span>
                <div className="p-2.5 bg-slate-100 rounded-xl text-slate-700 font-mono text-[11px] leading-relaxed whitespace-pre-line border border-slate-200 select-all max-h-[135px] overflow-y-auto">
                  {getLoginCredentialMessageTemplate(
                    credentialSuccessModal.displayName,
                    credentialSuccessModal.username,
                    credentialSuccessModal.password
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Action Footer (Always Visible at Bottom) */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 space-y-2 shrink-0">
              {/* Row 1: Copy Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyCredentialOnlyPassword}
                  className="w-full py-2 px-3 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-slate-700 rounded-xl font-bold transition flex items-center justify-center space-x-1.5 shadow-sm text-xs min-h-[38px]"
                >
                  {copiedCredentialPasswordToast ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700">Password Disalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>Copy Password</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyLoginInfoTemplate}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-bold transition flex items-center justify-center space-x-1.5 shadow text-xs min-h-[38px]"
                >
                  {copiedLoginInfoToast ? (
                    <>
                      <Check className="w-4 h-4 text-white shrink-0" />
                      <span>Info Login Disalin!</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span>Salin Info Login</span>
                    </>
                  )}
                </button>
              </div>

              {/* Row 2: Share & Close Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-2">
                {typeof navigator !== 'undefined' && !!navigator.share && (
                  <button
                    type="button"
                    onClick={handleShareLoginInfo}
                    className="w-full sm:flex-1 py-2 px-3 bg-white border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center justify-center space-x-1.5 text-xs shadow-sm min-h-[36px]"
                  >
                    <Share2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Bagikan via Aplikasi Lain</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCloseCredentialModal}
                  className={`w-full ${typeof navigator !== 'undefined' && !!navigator.share ? 'sm:w-auto sm:px-5' : ''} py-2 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl font-bold transition text-xs flex items-center justify-center min-h-[36px]`}
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Database Connection Modal */}
      <DatabaseConnectionModal
        isOpen={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
      />
    </div>
  );
};
