import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, FileText, CheckCircle2, Clock, AlertCircle, Map, Home, Sprout,
  ShieldCheck, FolderCheck, CloudUpload, MapPin
} from 'lucide-react';
import type { LandRecord } from '../types';

interface DashboardProps {
  records: LandRecord[];
}

export default function Dashboard({ records }: DashboardProps) {
  // Statistics and Calculations
  const stats = useMemo(() => {
    const total = records.length;
    const approved = records.filter(r => r.QC_STATUS === 'APPROVED').length;
    const pending = records.filter(r => r.QC_STATUS === 'PENDING' || !r.QC_STATUS).length;
    const rejected = records.filter(r => r.QC_STATUS === 'REJECTED').length;

    // Calculate total area (LUAS)
    const totalLuas = records.reduce((sum, r) => {
      const val = parseFloat(r.LUAS) || 0;
      return sum + val;
    }, 0);

    // Document completion rates
    const docsKtp = records.filter(r => r.LINK_KTP).length;
    const docsKk = records.filter(r => r.LINK_KK).length;
    const docsAlas = records.filter(r => r.LINK_ALAS_HAK).length;
    const docsPeralihan = records.filter(r => 
      r.LINK_PERALIHAN_HAK ||
      r.LINK_JUAL_BELI ||
      r.LINK_KETERANGAN_WARIS ||
      r.LINK_KUASA_WARIS ||
      r.LINK_SURAT_KUASA ||
      r.LINK_KET_BEDA_NAMA ||
      r.LINK_WAKAF ||
      r.LINK_KLAIM_TANAMAN ||
      r.LINK_KLAIM_BANGUNAN ||
      r.LINK_DOKUMEN_LAIN
    ).length;

    // Buildings stats
    let totalBuildings = 0;
    records.forEach(r => {
      r.buildings?.forEach(b => {
        if (b.luas || b.bentuk || b.jenis) {
          totalBuildings++;
        }
      });
    });

    // Plants stats
    let totalPlantsCount = 0;
    records.forEach(r => {
      r.plants?.forEach(p => {
        if (p.jenis) {
          const m1 = parseInt(p.sudah_menghasilkan) || 0;
          const m2 = parseInt(p.belum_menghasilkan) || 0;
          totalPlantsCount += (m1 + m2);
        }
      });
    });

    // Primary project progress stats
    const pemberkasanSelesai = records.filter(r => r.PROGRES_PEMBERKASAN === 'SELESAI').length;
    const pemberkasanKonsinyasi = records.filter(r => r.PROGRES_PEMBERKASAN === 'KONSINYASI').length;
    const pemberkasanBelumSelesai = total - pemberkasanSelesai - pemberkasanKonsinyasi;
    
    const trabasSudah = records.filter(r => r.PROGRES_UPLOAD_TRABAS === 'SUDAH').length;
    const trabasBelum = total - trabasSudah;

    return {
      total,
      approved,
      pending,
      rejected,
      totalLuas,
      docsKtp,
      docsKk,
      docsAlas,
      docsPeralihan,
      totalBuildings,
      totalPlantsCount,
      pemberkasanSelesai,
      pemberkasanKonsinyasi,
      pemberkasanBelumSelesai,
      trabasSudah,
      trabasBelum
    };
  }, [records]);

  // Chart data: Distribution by DESA
  const desaChartData = useMemo(() => {
    const counts: { [key: string]: { count: number; luas: number } } = {};
    records.forEach(r => {
      const d = r.DESA || 'Belum Diisi';
      const l = parseFloat(r.LUAS) || 0;
      if (!counts[d]) {
        counts[d] = { count: 0, luas: 0 };
      }
      counts[d].count += 1;
      counts[d].luas += l;
    });

    return Object.keys(counts).map(name => ({
      name,
      Jumlah: counts[name].count,
      'Luas (m²)': Math.round(counts[name].luas * 100) / 100
    }));
  }, [records]);

  // Unified progress data by DESA (Default alphabetical sort A-Z)
  const desaProgressData = useMemo(() => {
    const desaGroups: { 
      [key: string]: { 
        total: number; 
        selesai: number; 
        konsinyasi: number; 
        belum: number; 
        trabasSudah: number; 
        trabasBelum: number; 
      } 
    } = {};

    records.forEach(r => {
      const d = r.DESA || 'Belum Diisi';
      if (!desaGroups[d]) {
        desaGroups[d] = { total: 0, selesai: 0, konsinyasi: 0, belum: 0, trabasSudah: 0, trabasBelum: 0 };
      }
      desaGroups[d].total += 1;
      
      // Pemberkasan progress
      if (r.PROGRES_PEMBERKASAN === 'SELESAI') {
        desaGroups[d].selesai += 1;
      } else if (r.PROGRES_PEMBERKASAN === 'KONSINYASI') {
        desaGroups[d].konsinyasi += 1;
      } else {
        desaGroups[d].belum += 1;
      }

      // TRABAS progress
      if (r.PROGRES_UPLOAD_TRABAS === 'SUDAH') {
        desaGroups[d].trabasSudah += 1;
      } else {
        desaGroups[d].trabasBelum += 1;
      }
    });

    return Object.keys(desaGroups)
      .sort((a, b) => a.localeCompare(b, 'id'))
      .map(name => {
        const g = desaGroups[name];
        return {
          name,
          total: g.total,
          selesai: g.selesai,
          konsinyasi: g.konsinyasi,
          belum: g.belum,
          trabasSudah: g.trabasSudah,
          trabasBelum: g.trabasBelum,
        };
      });
  }, [records]);

  // Chart data: Land Cover (Penutup Lahan)
  const penutupLahanChartData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    records.forEach(r => {
      const p = r.PENUTUP_LAHAN || 'LAINNYA';
      counts[p] = (counts[p] || 0) + 1;
    });

    const colors = [
      '#10B981', '#3B82F6', '#F59E0B', '#EF4444', 
      '#8B5CF6', '#EC4899', '#6B7280', '#14B8A6', '#F43F5E'
    ];

    return Object.keys(counts).map((name, index) => ({
      name,
      value: counts[name],
      color: colors[index % colors.length]
    }));
  }, [records]);

  // Chart data: Document status
  const documentStats = useMemo(() => {
    const total = records.length || 1; // avoid division by zero
    return [
      { name: 'KTP', Persentase: Math.round((stats.docsKtp / total) * 100) },
      { name: 'KK', Persentase: Math.round((stats.docsKk / total) * 100) },
      { name: 'Alas Hak', Persentase: Math.round((stats.docsAlas / total) * 100) },
      { name: 'Peralihan Hak', Persentase: Math.round((stats.docsPeralihan / total) * 100) },
    ];
  }, [records, stats]);

  return (
    <div className="space-y-8" id="sip_dashboard">
      {/* Upper Welcome and Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">Ringkasan Data Pertanahan Desa</h1>
          <p className="text-slate-300 text-sm mt-1">
            Pantau progres berkas pertanahan, luas bidang tanah, bangunan, tanaman, dan hasil verifikasi QC.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-center">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-500/20 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Terhubung Google Sheets
          </span>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
          <div className="p-3.5 rounded-xl bg-white/5 text-slate-300 border border-white/10 shadow-inner">
            <Map className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Bidang</p>
            <h3 className="text-2xl font-bold text-white font-sans mt-0.5">{stats.total}</h3>
            <p className="text-slate-400 text-xs mt-0.5">Lahan terdaftar</p>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
          <div className="p-3.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-inner">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Luas Bidang</p>
            <h3 className="text-2xl font-bold text-white font-sans mt-0.5">
              {stats.totalLuas.toLocaleString('id-ID')} <span className="text-sm font-normal text-slate-400">m²</span>
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">Total luas keseluruhan</p>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
          <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Lolos QC (Approved)</p>
            <h3 className="text-2xl font-bold text-white font-sans mt-0.5">{stats.approved}</h3>
            <p className="text-emerald-400 text-xs font-semibold mt-0.5">
              {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}% Terverifikasi
            </p>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
          <div className="p-3.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Menunggu QC (Pending)</p>
            <h3 className="text-2xl font-bold text-white font-sans mt-0.5">{stats.pending}</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              {stats.rejected} Bidang ditolak (Reject)
            </p>
          </div>
        </div>
      </div>

      {/* SECTION A: PROGRES PEMBERKASAN LAPANGAN */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FolderCheck className="w-5 h-5 text-emerald-400" />
              Seksi Pemberkasan Lapangan & Administrasi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Ringkasan status pengumpulan, verifikasi berkas klaim, dan pendaftaran konsinyasi.</p>
          </div>
          <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-semibold">
            Status: Aktif Lapangan
          </span>
        </div>

        {/* 3-Column Stats Card for Pemberkasan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Selesai Card */}
          <div className="glass-card p-5 rounded-2xl shadow-lg border border-white/5 flex flex-col justify-between hover:border-emerald-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Berkas Selesai</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.pemberkasanSelesai / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-emerald-400 font-medium">Selesai Berkas</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.pemberkasanSelesai} dari {stats.total} bidang tanah
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.pemberkasanSelesai / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
          </div>

          {/* Konsinyasi Card */}
          <div className="glass-card p-5 rounded-2xl shadow-lg border border-white/5 flex flex-col justify-between hover:border-amber-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Berkas Konsinyasi</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clock className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.pemberkasanKonsinyasi / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-amber-400 font-medium">Melalui Konsinyasi</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.pemberkasanKonsinyasi} dari {stats.total} bidang tanah
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.pemberkasanKonsinyasi / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
          </div>

          {/* Belum Selesai Card */}
          <div className="glass-card p-5 rounded-2xl shadow-lg border border-white/5 flex flex-col justify-between hover:border-rose-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Belum Selesai</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.pemberkasanBelumSelesai / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-rose-400 font-medium">Belum Diproses</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.pemberkasanBelumSelesai} dari {stats.total} bidang tanah
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-rose-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.pemberkasanBelumSelesai / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION B: PROGRES UPLOAD TRABAS */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <CloudUpload className="w-5 h-5 text-blue-400" />
              Seksi Upload TRABAS & Sistem Informasi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Status digitalisasi dan publikasi berkas ke portal aplikasi sistem TRABAS pusat.</p>
          </div>
          <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full font-semibold">
            Status: Integrasi Online
          </span>
        </div>

        {/* 2-Column Stats Card for TRABAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Sudah Upload Card */}
          <div className="glass-card p-5 rounded-2xl shadow-lg border border-white/5 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Sudah Upload TRABAS</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <CloudUpload className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.trabasSudah / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-blue-400 font-medium">Selesai Integrasi</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.trabasSudah} dari {stats.total} bidang tanah (SUDAH)
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.trabasSudah / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
          </div>

          {/* Belum Upload Card */}
          <div className="glass-card p-5 rounded-2xl shadow-lg border border-white/5 flex flex-col justify-between hover:border-slate-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Belum Upload TRABAS</span>
              <span className="p-2 rounded-xl bg-slate-500/10 text-slate-400 border border-slate-500/20">
                <AlertCircle className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.trabasBelum / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-slate-400 font-medium">Tersisa Antrean</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.trabasBelum} dari {stats.total} bidang tanah (BELUM)
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-slate-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.total > 0 ? Math.round((stats.trabasBelum / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION C: DETAIL PROGRES KOMPARASI PER DESA (PEMBERKASAN VS TRABAS) */}
      <div className="glass-card p-6 rounded-2xl shadow-lg space-y-5">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-200 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            Grafik Komparasi Capaian per Desa (Pemberkasan vs Upload TRABAS)
          </h2>
          <p className="text-[11px] text-slate-400">
            Perbandingan langsung dua indikator utama per desa: Pemberkasan (atas) dan Upload TRABAS (bawah) dengan lebar grafik 100% untuk mempermudah identifikasi wilayah minim progress.
          </p>
        </div>

        {desaProgressData.length === 0 ? (
          <div className="h-32 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
            Belum ada data desa untuk ditampilkan
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-4">
            {desaProgressData.map(desa => {
              const total = desa.total;
              
              const selesaiPct = total > 0 ? (desa.selesai / total) * 100 : 0;
              const konsinyasiPct = total > 0 ? (desa.konsinyasi / total) * 100 : 0;
              const belumPct = total > 0 ? (desa.belum / total) * 100 : 0;
              
              const sudahPct = total > 0 ? (desa.trabasSudah / total) * 100 : 0;
              const belumTrabasPct = total > 0 ? (desa.trabasBelum / total) * 100 : 0;

              return (
                <div key={desa.name} className="p-3.5 bg-slate-900/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors duration-200 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  {/* Left Column: Village Info */}
                  <div className="md:w-36 flex-shrink-0 flex flex-row md:flex-col items-baseline md:items-start justify-between md:justify-center border-b md:border-b-0 md:border-r border-white/5 pb-2 md:pb-0 md:pr-4">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate max-w-[140px] md:max-w-none" title={desa.name}>
                      <MapPin className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      {desa.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium font-mono whitespace-nowrap mt-0.5">
                      {total} Bidang
                    </span>
                  </div>

                  {/* Right Column: Two bars stacked */}
                  <div className="flex-1 space-y-2.5">
                    {/* Bar 1: Pemberkasan */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Pemberkasan
                        </span>
                        <div className="flex gap-2 font-mono text-[9px] text-slate-400">
                          <span>Sl: <strong className="text-emerald-400 font-bold">{desa.selesai}</strong></span>
                          <span>Ks: <strong className="text-amber-400 font-bold">{desa.konsinyasi}</strong></span>
                          <span>Bl: <strong className="text-rose-400 font-bold">{desa.belum}</strong></span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden border border-white/5 shadow-inner">
                        {desa.selesai > 0 && (
                          <div 
                            style={{ width: `${selesaiPct}%` }} 
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.15)]"
                            title={`Selesai: ${desa.selesai} (${Math.round(selesaiPct)}%)`}
                          />
                        )}
                        {desa.konsinyasi > 0 && (
                          <div 
                            style={{ width: `${konsinyasiPct}%` }} 
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.15)]"
                            title={`Konsinyasi: ${desa.konsinyasi} (${Math.round(konsinyasiPct)}%)`}
                          />
                        )}
                        {desa.belum > 0 && (
                          <div 
                            style={{ width: `${belumPct}%` }} 
                            className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-500"
                            title={`Belum Selesai: ${desa.belum} (${Math.round(belumPct)}%)`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Bar 2: TRABAS */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          TRABAS
                        </span>
                        <div className="flex gap-2 font-mono text-[9px] text-slate-400">
                          <span>Sd: <strong className="text-blue-400 font-bold">{desa.trabasSudah}</strong></span>
                          <span>Bl: <strong className="text-slate-400 font-bold">{desa.trabasBelum}</strong></span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden border border-white/5 shadow-inner">
                        {desa.trabasSudah > 0 && (
                          <div 
                            style={{ width: `${sudahPct}%` }} 
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.15)]"
                            title={`Sudah Upload: ${desa.trabasSudah} (${Math.round(sudahPct)}%)`}
                          />
                        )}
                        {desa.trabasBelum > 0 && (
                          <div 
                            style={{ width: `${belumTrabasPct}%` }} 
                            className="h-full bg-slate-600 transition-all duration-500"
                            title={`Belum Upload: ${desa.trabasBelum} (${Math.round(belumTrabasPct)}%)`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION D: METRIK PROYEK FISIK & TANAMAN */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Map className="w-5 h-5 text-indigo-400" />
          Metrik Penghitungan Fisik & Tanaman Lapangan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="glass-card p-5 rounded-2xl flex items-center justify-between shadow-lg hover:border-white/15 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
                <Home className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Total Bangunan Terdata</p>
                <p className="text-xs text-slate-400">Jumlah bangunan berdiri di atas lahan proyek</p>
              </div>
            </div>
            <span className="text-xl font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 px-3.5 py-1 rounded-xl shadow-inner font-mono">
              {stats.totalBuildings} <span className="text-xs font-normal">Unit</span>
            </span>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center justify-between shadow-lg hover:border-white/15 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                <Sprout className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Total Pohon & Tanaman</p>
                <p className="text-xs text-slate-400">Jumlah tanaman produktif/belum menghasilkan</p>
              </div>
            </div>
            <span className="text-xl font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-3.5 py-1 rounded-xl shadow-inner font-mono">
              {stats.totalPlantsCount} <span className="text-xs font-normal">Pohon</span>
            </span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Village Lahan Distribution Chart */}
        <div className="glass-card p-6 rounded-2xl shadow-lg space-y-4">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Map className="w-5 h-5 text-indigo-400" />
            Distribusi Jumlah Bidang & Luas per Desa
          </h2>
          {desaChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
              Belum ada data desa untuk ditampilkan
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={desaChartData}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="left" stroke="#818cf8" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="Jumlah" fill="#818cf8" radius={[4, 4, 0, 0]} name="Jumlah Bidang" />
                  <Bar yAxisId="right" dataKey="Luas (m²)" fill="#34d399" radius={[4, 4, 0, 0]} name="Luas Total (m²)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Land Cover Classification */}
        <div className="glass-card p-6 rounded-2xl shadow-lg space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Sprout className="w-5 h-5 text-emerald-400" />
              Klasifikasi Penutup Lahan
            </h2>
            <p className="text-xs text-slate-400">Pembagian tipe pemanfaatan penutup lahan terdaftar.</p>
          </div>
          
          {penutupLahanChartData.length === 0 ? (
            <div className="h-60 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
              Belum ada klasifikasi penutup lahan
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
              <div className="w-full sm:w-1/2 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={penutupLahanChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {penutupLahanChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full sm:w-1/2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {penutupLahanChartData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: item.color }}
                    ></span>
                    <span className="text-slate-300 truncate font-medium">
                      {item.name} ({item.value})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document Completion Progress */}
      <div className="glass-card p-6 rounded-2xl shadow-lg space-y-5">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              Kelengkapan Dokumen Lampiran (Google Drive)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Persentase berkas digital yang sudah terunggah.</p>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="h-28 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
            Belum ada data berkas yang terunggah
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {documentStats.map((item, idx) => (
              <div key={idx} className="bg-white/5 p-4 rounded-xl border border-white/5 flex flex-col justify-between shadow-inner">
                <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">{item.name}</span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-white font-sans">{item.Persentase}%</span>
                  <span className="text-[10px] text-slate-400 font-medium">terisi</span>
                </div>
                {/* Visual bar */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden border border-white/5">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500 glow-indigo"
                    style={{ width: `${item.Persentase}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
