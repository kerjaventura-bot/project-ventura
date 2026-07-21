import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Trash2, Check, ArrowRight, ArrowLeft, Save, 
  MapPin, Landmark, Home, Sprout, ShieldAlert, Edit3, X, FileText
} from 'lucide-react';
import { type LandRecord, createEmptyRecord } from '../types';
import DocUpload from './DocUpload';

interface FormInputProps {
  records: LandRecord[];
  onSave: (record: LandRecord, isEdit: boolean) => Promise<void>;
  accessToken?: string;
  onUpdateRecord?: (updatedRecord: LandRecord) => Promise<void>;
  uploadsFolderId?: string;
  activeProjectName?: string;
}

export default function FormInput({ 
  records, 
  onSave, 
  accessToken, 
  onUpdateRecord, 
  uploadsFolderId, 
  activeProjectName 
}: FormInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEditRecord, setSelectedEditRecord] = useState<LandRecord | null>(null);
  
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

  // Find matched record
  const matchingRecord = useMemo(() => {
    if (!selectedDesa || !selectedSpan || !selectedNobid) return null;
    return records.find(r => 
      r.DESA?.trim() === selectedDesa && 
      r.SPAN?.trim() === selectedSpan && 
      r.NOBID?.trim() === selectedNobid
    ) || null;
  }, [records, selectedDesa, selectedSpan, selectedNobid]);
  
  // Form State
  const [formData, setFormData] = useState<LandRecord>(createEmptyRecord());
  const [activeTab, setActiveTab] = useState<'lahan_pemilik' | 'alas_bangunan' | 'tanaman' | 'administrasi' | 'cetak_unggah'>('lahan_pemilik');
  
  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter records based on search query for loading to edit
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return [];
    return records.filter(r => 
      r.CODE.toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.NAMA.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.NIK.includes(searchQuery)
    ).slice(0, 5); // Limit search results to 5
  }, [searchQuery, records]);

  // Handle Edit Action from search
  const handleSelectForEdit = (record: LandRecord) => {
    setSelectedEditRecord(record);
    // Deep copy record to avoid mutating parent state
    setFormData(JSON.parse(JSON.stringify(record)));
    setSearchQuery('');
    setSubmitMessage({ type: 'success', text: `Berhasil memuat data CODE: ${record.CODE} untuk diedit` });
    setTimeout(() => setSubmitMessage(null), 3000);
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setSelectedEditRecord(null);
    setFormData(createEmptyRecord());
    setErrors({});
  };

  // Generate CODE automatically from DESA/SPAN/NOBID
  useEffect(() => {
    if (!selectedEditRecord) {
      const cleanDesa = (formData.DESA || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
      const cleanSpan = (formData.SPAN || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
      const cleanNobid = (formData.NOBID || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
      
      if (cleanDesa && cleanSpan && cleanNobid) {
        const generatedCode = `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
        setFormData(prev => ({ ...prev, CODE: generatedCode }));
      } else {
        setFormData(prev => ({ ...prev, CODE: '' }));
      }
    }
  }, [formData.DESA, formData.SPAN, formData.NOBID, selectedEditRecord]);

  // Form Change Handler
  const handleChange = (field: keyof LandRecord, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  // Buildings Dynamic Management
  const [activeBuildingsCount, setActiveBuildingsCount] = useState<number>(1);

  // Sync count of active buildings with populated ones from record when editing
  useEffect(() => {
    if (formData.buildings) {
      const populatedCount = formData.buildings.filter(b => b.luas.trim() !== '' || b.bentuk.trim() !== '' || b.jenis.trim() !== '').length;
      setActiveBuildingsCount(Math.max(1, populatedCount));
    }
  }, [selectedEditRecord, formData.CODE]);

  // Building Field Change Handler (8 buildings max)
  const handleBuildingChange = (index: number, field: 'luas' | 'bentuk' | 'jenis', value: string) => {
    const updatedBuildings = [...formData.buildings];
    if (!updatedBuildings[index]) {
      updatedBuildings[index] = { luas: '', bentuk: '', jenis: '' };
    }
    updatedBuildings[index][field] = value;
    setFormData(prev => ({ ...prev, buildings: updatedBuildings }));
  };

  const removeBuildingAt = (index: number) => {
    const updatedBuildings = [...formData.buildings];
    // Reset fields in the 8 slots
    updatedBuildings[index] = { luas: '', bentuk: '', jenis: '' };
    setFormData(prev => ({ ...prev, buildings: updatedBuildings }));
    if (activeBuildingsCount > 1) {
      setActiveBuildingsCount(prev => prev - 1);
    }
  };

  // Plants Dynamic Management
  // Filter active plants (non-empty jenis) for UI display and input editing.
  // We'll map them back to the 30 elements of `formData.plants` on save.
  const [activePlantsCount, setActivePlantsCount] = useState<number>(1);

  // Sync count of active plants with populated ones from record when editing
  useEffect(() => {
    if (formData.plants) {
      const populatedCount = formData.plants.filter(p => p.jenis.trim() !== '').length;
      setActivePlantsCount(Math.max(1, populatedCount));
    }
  }, [selectedEditRecord, formData.CODE]);

  const handlePlantChange = (index: number, field: 'jenis' | 'sudah_menghasilkan' | 'belum_menghasilkan' | 'kecil' | 'sedang' | 'besar', value: string) => {
    const updatedPlants = [...formData.plants];
    if (!updatedPlants[index]) {
      updatedPlants[index] = { jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' };
    }
    updatedPlants[index][field] = value;
    setFormData(prev => ({ ...prev, plants: updatedPlants }));
  };

  const removePlantAt = (index: number) => {
    const updatedPlants = [...formData.plants];
    // Reset fields in the 30 slots
    updatedPlants[index] = { jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' };
    setFormData(prev => ({ ...prev, plants: updatedPlants }));
    if (activePlantsCount > 1) {
      setActivePlantsCount(prev => prev - 1);
    }
  };

  // Form Validation
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // 1. Check Identification Fields
    if (!formData.DESA.trim()) newErrors.DESA = 'Desa wajib diisi';
    if (!formData.SPAN.trim()) newErrors.SPAN = 'Span wajib diisi';
    if (!formData.NOBID.trim()) newErrors.NOBID = 'Nomor Bidang wajib diisi';
    if (!formData.LUAS.trim()) {
      newErrors.LUAS = 'Luas wajib diisi';
    } else if (isNaN(parseFloat(formData.LUAS)) || parseFloat(formData.LUAS) <= 0) {
      newErrors.LUAS = 'Luas harus berupa angka positif';
    }

    // 2. Check Owner identity
    if (!formData.NAMA.trim()) newErrors.NAMA = 'Nama pemilik wajib diisi';
    if (formData.NIK.trim() && !/^\d{16}$/.test(formData.NIK.trim())) {
      newErrors.NIK = 'NIK harus terdiri dari 16 digit angka';
    }

    if (formData.LUAS_YANG_ADA_PADA_ALAS_HAK && isNaN(parseFloat(formData.LUAS_YANG_ADA_PADA_ALAS_HAK))) {
      newErrors.LUAS_YANG_ADA_PADA_ALAS_HAK = 'Luas alas hak harus berupa angka';
    }

    // Check buildings numbers
    formData.buildings.forEach((b, i) => {
      if (b.luas && isNaN(parseFloat(b.luas))) {
        newErrors[`building_luas_${i}`] = 'Luas bangunan harus berupa angka';
      }
    });

    // Check plants numbers
    formData.plants.forEach((p, i) => {
      if (p.jenis) {
        if (p.sudah_menghasilkan && isNaN(parseInt(p.sudah_menghasilkan))) newErrors[`plant_sm_${i}`] = 'Harus angka';
        if (p.belum_menghasilkan && isNaN(parseInt(p.belum_menghasilkan))) newErrors[`plant_bm_${i}`] = 'Harus angka';
        if (p.kecil && isNaN(parseInt(p.kecil))) newErrors[`plant_kc_${i}`] = 'Harus angka';
        if (p.sedang && isNaN(parseInt(p.sedang))) newErrors[`plant_sd_${i}`] = 'Harus angka';
        if (p.besar && isNaN(parseInt(p.besar))) newErrors[`plant_bs_${i}`] = 'Harus angka';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMessage(null);

    if (!validateForm()) {
      setSubmitMessage({ 
        type: 'error', 
        text: 'Validasi gagal. Mohon periksa isian data yang diberi tanda merah pada tab formulir.' 
      });
      // Scroll to top of form
      document.getElementById('sip_form_card')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    try {
      const isEdit = !!selectedEditRecord;
      
      // If it's a new record, let's verify if the code already exists
      if (!isEdit) {
        const codeExists = records.some(r => r.CODE === formData.CODE);
        if (codeExists) {
          throw new Error(`Data dengan CODE '${formData.CODE}' sudah terdaftar. Gunakan kolom pencarian di atas jika ingin mengedit data ini.`);
        }
      }

      await onSave(formData, isEdit);
      
      // Keep the saved record loaded so they can print/upload immediately
      const savedRecord = JSON.parse(JSON.stringify(formData));
      if (!savedRecord.ID_UNIK) {
        const found = records.find(r => r.CODE === formData.CODE);
        if (found) {
          savedRecord.ID_UNIK = found.ID_UNIK;
        } else {
          savedRecord.ID_UNIK = `TEMP_${Date.now()}`;
        }
      }

      setSubmitMessage({
        type: 'success',
        text: isEdit 
          ? `Data dengan CODE ${formData.CODE} berhasil diperbarui di Google Sheets! Anda dapat melihat hasil dan mengunggah dokumen di tab "Cetak & Unggah" di bawah.`
          : `Data baru dengan CODE ${formData.CODE} berhasil ditambahkan! Anda sekarang dapat langsung mencetak Formulir Inventarisasi atau mengunggah berkas di tab "Cetak & Unggah" di bawah.`
      });

      setSelectedEditRecord(savedRecord);
      setFormData(JSON.parse(JSON.stringify(savedRecord)));
      setActiveTab('cetak_unggah');
    } catch (err: any) {
      setSubmitMessage({
        type: 'error',
        text: err.message || 'Gagal menyimpan data ke Google Sheets.'
      });
    } finally {
      setIsSubmitting(false);
      document.getElementById('sip_form_card')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6" id="sip_form_input">
      {/* Search/Load Record to Edit section */}
      <div className="glass-card p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 className="text-md font-bold text-white tracking-tight flex items-center gap-1.5">
              <Edit3 className="w-5 h-5 text-indigo-400" />
              Edit Data Terdaftar (Search)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cari data lahan berdasarkan pilihan berjenjang atau ketik nama/CODE secara manual.
            </p>
          </div>
          {selectedEditRecord && (
            <button 
              type="button"
              onClick={handleCancelEdit}
              className="px-3.5 py-1.5 bg-rose-500/10 text-rose-300 text-xs font-semibold rounded-lg border border-rose-500/20 flex items-center gap-1.5 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              Batal Edit (Buat Baru)
            </button>
          )}
        </div>

        {/* Search Method Toggle Tabs */}
        <div className="flex gap-2 border-b border-white/5 pb-2">
          <button
            type="button"
            onClick={() => setSearchMethod('dropdown')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              searchMethod === 'dropdown'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Dropdown Bertingkat (Desa &gt; Span &gt; No Bidang)
          </button>
          <button
            type="button"
            onClick={() => setSearchMethod('manual')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              searchMethod === 'manual'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Ketik Pencarian Manual
          </button>
        </div>

        {searchMethod === 'dropdown' ? (
          <div className="space-y-4 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Select DESA */}
              <div>
                <label className="block text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider mb-1.5">
                  1. Pilih Desa
                </label>
                <select
                  value={selectedDesa}
                  onChange={(e) => setSelectedDesa(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="">-- Pilih Desa --</option>
                  {uniqueDesas.map(desa => (
                    <option key={desa} value={desa}>{desa}</option>
                  ))}
                </select>
              </div>

              {/* Select SPAN */}
              <div>
                <label className="block text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider mb-1.5">
                  2. Pilih Span
                </label>
                <select
                  value={selectedSpan}
                  onChange={(e) => setSelectedSpan(e.target.value)}
                  disabled={!selectedDesa}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <option value="">{selectedDesa ? '-- Pilih Span --' : '-- Pilih Desa Dulu --'}</option>
                  {uniqueSpansForDesa.map(span => (
                    <option key={span} value={span}>{span}</option>
                  ))}
                </select>
              </div>

              {/* Select NOBID */}
              <div>
                <label className="block text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider mb-1.5">
                  3. Pilih No. Bidang (NOBID)
                </label>
                <select
                  value={selectedNobid}
                  onChange={(e) => setSelectedNobid(e.target.value)}
                  disabled={!selectedSpan}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <option value="">{selectedSpan ? '-- Pilih No. Bidang --' : '-- Pilih Span Dulu --'}</option>
                  {uniqueNobidsForDesaAndSpan.map(nobid => (
                    <option key={nobid} value={nobid}>{nobid}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Matched Record Preview box */}
            {matchingRecord ? (
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold font-mono text-indigo-300 bg-indigo-500/20 px-2.5 py-0.5 rounded-lg border border-indigo-500/30">
                      {matchingRecord.CODE}
                    </span>
                    <span className="text-sm font-extrabold text-slate-100">{matchingRecord.NAMA}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    Desa <span className="text-slate-200 font-bold">{matchingRecord.DESA}</span> · Span <span className="text-slate-200 font-bold">{matchingRecord.SPAN}</span> · No. Bidang <span className="text-slate-200 font-bold">{matchingRecord.NOBID}</span> · NIK: <span className="text-slate-200 font-bold font-mono">{matchingRecord.NIK || '-'}</span> · Luas: <span className="text-slate-200 font-bold">{matchingRecord.LUAS} m²</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectForEdit(matchingRecord);
                    // Reset dropdown states so they are clear for next time
                    setSelectedDesa('');
                    setSelectedSpan('');
                    setSelectedNobid('');
                  }}
                  className="px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-white-keep font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-98 transition-all cursor-pointer border border-indigo-400/30 shrink-0"
                >
                  <Check className="w-4 h-4 text-emerald-300" />
                  Muat Data ke Formulir Edit
                </button>
              </div>
            ) : (
              selectedDesa && selectedSpan && selectedNobid && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-300 text-xs font-semibold animate-fadeIn">
                  ⚠️ Data lahan tidak ditemukan dengan kombinasi terpilih. Silakan periksa kembali desa, span, dan nomor bidang Anda.
                </div>
              )
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-fadeIn">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik CODE, NAMA, atau NIK..."
                className="w-full pl-11 pr-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all text-white placeholder-slate-400"
              />
            </div>

            {filteredRecords.length > 0 && (
              <div className="bg-slate-900/40 rounded-xl border border-white/10 p-2 divide-y divide-white/5 animate-fadeIn">
                {filteredRecords.map((rec, idx) => (
                  <button
                    key={`${rec.ID_UNIK || rec.CODE || 'row'}-${idx}`}
                    type="button"
                    onClick={() => handleSelectForEdit(rec)}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-500/10 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-white cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-bold font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                        {rec.CODE}
                      </span>
                      <span className="ml-3 text-sm font-semibold text-slate-200">{rec.NAMA}</span>
                      <span className="ml-3 text-xs text-slate-400 font-mono">NIK: {rec.NIK}</span>
                    </div>
                    <span className="text-xs text-slate-300 italic shrink-0">
                      Desa {rec.DESA} · Luas {rec.LUAS} m²
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Form Entry Card */}
      <div className="glass-card rounded-2xl shadow-xl overflow-hidden" id="sip_form_card">
        {/* Banner Indicator for Mode */}
        {selectedEditRecord ? (
          <div className="bg-indigo-600/40 text-white px-6 py-4 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-white/10 text-white">
                <Edit3 className="w-4 h-4" />
              </span>
              <div>
                <p className="text-[10px] font-medium text-indigo-200 uppercase tracking-wider">Mode Edit Data</p>
                <h3 className="text-sm font-bold mt-0.5">Mengedit Data Lahan: <span className="font-mono text-amber-300">{selectedEditRecord.CODE}</span></h3>
              </div>
            </div>
            <span className="text-xs font-mono bg-white/10 px-2.5 py-1 rounded-md border border-white/10">
              Baris spreadsheet akan otomatis diperbarui
            </span>
          </div>
        ) : (
          <div className="bg-slate-900/60 text-white px-6 py-4 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-white/10 text-white">
                <Plus className="w-4 h-4" />
              </span>
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Mode Input Data Baru</p>
                <h3 className="text-sm font-bold mt-0.5 font-sans">Formulir Lahan Baru</h3>
              </div>
            </div>
            <span className="text-xs font-mono bg-white/10 px-2.5 py-1 rounded-md border border-white/10">
              Menambahkan baris baru ke Google Sheets
            </span>
          </div>
        )}

        {/* Message Banner */}
        {submitMessage && (
          <div className={`p-4 border-b text-sm font-medium flex items-center gap-2.5 ${
            submitMessage.type === 'success' 
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' 
              : 'bg-rose-500/15 text-rose-300 border-rose-500/20'
          }`}>
            <ShieldAlert className={`w-5 h-5 shrink-0 ${submitMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`} />
            <p>{submitMessage.text}</p>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Automatically Generated CODE View */}
          {activeTab !== 'cetak_unggah' && (
            <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kode Pengenal (CODE)</span>
                <p className="text-xs text-slate-400 mt-0.5">Dihasilkan otomatis dari gabungan DESA, SPAN, dan NOBID.</p>
              </div>
              <span className="text-base font-bold font-mono text-white bg-slate-900 border border-white/10 px-4 py-2 rounded-xl">
                {formData.CODE || 'BELUM LENGKAP (DESA/SPAN/NOBID)'}
              </span>
            </div>
          )}

          {/* Form Navigation Tabs */}
          <div className="flex border-b border-white/10 overflow-x-auto scrollbar-none gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('lahan_pemilik')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'lahan_pemilik' 
                  ? 'border-indigo-400 text-indigo-300 font-extrabold' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapPin className="w-4 h-4" />
              Lahan & Pemilik
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('alas_bangunan')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'alas_bangunan' 
                  ? 'border-indigo-400 text-indigo-300 font-extrabold' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-4 h-4" />
              Alas Hak & Bangunan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tanaman')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'tanaman' 
                  ? 'border-indigo-400 text-indigo-300 font-extrabold' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sprout className="w-4 h-4" />
              Tanaman Lahan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('administrasi')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'administrasi' 
                  ? 'border-indigo-400 text-indigo-300 font-extrabold' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Landmark className="w-4 h-4" />
              Administrasi & Status
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cetak_unggah')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'cetak_unggah' 
                  ? 'border-indigo-400 text-indigo-300 font-extrabold' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              Cetak & Unggah Berkas
            </button>
          </div>

          {activeTab !== 'cetak_unggah' ? (
            <form onSubmit={handleSubmit} className="space-y-6">

          {/* Form Content - TAB 1: LAHAN & PEMILIK */}
          {activeTab === 'lahan_pemilik' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">DESA *</label>
                  <input
                    type="text"
                    value={formData.DESA}
                    onChange={(e) => handleChange('DESA', e.target.value)}
                    disabled={!!selectedEditRecord}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      errors.DESA ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-indigo-500'
                    }`}
                    placeholder="Contoh: KUTA"
                  />
                  {errors.DESA && <p className="text-xs text-rose-600 mt-1">{errors.DESA}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">SPAN *</label>
                  <input
                    type="text"
                    value={formData.SPAN}
                    onChange={(e) => handleChange('SPAN', e.target.value)}
                    disabled={!!selectedEditRecord}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      errors.SPAN ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-indigo-500'
                    }`}
                    placeholder="Contoh: SPAN_A"
                  />
                  {errors.SPAN && <p className="text-xs text-rose-600 mt-1">{errors.SPAN}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NOBID (Nomor Bidang) *</label>
                  <input
                    type="text"
                    value={formData.NOBID}
                    onChange={(e) => handleChange('NOBID', e.target.value)}
                    disabled={!!selectedEditRecord}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      errors.NOBID ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-indigo-500'
                    }`}
                    placeholder="Contoh: 0014"
                  />
                  {errors.NOBID && <p className="text-xs text-rose-600 mt-1">{errors.NOBID}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">LUAS (m²) *</label>
                  <input
                    type="text"
                    value={formData.LUAS}
                    onChange={(e) => handleChange('LUAS', e.target.value)}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      errors.LUAS ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-indigo-500'
                    }`}
                    placeholder="Contoh: 1540"
                  />
                  {errors.LUAS && <p className="text-xs text-rose-600 mt-1">{errors.LUAS}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PENUTUP LAHAN</label>
                  <select
                    value={formData.PENUTUP_LAHAN}
                    onChange={(e) => handleChange('PENUTUP_LAHAN', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                  >
                    <option value="SAWAH" className="text-slate-800 bg-white">SAWAH</option>
                    <option value="LADANG ATAU TEGALAN" className="text-slate-800 bg-white">LADANG ATAU TEGALAN</option>
                    <option value="PERKEBUNAN" className="text-slate-800 bg-white">PERKEBUNAN</option>
                    <option value="PEMUKIMAN" className="text-slate-800 bg-white">PEMUKIMAN</option>
                    <option value="PADANG RUMPUT" className="text-slate-800 bg-white">PADANG RUMPUT</option>
                    <option value="SUNGAI" className="text-slate-800 bg-white">SUNGAI</option>
                    <option value="JARINGAN JALAN" className="text-slate-800 bg-white">JARINGAN JALAN</option>
                    <option value="SALURAN IRIGASI" className="text-slate-800 bg-white">SALURAN IRIGASI</option>
                    <option value="LAINNYA" className="text-slate-800 bg-white">LAINNYA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS PENUTUP LAHAN</label>
                  <select
                    value={formData.STATUS_PENUTUP_LAHAN}
                    onChange={(e) => handleChange('STATUS_PENUTUP_LAHAN', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                  >
                    <option value="TANAH MASYARAKAT" className="text-slate-800 bg-white">TANAH MASYARAKAT</option>
                    <option value="KAWASAN HUTAN" className="text-slate-800 bg-white">KAWASAN HUTAN</option>
                    <option value="BMN" className="text-slate-800 bg-white">BMN</option>
                    <option value="BMD" className="text-slate-800 bg-white">BMD</option>
                    <option value="ASET BUMN" className="text-slate-800 bg-white">ASET BUMN</option>
                    <option value="ASET BUMD" className="text-slate-800 bg-white">ASET BUMD</option>
                    <option value="ASET DESA" className="text-slate-800 bg-white">ASET DESA</option>
                    <option value="TANAH NEGARA" className="text-slate-800 bg-white">TANAH NEGARA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS KEPEMILIKAN</label>
                  <select
                    value={formData.STATUS_KEPEMILIKAN}
                    onChange={(e) => handleChange('STATUS_KEPEMILIKAN', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                  >
                    <option value="PEMILIK DIKETAHUI" className="text-slate-800 bg-white">PEMILIK DIKETAHUI</option>
                    <option value="PEMILIK TIDAK DIKETAHUI KEBERADAANNYA" className="text-slate-800 bg-white">PEMILIK TIDAK DIKETAHUI KEBERADAANNYA</option>
                    <option value="PEMILIK MENOLAK KOMPENSASI" className="text-slate-800 bg-white">PEMILIK MENOLAK KOMPENSASI</option>
                    <option value="PEMILIK TIDAK DIKETAHUI" className="text-slate-800 bg-white">PEMILIK TIDAK DIKETAHUI</option>
                  </select>
                </div>
              </div>

              {/* Owner Info */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100/80 space-y-5">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  Identitas Pemilik Lahan
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA PEMILIK *</label>
                    <input
                      type="text"
                      value={formData.NAMA}
                      onChange={(e) => handleChange('NAMA', e.target.value)}
                      className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                        errors.NAMA ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-indigo-500'
                      }`}
                      placeholder="Contoh: AHMAD SUBAGJO"
                    />
                    {errors.NAMA && <p className="text-xs text-rose-600 mt-1">{errors.NAMA}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NIK (16 Digit - Opsional)</label>
                    <input
                      type="text"
                      value={formData.NIK}
                      onChange={(e) => handleChange('NIK', e.target.value)}
                      maxLength={16}
                      className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                        errors.NIK ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-indigo-500'
                      }`}
                      placeholder="Contoh: 3501xxxxxxxxxxxx"
                    />
                    {errors.NIK && <p className="text-xs text-rose-600 mt-1">{errors.NIK}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">JENIS KELAMIN</label>
                    <select
                      value={formData.JENIS_KELAMIN}
                      onChange={(e) => handleChange('JENIS_KELAMIN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="Laki-laki" className="text-slate-800 bg-white">Laki-laki</option>
                      <option value="Perempuan" className="text-slate-800 bg-white">Perempuan</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">TEMPAT TANGGAL LAHIR (TTL)</label>
                    <input
                      type="text"
                      value={formData.TTL}
                      onChange={(e) => handleChange('TTL', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: Sleman, 12-05-1980"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PEKERJAAN</label>
                    <input
                      type="text"
                      value={formData.PEKERJAAN}
                      onChange={(e) => handleChange('PEKERJAAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: PETANI"
                    />
                  </div>
                </div>

                {/* Alamat Baris 1-4 */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-600 uppercase">ALAMAT KTP</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 1 (RT/RW, Dusun)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_1}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_1', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="RT 03 RW 01, Dusun Krajan"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 2 (Desa/Kelurahan)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_2}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_2', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Desa Kuta"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 3 (Kecamatan)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_3}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_3', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Kecamatan Baturaden"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 4 (Kabupaten & Provinsi)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_4}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_4', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Banyumas, Jawa Tengah"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Batas-Batas Tanah */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100/80 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  Batas-Batas Tanah
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Utara Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_UTARA || ''}
                      onChange={(e) => handleChange('BATAS_UTARA', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Sri Suyani)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Selatan Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_SELATAN || ''}
                      onChange={(e) => handleChange('BATAS_SELATAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Sri Suyani)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Timur Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_TIMUR || ''}
                      onChange={(e) => handleChange('BATAS_TIMUR', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Sri Suyani)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Barat Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_BARAT || ''}
                      onChange={(e) => handleChange('BATAS_BARAT', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Tumirah)"
                    />
                  </div>
                </div>
              </div>

              {/* Navigation button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('alas_bangunan')}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-xs transition-all"
                >
                  Tab Berikutnya
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Form Content - TAB 2: ALAS HAK & BANGUNAN */}
          {activeTab === 'alas_bangunan' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Alas Hak */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100/80 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  Detail Kepemilikan & Alas Hak Lahan
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">JENIS ALAS HAK</label>
                    <select
                      value={formData.JENIS_ALAS_HAK}
                      onChange={(e) => handleChange('JENIS_ALAS_HAK', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="SERTIPIKAT HAK MILIK" className="text-slate-800 bg-white">SERTIPIKAT HAK MILIK</option>
                      <option value="SERTIPIKAT HAK GUNA BANGUNAN" className="text-slate-800 bg-white">SERTIPIKAT HAK GUNA BANGUNAN</option>
                      <option value="SERTIPIKAT HAK GUNA USAHA" className="text-slate-800 bg-white">SERTIPIKAT HAK GUNA USAHA</option>
                      <option value="SERTIPIKAT HAK PAKAI" className="text-slate-800 bg-white">SERTIPIKAT HAK PAKAI</option>
                      <option value="SERTIPIKAT HAK WAKAF" className="text-slate-800 bg-white">SERTIPIKAT HAK WAKAF</option>
                      <option value="LETTER C" className="text-slate-800 bg-white">LETTER C</option>
                      <option value="SEPORADIK" className="text-slate-800 bg-white">SEPORADIK</option>
                      <option value="SURAT KETERANGAN" className="text-slate-800 bg-white">SURAT KETERANGAN</option>
                      <option value="LAINNYA" className="text-slate-800 bg-white">LAINNYA</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NOMER HAK</label>
                    <input
                      type="text"
                      value={formData.NOMER_HAK}
                      onChange={(e) => handleChange('NOMER_HAK', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                      placeholder="Contoh: No. 1205"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA ALAS HAK</label>
                    <input
                      type="text"
                      value={formData.NAMA_ALAS_HAK}
                      onChange={(e) => handleChange('NAMA_ALAS_HAK', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                      placeholder="Contoh: H. SUBUR"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">LUAS PADA ALAS HAK (m²)</label>
                    <input
                      type="text"
                      value={formData.LUAS_YANG_ADA_PADA_ALAS_HAK}
                      onChange={(e) => handleChange('LUAS_YANG_ADA_PADA_ALAS_HAK', e.target.value)}
                      className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 ${
                        errors.LUAS_YANG_ADA_PADA_ALAS_HAK ? 'border-rose-300 font-medium' : 'border-slate-200 font-medium'
                      }`}
                      placeholder="Contoh: 1500"
                    />
                    {errors.LUAS_YANG_ADA_PADA_ALAS_HAK && <p className="text-xs text-rose-600 mt-1">{errors.LUAS_YANG_ADA_PADA_ALAS_HAK}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">JENIS DOKUMEN PERALIHAN</label>
                    <select
                      value={formData.JENIS_PERALIHAN_HAK || 'JUAL-BELI'}
                      onChange={(e) => handleChange('JENIS_PERALIHAN_HAK', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white font-medium text-slate-800"
                    >
                      <option value="SESUAI" className="text-slate-800 bg-white">SESUAI</option>
                      <option value="JUAL-BELI" className="text-slate-800 bg-white">JUAL-BELI</option>
                      <option value="KETERANGAN WARIS" className="text-slate-800 bg-white">KETERANGAN WARIS</option>
                      <option value="KUASA WARIS" className="text-slate-800 bg-white">KUASA WARIS</option>
                      <option value="SURAT KUASA" className="text-slate-800 bg-white">SURAT KUASA</option>
                      <option value="KET. BEDA NAMA" className="text-slate-800 bg-white">KET. BEDA NAMA</option>
                      <option value="WAKAF" className="text-slate-800 bg-white">WAKAF</option>
                      <option value="SURAT KLAIM TANAMAN" className="text-slate-800 bg-white">SURAT KLAIM TANAMAN</option>
                      <option value="SURAT KLAIM BANGUNAN" className="text-slate-800 bg-white">SURAT KLAIM BANGUNAN</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 8 Buildings */}
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                    <Home className="w-4 h-4 text-indigo-400" />
                    Data Bangunan Di Atas Lahan (Maksimal 8 Bangunan)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Isi rincian bangunan yang berdiri di atas lahan ini.</p>
                </div>

                <div className="space-y-4">
                  {Array.from({ length: activeBuildingsCount }).map((_, i) => {
                    const b = formData.buildings?.[i] || { luas: '', bentuk: '', jenis: '' };
                    return (
                      <div key={i} className="p-5 rounded-2xl border border-indigo-500/20 bg-slate-900/60 relative space-y-4 shadow-lg shadow-black/10">
                        {/* Close button to reset */}
                        <button
                          type="button"
                          onClick={() => removeBuildingAt(i)}
                          className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                          title="Hapus baris bangunan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">
                              Bangunan #{i + 1} - JENIS BANGUNAN
                            </label>
                            <input
                              type="text"
                              value={b.jenis}
                              onChange={(e) => handleBuildingChange(i, 'jenis', e.target.value)}
                              className="w-full px-3 py-2 bg-slate-950 border border-white/20 rounded-xl text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 font-semibold text-white placeholder:text-slate-500"
                              placeholder="Contoh: RUMAH / TOKO / GUDANG"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">
                              BENTUK BANGUNAN
                            </label>
                            <input
                              type="text"
                              value={b.bentuk}
                              onChange={(e) => handleBuildingChange(i, 'bentuk', e.target.value)}
                              className="w-full px-3 py-2 bg-slate-950 border border-white/20 rounded-xl text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 font-semibold text-white placeholder:text-slate-500"
                              placeholder="Contoh: PERMANEN / SEMI PERMANEN"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">
                              LUAS BANGUNAN (m²)
                            </label>
                            <input
                              type="text"
                              value={b.luas}
                              onChange={(e) => handleBuildingChange(i, 'luas', e.target.value)}
                              className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`building_luas_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-indigo-400 focus:ring-indigo-400/30'
                              }`}
                              placeholder="Contoh: 120"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {activeBuildingsCount < 8 && (
                    <button
                      type="button"
                      onClick={() => setActiveBuildingsCount(prev => prev + 1)}
                      className="w-full py-3 bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-300 rounded-xl text-xs font-extrabold border border-dashed border-indigo-500/30 hover:border-indigo-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Tambah Kolom Bangunan (Maksimal 8 Bangunan)
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('lahan_pemilik')}
                  className="px-5 py-2.5 border border-white/10 text-slate-300 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tanaman')}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  Tab Berikutnya
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Form Content - TAB 3: PLANTS (30 plants slots) */}
          {activeTab === 'tanaman' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border-b border-white/10 pb-2">
                <h3 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                  <Sprout className="w-4 h-4 text-emerald-400" />
                  Pohon & Tanaman Produktif Di Atas Lahan (Hingga 30 Jenis)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Isi jenis tanaman serta rincian usia produktif dan ukuran tanaman di bawah ini.</p>
              </div>

              <div className="space-y-4">
                {Array.from({ length: activePlantsCount }).map((_, i) => {
                  const p = formData.plants?.[i] || { jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' };
                  return (
                    <div key={i} className="p-5 rounded-2xl border border-emerald-500/20 bg-slate-900/60 relative space-y-4 shadow-lg shadow-black/10">
                      {/* Close button to reset */}
                      <button
                        type="button"
                        onClick={() => removePlantAt(i)}
                        className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                        title="Hapus baris tanaman"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 pt-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-emerald-300 uppercase mb-1.5 tracking-wide">
                            Tanaman #{i + 1} - JENIS TANAMAN
                          </label>
                          <input
                            type="text"
                            value={p.jenis}
                            onChange={(e) => handlePlantChange(i, 'jenis', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-white/20 rounded-xl text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 font-semibold text-white placeholder:text-slate-500"
                            placeholder="Contoh: KELAPA / ALPUKAT"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">SUDAH MENGHASILKAN</label>
                          <input
                            type="number"
                            min="0"
                            value={p.sudah_menghasilkan}
                            onChange={(e) => handlePlantChange(i, 'sudah_menghasilkan', e.target.value)}
                            className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                              errors[`plant_sm_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                            }`}
                            placeholder="Pohon"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">BELUM MENGHASILKAN</label>
                          <input
                            type="number"
                            min="0"
                            value={p.belum_menghasilkan}
                            onChange={(e) => handlePlantChange(i, 'belum_menghasilkan', e.target.value)}
                            className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                              errors[`plant_bm_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                            }`}
                            placeholder="Pohon"
                          />
                        </div>

                        <div>
                          <div className="grid grid-cols-3 gap-1">
                            <div className="col-span-3">
                              <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">UKURAN (K / S / B)</label>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={p.kecil}
                              onChange={(e) => handlePlantChange(i, 'kecil', e.target.value)}
                              className={`w-full px-2 py-2 bg-slate-950 border rounded-xl text-xs text-center focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`plant_kc_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                              }`}
                              placeholder="Kcl"
                              title="Jumlah tanaman ukuran Kecil"
                            />
                            <input
                              type="number"
                              min="0"
                              value={p.sedang}
                              onChange={(e) => handlePlantChange(i, 'sedang', e.target.value)}
                              className={`w-full px-2 py-2 bg-slate-950 border rounded-xl text-xs text-center focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`plant_sd_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                              }`}
                              placeholder="Sdg"
                              title="Jumlah tanaman ukuran Sedang"
                            />
                            <input
                              type="number"
                              min="0"
                              value={p.besar}
                              onChange={(e) => handlePlantChange(i, 'besar', e.target.value)}
                              className={`w-full px-2 py-2 bg-slate-950 border rounded-xl text-xs text-center focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`plant_bs_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                              }`}
                              placeholder="Bsr"
                              title="Jumlah tanaman ukuran Besar"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {activePlantsCount < 30 && (
                  <button
                    type="button"
                    onClick={() => setActivePlantsCount(prev => prev + 1)}
                    className="w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300 rounded-xl text-xs font-extrabold border border-dashed border-emerald-500/30 hover:border-emerald-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Kolom Tanaman (Maksimal 30 Tanaman)
                  </button>
                )}
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('alas_bangunan')}
                  className="px-5 py-2.5 border border-white/10 text-slate-300 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('administrasi')}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  Tab Berikutnya
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Form Content - TAB 4: ADMINISTRASI & STATUS */}
          {activeTab === 'administrasi' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight border-b border-slate-200 pb-2">
                  Penanggung Jawab & Saksi Lahan
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS DESA</label>
                    <input
                      type="text"
                      value={formData.STATUS_DESA}
                      onChange={(e) => handleChange('STATUS_DESA', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: AKTIF / PERSUASIF"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS KEPALA DESA</label>
                    <input
                      type="text"
                      value={formData.STATUS_KEPALA}
                      onChange={(e) => handleChange('STATUS_KEPALA', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: PLT / DEFINITIF"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA KEPALA DESA (KADES)</label>
                    <input
                      type="text"
                      value={formData.NAMA_KADES}
                      onChange={(e) => handleChange('NAMA_KADES', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: SUPRAYITNO"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA SAKSI 1</label>
                    <input
                      type="text"
                      value={formData.NAMA_SAKSI_1}
                      onChange={(e) => handleChange('NAMA_SAKSI_1', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: SAKSI_A"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA SAKSI 2</label>
                    <input
                      type="text"
                      value={formData.NAMA_SAKSI_2}
                      onChange={(e) => handleChange('NAMA_SAKSI_2', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: SAKSI_B"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA TIM PELAKSANA 1</label>
                    <input
                      type="text"
                      value={formData.nama_tim_1}
                      onChange={(e) => handleChange('nama_tim_1', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: TIM_1"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA TIM PELAKSANA 2</label>
                    <input
                      type="text"
                      value={formData.nama_tim_2}
                      onChange={(e) => handleChange('nama_tim_2', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: TIM_2"
                    />
                  </div>
                </div>
              </div>

              {/* Progress & Locations */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight border-b border-slate-200 pb-2">
                  Wilayah, Tanggal & Progres Berkas
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KECAMATAN</label>
                    <input
                      type="text"
                      value={formData.KECAMATAN}
                      onChange={(e) => handleChange('KECAMATAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: BATURADEN"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KABUPATEN</label>
                    <input
                      type="text"
                      value={formData.KABUPATEN}
                      onChange={(e) => handleChange('KABUPATEN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Contoh: BANYUMAS"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">TANGGAL PELAKSANAAN</label>
                    <input
                      type="date"
                      value={formData.TANGGAL_PELAKSANAAN}
                      onChange={(e) => handleChange('TANGGAL_PELAKSANAAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KONFIRMASI BPN</label>
                    <select
                      value={formData.KONFIRMASI_BPN || 'TIDAK'}
                      onChange={(e) => handleChange('KONFIRMASI_BPN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="IYA" className="text-slate-800 bg-white">IYA</option>
                      <option value="TIDAK" className="text-slate-800 bg-white">TIDAK</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PROGRES PEMBERKASAN</label>
                    <select
                      value={formData.PROGRES_PEMBERKASAN || 'BELUM SELESAI'}
                      onChange={(e) => handleChange('PROGRES_PEMBERKASAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="BELUM SELESAI" className="text-slate-800 bg-white">BELUM SELESAI</option>
                      <option value="SELESAI" className="text-slate-800 bg-white">SELESAI</option>
                      <option value="KONSINYASI" className="text-slate-800 bg-white">KONSINYASI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PROGRES UPLOAD TRABAS</label>
                    <select
                      value={formData.PROGRES_UPLOAD_TRABAS || 'BELUM'}
                      onChange={(e) => handleChange('PROGRES_UPLOAD_TRABAS', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="SUDAH" className="text-slate-800 bg-white">SUDAH</option>
                      <option value="BELUM" className="text-slate-800 bg-white">BELUM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KETERANGAN TAMBAHAN</label>
                  <textarea
                    value={formData.KETERANGAN}
                    onChange={(e) => handleChange('KETERANGAN', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Masukkan catatan tambahan mengenai kondisi lahan atau pemilik..."
                  />
                </div>
              </div>

              {/* Navigation and Submit Buttons */}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('tanaman')}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {selectedEditRecord ? 'Simpan Perubahan Lahan' : 'Daftarkan Lahan Baru'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      ) : (
        <div className="space-y-6 animate-fadeIn">
          {selectedEditRecord ? (
            accessToken ? (
              <DocUpload
                records={records}
                accessToken={accessToken}
                onUpdateRecord={onUpdateRecord || (async () => {})}
                uploadsFolderId={uploadsFolderId}
                activeProjectName={activeProjectName}
                preselectedRecordId={selectedEditRecord.ID_UNIK}
              />
            ) : (
              <div className="p-8 bg-slate-900/50 border border-white/5 rounded-2xl text-center space-y-4">
                <ShieldAlert className="w-8 h-8 text-indigo-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">Koneksi Google Drive Belum Aktif</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Hubungkan Google Drive Anda menggunakan tombol <strong>Hubungkan Drive</strong> di bagian atas layar untuk mengaktifkan cetak dokumen resmi dan unggah lampiran berkas langsung ke Google Drive.
                </p>
              </div>
            )
          ) : (
            <div className="p-10 bg-slate-900/40 rounded-2xl border border-white/5 text-center space-y-4">
              <ShieldAlert className="w-8 h-8 text-indigo-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">Data Lahan Belum Dipilih / Dimuat</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Silakan cari dan muat data lahan terlebih dahulu menggunakan panel pencarian di bagian atas, atau simpan data lahan baru untuk mencetak Formulir Inventarisasi resmi (PDF) atau mengunggah lampiran berkas ke Google Drive.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
</div>
  );
}
