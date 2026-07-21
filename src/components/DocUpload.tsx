import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, Upload, CheckCircle2, AlertCircle, ExternalLink, 
  Search, Loader2, FolderOpen, Info, ShieldAlert, MapPin, Check,
  FileDown, Cloud
} from 'lucide-react';
import { type LandRecord } from '../types';
import { findOrCreateFolder, uploadFileToDrive } from '../lib/googleApi';
import { generateInventoryPDF } from '../lib/pdfGenerator';

interface DocUploadProps {
  records: LandRecord[];
  accessToken: string;
  onUpdateRecord: (updatedRecord: LandRecord) => Promise<void>;
  uploadsFolderId?: string;
  activeProjectName?: string;
  preselectedRecordId?: string | null;
}

type DocType = 
  | 'KTP' 
  | 'KK' 
  | 'Alas_Hak' 
  | 'Peralihan_Hak'
  | 'Jual_Beli'
  | 'Keterangan_Waris'
  | 'Kuasa_Waris'
  | 'Surat_Kuasa'
  | 'Ket_Beda_Nama'
  | 'Wakaf'
  | 'Klaim_Tanaman'
  | 'Klaim_Bangunan'
  | 'Dokumen_Lain'
  | 'Dokumentasi_Bidang'
  | 'Wajah_Pemilik';

interface DocTypeConfig {
  key: keyof LandRecord;
  label: string;
  description: string;
  docType: DocType;
}

export default function DocUpload({ 
  records, 
  accessToken, 
  onUpdateRecord, 
  uploadsFolderId, 
  activeProjectName,
  preselectedRecordId = null
}: DocUploadProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(preselectedRecordId || null);
  const [isSavingPDFToDrive, setIsSavingPDFToDrive] = useState(false);

  useEffect(() => {
    if (preselectedRecordId) {
      setSelectedRecordId(preselectedRecordId);
    }
  }, [preselectedRecordId]);
  
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

  // Loading and error states
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Configuration for document slots
  const mainDocumentSlots: DocTypeConfig[] = [
    { key: 'LINK_KTP', label: 'Scan KTP / Foto KTP', description: 'File PDF atau Gambar (JPG, JPEG, PNG) bukti identitas Kartu Tanda Penduduk.', docType: 'KTP' },
    { key: 'LINK_KK', label: 'Scan Kartu Keluarga (KK)', description: 'File PDF bukti hubungan keluarga/KK pemilik.', docType: 'KK' },
    { key: 'LINK_ALAS_HAK', label: 'Scan Alas Hak Lahan', description: 'File PDF Sertipikat, Letter C, Seporadik atau bukti kepemilikan.', docType: 'Alas_Hak' }
  ];

  const transitionDocumentSlots: DocTypeConfig[] = [
    { key: 'LINK_JUAL_BELI', label: 'Scan Akta Jual Beli / AJB', description: 'File PDF Akta Jual Beli (AJB) atau dokumen pelepasan hak.', docType: 'Jual_Beli' },
    { key: 'LINK_KETERANGAN_WARIS', label: 'Scan Surat Keterangan Waris', description: 'File PDF Surat Keterangan Waris yang sah.', docType: 'Keterangan_Waris' },
    { key: 'LINK_KUASA_WARIS', label: 'Scan Surat Kuasa Waris', description: 'File PDF Surat Kuasa dari para ahli waris.', docType: 'Kuasa_Waris' },
    { key: 'LINK_SURAT_KUASA', label: 'Scan Surat Kuasa', description: 'File PDF Surat Kuasa penunjukkan pengurusan berkas.', docType: 'Surat_Kuasa' },
    { key: 'LINK_KET_BEDA_NAMA', label: 'Scan Keterangan Beda Nama', description: 'File PDF Surat Keterangan Beda Nama dari kepala desa.', docType: 'Ket_Beda_Nama' },
    { key: 'LINK_WAKAF', label: 'Scan Akta Wakaf', description: 'File PDF Akta Ikrar Wakaf atau dokumen pelepasan wakaf.', docType: 'Wakaf' },
    { key: 'LINK_KLAIM_TANAMAN', label: 'Scan Surat Klaim Tanaman', description: 'File PDF Surat Pernyataan / Klaim ganti rugi tanaman.', docType: 'Klaim_Tanaman' },
    { key: 'LINK_KLAIM_BANGUNAN', label: 'Scan Surat Klaim Bangunan', description: 'File PDF Surat Pernyataan / Klaim ganti rugi bangunan.', docType: 'Klaim_Bangunan' },
    { key: 'LINK_DOKUMEN_LAIN', label: 'Scan Dokumen Lain / Tambahan', description: 'File PDF dokumen pendukung lainnya yang dibutuhkan.', docType: 'Dokumen_Lain' }
  ];

  const photoDocumentSlots: DocTypeConfig[] = [
    { key: 'LINK_DOKUMENTASI_BIDANG', label: 'Foto Dokumentasi Bidang', description: 'Foto/Gambar (JPG, JPEG, PNG) atau PDF dokumentasi kondisi fisik di lokasi bidang tanah.', docType: 'Dokumentasi_Bidang' },
    { key: 'LINK_WAJAH_PEMILIK', label: 'Foto Wajah Pemilik', description: 'Foto/Gambar (JPG, JPEG, PNG) atau PDF wajah dari pemilik lahan atau ahli waris.', docType: 'Wajah_Pemilik' }
  ];

  // Selected Record details
  const selectedRecord = useMemo(() => {
    return records.find(r => r.ID_UNIK === selectedRecordId) || null;
  }, [records, selectedRecordId]);

  // Filtered list of records to select from
  const filteredRecords = useMemo(() => {
    if (searchMethod === 'manual') {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return records;
      return records.filter(r => 
        r.CODE.toLowerCase().includes(query) || 
        r.NAMA.toLowerCase().includes(query)
      );
    } else {
      // Dropdown filtering
      let list = records;
      if (selectedDesa) {
        list = list.filter(r => r.DESA?.trim() === selectedDesa);
      }
      if (selectedSpan) {
        list = list.filter(r => r.SPAN?.trim() === selectedSpan);
      }
      if (selectedNobid) {
        list = list.filter(r => r.NOBID?.trim() === selectedNobid);
      }
      return list;
    }
  }, [records, searchQuery, searchMethod, selectedDesa, selectedSpan, selectedNobid]);

  // Handle PDF/Image file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, docType: DocType) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedRecord) {
      setStatusMessage({ type: 'error', text: 'Mohon pilih data lahan terlebih dahulu.' });
      return;
    }

    // Validation for KTP, Dokumentasi_Bidang, and Wajah_Pemilik can be PDF or Image (JPEG/JPG/PNG)
    if (docType === 'KTP' || docType === 'Dokumentasi_Bidang' || docType === 'Wajah_Pemilik') {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        setStatusMessage({ type: 'error', text: `Format ${docType.replace('_', ' ')} harus berupa PDF atau Gambar (JPG, JPEG, PNG).` });
        return;
      }
    } else {
      if (file.type !== 'application/pdf') {
        setStatusMessage({ type: 'error', text: 'Hanya file berformat PDF yang diizinkan untuk diunggah pada slot ini.' });
        return;
      }
    }

    setUploadingType(docType);
    setStatusMessage(null);

    try {
      // 1. Find or create master folder in Google Drive Root (use project-specific folder if available)
      const mainFolderId = uploadsFolderId || await findOrCreateFolder(accessToken, "SIP_Berkas_Pertanahan_Desa");
      
      // 2. Find or create subfolder matching record with unique id prefix (e.g. ID-8F9G2H_KUTA-12-4)
      // Check if there is already a locked Google Drive Folder ID
      let subFolderId = selectedRecord.DRIVE_FOLDER_ID;
      if (!subFolderId) {
        const subFolderName = selectedRecord.CODE.replace(/[\/\\?%*:|"<>\s]/g, '-');
        subFolderId = await findOrCreateFolder(accessToken, subFolderName, mainFolderId, selectedRecord.ID_UNIK);
      }
      
      // 3. Upload file to Google Drive subfolder, with proper naming
      // For Peralihan_Hak, let's include the sub-type in the file name prefix
      const finalDocTypeLabel = docType === 'Peralihan_Hak' 
        ? `Peralihan_${(selectedRecord.JENIS_PERALIHAN_HAK || 'HAK').replace(/[\s\/\\?%*:|"<>-]/g, '_')}`
        : docType;

      const uploadResult = await uploadFileToDrive(
        accessToken,
        file,
        finalDocTypeLabel,
        selectedRecord.CODE,
        subFolderId
      );

      // 4. Update corresponding link field inside record
      const updatedRecord = { ...selectedRecord };
      updatedRecord.DRIVE_FOLDER_ID = subFolderId; // save and lock Drive Folder ID!
      if (docType === 'KTP') updatedRecord.LINK_KTP = uploadResult.webViewLink;
      else if (docType === 'KK') updatedRecord.LINK_KK = uploadResult.webViewLink;
      else if (docType === 'Alas_Hak') updatedRecord.LINK_ALAS_HAK = uploadResult.webViewLink;
      else if (docType === 'Peralihan_Hak') updatedRecord.LINK_PERALIHAN_HAK = uploadResult.webViewLink;
      else if (docType === 'Jual_Beli') updatedRecord.LINK_JUAL_BELI = uploadResult.webViewLink;
      else if (docType === 'Keterangan_Waris') updatedRecord.LINK_KETERANGAN_WARIS = uploadResult.webViewLink;
      else if (docType === 'Kuasa_Waris') updatedRecord.LINK_KUASA_WARIS = uploadResult.webViewLink;
      else if (docType === 'Surat_Kuasa') updatedRecord.LINK_SURAT_KUASA = uploadResult.webViewLink;
      else if (docType === 'Ket_Beda_Nama') updatedRecord.LINK_KET_BEDA_NAMA = uploadResult.webViewLink;
      else if (docType === 'Wakaf') updatedRecord.LINK_WAKAF = uploadResult.webViewLink;
      else if (docType === 'Klaim_Tanaman') updatedRecord.LINK_KLAIM_TANAMAN = uploadResult.webViewLink;
      else if (docType === 'Klaim_Bangunan') updatedRecord.LINK_KLAIM_BANGUNAN = uploadResult.webViewLink;
      else if (docType === 'Dokumen_Lain') updatedRecord.LINK_DOKUMEN_LAIN = uploadResult.webViewLink;
      else if (docType === 'Dokumentasi_Bidang') updatedRecord.LINK_DOKUMENTASI_BIDANG = uploadResult.webViewLink;
      else if (docType === 'Wajah_Pemilik') updatedRecord.LINK_WAJAH_PEMILIK = uploadResult.webViewLink;

      // 5. Update parent records & save to Google Sheets
      await onUpdateRecord(updatedRecord);

      setStatusMessage({ 
        type: 'success', 
        text: `Berkas ${docType.replace('_', ' ')} berhasil diunggah ke Google Drive di folder ${selectedRecord.CODE}!` 
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ 
        type: 'error', 
        text: err.message || `Gagal mengunggah berkas ${docType}. Pastikan izin Google Drive aktif.` 
      });
    } finally {
      setUploadingType(null);
      // Reset input value
      event.target.value = '';
    }
  };

  const handleDownloadPDFDirectly = () => {
    if (!selectedRecord) return;
    try {
      const docInstance = generateInventoryPDF(selectedRecord, activeProjectName || "KOMPENSASI JALUR TRANSMISI");
      docInstance.save(`FORMULIR_INVENTARISASI_${selectedRecord.CODE.replace(/[\/\\?%*:|"<>\s]/g, '_')}.pdf`);
      setStatusMessage({
        type: 'success',
        text: `Formulir Inventarisasi untuk ${selectedRecord.CODE} berhasil diunduh ke komputer Anda!`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: `Gagal mengunduh PDF: ${err.message}`
      });
    }
  };

  const handleSavePDFToDrive = async () => {
    if (!selectedRecord) return;
    setIsSavingPDFToDrive(true);
    setStatusMessage(null);
    try {
      // 1. Generate PDF blob
      const docInstance = generateInventoryPDF(selectedRecord, activeProjectName || "KOMPENSASI JALUR TRANSMISI");
      const pdfBlob = docInstance.output('blob');
      const pdfFile = new File([pdfBlob], `FORMULIR_INVENTARISASI_${selectedRecord.CODE.replace(/[\/\\?%*:|"<>\s]/g, '_')}.pdf`, { type: 'application/pdf' });

      // 2. Find or create folders in Drive
      const mainFolderId = uploadsFolderId || await findOrCreateFolder(accessToken, "SIP_Berkas_Pertanahan_Desa");
      let subFolderId = selectedRecord.DRIVE_FOLDER_ID;
      if (!subFolderId) {
        const subFolderName = selectedRecord.CODE.replace(/[\/\\?%*:|"<>\s]/g, '-');
        subFolderId = await findOrCreateFolder(accessToken, subFolderName, mainFolderId, selectedRecord.ID_UNIK);
      }

      // 3. Upload file to Google Drive subfolder
      await uploadFileToDrive(
        accessToken,
        pdfFile,
        "FORMULIR_INVENTARISASI",
        selectedRecord.CODE,
        subFolderId
      );

      // 4. Update parent records to ensure DRIVE_FOLDER_ID is saved
      const updatedRecord = { ...selectedRecord };
      updatedRecord.DRIVE_FOLDER_ID = subFolderId;
      await onUpdateRecord(updatedRecord);

      setStatusMessage({
        type: 'success',
        text: `Formulir Inventarisasi resmi berhasil diproduksi dan diunggah langsung ke Google Drive di dalam folder ${selectedRecord.CODE}!`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Gagal menyimpan Formulir Inventarisasi ke Google Drive. Periksa izin akses Drive.'
      });
    } finally {
      setIsSavingPDFToDrive(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="sip_doc_upload">
      {/* Left panel: List of land records to select */}
      {!preselectedRecordId && (
        <div className="lg:col-span-4 glass-card p-5 rounded-2xl shadow-xl flex flex-col h-[600px]">
          <div>
            <h2 className="text-md font-bold text-white tracking-tight flex items-center gap-1.5">
              <FolderOpen className="w-5 h-5 text-indigo-400" />
              Daftar Berkas Lahan
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Pilih salah satu kode lahan di bawah untuk melengkapi berkas lampiran.</p>
          </div>

          {/* Search Method Toggle Tabs */}
          <div className="flex gap-1.5 border-b border-white/5 pb-2 mt-4">
            <button
              type="button"
              onClick={() => setSearchMethod('dropdown')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                searchMethod === 'dropdown'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Dropdown
            </button>
            <button
              type="button"
              onClick={() => setSearchMethod('manual')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                searchMethod === 'manual'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Manual
            </button>
          </div>

          {/* Search Input / Cascading Dropdowns */}
          <div className="space-y-2 mt-3 mb-4">
            {searchMethod === 'dropdown' ? (
              <div className="space-y-2.5">
                {/* Select DESA */}
                <div>
                  <select
                    value={selectedDesa}
                    onChange={(e) => setSelectedDesa(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-[11px] text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                  >
                    <option value="">-- 1. Pilih Desa --</option>
                    {uniqueDesas.map(desa => (
                      <option key={desa} value={desa}>{desa}</option>
                    ))}
                  </select>
                </div>

                {/* Select SPAN */}
                <div>
                  <select
                    value={selectedSpan}
                    onChange={(e) => setSelectedSpan(e.target.value)}
                    disabled={!selectedDesa}
                    className="w-full px-2.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-[11px] text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <option value="">{selectedDesa ? '-- 2. Pilih Span --' : '-- 2. Pilih Desa Dulu --'}</option>
                    {uniqueSpansForDesa.map(span => (
                      <option key={span} value={span}>{span}</option>
                    ))}
                  </select>
                </div>

                {/* Select NOBID */}
                <div>
                  <select
                    value={selectedNobid}
                    onChange={(e) => setSelectedNobid(e.target.value)}
                    disabled={!selectedSpan}
                    className="w-full px-2.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-[11px] text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <option value="">{selectedSpan ? '-- 3. Pilih No. Bidang --' : '-- 3. Pilih Span Dulu --'}</option>
                    {uniqueNobidsForDesaAndSpan.map(nobid => (
                      <option key={nobid} value={nobid}>{nobid}</option>
                    ))}
                  </select>
                </div>

                {/* Reset Dropdown Selection if anything chosen */}
                {(selectedDesa || selectedSpan || selectedNobid) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDesa('');
                      setSelectedSpan('');
                      setSelectedNobid('');
                    }}
                    className="w-full py-1 bg-white/5 hover:bg-rose-500/10 hover:text-rose-300 text-[10px] font-bold text-slate-400 rounded-lg border border-white/5 transition-all cursor-pointer"
                  >
                    Bersihkan Filter Dropdown
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari CODE atau Nama Pemilik..."
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-400 animate-fadeIn"
                />
              </div>
            )}
          </div>

          {/* List scroll */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
            {filteredRecords.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                Tidak ada data pertanahan ditemukan
              </div>
            ) : (
              filteredRecords.map((r, idx) => {
                const isSelected = r.ID_UNIK === selectedRecordId;
                // Check how many documents have links
                const docCount = [
                  r.LINK_KTP, r.LINK_KK, r.LINK_ALAS_HAK, r.LINK_PERALIHAN_HAK,
                  r.LINK_JUAL_BELI, r.LINK_KETERANGAN_WARIS, r.LINK_KUASA_WARIS,
                  r.LINK_SURAT_KUASA, r.LINK_KET_BEDA_NAMA, r.LINK_WAKAF,
                  r.LINK_KLAIM_TANAMAN, r.LINK_KLAIM_BANGUNAN, r.LINK_DOKUMEN_LAIN,
                  r.LINK_DOKUMENTASI_BIDANG, r.LINK_WAJAH_PEMILIK
                ].filter(Boolean).length;
                
                return (
                  <button
                    key={`${r.ID_UNIK || r.CODE || 'row'}-${idx}`}
                    onClick={() => {
                      setSelectedRecordId(r.ID_UNIK);
                      setStatusMessage(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex justify-between items-center cursor-pointer ${
                      isSelected 
                        ? 'bg-indigo-500/15 border-indigo-500/30 ring-1 ring-indigo-500/30 text-white' 
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="space-y-1 truncate pr-2">
                      <p className={`font-bold font-mono truncate ${isSelected ? 'text-indigo-200' : 'text-slate-300'}`}>{r.CODE}</p>
                      <p className="text-slate-400 font-semibold truncate">{r.NAMA}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold shrink-0 ${
                      docCount > 0 
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                        : 'bg-slate-900 text-slate-400 border border-white/5'
                    }`}>
                      {docCount} Berkas
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Right panel: Active upload view */}
      <div className={`${preselectedRecordId ? 'lg:col-span-12' : 'lg:col-span-8'} glass-card p-6 rounded-2xl shadow-xl flex flex-col justify-between min-h-[600px]`}>
        {selectedRecord ? (
          <div className="space-y-6 flex-1 flex flex-col justify-between">
            {/* Upper details of selection */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 px-2.5 py-1 rounded-md font-mono">
                    {selectedRecord.CODE}
                  </span>
                  <h3 className="text-lg font-extrabold text-white font-sans mt-2">{selectedRecord.NAMA}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Desa {selectedRecord.DESA} · NIK {selectedRecord.NIK} · Alas Hak: {selectedRecord.JENIS_ALAS_HAK} ({selectedRecord.NOMER_HAK || 'Tanpa Nomor'})
                  </p>
                </div>
                {selectedRecord.DRIVE_FOLDER_ID && (
                  <a
                    href={`https://drive.google.com/drive/folders/${selectedRecord.DRIVE_FOLDER_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-98 transition-all cursor-pointer border border-indigo-400/30 shrink-0 self-start sm:self-center"
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-300" />
                    Buka Folder Drive
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                )}
              </div>

              {/* PRODUKSI FORMULIR INVENTARISASI (PDF) CARD */}
              <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 mt-0.5">
                    <FileText className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                      Cetak Formulir Inventarisasi Resmi (PDF)
                      <span className="text-[8px] font-extrabold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Bebas Kuota Firebase
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Format resmi 2 halaman (Data Jaringan, Pihak Berhak, Lahan, Bangunan, Tanaman, & Blok Tanda Tangan).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    type="button"
                    onClick={handleDownloadPDFDirectly}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-xl border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98"
                  >
                    <FileDown className="w-4 h-4 text-indigo-400" />
                    Unduh PDF
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleSavePDFToDrive}
                    disabled={isSavingPDFToDrive}
                    className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer shadow-xs active:scale-98 ${
                      isSavingPDFToDrive
                        ? 'bg-slate-950 text-slate-500 border-white/5 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/30'
                    }`}
                  >
                    {isSavingPDFToDrive ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4 text-emerald-300" />
                        Simpan ke Drive
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              {statusMessage && (
                <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5 border ${
                  statusMessage.type === 'success' 
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' 
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/20'
                }`}>
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <p>{statusMessage.text}</p>
                </div>
              )}

              {/* Drive Folder structure info */}
              <div className="p-3.5 bg-white/5 rounded-xl border border-white/5 text-[11px] text-slate-300 flex items-start gap-2.5 shadow-inner">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    Integrasi Otomatis & Kunci Folder Google Drive
                    {selectedRecord.DRIVE_FOLDER_ID && (
                      <span className="text-[9px] font-extrabold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider">
                        🔒 Kunci Folder Aktif
                      </span>
                    )}
                  </span>
                  <p className="text-slate-400 leading-relaxed">
                    {selectedRecord.DRIVE_FOLDER_ID ? (
                      <>
                        Folder bidang ini telah **dikunci secara permanen** dengan Google Drive Folder ID: <code className="text-indigo-200 bg-indigo-950/40 px-1.5 py-0.5 rounded font-mono text-[10px] select-all">{selectedRecord.DRIVE_FOLDER_ID}</code>. 
                        Meskipun Anda mengedit nomor bidang (NOBID), memindahkan baris, atau menyisipkan baris baru di antara bidang lainnya, dokumen di dalam folder ini tidak akan pernah tertukar atau salah tampil!
                      </>
                    ) : (
                      <>
                        Sistem menggunakan <strong className="text-indigo-200">Kode Unik ({selectedRecord.ID_UNIK})</strong> yang tersambung dengan Google Drive secara permanen. 
                        Ketika Anda pertama kali mengunggah dokumen, folder akan dibuat dan ID-nya akan dikunci secara otomatis ke baris bidang ini agar tidak pernah tertukar atau salah tampil!
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Upload slots */}
              {(() => {
                const renderSlot = (slot: DocTypeConfig) => {
                  const linkValue = selectedRecord[slot.key] as string;
                  const isUploaded = !!linkValue;
                  const slotDocType = slot.docType;
                  const isSlotUploading = uploadingType === slotDocType;
                  
                  // Accept PDF or images for KTP, Dokumentasi_Bidang, and Wajah_Pemilik
                  const isImageAndPdf = slot.key === 'LINK_KTP' || slot.key === 'LINK_DOKUMENTASI_BIDANG' || slot.key === 'LINK_WAJAH_PEMILIK';
                  const acceptTypes = isImageAndPdf 
                    ? 'application/pdf,image/jpeg,image/jpg,image/png' 
                    : 'application/pdf';
                  
                  const uploadLabel = isImageAndPdf ? 'Unggah Berkas' : 'Unggah PDF';

                  return (
                    <div key={slot.key} className="p-4 rounded-xl border border-white/5 bg-slate-900/45 flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1 max-w-md">
                          <h4 className="text-xs font-bold text-slate-200 tracking-tight flex items-center gap-1.5">
                            {slot.label}
                            {isUploaded && (
                              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Selesai
                              </span>
                            )}
                          </h4>
                          <p className="text-[11px] text-slate-400">{slot.description}</p>
                        </div>

                        <div className="shrink-0 self-end sm:self-auto">
                          {isUploaded ? (
                            <div className="flex items-center gap-2">
                              <a 
                                href={linkValue} 
                                target="_blank" 
                                referrerPolicy="no-referrer"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg border border-white/10 flex items-center gap-1.5 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Buka File Drive
                              </a>
                              <label className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-500/25 flex items-center gap-1.5 cursor-pointer transition-colors">
                                <Upload className="w-3.5 h-3.5" />
                                Ganti
                                <input 
                                  type="file" 
                                  accept={acceptTypes}
                                  onChange={(e) => handleFileUpload(e, slotDocType)}
                                  className="hidden" 
                                  disabled={uploadingType !== null}
                                />
                              </label>
                            </div>
                          ) : (
                            <label className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer border shadow-xs transition-all ${
                              isSlotUploading 
                                ? 'bg-slate-950 text-slate-500 border-white/5 cursor-not-allowed' 
                                : 'bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-500 glow-indigo'
                            }`}>
                              {isSlotUploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                                  Mengunggah...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  {uploadLabel}
                                </>
                              )}
                              <input 
                                type="file" 
                                accept={acceptTypes}
                                onChange={(e) => handleFileUpload(e, slotDocType)}
                                className="hidden" 
                                disabled={uploadingType !== null}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="space-y-6 mt-5 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                    {/* Dokumen Utama Section */}
                    <div className="space-y-3">
                      <div className="border-b border-white/5 pb-1 mb-2">
                        <span className="text-xs font-extrabold text-indigo-300 uppercase tracking-wider">I. Dokumen Utama</span>
                      </div>
                      {mainDocumentSlots.map(renderSlot)}
                    </div>

                    {/* Dokumen Peralihan Hak & Pendukung Section */}
                    <div className="space-y-3 pt-2">
                      <div className="border-b border-white/5 pb-1 mb-2">
                        <span className="text-xs font-extrabold text-indigo-300 uppercase tracking-wider">II. Dokumen Peralihan Hak & Pendukung (Bisa Lebih Dari 1)</span>
                      </div>

                      {/* Legacy Peralihan Link if it exists */}
                      {selectedRecord.LINK_PERALIHAN_HAK && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Info className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Arsip Dokumen Peralihan sebelumnya tersedia (Legacy)</span>
                          </div>
                          <a 
                            href={selectedRecord.LINK_PERALIHAN_HAK} 
                            target="_blank" 
                            referrerPolicy="no-referrer"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold rounded-lg flex items-center gap-1 transition-colors text-[11px]"
                          >
                            <ExternalLink className="w-3 h-3" /> Buka
                          </a>
                        </div>
                      )}

                      {transitionDocumentSlots.map(renderSlot)}
                    </div>

                    {/* Foto & Dokumentasi Lapangan Section */}
                    <div className="space-y-3 pt-2">
                      <div className="border-b border-white/5 pb-1 mb-2">
                        <span className="text-xs font-extrabold text-indigo-300 uppercase tracking-wider">III. Foto & Dokumentasi Lapangan</span>
                      </div>
                      {photoDocumentSlots.map(renderSlot)}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Bottom help text */}
            <p className="text-[10px] text-slate-400 text-center mt-6">
              * Hanya file berformat PDF (atau Gambar JPG/JPEG/PNG khusus untuk KTP, Dokumentasi Bidang, dan Wajah Pemilik) dengan ukuran maksimal 10MB yang diperbolehkan.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="p-4 rounded-full bg-white/5 text-slate-400 border border-white/5 shadow-inner">
              <FileText className="w-12 h-12 text-slate-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Belum Ada Berkas Lahan Terpilih</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Silakan pilih salah satu berkas bidang tanah di daftar sebelah kiri untuk memulai pengunggahan berkas KTP, KK, Alas Hak, dan Peralihan Hak.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
