import React, { useState, useEffect, useMemo } from 'react';
import { ApiService } from '../../services/api';
import { Event, EventDay, SessionGroup, SessionConfig, User } from '../../types';
import { LoadingButton } from '../common/LoadingButton';
import {
  Calendar, CheckCircle2, Save, Plus, Edit2, Trash2,
  Clock, Layers, Shield, AlertTriangle, X, Power,
  Filter, CalendarDays, BookOpen, AlertCircle, Info, Loader2
} from 'lucide-react';

interface EventManagementProps {
  currentUser?: User | null;
}

type ActiveTab = 'info' | 'days' | 'groups' | 'sessions';

export const EventManagement: React.FC<EventManagementProps> = ({ currentUser }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isCoordinator = currentUser?.role === 'COORDINATOR';

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('info');
  const [loading, setLoading] = useState<boolean>(true);

  // Event Info State
  const [eventForm, setEventForm] = useState<Partial<Event>>({});
  const [savingEvent, setSavingEvent] = useState<boolean>(false);
  const [eventFormError, setEventFormError] = useState<string>('');

  // Event Days State (07A_EVENT_DAYS)
  const [eventDays, setEventDays] = useState<EventDay[]>([]);
  const [isDayModalOpen, setIsDayModalOpen] = useState<boolean>(false);
  const [editingDay, setEditingDay] = useState<EventDay | null>(null);
  const [savingDay, setSavingDay] = useState<boolean>(false);
  const [dayModalError, setDayModalError] = useState<string>('');
  const [dayForm, setDayForm] = useState<Partial<EventDay>>({
    day_no: 1,
    event_date: '',
    day_name: '',
    status: 'ACTIVE',
    notes: ''
  });

  // Session Groups State (08_SESSION_GROUPS)
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState<boolean>(false);
  const [editingGroup, setEditingGroup] = useState<SessionGroup | null>(null);
  const [savingGroup, setSavingGroup] = useState<boolean>(false);
  const [groupModalError, setGroupModalError] = useState<string>('');
  const [groupForm, setGroupForm] = useState<Partial<SessionGroup>>({
    group_name: '',
    description: '',
    active: true
  });

  // Session Config State (09_SESSION_CONFIG)
  const [sessionConfigs, setSessionConfigs] = useState<SessionConfig[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);
  const [editingSession, setEditingSession] = useState<SessionConfig | null>(null);
  const [savingSession, setSavingSession] = useState<boolean>(false);
  const [sessionModalError, setSessionModalError] = useState<string>('');
  const [saveSuccessToast, setSaveSuccessToast] = useState<{ title: string; detail?: string } | null>(null);
  const [sessionForm, setSessionForm] = useState<Partial<SessionConfig>>({
    event_day_id: '',
    session_no: 1,
    day_session_no: 1,
    session_name: '',
    session_type: 'REGULAR',
    start_time: '08:00',
    end_time: '09:00',
    active: true,
    notes: ''
  });

  // Feedback Messages
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const triggerSuccessToast = (title: string, detail?: string) => {
    setSaveSuccessToast({ title, detail });
    setTimeout(() => {
      setSaveSuccessToast(null);
    }, 2500);
  };

  // Confirmation Modal State for Deactivation
  const [deactivateTarget, setDeactivateTarget] = useState<{
    type: 'SESSION' | 'GROUP' | 'DAY';
    id: string;
    name: string;
    item: any;
  } | null>(null);

  // Initial Load
  useEffect(() => {
    loadAllEvents();
  }, []);

  // Tab Resume listener
  useEffect(() => {
    const handleResume = () => {
      if (selectedEventId) {
        loadEventDetails(selectedEventId);
      }
    };
    window.addEventListener('rt_app_resumed', handleResume);
    return () => window.removeEventListener('rt_app_resumed', handleResume);
  }, [selectedEventId]);

  const loadAllEvents = async () => {
    setLoading(true);
    try {
      const allEvents = await ApiService.getEvents();
      if (Array.isArray(allEvents) && allEvents.length > 0) {
        setEvents(allEvents);
        setSelectedEventId(prev => {
          if (prev && allEvents.some(e => e.event_id === prev)) return prev;
          const active = allEvents.find(e => e.status === 'ACTIVE') || allEvents[0];
          return active ? active.event_id : prev;
        });
      }
    } catch (err: any) {
      console.warn('Gagal memuat daftar event:', err);
      setErrorMsg('Gagal memuat daftar event: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // Load sub-resources whenever selectedEventId changes
  useEffect(() => {
    if (!selectedEventId) return;
    const currentEvt = events.find(e => e.event_id === selectedEventId);
    if (currentEvt) {
      setEventForm(currentEvt);
    }
    loadEventDetails(selectedEventId);
  }, [selectedEventId]);

  const loadEventDetails = async (eventId: string) => {
    try {
      const [days, groups, configs] = await Promise.all([
        ApiService.getEventDays(eventId),
        ApiService.getSessionGroups(eventId),
        ApiService.getSessionConfigs(eventId)
      ]);
      setEventDays(days.sort((a, b) => a.day_no - b.day_no));
      setSessionGroups(groups);
      setSessionConfigs(configs);

      // Select first group if not selected
      if (groups.length > 0) {
        if (!selectedGroupId || !groups.some(g => g.session_group_id === selectedGroupId)) {
          setSelectedGroupId(groups[0].session_group_id);
        }
      } else {
        setSelectedGroupId('');
      }
    } catch (err: any) {
      setErrorMsg('Gagal memuat konfigurasi jadwal event: ' + (err.message || ''));
    }
  };

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setSuccessMsg('');
    } else {
      setSuccessMsg(msg);
      setErrorMsg('');
    }
    setTimeout(() => {
      setSuccessMsg('');
      setErrorMsg('');
    }, 4000);
  };

  // -------------------------------------------------------------
  // TAB 1: INFORMASI EVENT HANDLER
  // -------------------------------------------------------------
  const handleSaveEventInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || savingEvent) return;
    setSavingEvent(true);
    setEventFormError('');

    try {
      const updatedEvt: Event = {
        event_id: selectedEventId,
        event_name: eventForm.event_name || 'Event Rumah Tahfidz',
        academic_year: eventForm.academic_year || '2025/2026',
        sequence_no: Number(eventForm.sequence_no || 1),
        start_date: eventForm.start_date || new Date().toISOString().split('T')[0],
        end_date: eventForm.end_date || new Date().toISOString().split('T')[0],
        status: eventForm.status || 'ACTIVE',
        public_dashboard: eventForm.public_dashboard !== false,
        notes: eventForm.notes || '',
        created_at: eventForm.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await ApiService.updateEvent(updatedEvt, currentUser?.user_id);
      
      // Update local state
      setEvents(prev => prev.map(e => e.event_id === updatedEvt.event_id ? updatedEvt : e));
      setEventForm(updatedEvt);
      triggerSuccessToast('Event berhasil disimpan.', updatedEvt.event_name);
      showNotification('Informasi Event berhasil disimpan!');
    } catch (err: any) {
      const msg = err?.message || 'Gagal menyimpan event. Silakan coba kembali.';
      setEventFormError(msg);
      showNotification(msg, true);
    } finally {
      setSavingEvent(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 2: HARI EVENT (07A_EVENT_DAYS) HANDLERS
  // -------------------------------------------------------------
  const handleOpenAddDay = () => {
    if (!isAdmin) return;
    const nextDayNo = eventDays.length > 0 ? Math.max(...eventDays.map(d => d.day_no)) + 1 : 1;
    setEditingDay(null);
    setDayModalError('');
    setSavingDay(false);
    setDayForm({
      day_no: nextDayNo,
      event_date: eventForm.start_date || new Date().toISOString().split('T')[0],
      day_name: `Hari ${nextDayNo}`,
      status: 'ACTIVE',
      notes: ''
    });
    setIsDayModalOpen(true);
  };

  const handleOpenEditDay = (day: EventDay) => {
    if (!isAdmin) return;
    setEditingDay(day);
    setDayModalError('');
    setSavingDay(false);
    setDayForm({ ...day });
    setIsDayModalOpen(true);
  };

  const handleSaveDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || savingDay) return;

    const dayNo = Number(dayForm.day_no);
    if (!dayNo || dayNo < 1) {
      setDayModalError('Nomor Hari (day_no) harus berupa angka positif.');
      return;
    }
    if (!dayForm.event_date) {
      setDayModalError('Tanggal kegiatan hari wajib diisi.');
      return;
    }

    setSavingDay(true);
    setDayModalError('');

    try {
      const dayId = editingDay?.event_day_id || `ED-${selectedEventId}-${dayNo}-${Date.now().toString(36).slice(-4)}`;
      const dayToSave: EventDay = {
        event_day_id: dayId,
        event_id: selectedEventId,
        day_no: dayNo,
        event_date: dayForm.event_date,
        day_name: dayForm.day_name || `Hari ${dayNo}`,
        status: (dayForm.status as any) || 'ACTIVE',
        notes: dayForm.notes || ''
      };

      await ApiService.saveEventDay(dayToSave, currentUser?.user_id);
      await loadEventDetails(selectedEventId);
      setIsDayModalOpen(false);
      triggerSuccessToast('Hari event berhasil disimpan.', `Hari ke-${dayNo} (${dayToSave.day_name})`);
      showNotification(`Hari ke-${dayNo} (${dayToSave.day_name}) berhasil disimpan!`);
    } catch (err: any) {
      setDayModalError(err?.message || 'Gagal menyimpan data hari. Silakan coba kembali.');
    } finally {
      setSavingDay(false);
    }
  };

  const handleToggleDayStatus = async (day: EventDay) => {
    if (!isAdmin) return;
    const newStatus = day.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
    try {
      const updatedDay: EventDay = { ...day, status: newStatus as any };
      await ApiService.saveEventDay(updatedDay, currentUser?.user_id);
      await loadEventDetails(selectedEventId);
      showNotification(`Status hari ke-${day.day_no} diubah menjadi ${newStatus}.`);
    } catch (err: any) {
      showNotification('Gagal mengubah status hari: ' + (err.message || ''), true);
    }
  };

  // -------------------------------------------------------------
  // TAB 3: KELOMPOK JADWAL (08_SESSION_GROUPS) HANDLERS
  // -------------------------------------------------------------
  const handleOpenAddGroup = () => {
    if (!isAdmin) return;
    setEditingGroup(null);
    setGroupModalError('');
    setSavingGroup(false);
    setGroupForm({
      group_name: '',
      description: '',
      active: true
    });
    setIsGroupModalOpen(true);
  };

  const handleOpenEditGroup = (group: SessionGroup) => {
    if (!isAdmin) return;
    setEditingGroup(group);
    setGroupModalError('');
    setSavingGroup(false);
    setGroupForm({ ...group });
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || savingGroup) return;

    const gName = (groupForm.group_name || '').trim();
    if (!gName) {
      setGroupModalError('Nama Kelompok Jadwal wajib diisi.');
      return;
    }

    setSavingGroup(true);
    setGroupModalError('');

    try {
      const groupId = editingGroup?.session_group_id || `SG-${selectedEventId.replace('-', '')}-${Date.now().toString(36).slice(-4)}`;
      const groupToSave: SessionGroup = {
        session_group_id: groupId,
        event_id: selectedEventId,
        group_name: gName,
        description: groupForm.description || '',
        active: groupForm.active !== false
      };

      await ApiService.saveSessionGroup(groupToSave, currentUser?.user_id);
      await loadEventDetails(selectedEventId);
      setIsGroupModalOpen(false);
      triggerSuccessToast('Kelompok jadwal berhasil disimpan.', `Kelompok "${gName}"`);
      showNotification(`Kelompok Jadwal "${gName}" berhasil disimpan!`);
    } catch (err: any) {
      setGroupModalError(err?.message || 'Gagal menyimpan kelompok jadwal. Silakan coba kembali.');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleToggleGroupActive = async (group: SessionGroup) => {
    if (!isAdmin) return;
    const newActive = !group.active;
    try {
      const updatedGroup: SessionGroup = { ...group, active: newActive };
      await ApiService.saveSessionGroup(updatedGroup, currentUser?.user_id);
      await loadEventDetails(selectedEventId);
      showNotification(`Kelompok jadwal "${group.group_name}" ${newActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } catch (err: any) {
      showNotification('Gagal mengubah status kelompok jadwal: ' + (err.message || ''), true);
    }
  };

  // -------------------------------------------------------------
  // TAB 4: JADWAL SESI (09_SESSION_CONFIG) HANDLERS
  // -------------------------------------------------------------
  const handleOpenAddSession = (preferredDayId?: string) => {
    if (!isAdmin) return;
    if (!selectedGroupId) {
      showNotification('Silakan pilih atau buat Kelompok Jadwal terlebih dahulu.', true);
      return;
    }
    if (eventDays.length === 0) {
      showNotification('Silakan buat data Hari Event terlebih dahulu pada tab "Hari Event".', true);
      return;
    }

    const defaultDayId = preferredDayId || (eventDays[0]?.event_day_id || '');
    
    // Calculate next cumulative session_no for this session group
    const groupConfigs = sessionConfigs.filter(sc => sc.session_group_id === selectedGroupId && sc.active !== false);
    const maxSessionNo = groupConfigs.length > 0 ? Math.max(...groupConfigs.map(sc => sc.session_no)) : 0;
    const nextSessionNo = maxSessionNo + 1;

    // Calculate next day_session_no for the chosen day
    const dayConfigs = groupConfigs.filter(sc => sc.event_day_id === defaultDayId);
    const maxDaySessionNo = dayConfigs.length > 0 ? Math.max(...dayConfigs.map(sc => sc.day_session_no)) : 0;
    const nextDaySessionNo = maxDaySessionNo + 1;

    setEditingSession(null);
    setSessionModalError('');
    setSavingSession(false);
    setSessionForm({
      event_day_id: defaultDayId,
      session_no: nextSessionNo,
      day_session_no: nextDaySessionNo,
      session_name: 'Akselerasi Bacaan',
      session_type: 'REGULAR',
      start_time: '08:00',
      end_time: '09:00',
      active: true,
      notes: ''
    });
    setIsSessionModalOpen(true);
  };

  const handleOpenEditSession = (config: SessionConfig) => {
    if (!isAdmin) return;
    setEditingSession(config);
    setSessionModalError('');
    setSavingSession(false);
    setSessionForm({
      ...config,
      session_type: (config.session_type === 'FINAL_EVALUATION') ? 'FINAL_EVALUATION' : 'REGULAR',
      start_time: ApiService.normalizeTime(config.start_time) || '08:00',
      end_time: ApiService.normalizeTime(config.end_time) || '09:00'
    });
    setIsSessionModalOpen(true);
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || savingSession) return; // Prevent double submit

    setSessionModalError('');

    const sNo = Number(sessionForm.session_no);
    const daySNo = Number(sessionForm.day_session_no);
    const dayId = sessionForm.event_day_id || '';
    const rawStartTime = sessionForm.start_time || '';
    const rawEndTime = sessionForm.end_time || '';
    const startTime = ApiService.normalizeTime(rawStartTime);
    const endTime = ApiService.normalizeTime(rawEndTime);
    const sName = (sessionForm.session_name || '').trim();

    // Validation 1: Event Day belongs to selected event
    const validDay = eventDays.find(d => d.event_day_id === dayId && d.event_id === selectedEventId);
    if (!validDay) {
      setSessionModalError('Hari Event yang dipilih tidak valid untuk kegiatan ini.');
      return;
    }

    // Validation 2: Session Group belongs to selected event
    const validGroup = sessionGroups.find(g => g.session_group_id === selectedGroupId && g.event_id === selectedEventId);
    if (!validGroup) {
      setSessionModalError('Kelompok Jadwal yang dipilih tidak valid.');
      return;
    }

    // Validation 3: Time ordering (start_time < end_time)
    if (!startTime || !endTime) {
      setSessionModalError('Jam mulai (start_time) dan jam selesai (end_time) wajib diisi.');
      return;
    }
    if (startTime >= endTime) {
      setSessionModalError(`Jam Mulai (${startTime}) harus lebih awal daripada Jam Selesai (${endTime}).`);
      return;
    }

    // Validation 4: Duplicate session_no in the same event + session group
    const duplicateSession = sessionConfigs.find(sc =>
      sc.event_id === selectedEventId &&
      sc.session_group_id === selectedGroupId &&
      sc.session_no === sNo &&
      sc.active !== false &&
      sc.session_config_id !== editingSession?.session_config_id
    );

    if (duplicateSession && sessionForm.active !== false) {
      setSessionModalError(`Nomor Sesi #${sNo} sudah digunakan oleh "${duplicateSession.session_name}" pada kelompok jadwal ini. Gunakan nomor sesi lain.`);
      return;
    }

    setSavingSession(true);

    try {
      const configId = editingSession?.session_config_id || `SC-${selectedEventId.replace(/-/g, '')}-${selectedGroupId.replace(/-/g, '')}-${sNo}`;
      const sessionToSave: SessionConfig = {
        session_config_id: configId,
        event_id: selectedEventId,
        event_day_id: dayId,
        session_group_id: selectedGroupId,
        session_no: sNo,
        day_session_no: daySNo || 1,
        session_name: sName || `Sesi ${sNo}`,
        session_type: (sessionForm.session_type === 'FINAL_EVALUATION') ? 'FINAL_EVALUATION' : 'REGULAR',
        start_time: startTime,
        end_time: endTime,
        active: sessionForm.active !== false,
        notes: sessionForm.notes || ''
      };

      const savedResult = await ApiService.saveSessionConfig(sessionToSave, currentUser?.user_id);
      await loadEventDetails(selectedEventId);
      setIsSessionModalOpen(false);

      const detailStr = `Sesi ${sNo} • ${savedResult.start_time || startTime}–${savedResult.end_time || endTime}`;
      triggerSuccessToast('Konfigurasi sesi berhasil disimpan.', `${sessionToSave.session_name} (${detailStr})`);
      showNotification(`Konfigurasi Sesi #${sNo} (${sessionToSave.session_name}) berhasil disimpan!`);
    } catch (err: any) {
      console.error('Error saving session config:', err);
      const errMsg = err?.message || 'Gagal menyimpan konfigurasi sesi. Silakan coba kembali.';
      setSessionModalError(errMsg);
    } finally {
      setSavingSession(false);
    }
  };

  const handleDeactivateSession = async (config: SessionConfig) => {
    if (!isAdmin) return;
    try {
      const updated: SessionConfig = { ...config, active: false };
      await ApiService.saveSessionConfig(updated, currentUser?.user_id);
      await loadEventDetails(selectedEventId);
      showNotification(`Sesi #${config.session_no} (${config.session_name}) telah dinonaktifkan.`);
      setDeactivateTarget(null);
    } catch (err: any) {
      showNotification('Gagal menonaktifkan sesi: ' + (err.message || ''), true);
    }
  };

  const handleReactivateSession = async (config: SessionConfig) => {
    if (!isAdmin) return;
    try {
      const updated: SessionConfig = { ...config, active: true };
      await ApiService.saveSessionConfig(updated, currentUser?.user_id);
      await loadEventDetails(selectedEventId);
      showNotification(`Sesi #${config.session_no} (${config.session_name}) berhasil diaktifkan kembali.`);
    } catch (err: any) {
      showNotification('Gagal mengaktifkan sesi: ' + (err.message || ''), true);
    }
  };

  // Grouped sessions for Tab 4
  const sessionsByDay = useMemo(() => {
    const activeGroupConfigs = sessionConfigs.filter(sc => sc.session_group_id === selectedGroupId);
    
    return eventDays.map(day => {
      const daySessions = activeGroupConfigs
        .filter(sc => sc.event_day_id === day.event_day_id)
        .sort((a, b) => a.session_no - b.session_no);
      return {
        day,
        sessions: daySessions
      };
    });
  }, [eventDays, sessionConfigs, selectedGroupId]);

  const selectedGroupName = useMemo(() => {
    return sessionGroups.find(g => g.session_group_id === selectedGroupId)?.group_name || 'Pilih Kelompok Jadwal';
  }, [sessionGroups, selectedGroupId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-medium">Memuat Pengaturan Event Tahfidz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 animate-in fade-in">
      
      {/* Title Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-l-4 border-l-blue-500 w-full min-w-0">
        <div className="space-y-1 w-full min-w-0 max-w-full flex-1">
          <div className="inline-flex items-center space-x-2 text-xs text-blue-400 font-semibold">
            <CalendarDays className="w-4 h-4" />
            <span>Manajemen Jadwal & Struktur Event</span>
            {isCoordinator && (
              <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold">
                Mode Read-Only (Koordinator)
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white line-clamp-2 break-normal">Konfigurasi Event & Jadwal Sesi</h2>
          <p className="text-xs text-slate-400 break-normal">
            Kelola data hari event (07A), kelompok jadwal halaqah (08), dan konfigurasi jadwal sesi setoran (09).
          </p>
        </div>

        {/* Event Selector Dropdown */}
        <div className="flex items-center space-x-3 bg-slate-800/90 p-2.5 rounded-xl border border-slate-700 w-full xl:w-auto xl:justify-end shrink-0">
          <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="space-y-0.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 block">Pilih Event:</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="bg-slate-900 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            >
              {events.map(e => (
                <option key={e.event_id} value={e.event_id}>
                  {e.event_name} ({e.academic_year}) - [{e.status}]
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Floating Center-Top Success Toast */}
      {saveSuccessToast && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] max-w-md w-full px-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center space-x-3.5 ring-4 ring-emerald-500/10">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-white">{saveSuccessToast.title}</h4>
              {saveSuccessToast.detail && (
                <p className="text-xs text-emerald-300 font-medium truncate">{saveSuccessToast.detail}</p>
              )}
            </div>
            <button
              onClick={() => setSaveSuccessToast(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Standard Banners */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-semibold text-xs flex items-center space-x-2 border-l-4 border-l-emerald-500 shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-semibold text-xs flex items-center space-x-2 border-l-4 border-l-rose-500 shadow-sm animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-1.5 flex flex-wrap gap-1 shadow-sm">
        <button
          id="tab-event-info"
          onClick={() => setActiveTab('info')}
          className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeTab === 'info'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>Informasi Event</span>
        </button>

        <button
          id="tab-event-days"
          onClick={() => setActiveTab('days')}
          className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeTab === 'days'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Hari Event ({eventDays.length})</span>
        </button>

        <button
          id="tab-session-groups"
          onClick={() => setActiveTab('groups')}
          className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeTab === 'groups'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Kelompok Jadwal ({sessionGroups.length})</span>
        </button>

        <button
          id="tab-session-configs"
          onClick={() => setActiveTab('sessions')}
          className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeTab === 'sessions'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Jadwal Sesi ({sessionConfigs.filter(s => s.active !== false).length})</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: INFORMASI EVENT */}
      {/* ========================================================= */}
      {activeTab === 'info' && (
        <form onSubmit={handleSaveEventInfo} className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Detail Informasi Event</h3>
              <p className="text-xs text-slate-500">Konfigurasi metadata umum kegiatan Rumah Tahfidz.</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              eventForm.status === 'ACTIVE'
                ? 'bg-emerald-100 text-emerald-800'
                : eventForm.status === 'DRAFT'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-700'
            }`}>
              Status: {eventForm.status}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Nama Event Tahfidz
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={eventForm.event_name || ''}
                onChange={(e) => setEventForm({ ...eventForm, event_name: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Tahun Ajaran
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={eventForm.academic_year || ''}
                onChange={(e) => setEventForm({ ...eventForm, academic_year: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Tanggal Mulai Kegiatan
              </label>
              <input
                type="date"
                required
                disabled={!isAdmin}
                value={eventForm.start_date ? eventForm.start_date.split('T')[0] : ''}
                onChange={(e) => setEventForm({ ...eventForm, start_date: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Tanggal Selesai Kegiatan
              </label>
              <input
                type="date"
                required
                disabled={!isAdmin}
                value={eventForm.end_date ? eventForm.end_date.split('T')[0] : ''}
                onChange={(e) => setEventForm({ ...eventForm, end_date: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Status Event
              </label>
              <select
                disabled={!isAdmin}
                value={eventForm.status || 'ACTIVE'}
                onChange={(e) => setEventForm({ ...eventForm, status: e.target.value as any })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
              >
                <option value="ACTIVE">ACTIVE (Sedang Berjalan)</option>
                <option value="DRAFT">DRAFT (Persiapan)</option>
                <option value="CLOSED">CLOSED (Selesai/Tutup)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Urutan Skuensial / Sequence No
              </label>
              <input
                type="number"
                min={1}
                max={12}
                disabled={!isAdmin}
                value={eventForm.sequence_no || 1}
                onChange={(e) => setEventForm({ ...eventForm, sequence_no: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Catatan Khusus Event
            </label>
            <textarea
              rows={3}
              disabled={!isAdmin}
              value={eventForm.notes || ''}
              onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
              placeholder="Catatan pelaksanaan, instruksi umum panitia, atau deskripsi target kegiatan..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
            />
          </div>

          {eventFormError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-semibold">{eventFormError}</span>
            </div>
          )}

          {isAdmin && (
            <div className="pt-2 flex justify-end">
              <LoadingButton
                type="submit"
                loading={savingEvent}
                loadingText="Menyimpan..."
                icon={<Save className="w-4 h-4" />}
                className="px-6 py-2.5 text-xs md:text-sm font-bold"
              >
                Simpan Informasi Event
              </LoadingButton>
            </div>
          )}
        </form>
      )}

      {/* ========================================================= */}
      {/* TAB 2: HARI EVENT (07A_EVENT_DAYS) */}
      {/* ========================================================= */}
      {activeTab === 'days' && (
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Daftar Hari Event (07A_EVENT_DAYS)</h3>
              <p className="text-xs text-slate-500">
                Atur hari ke-1, ke-2, dst. beserta tanggal kalender resmi untuk penanggalan jadwal sesi.
              </p>
            </div>

            {isAdmin && (
              <button
                id="btn-add-event-day"
                onClick={handleOpenAddDay}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Hari</span>
              </button>
            )}
          </div>

          {eventDays.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
              <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700">Belum Ada Data Hari Event</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Klik tombol &ldquo;Tambah Hari&rdquo; di atas untuk mendaftarkan Hari 1, Hari 2, dst.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-4 rounded-l-lg">Hari Ke</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Nama Hari</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Catatan</th>
                    {isAdmin && <th className="py-3 px-4 text-right rounded-r-lg">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eventDays.map((day) => (
                    <tr key={day.event_day_id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-black text-slate-900">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                          {day.day_no}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {day.event_date ? new Date(day.event_date).toLocaleDateString('id-ID', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        }) : '-'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {day.day_name}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          day.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : day.status === 'COMPLETED'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {day.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                        {day.notes || '-'}
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-4 text-right space-x-1">
                          <button
                            onClick={() => handleOpenEditDay(day)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                            title="Edit Hari"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleDayStatus(day)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition"
                            title={day.status === 'ACTIVE' ? 'Tandai Selesai' : 'Aktifkan Kembali'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: KELOMPOK JADWAL (08_SESSION_GROUPS) */}
      {/* ========================================================= */}
      {activeTab === 'groups' && (
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Kelompok Jadwal Sesi (08_SESSION_GROUPS)</h3>
              <p className="text-xs text-slate-500">
                Kelompok jadwal digunakan bersama oleh beberapa halaqah yang memiliki jadwal/timetable jam sesi yang sama (contoh: &ldquo;SD Kelas 1–2&rdquo;, &ldquo;Kelas 4–9 Ikhwan&rdquo;).
              </p>
            </div>

            {isAdmin && (
              <button
                id="btn-add-session-group"
                onClick={handleOpenAddGroup}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Kelompok Jadwal</span>
              </button>
            )}
          </div>

          {sessionGroups.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
              <Layers className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700">Belum Ada Kelompok Jadwal</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Buat kelompok jadwal pertama (contoh: &ldquo;SD Kelas 1–2&rdquo; atau &ldquo;Reguler Ikhwan&rdquo;) untuk mengelompokkan timetable sesi setoran.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessionGroups.map((group) => {
                const configsInGroup = sessionConfigs.filter(sc => sc.session_group_id === group.session_group_id && sc.active !== false);
                return (
                  <div
                    key={group.session_group_id}
                    className={`rounded-2xl border p-5 transition space-y-3 flex flex-col justify-between ${
                      group.active !== false
                        ? 'bg-white border-slate-200 shadow-sm hover:shadow-md'
                        : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mb-1 ${
                            group.active !== false
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {group.active !== false ? 'AKTIF' : 'NON-AKTIF'}
                          </span>
                          <h4 className="text-base font-bold text-slate-900">{group.group_name}</h4>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleOpenEditGroup(group)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                              title="Edit Kelompok"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleGroupActive(group)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition"
                              title={group.active !== false ? 'Nonaktifkan Kelompok' : 'Aktifkan Kelompok'}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2">
                        {group.description || 'Tidak ada deskripsi tambahan.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Jumlah Sesi Terdaftar:</span>
                      <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                        {configsInGroup.length} Sesi
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: JADWAL SESI (09_SESSION_CONFIG) */}
      {/* ========================================================= */}
      {activeTab === 'sessions' && (
        <div className="space-y-6 animate-in fade-in">
          
          {/* Top Filter Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <label className="text-xs font-bold text-slate-700">Kelompok Jadwal:</label>
              </div>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="py-2 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {sessionGroups.length === 0 ? (
                  <option value="">(Belum Ada Kelompok Jadwal)</option>
                ) : (
                  sessionGroups.map(g => (
                    <option key={g.session_group_id} value={g.session_group_id}>
                      {g.group_name} {g.active === false ? '(Non-aktif)' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {isAdmin && sessionGroups.length > 0 && eventDays.length > 0 && (
              <button
                id="btn-add-session"
                onClick={() => handleOpenAddSession()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Sesi Baru</span>
              </button>
            )}
          </div>

          {sessionGroups.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3 shadow-sm">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">Kelompok Jadwal Belum Dibuat</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Silakan buka tab <strong>&ldquo;Kelompok Jadwal&rdquo;</strong> terlebih dahulu untuk membuat minimal satu kelompok jadwal (mis: &ldquo;SD Kelas 1–2&rdquo;).
              </p>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('groups')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
                >
                  Buka Tab Kelompok Jadwal
                </button>
              )}
            </div>
          ) : eventDays.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3 shadow-sm">
              <Calendar className="w-10 h-10 text-amber-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">Hari Event Belum Dibuat</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Silakan buka tab <strong>&ldquo;Hari Event&rdquo;</strong> terlebih dahulu untuk mendaftarkan hari ke-1, ke-2, dst.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('days')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
                >
                  Buka Tab Hari Event
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {sessionsByDay.map(({ day, sessions }) => (
                <div key={day.event_day_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  
                  {/* Day Header Banner */}
                  <div className="bg-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-sm">
                        {day.day_no}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold tracking-tight text-white uppercase">
                          HARI {day.day_no} — {day.event_date ? new Date(day.event_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : day.day_name}
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          {day.day_name} • Kelompok: <span className="text-amber-300 font-semibold">{selectedGroupName}</span>
                        </p>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => handleOpenAddSession(day.event_day_id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 hover:border-slate-600 text-xs font-bold rounded-lg transition flex items-center space-x-1 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Sesi di Hari Ini</span>
                      </button>
                    )}
                  </div>

                  {/* Sessions List */}
                  <div className="p-6">
                    {sessions.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                        <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                        <p className="text-xs text-slate-500 font-medium">
                          Belum ada sesi yang dikonfigurasi untuk Hari {day.day_no} pada kelompok ini.
                        </p>
                        {isAdmin && (
                          <button
                            onClick={() => handleOpenAddSession(day.event_day_id)}
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition"
                          >
                            + Tambah Sesi Hari {day.day_no}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sessions.map((sc) => (
                          <div
                            key={sc.session_config_id}
                            className={`rounded-xl border p-4 transition space-y-3 flex flex-col justify-between ${
                              sc.active !== false
                                ? 'bg-white border-slate-200 shadow-sm hover:border-blue-300'
                                : 'bg-slate-50 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-black text-xs rounded border border-blue-200">
                                      Sesi {sc.session_no}
                                    </span>
                                    {sc.session_type === 'FINAL_EVALUATION' && (
                                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-extrabold text-[10px] rounded border border-purple-200 uppercase tracking-wider">
                                        Evaluasi Akhir
                                      </span>
                                    )}
                                    <span className="text-[10px] text-slate-400 font-semibold">
                                      (Urutan Harian: ke-{sc.day_session_no})
                                    </span>
                                  </div>
                                  <h5 className="text-sm font-bold text-slate-900 pt-1">{sc.session_name}</h5>
                                </div>

                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  sc.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {sc.active !== false ? 'Aktif' : 'Non-aktif'}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="font-bold text-slate-800">
                                  {ApiService.formatClockTime(sc.start_time)} – {ApiService.formatClockTime(sc.end_time)}
                                </span>
                              </div>

                              {sc.notes && (
                                <p className="text-[11px] text-slate-500 italic">
                                  {sc.notes}
                                </p>
                              )}
                            </div>

                            {isAdmin && (
                              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-1 text-xs">
                                <button
                                  onClick={() => handleOpenEditSession(sc)}
                                  className="px-2.5 py-1 text-slate-600 hover:text-blue-700 hover:bg-slate-100 rounded-lg font-semibold transition flex items-center space-x-1"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                
                                {sc.active !== false ? (
                                  <button
                                    onClick={() => setDeactivateTarget({
                                      type: 'SESSION',
                                      id: sc.session_config_id,
                                      name: `Sesi #${sc.session_no} (${sc.session_name})`,
                                      item: sc
                                    })}
                                    className="px-2.5 py-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg font-semibold transition flex items-center space-x-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Nonaktifkan</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReactivateSession(sc)}
                                    className="px-2.5 py-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg font-semibold transition flex items-center space-x-1"
                                  >
                                    <Power className="w-3 h-3" />
                                    <span>Aktifkan</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT EVENT DAY (07A_EVENT_DAYS) */}
      {/* ========================================================= */}
      {isDayModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span>{editingDay ? 'Edit Hari Event' : 'Tambah Hari Event Baru'}</span>
              </h3>
              <button
                type="button"
                disabled={savingDay}
                onClick={() => setIsDayModalOpen(false)}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDay} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hari Ke (day_no)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    disabled={savingDay}
                    value={dayForm.day_no || 1}
                    onChange={(e) => setDayForm({ ...dayForm, day_no: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <select
                    disabled={savingDay}
                    value={dayForm.status || 'ACTIVE'}
                    onChange={(e) => setDayForm({ ...dayForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SCHEDULED">SCHEDULED</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Kegiatan (event_date)</label>
                <input
                  type="date"
                  required
                  disabled={savingDay}
                  value={dayForm.event_date ? dayForm.event_date.split('T')[0] : ''}
                  onChange={(e) => setDayForm({ ...dayForm, event_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Hari / Label (day_name)</label>
                <input
                  type="text"
                  required
                  disabled={savingDay}
                  placeholder="mis: Hari 1 (Kamis), Pembukaan Seta"
                  value={dayForm.day_name || ''}
                  onChange={(e) => setDayForm({ ...dayForm, day_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan (notes)</label>
                <textarea
                  rows={2}
                  disabled={savingDay}
                  placeholder="Catatan agenda kegiatan harian..."
                  value={dayForm.notes || ''}
                  onChange={(e) => setDayForm({ ...dayForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {/* In-Modal Error Feedback */}
              {dayModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start space-x-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{dayModalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingDay}
                  onClick={() => setIsDayModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Batal
                </button>
                <LoadingButton
                  type="submit"
                  loading={savingDay}
                  loadingText="Menyimpan..."
                  icon={<Save className="w-3.5 h-3.5" />}
                  className="px-5 py-2 text-xs font-bold"
                >
                  Simpan Hari Event
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT SESSION GROUP (08_SESSION_GROUPS) */}
      {/* ========================================================= */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>{editingGroup ? 'Edit Kelompok Jadwal' : 'Tambah Kelompok Jadwal Baru'}</span>
              </h3>
              <button
                type="button"
                disabled={savingGroup}
                onClick={() => setIsGroupModalOpen(false)}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Kelompok Jadwal (group_name)</label>
                <input
                  type="text"
                  required
                  disabled={savingGroup}
                  placeholder="mis: SD Kelas 1–2, SD Kelas 3, Kelas 4–9 Ikhwan"
                  value={groupForm.group_name || ''}
                  onChange={(e) => setGroupForm({ ...groupForm, group_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Nama kelompok yang akan dibagikan ke halaqah-halaqah dengan timetable yang serupa.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi (description)</label>
                <textarea
                  rows={3}
                  disabled={savingGroup}
                  placeholder="mis: Jadwal khusus peserta SD kelas bawah dengan durasi sesi 45 menit..."
                  value={groupForm.description || ''}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="grpActive"
                  disabled={savingGroup}
                  checked={groupForm.active !== false}
                  onChange={(e) => setGroupForm({ ...groupForm, active: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <label htmlFor="grpActive" className="text-xs font-bold text-slate-700">
                  Kelompok Jadwal Aktif
                </label>
              </div>

              {/* In-Modal Error Feedback */}
              {groupModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start space-x-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{groupModalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingGroup}
                  onClick={() => setIsGroupModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Batal
                </button>
                <LoadingButton
                  type="submit"
                  loading={savingGroup}
                  loadingText="Menyimpan..."
                  icon={<Save className="w-3.5 h-3.5" />}
                  className="px-5 py-2 text-xs font-bold"
                >
                  Simpan Kelompok Jadwal
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT SESSION CONFIG (09_SESSION_CONFIG) */}
      {/* ========================================================= */}
      {isSessionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>{editingSession ? 'Edit Sesi Jadwal' : 'Tambah Sesi Jadwal Baru'}</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Kelompok: <strong className="text-white">{selectedGroupName}</strong>
                </p>
              </div>
              <button
                type="button"
                disabled={savingSession}
                onClick={() => setIsSessionModalOpen(false)}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Hari Event</label>
                <select
                  required
                  disabled={savingSession}
                  value={sessionForm.event_day_id || ''}
                  onChange={(e) => {
                    const chosenDayId = e.target.value;
                    // Recalculate day_session_no
                    const groupConfigs = sessionConfigs.filter(sc => sc.session_group_id === selectedGroupId && sc.event_day_id === chosenDayId && sc.active !== false);
                    const nextDaySess = groupConfigs.length > 0 ? Math.max(...groupConfigs.map(c => c.day_session_no)) + 1 : 1;
                    setSessionForm({
                      ...sessionForm,
                      event_day_id: chosenDayId,
                      day_session_no: nextDaySess
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {eventDays.map(d => (
                    <option key={d.event_day_id} value={d.event_day_id}>
                      Hari {d.day_no} ({d.event_date ? new Date(d.event_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : d.day_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor Sesi Total (session_no)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    disabled={savingSession}
                    value={sessionForm.session_no || 1}
                    onChange={(e) => setSessionForm({ ...sessionForm, session_no: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Urutan kumulatif di event (mis: 1, 2, 3, 4, 5...)
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sesi Ke- di Hari Ini (day_session_no)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    disabled={savingSession}
                    value={sessionForm.day_session_no || 1}
                    onChange={(e) => setSessionForm({ ...sessionForm, day_session_no: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Urutan sesi hanya di hari terpilih (mis: 1, 2, 3)
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jenis Sesi</label>
                <select
                  disabled={savingSession}
                  value={sessionForm.session_type || 'REGULAR'}
                  onChange={(e) => {
                    const newType = e.target.value as any;
                    const isNewTypeFinal = newType === 'FINAL_EVALUATION';
                    let updatedName = sessionForm.session_name || '';
                    if (!editingSession && isNewTypeFinal && (updatedName === 'Akselerasi Bacaan' || updatedName.startsWith('Sesi '))) {
                      updatedName = 'Evaluasi Akhir';
                    }
                    setSessionForm({
                      ...sessionForm,
                      session_type: newType,
                      session_name: updatedName
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="REGULAR">Sesi Reguler</option>
                  <option value="FINAL_EVALUATION">Evaluasi Akhir</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  {sessionForm.session_type === 'FINAL_EVALUATION'
                    ? 'Sesi ini diarahkan khusus untuk evaluasi akhir santri / siswa.'
                    : 'Sesi pembelajaran dan setoran hafalan Ziyadah/Iqra harian.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Sesi (session_name)</label>
                <input
                  type="text"
                  required
                  disabled={savingSession}
                  placeholder="mis: Akselerasi Bacaan, Setoran Pagi, Tasmik Sore"
                  value={sessionForm.session_name || ''}
                  onChange={(e) => setSessionForm({ ...sessionForm, session_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jam Mulai (start_time)</label>
                  <input
                    type="time"
                    required
                    disabled={savingSession}
                    value={sessionForm.start_time || '08:00'}
                    onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jam Selesai (end_time)</label>
                  <input
                    type="time"
                    required
                    disabled={savingSession}
                    value={sessionForm.end_time || '09:00'}
                    onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Sesi (notes)</label>
                <textarea
                  rows={2}
                  disabled={savingSession}
                  placeholder="Catatan khusus atau panduan tasmik..."
                  value={sessionForm.notes || ''}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="sessActive"
                  disabled={savingSession}
                  checked={sessionForm.active !== false}
                  onChange={(e) => setSessionForm({ ...sessionForm, active: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <label htmlFor="sessActive" className="text-xs font-bold text-slate-700">
                  Sesi Aktif
                </label>
              </div>

              {/* In-Modal Error Feedback */}
              {sessionModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start space-x-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{sessionModalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingSession}
                  onClick={() => setIsSessionModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Batal
                </button>
                <LoadingButton
                  type="submit"
                  loading={savingSession}
                  loadingText="Menyimpan..."
                  icon={<Save className="w-3.5 h-3.5" />}
                  className="px-5 py-2 text-xs font-bold"
                >
                  Simpan Konfigurasi Sesi
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONFIRMATION MODAL: DEACTIVATE SESSION */}
      {/* ========================================================= */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Nonaktifkan Sesi Ini?</h3>
              <p className="text-xs text-slate-500">
                Anda akan menonaktifkan <strong>{deactivateTarget.name}</strong>. Data penilaian sebelumnya (jika ada) akan tetap tersimpan aman.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeactivateTarget(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={() => handleDeactivateSession(deactivateTarget.item)}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                Nonaktifkan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
