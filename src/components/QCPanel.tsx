import React, { useState, useMemo, useEffect } from 'react';
import { 
  CheckCircle, XCircle, AlertCircle, FileText, ExternalLink, 
  Search, ShieldCheck, UserCheck, Eye, Calendar, MapPin, 
  Home, Sprout, Landmark, Save, X, Info, Loader2, Check
} from 'lucide-react';
import { type LandRecord } from '../types';

interface QCPanelProps {
  records: LandRecord[];
  adminEmail: string;
  onSaveQC: (record: LandRecord) => Promise<void>;
}

export default function QCPanel({ records, adminEmail, onSaveQC }: QCPanelProps) {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<LandRecord | null>(null);

  // Search state for cascading dropdowns
  const [searchMethod, setSearchMethod] = useState<'dropdown' | 'manual'>('dropdown');
  const [selectedDesa, setSelectedDesa] = useState('');
  const [selectedSpan, setSelectedSpan] = useState('');
  const [selectedNobid, setSelectedNobid] = useState('');

  // Reset child selectors when parent changes
  useEffect(() => {
    setSelectedSpan('');
    setSelectedNobid('');
  }, [selectedDesa]);

  useEffect(() => {
    setSelectedNobid('');
  }, [selectedSpan]);

  // Compute unique values for dropdowns
  const uniqueDesas = useMemo(() => {
    const desas = records.map(r => r.DESA?.trim()).filter(Boolean);
    return Array.from(new Set(desas)).sort();
  }, [records]);

  const uniqueSpansForDesa = useMemo(() => {
    if (!selectedDesa) return [];
    const spans = records
      .filter(r => r.DESA?.trim() === selectedDesa)
      .map(r => r.SPAN?.trim())
      .filter(Boolean);
    return Array.from(new Set(spans)).sort();
  }, [records, selectedDesa]);

  const uniqueNobidsForDesaAndSpan = useMemo(() => {
    if (!selectedDesa || !selectedSpan) return [];
    const nobids = records
      .filter(r => r.DESA?.trim() === selectedDesa && r.SPAN?.trim() === selectedSpan)
      .map(r => r.NOBID?.trim())
      .filter(Boolean);
    return Array.from(new Set(nobids)).sort();
  }, [records, selectedDesa, selectedSpan]);

  // QC Form local states for the modal
  const [qcStatus, setQcStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [qcNotes, setQcNotes] = useState('');
  const [kekuranganBerkas, setKekuranganBerkas] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 1. Check QC Status Filter
      const matchesStatus = filterStatus === 'ALL' 
        ? true 
        : (filterStatus === 'PENDING' ? (!r.QC_STATUS || r.QC_STATUS === 'PENDING') : r.QC_STATUS === filterStatus);
      
      if (!matchesStatus) return false;

      // 2. Check Search Method (Manual vs Dropdown)
      if (searchMethod === 'manual') {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return r.CODE.toLowerCase().includes(query) || 
               r.NAMA.toLowerCase().includes(query) ||
               (r.NIK && r.NIK.includes(query));
      } else {
        // Dropdown filtering
        if (selectedDesa && r.DESA?.trim() !== selectedDesa) return false;
        if (selectedSpan && r.SPAN?.trim() !== selectedSpan) return false;
        if (selectedNobid && r.NOBID?.trim() !== selectedNobid) return false;
        return true;
      }
    });
  }, [records, filterStatus, searchMethod, searchQuery, selectedDesa, selectedSpan, selectedNobid]);

  // Open inspection details modal
  const handleInspect = (record: LandRecord) => {
    setSelectedRecord(record);
    setQcStatus(record.QC_STATUS === 'REJECTED' ? 'REJECTED' : 'APPROVED');
    setQcNotes(record.QC_NOTES || '');
    setKekuranganBerkas(record.KEKURANGAN_BERKAS || '');
    setActionMessage(null);
  };

  // Close modal
  const handleCloseModal = () => {
    setSelectedRecord(null);
  };

  // Submit QC assessment
  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setIsSaving(true);
    setActionMessage(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const updatedRecord: LandRecord = {
        ...selectedRecord,
        QC_STATUS: qcStatus,
        QC_NOTES: qcNotes,
        KEKURANGAN_BERKAS: kekuranganBerkas,
        QC_BY: adminEmail || 'Admin',
        QC_DATE: today
      };

      await onSaveQC(updatedRecord);
      
      setActionMessage('Verifikasi QC berhasil disimpan ke Google Sheets!');
      
      // Update selected record view in-place
      setSelectedRecord(updatedRecord);
      
      setTimeout(() => {
        handleCloseModal();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setActionMessage(`Gagal menyimpan: ${err.message || 'Error tidak diketahui'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6" id="sip_qc_panel">
      {/* Header and filters */}
      <div className="glass-card p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 font-sans">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Verifikasi & Quality Control (QC)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Menu verifikasi data oleh Admin untuk memeriksa kelengkapan isian serta keabsahan dokumen sebelum dipublikasikan.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 font-bold shrink-0">Filter Status:</span>
          <div className="inline-flex rounded-xl bg-slate-900/50 border border-white/5 p-1 text-xs font-semibold">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterStatus === s 
                    ? 'bg-white/10 text-indigo-300 shadow-inner border border-white/5' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'Semua' : s === 'PENDING' ? 'Pending' : s === 'APPROVED' ? 'Approved' : 'Rejected'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search and Table Grid */}
      <div className="glass-card rounded-2xl shadow-xl overflow-hidden">
        {/* Search Header */}
        <div className="p-5 border-b border-white/10 bg-white/5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Method Toggle */}
            <div className="flex gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/5 self-start">
              <button
                type="button"
                onClick={() => setSearchMethod('dropdown')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  searchMethod === 'dropdown'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Dropdown Bertingkat
              </button>
              <button
                type="button"
                onClick={() => setSearchMethod('manual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  searchMethod === 'manual'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Pencarian Manual
              </button>
            </div>
            
            <span className="text-xs text-slate-400 font-semibold italic">
              Menampilkan {filteredRecords.length} dari {records.length} total data
            </span>
          </div>

          {searchMethod === 'dropdown' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 items-end animate-fadeIn">
              {/* Select DESA */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider block">1. Desa</span>
                <select
                  value={selectedDesa}
                  onChange={(e) => setSelectedDesa(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="">-- Pilih Desa --</option>
                  {uniqueDesas.map(desa => (
                    <option key={desa} value={desa}>{desa}</option>
                  ))}
                </select>
              </div>

              {/* Select SPAN */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider block">2. Span</span>
                <select
                  value={selectedSpan}
                  onChange={(e) => setSelectedSpan(e.target.value)}
                  disabled={!selectedDesa}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <option value="">{selectedDesa ? '-- Pilih Span --' : '-- Pilih Desa Dulu --'}</option>
                  {uniqueSpansForDesa.map(span => (
                    <option key={span} value={span}>{span}</option>
                  ))}
                </select>
              </div>

              {/* Select NOBID */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider block">3. No. Bidang</span>
                <select
                  value={selectedNobid}
                  onChange={(e) => setSelectedNobid(e.target.value)}
                  disabled={!selectedSpan}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <option value="">{selectedSpan ? '-- Pilih No. Bidang --' : '-- Pilih Span Dulu --'}</option>
                  {uniqueNobidsForDesaAndSpan.map(nobid => (
                    <option key={nobid} value={nobid}>{nobid}</option>
                  ))}
                </select>
              </div>

              {/* Clear filters button */}
              {(selectedDesa || selectedSpan || selectedNobid) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDesa('');
                    setSelectedSpan('');
                    setSelectedNobid('');
                  }}
                  className="h-9 px-4 bg-white/5 hover:bg-rose-500/10 hover:text-rose-300 text-xs font-bold text-slate-400 rounded-xl border border-white/5 transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            <div className="relative max-w-sm w-full animate-fadeIn">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari CODE, NAMA, atau NIK..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white"
              />
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-slate-300 text-[10px] font-extrabold uppercase tracking-wider">
                <th className="px-6 py-4">CODE Pengenal</th>
                <th className="px-6 py-4">Nama Pemilik</th>
                <th className="px-6 py-4">Desa / Bidang</th>
                <th className="px-6 py-4">Saksi & Tim</th>
                <th className="px-6 py-4">Lampiran</th>
                <th className="px-6 py-4">Status QC</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs text-slate-300">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic bg-white/10">
                    Tidak ada data lahan yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const docCount = [r.LINK_KTP, r.LINK_KK, r.LINK_ALAS_HAK, r.LINK_PERALIHAN_HAK].filter(Boolean).length;
                  return (
                    <tr key={r.ID_UNIK} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-indigo-300">{r.CODE}</td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-white">{r.NAMA}</p>
                        <p className="text-[10px] text-slate-400 font-mono">NIK: {r.NIK}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-200">{r.DESA} · SPAN {r.SPAN}</p>
                        <p className="text-[10px] text-slate-400">Luas: {r.LUAS} m²</p>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        <p className="truncate max-w-[150px]">Kades: {r.NAMA_KADES || '-'}</p>
                        <p className="truncate max-w-[150px] text-[10px] text-slate-400">Tim: {r.nama_tim_1 || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          docCount === 4 
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        }`}>
                          {docCount}/4 Berkas PDF
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {r.QC_STATUS === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            Approved
                          </span>
                        ) : r.QC_STATUS === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 text-rose-300 text-[10px] font-bold rounded-full border border-rose-500/20">
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 text-slate-400 text-[10px] font-bold rounded-full border border-white/5">
                            <AlertCircle className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
                            Pending QC
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleInspect(r)}
                          className="p-1.5 hover:bg-indigo-500/15 text-indigo-300 hover:text-indigo-200 rounded-lg border border-white/5 hover:border-indigo-500/30 transition-all inline-flex items-center gap-1 font-bold cursor-pointer"
                          title="Periksa data Lahan"
                        >
                          <Eye className="w-4 h-4" />
                          Periksa
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSPECTION DETAILED MODAL / POPUP */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
          <div className="glass-card rounded-3xl border border-white/10 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slideUp">
            {/* Modal Header */}
            <div className="bg-slate-900/60 text-white p-6 flex justify-between items-center shrink-0 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-md font-extrabold text-white">Inspeksi Lahan & Keputusan QC</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">CODE: {selectedRecord.CODE}</p>
                </div>
              </div>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Scroll Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Status Message */}
              {actionMessage && (
                <div className="p-4 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-semibold">
                  {actionMessage}
                </div>
              )}

              {/* Data Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Lahan & Owner (General) */}
                <div className="p-4 rounded-2xl border border-white/5 space-y-3 bg-white/5 shadow-inner">
                  <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-white/10 pb-2">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    Detail Bidang & Identitas Pemilik
                  </h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <p className="text-slate-400 font-medium">Nama Pemilik:</p>
                    <p className="font-bold text-white text-right">{selectedRecord.NAMA || '-'}</p>

                    <p className="text-slate-400 font-medium">NIK Lahan:</p>
                    <p className="font-mono text-slate-300 text-right">{selectedRecord.NIK || '-'}</p>

                    <p className="text-slate-400 font-medium">TTL / Kelamin:</p>
                    <p className="text-slate-300 text-right">
                      {selectedRecord.TTL || '-'} / {selectedRecord.JENIS_KELAMIN || '-'}
                    </p>

                    <p className="text-slate-400 font-medium">Pekerjaan:</p>
                    <p className="text-slate-300 text-right">{selectedRecord.PEKERJAAN || '-'}</p>

                    <p className="text-slate-400 font-medium">Desa / SPAN / No. Bid:</p>
                    <p className="text-slate-300 text-right">
                      {selectedRecord.DESA} / {selectedRecord.SPAN} / {selectedRecord.NOBID}
                    </p>

                    <p className="text-slate-400 font-medium">Luas Terdaftar:</p>
                    <p className="font-bold text-indigo-300 text-right">{selectedRecord.LUAS} m²</p>

                    <p className="text-slate-400 font-medium">Penutup Lahan:</p>
                    <p className="text-slate-300 text-right">{selectedRecord.PENUTUP_LAHAN || '-'}</p>

                    <p className="text-slate-400 font-medium">Status Penutup / Milik:</p>
                    <p className="text-slate-300 text-right">
                      {selectedRecord.STATUS_PENUTUP_LAHAN} / {selectedRecord.STATUS_KEPEMILIKAN}
                    </p>
                  </div>
                  
                  {/* Address Box */}
                  <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 space-y-0.5">
                    <span className="font-bold text-slate-300 block">Alamat KTP Pemilik:</span>
                    <p>{selectedRecord.ALAMAT_KTP_BARIS_1 || '-'}</p>
                    <p>{selectedRecord.ALAMAT_KTP_BARIS_2 || '-'}</p>
                    <p>{selectedRecord.ALAMAT_KTP_BARIS_3 || '-'}</p>
                    <p>{selectedRecord.ALAMAT_KTP_BARIS_4 || '-'}</p>
                  </div>
                </div>

                {/* 2. Alas Hak & Bangunan */}
                <div className="p-4 rounded-2xl border border-white/5 space-y-3 bg-white/5 flex flex-col justify-between shadow-inner">
                  <div className="space-y-3">
                    <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-white/10 pb-2">
                      <Home className="w-4 h-4 text-indigo-400" />
                      Alas Hak & Data Bangunan
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <p className="text-slate-400 font-medium">Jenis Alas Hak:</p>
                      <p className="font-semibold text-white text-right">{selectedRecord.JENIS_ALAS_HAK || '-'}</p>

                      <p className="text-slate-400 font-medium">Nomor Hak / Nama:</p>
                      <p className="text-slate-300 text-right">{selectedRecord.NOMER_HAK || '-'} / {selectedRecord.NAMA_ALAS_HAK || '-'}</p>

                      <p className="text-slate-400 font-medium">Luas Alas Hak:</p>
                      <p className="text-slate-300 text-right">{selectedRecord.LUAS_YANG_ADA_PADA_ALAS_HAK || '-'} m²</p>

                      <p className="text-slate-400 font-medium">Jenis Peralihan:</p>
                      <p className="text-indigo-300 font-bold text-right text-[11px] bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/10 inline-block align-middle self-end">{selectedRecord.JENIS_PERALIHAN_HAK || 'SESUAI'}</p>
                    </div>

                    {/* Populated Buildings */}
                    <div className="pt-2 border-t border-white/10">
                      <span className="font-bold text-slate-300 text-[11px] block mb-1">Bangunan Terdata:</span>
                      {selectedRecord.buildings?.filter(b => b.luas || b.bentuk || b.jenis).length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">Tidak ada bangunan berdiri di atas lahan ini</p>
                      ) : (
                        <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1">
                          {selectedRecord.buildings?.map((b, idx) => {
                            if (!b.luas && !b.bentuk && !b.jenis) return null;
                            return (
                              <div key={idx} className="bg-slate-900 px-2 py-1.5 rounded-lg border border-white/5 text-[10px] flex justify-between text-slate-300">
                                <span className="font-bold text-slate-400">Bangunan #{idx + 1} ({b.jenis || 'Tanpa Jenis'})</span>
                                <span className="text-slate-400 font-mono">{b.bentuk || '-'} · {b.luas || '0'} m²</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Plants List */}
                <div className="p-4 rounded-2xl border border-white/5 space-y-3 bg-white/5 md:col-span-2 shadow-inner">
                  <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-white/10 pb-2">
                    <Sprout className="w-4 h-4 text-indigo-400" />
                    Pohon & Tanaman Produktif Terdata
                  </h4>
                  {selectedRecord.plants?.filter(p => p.jenis).length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2 text-center">Tidak ada tanaman terdata di atas lahan ini</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedRecord.plants?.map((p, idx) => {
                        if (!p.jenis) return null;
                        const sm = parseInt(p.sudah_menghasilkan) || 0;
                        const bm = parseInt(p.belum_menghasilkan) || 0;
                        const total = sm + bm;
                        return (
                          <div key={idx} className="bg-slate-900 p-2.5 rounded-xl border border-white/5 text-[11px] space-y-1.5 text-slate-300">
                            <div className="flex justify-between items-center border-b border-white/5 pb-1">
                              <span className="font-bold text-white truncate">{p.jenis}</span>
                              <span className="font-extrabold text-indigo-300 font-mono">{total} Pohon</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
                              <p>Mghasilkan: <strong className="text-white">{sm}</strong></p>
                              <p>Blm Hasil: <strong className="text-white">{bm}</strong></p>
                              <p className="col-span-2 text-[9px] text-slate-500">
                                Ukuran: K({p.kecil || 0}) S({p.sedang || 0}) B({p.besar || 0})
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 4. Documents & Administrative */}
                <div className="p-4 rounded-2xl border border-white/5 space-y-3 bg-white/5 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-inner">
                  <div>
                    <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-white/10 pb-2">
                      <Landmark className="w-4 h-4 text-indigo-400" />
                      Administrasi & Progress
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-1.5 text-slate-300">
                      <p className="text-slate-400 font-medium">Kabupaten / Kec:</p>
                      <p className="text-slate-200 font-medium text-right">{selectedRecord.KABUPATEN} / {selectedRecord.KECAMATAN}</p>

                      <p className="text-slate-400 font-medium">Nama Kades / Status:</p>
                      <p className="text-slate-200 text-right">{selectedRecord.NAMA_KADES || '-'} ({selectedRecord.STATUS_KEPALA || '-'})</p>

                      <p className="text-slate-400 font-medium">Saksi 1 / Saksi 2:</p>
                      <p className="text-slate-300 text-right">{selectedRecord.NAMA_SAKSI_1 || '-'} / {selectedRecord.NAMA_SAKSI_2 || '-'}</p>

                      <p className="text-slate-400 font-medium">Konfirmasi BPN / Trabas:</p>
                      <p className="text-slate-300 text-right">{selectedRecord.KONFIRMASI_BPN} / {selectedRecord.PROGRES_UPLOAD_TRABAS}</p>

                      <p className="text-slate-400 font-medium">Pemberkasan / Kurang:</p>
                      <p className="text-slate-200 text-right text-rose-400 font-semibold">{selectedRecord.PROGRES_PEMBERKASAN} (Kurang: {selectedRecord.KEKURANGAN_BERKAS || '-'})</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-white/10 pb-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      Tinjau Dokumen Drive
                    </h4>
                    <div className="space-y-2 pt-2.5 max-h-[250px] overflow-y-auto pr-1 scrollbar-thin">
                      {[
                        { label: 'Bukti KTP', link: selectedRecord.LINK_KTP },
                        { label: 'Kartu Keluarga (KK)', link: selectedRecord.LINK_KK },
                        { label: 'Alas Hak Lahan', link: selectedRecord.LINK_ALAS_HAK },
                        ...(selectedRecord.LINK_PERALIHAN_HAK ? [{ label: 'Peralihan (Arsip)', link: selectedRecord.LINK_PERALIHAN_HAK }] : []),
                        { label: 'Jual-Beli / AJB', link: selectedRecord.LINK_JUAL_BELI },
                        { label: 'Keterangan Waris', link: selectedRecord.LINK_KETERANGAN_WARIS },
                        { label: 'Kuasa Waris', link: selectedRecord.LINK_KUASA_WARIS },
                        { label: 'Surat Kuasa', link: selectedRecord.LINK_SURAT_KUASA },
                        { label: 'Keterangan Beda Nama', link: selectedRecord.LINK_KET_BEDA_NAMA },
                        { label: 'Akta Wakaf', link: selectedRecord.LINK_WAKAF },
                        { label: 'Klaim Tanaman', link: selectedRecord.LINK_KLAIM_TANAMAN },
                        { label: 'Klaim Bangunan', link: selectedRecord.LINK_KLAIM_BANGUNAN },
                        { label: 'Dokumen Lain', link: selectedRecord.LINK_DOKUMEN_LAIN },
                        { label: 'Dokumentasi Bidang', link: selectedRecord.LINK_DOKUMENTASI_BIDANG },
                        { label: 'Wajah Pemilik', link: selectedRecord.LINK_WAJAH_PEMILIK }
                      ].map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-slate-900 p-1.5 rounded-lg border border-white/5 text-slate-300">
                          <span className="font-semibold text-slate-300 text-[11px] truncate pr-2">{doc.label}</span>
                          {doc.link ? (
                            <a 
                              href={doc.link} 
                              target="_blank" 
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer" 
                              className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[10px] font-bold rounded-md flex items-center gap-1 shrink-0 transition-colors"
                            >
                              Buka File
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium bg-slate-950 border border-white/5 px-2 py-1 rounded-md">Belum Ada</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Assessment Footer Form */}
            <form onSubmit={handleSaveAssessment} className="bg-slate-900/40 p-6 border-t border-white/10 shrink-0">
              <h4 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-400" />
                Lembar Hasil Quality Control (QC)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Keputusan QC</label>
                  <select
                    value={qcStatus}
                    onChange={(e) => setQcStatus(e.target.value as any)}
                    className="w-full px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="APPROVED" className="bg-slate-900 text-white">Setujui (APPROVED)</option>
                    <option value="REJECTED" className="bg-slate-900 text-white">Tolak (REJECTED)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Kekurangan Berkas</label>
                  <input
                    type="text"
                    value={kekuranganBerkas}
                    onChange={(e) => setKekuranganBerkas(e.target.value)}
                    placeholder="Contoh: Kurang FC KK"
                    className="w-full px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Catatan / Alasan Penolakan</label>
                  <input
                    type="text"
                    value={qcNotes}
                    onChange={(e) => setQcNotes(e.target.value)}
                    placeholder="Masukkan alasan penolakan atau catatan..."
                    className="w-full px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className={`w-full py-2 px-4 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                    qcStatus === 'APPROVED' 
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white glow-emerald' 
                      : 'bg-rose-500 hover:bg-rose-600 text-white glow-rose'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Simpan QC
                    </>
                  )}
                </button>
              </div>

              {/* Inspector info */}
              <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-4 italic">
                <Info className="w-3.5 h-3.5" />
                <span>Memverifikasi sebagai admin: <strong>{adminEmail || 'Admin'}</strong></span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
