import React from 'react';
import { UserRole } from '../../types';
import {
  BarChart3, Search, Users, Calendar, BookOpen, UserCheck,
  TrendingUp, Settings, Layers, FileText
} from 'lucide-react';

interface NavbarProps {
  currentRole: UserRole | 'PUBLIC';
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRole, activeTab, onTabChange }) => {
  // Public user menu
  if (currentRole === 'PUBLIC') {
    return (
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2 md:space-x-8 overflow-x-auto py-2">
          <button
            onClick={() => onTabChange('student-progress')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
              activeTab === 'student-progress'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Search className="w-4 h-4 text-emerald-600" />
            <span>Cek Perkembangan Hafalan Siswa</span>
          </button>
        </div>
      </nav>
    );
  }

  // Teacher menu
  if (currentRole === 'TEACHER') {
    return (
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2 md:space-x-8 overflow-x-auto py-2">
          <button
            onClick={() => onTabChange('my-halaqah')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
              activeTab === 'my-halaqah'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-600" />
            <span>My Halaqah</span>
          </button>

          <button
            onClick={() => onTabChange('session-assessment')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
              activeTab === 'session-assessment'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>Penilaian Sesi</span>
          </button>

          <button
            onClick={() => onTabChange('final-evaluation')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
              activeTab === 'final-evaluation'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Evaluasi Akhir</span>
          </button>
        </div>
      </nav>
    );
  }

  // Admin & Coordinator menu
  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-16 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 md:space-x-3 overflow-x-auto py-2">
        <button
          onClick={() => onTabChange('admin-dashboard')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'admin-dashboard'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          <span>Dashboard Ops</span>
        </button>

        <button
          onClick={() => onTabChange('event-mgmt')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'event-mgmt'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span>Event</span>
        </button>

        <button
          onClick={() => onTabChange('student-mgmt')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'student-mgmt'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-600" />
          <span>Siswa</span>
        </button>

        <button
          onClick={() => onTabChange('halaqah-mgmt')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'halaqah-mgmt'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Layers className="w-4 h-4 text-emerald-600" />
          <span>Halaqah</span>
        </button>

        <button
          onClick={() => onTabChange('assignments-mgmt')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'assignments-mgmt'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span>Penugasan Massal</span>
        </button>

        <button
          onClick={() => onTabChange('assessments-overview')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'assessments-overview'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>Data Penilaian</span>
        </button>

        <button
          onClick={() => onTabChange('analytics')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'analytics'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Analytics Eksekutif</span>
        </button>

        <button
          onClick={() => onTabChange('administration')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
            activeTab === 'administration'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Settings className="w-4 h-4 text-emerald-600" />
          <span>Administrasi</span>
        </button>
      </div>
    </nav>
  );
};
