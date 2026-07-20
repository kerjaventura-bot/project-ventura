import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, orderBy, limit, onSnapshot, getFirestore 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Clock, Search, User, FileText, CheckCircle2, AlertTriangle, 
  MapPin, RefreshCw, Calendar, ArrowUpDown, ChevronDown, ListFilter, Trash2
} from 'lucide-react';

interface ActivityLog {
  id: string;
  projectId: string;
  projectName: string;
  timestamp: number;
  userEmail: string;
  operatorName?: string;
  userRole: string;
  actionType: 'CREATE' | 'UPDATE' | 'UPLOAD' | 'QC';
  details: string;
  recordCode: string;
}

interface ActivityLogsPanelProps {
  activeProjectId: string;
  projects: { id: string; name: string }[];
}

export default function ActivityLogsPanel({ activeProjectId, projects }: ActivityLogsPanelProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | 'active' | string>('active');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Real-time subscribe to activity logs
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    try {
      const logsRef = collection(db, 'activity_logs');
      // Limit to 250 logs for performance and quota control
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(250));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const loadedLogs: ActivityLog[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          loadedLogs.push({
            id: doc.id,
            projectId: data.projectId || '',
            projectName: data.projectName || '',
            timestamp: data.timestamp || Date.now(),
            userEmail: data.userEmail || '',
            operatorName: data.operatorName || '',
            userRole: data.userRole || '',
            actionType: data.actionType || 'UPDATE',
            details: data.details || '',
            recordCode: data.recordCode || '',
          });
        });
        setLogs(loadedLogs);
        setIsLoading(false);
      }, (err) => {
        console.error("Error subscribing to activity logs:", err);
        setError("Gagal memuat log aktivitas. Pastikan koneksi internet aktif dan database Firestore terhubung.");
        setIsLoading(false);
      });

      return () => unsubscribe();
    } catch (err: any) {
      console.error("Error in activity logs subscription setup:", err);
      setError(err.message || "Gagal menyetel sinkronisasi log.");
      setIsLoading(false);
    }
  }, []);

  // Filter & sort logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        // Project Filter
        if (projectFilter === 'active') {
          if (log.projectId !== activeProjectId) return false;
        } else if (projectFilter !== 'all') {
          if (log.projectId !== projectFilter) return false;
        }

        // Action Filter
        if (actionFilter !== 'ALL' && log.actionType !== actionFilter) {
          return false;
        }

        // Search Query (filters by user, operator name, code, or details)
        if (searchQuery.trim()) {
          const queryLower = searchQuery.toLowerCase().trim();
          return (
            log.recordCode.toLowerCase().includes(queryLower) ||
            log.userEmail.toLowerCase().includes(queryLower) ||
            (log.operatorName && log.operatorName.toLowerCase().includes(queryLower)) ||
            log.details.toLowerCase().includes(queryLower)
          );
        }

        return true;
      })
      .sort((a, b) => {
        return sortOrder === 'desc' 
          ? b.timestamp - a.timestamp 
          : a.timestamp - b.timestamp;
      });
  }, [logs, projectFilter, activeProjectId, actionFilter, searchQuery, sortOrder]);

  // Format date helper
  const formatLogDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return '-';
    }
  };

  // Get Action Badge Style helper
  const getActionBadge = (type: string) => {
    switch (type) {
      case 'CREATE':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          label: 'TAMBAH',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />
        };
      case 'UPLOAD':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          label: 'UPLOAD',
          icon: <FileText className="w-3.5 h-3.5" />
        };
      case 'QC':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          label: 'QC / VERIFIKASI',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />
        };
      case 'UPDATE':
      default:
        return {
          bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          label: 'EDIT',
          icon: <RefreshCw className="w-3.5 h-3.5" />
        };
    }
  };

  // Get Role Badge Style
  const getRoleBadge = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'ADMIN':
        return 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20';
      case 'FIELD':
        return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20';
      case 'QC':
        return 'bg-amber-500/15 text-amber-300 border border-amber-500/20';
      default:
        return 'bg-slate-500/15 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6" id="activity_logs_panel">
      {/* 1. Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight uppercase">
            LOG AKTIVITAS SISTEM
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Melacak riwayat perubahan data lahan, pengunggahan berkas digital, dan verifikasi Quality Control (QC).
          </p>
        </div>
      </div>

      {/* 2. Filters Grid */}
      <div className="glass-card p-5 rounded-2xl border border-white/10 space-y-4 shadow-lg">
        <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
          <ListFilter className="w-4 h-4" />
          Filter & Pencarian Log
        </span>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search bar */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari CODE, email, detail..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-400"
            />
          </div>

          {/* Project select */}
          <div>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="active">Jalur Aktif Saja</option>
              <option value="all">Semua Jalur Proyek</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>{proj.name}</option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="ALL">Semua Jenis Tindakan</option>
              <option value="CREATE">TAMBAH DATA LAHAN</option>
              <option value="UPDATE">EDIT DATA LAHAN</option>
              <option value="UPLOAD">UPLOAD BERKAS PDF</option>
              <option value="QC">QC / VERIFIKASI</option>
            </select>
          </div>

          {/* Sort Order */}
          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <ArrowUpDown className="w-4 h-4 text-indigo-400" />
            Urutan: {sortOrder === 'desc' ? 'Terbaru' : 'Terlama'}
          </button>
        </div>
      </div>

      {/* 3. Log Output */}
      {isLoading ? (
        <div className="glass-card p-12 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 min-h-[300px]">
          <div className="w-8 h-8 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold text-slate-300">Menghubungkan ke database log aktivitas...</p>
        </div>
      ) : error ? (
        <div className="glass-card p-8 rounded-2xl flex flex-col items-center justify-center text-center text-rose-300 border-rose-500/20 bg-rose-500/5">
          <AlertTriangle className="w-8 h-8 text-rose-400 mb-2" />
          <p className="text-xs font-bold">{error}</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="glass-card p-12 rounded-2xl text-center space-y-3 shadow-lg">
          <Clock className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-xs font-bold text-slate-300 uppercase">Tidak Ada Log Aktivitas Ditemukan</p>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
            Belum ada aktivitas terekam yang cocok dengan filter saat ini.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl shadow-xl overflow-hidden">
          {/* Scrollable Timeline Table view */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs text-slate-300">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Pengguna (Role)</th>
                  <th className="py-3 px-4">Tindakan</th>
                  <th className="py-3 px-4">Kode Lahan</th>
                  <th className="py-3 px-4">Rincian Aktivitas</th>
                  {projectFilter === 'all' && <th className="py-3 px-4">Proyek / Jalur</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.map((log) => {
                  const badge = getActionBadge(log.actionType);
                  return (
                    <tr key={log.id} className="hover:bg-white/2 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-semibold font-mono text-slate-300 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        {formatLogDate(log.timestamp)}
                      </td>

                      {/* User Email, Operator Name & Role */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="p-1 bg-white/5 rounded-md text-slate-400 shrink-0">
                              <User className="w-3 h-3" />
                            </div>
                            <span className="font-extrabold text-slate-200 truncate max-w-[180px] block uppercase text-[11px]" title={log.operatorName || log.userEmail}>
                              {log.operatorName && log.operatorName !== 'unknown' ? log.operatorName : log.userEmail.split('@')[0]}
                            </span>
                          </div>
                          {log.operatorName && log.operatorName !== 'unknown' && (
                            <span className="text-[9px] text-slate-400 font-mono pl-6 truncate max-w-[180px] block" title={log.userEmail}>
                              {log.userEmail}
                            </span>
                          )}
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-extrabold tracking-wider self-start uppercase mt-1 ${getRoleBadge(log.userRole)}`}>
                            {log.userRole || 'GUEST'}
                          </span>
                        </div>
                      </td>

                      {/* Action Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold border px-2 py-0.5 rounded-full uppercase tracking-wider ${badge.bg}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>

                      {/* Record Code */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-100 font-mono">
                        {log.recordCode || '-'}
                      </td>

                      {/* Details */}
                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-200 min-w-[280px] max-w-[420px] leading-relaxed">
                        {log.details}
                      </td>

                      {/* Project Name (if in all-project view) */}
                      {projectFilter === 'all' && (
                        <td className="py-3.5 px-4 text-[10px] font-bold text-indigo-300 max-w-[150px] truncate" title={log.projectName}>
                          {log.projectName || '-'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer stats */}
          <div className="bg-white/5 px-5 py-3 border-t border-white/10 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">
            <span>Total Terekam: {filteredLogs.length} Aktivitas</span>
            <span>Riwayat Sinkron Secara Real-time</span>
          </div>
        </div>
      )}
    </div>
  );
}
