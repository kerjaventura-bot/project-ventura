export interface BuildingData {
  luas: string;
  bentuk: string;
  jenis: string;
}

export interface PlantData {
  jenis: string;
  sudah_menghasilkan: string;
  belum_menghasilkan: string;
  kecil: string;
  sedang: string;
  besar: string;
}

export interface LandRecord {
  // Key Identification
  CODE: string;
  DESA: string;
  SPAN: string;
  NOBID: string;
  LUAS: string;
  
  // Land characteristics
  PENUTUP_LAHAN: string;
  STATUS_PENUTUP_LAHAN: string;
  STATUS_KEPEMILIKAN: string;
  
  // Owner identity
  NAMA: string;
  NIK: string;
  TTL: string;
  JENIS_KELAMIN: string;
  ALAMAT_KTP_BARIS_1: string;
  ALAMAT_KTP_BARIS_2: string;
  ALAMAT_KTP_BARIS_3: string;
  ALAMAT_KTP_BARIS_4: string;
  PEKERJAAN: string;
  
  // Alas Hak details
  JENIS_ALAS_HAK: string;
  NOMER_HAK: string;
  NAMA_ALAS_HAK: string;
  LUAS_YANG_ADA_PADA_ALAS_HAK: string;
  KETERANGAN_ALAS_HAK: string;
  
  // 8 Buildings
  buildings: BuildingData[];
  
  // 30 Plants
  plants: PlantData[];
  
  // Administrative and progress
  STATUS_DESA: string;
  STATUS_KEPALA: string;
  NAMA_KADES: string;
  NAMA_SAKSI_1: string;
  NAMA_SAKSI_2: string;
  nama_tim_1: string;
  nama_tim_2: string;
  TANGGAL_PELAKSANAAN: string;
  KECAMATAN: string;
  KABUPATEN: string;
  KONFIRMASI_BPN: string;
  PROGRES_PEMBERKASAN: string;
  PROGRES_UPLOAD_TRABAS: string;
  KEKURANGAN_BERKAS: string;
  KETERANGAN: string;
  
  // Google Drive links
  LINK_KTP: string;
  LINK_KK: string;
  LINK_ALAS_HAK: string;
  LINK_PERALIHAN_HAK: string;
  
  // Specific transition document links
  LINK_JUAL_BELI: string;
  LINK_KETERANGAN_WARIS: string;
  LINK_KUASA_WARIS: string;
  LINK_SURAT_KUASA: string;
  LINK_KET_BEDA_NAMA: string;
  LINK_WAKAF: string;
  LINK_KLAIM_TANAMAN: string;
  LINK_KLAIM_BANGUNAN: string;
  LINK_DOKUMEN_LAIN: string;
  LINK_DOKUMENTASI_BIDANG: string;
  LINK_DOKUMENTASI_BIDANG_2: string;
  LINK_DOKUMENTASI_BIDANG_3: string;
  LINK_WAJAH_PEMILIK: string;
  DRIVE_FOLDER_ID: string;
  
  // QC statuses
  QC_STATUS: 'PENDING' | 'APPROVED' | 'REJECTED';
  QC_NOTES: string;
  QC_BY: string;
  QC_DATE: string;

  // Syncing and additional categories
  ID_UNIK: string;
  JENIS_PERALIHAN_HAK: string;
  rowNumber?: number;

  // Land Boundaries
  BATAS_UTARA: string;
  BATAS_SELATAN: string;
  BATAS_TIMUR: string;
  BATAS_BARAT: string;
}

// Helper to generate the exact header row for Google Sheets
export const getSheetHeaders = (): string[] => {
  const baseHeaders = [
    "CODE", "DESA", "SPAN", "NOBID", "LUAS",
    "PENUTUP_LAHAN", "STATUS_PENUTUP_LAHAN", "STATUS_KEPEMILIKAN",
    "NAMA", "NIK", "TTL", "JENIS_KELAMIN",
    "ALAMAT_KTP_BARIS_1", "ALAMAT_KTP_BARIS_2", "ALAMAT_KTP_BARIS_3", "ALAMAT_KTP_BARIS_4",
    "PEKERJAAN", "JENIS_ALAS_HAK", "NOMER_HAK", "NAMA_ALAS_HAK", "LUAS_YANG_ADA_PADA_ALAS_HAK"
  ];

  // Adding 8 buildings (3 columns each)
  const buildingHeaders: string[] = [];
  for (let i = 1; i <= 8; i++) {
    buildingHeaders.push(`LUAS BANGUNAN ${i}`, `BENTUK BANGUNAN ${i}`, `JENIS BANGUNAN ${i}`);
  }

  // Adding 30 plants (6 columns each)
  const plantHeaders: string[] = [];
  for (let i = 1; i <= 30; i++) {
    plantHeaders.push(
      `JENIS TANAMAN ${i}`,
      `SUDAH MENGHASILKAN ${i}`,
      `BELUM MENGHASILKAN ${i}`,
      `KECIL ${i}`,
      `SEDANG ${i}`,
      `BESAR ${i}`
    );
  }

  const adminAndLinksHeaders = [
    "STATUS DESA", "STATUS KEPALA", "NAMA KADES", "NAMA SAKSI 1", "NAMA SAKSI 2",
    "NAMA TIM 1", "NAMA TIM 2", "TANGGAL PELAKSANAAN", "KECAMATAN", "KABUPATEN",
    "KONFIRMASI BPN", "PROGRES PEMBERKASAN", "PROGRES UPLOAD TRABAS", "KEKURANGAN BERKAS", "KETERANGAN",
    "LINK_KTP", "LINK_KK", "LINK_ALAS_HAK", "LINK_PERALIHAN_HAK",
    "QC_STATUS", "QC_NOTES", "QC_BY", "QC_DATE", "ID_UNIK", "JENIS_PERALIHAN_HAK",
    "LINK_JUAL_BELI", "LINK_KETERANGAN_WARIS", "LINK_KUASA_WARIS", "LINK_SURAT_KUASA", "LINK_KET_BEDA_NAMA", "LINK_WAKAF", "LINK_KLAIM_TANAMAN", "LINK_KLAIM_BANGUNAN", "LINK_DOKUMEN_LAIN",
    "LINK_DOKUMENTASI_BIDANG", "LINK_DOKUMENTASI_BIDANG_2", "LINK_DOKUMENTASI_BIDANG_3", "LINK_WAJAH_PEMILIK", "DRIVE_FOLDER_ID",
    "BATAS_UTARA", "BATAS_SELATAN", "BATAS_TIMUR", "BATAS_BARAT"
  ];

  return [...baseHeaders, ...buildingHeaders, ...plantHeaders, ...adminAndLinksHeaders];
};

// Maps a LandRecord object into a row array aligned with headers
export const recordToRow = (record: LandRecord): string[] => {
  const row: string[] = [
    record.CODE || "",
    record.DESA || "",
    record.SPAN || "",
    record.NOBID || "",
    record.LUAS || "",
    record.PENUTUP_LAHAN || "",
    record.STATUS_PENUTUP_LAHAN || "",
    record.STATUS_KEPEMILIKAN || "",
    record.NAMA || "",
    record.NIK || "",
    record.TTL || "",
    record.JENIS_KELAMIN || "",
    record.ALAMAT_KTP_BARIS_1 || "",
    record.ALAMAT_KTP_BARIS_2 || "",
    record.ALAMAT_KTP_BARIS_3 || "",
    record.ALAMAT_KTP_BARIS_4 || "",
    record.PEKERJAAN || "",
    record.JENIS_ALAS_HAK || "",
    record.NOMER_HAK || "",
    record.NAMA_ALAS_HAK || "",
    record.LUAS_YANG_ADA_PADA_ALAS_HAK || ""
  ];

  // Buildings (8 items, 3 fields each)
  for (let i = 0; i < 8; i++) {
    const b = record.buildings?.[i] || { luas: "", bentuk: "", jenis: "" };
    row.push(b.luas || "", b.bentuk || "", b.jenis || "");
  }

  // Plants (30 items, 6 fields each)
  for (let i = 0; i < 30; i++) {
    const p = record.plants?.[i] || { jenis: "", sudah_menghasilkan: "", belum_menghasilkan: "", kecil: "", sedang: "", besar: "" };
    row.push(
      p.jenis || "",
      p.sudah_menghasilkan || "",
      p.belum_menghasilkan || "",
      p.kecil || "",
      p.sedang || "",
      p.besar || ""
    );
  }

  row.push(
    record.STATUS_DESA || "",
    record.STATUS_KEPALA || "",
    record.NAMA_KADES || "",
    record.NAMA_SAKSI_1 || "",
    record.NAMA_SAKSI_2 || "",
    record.nama_tim_1 || "",
    record.nama_tim_2 || "",
    record.TANGGAL_PELAKSANAAN || "",
    record.KECAMATAN || "",
    record.KABUPATEN || "",
    record.KONFIRMASI_BPN || "",
    record.PROGRES_PEMBERKASAN || "",
    record.PROGRES_UPLOAD_TRABAS || "",
    record.KEKURANGAN_BERKAS || "",
    record.KETERANGAN || "",
    record.LINK_KTP || "",
    record.LINK_KK || "",
    record.LINK_ALAS_HAK || "",
    record.LINK_PERALIHAN_HAK || "",
    record.QC_STATUS || "PENDING",
    record.QC_NOTES || "",
    record.QC_BY || "",
    record.QC_DATE || "",
    record.ID_UNIK || "",
    record.JENIS_PERALIHAN_HAK || "",
    record.LINK_JUAL_BELI || "",
    record.LINK_KETERANGAN_WARIS || "",
    record.LINK_KUASA_WARIS || "",
    record.LINK_SURAT_KUASA || "",
    record.LINK_KET_BEDA_NAMA || "",
    record.LINK_WAKAF || "",
    record.LINK_KLAIM_TANAMAN || "",
    record.LINK_KLAIM_BANGUNAN || "",
    record.LINK_DOKUMEN_LAIN || "",
    record.LINK_DOKUMENTASI_BIDANG || "",
    record.LINK_DOKUMENTASI_BIDANG_2 || "",
    record.LINK_DOKUMENTASI_BIDANG_3 || "",
    record.LINK_WAJAH_PEMILIK || "",
    record.DRIVE_FOLDER_ID || "",
    record.BATAS_UTARA || "",
    record.BATAS_SELATAN || "",
    record.BATAS_TIMUR || "",
    record.BATAS_BARAT || ""
  );

  return row;
};

// Parses a row array back to a LandRecord object based on index mapping
export const rowToRecord = (row: any[], index?: number): LandRecord => {
  const getVal = (index: number): string => {
    if (index >= row.length || row[index] === undefined || row[index] === null) return "";
    return String(row[index]);
  };

  const record: Partial<LandRecord> = {
    CODE: getVal(0),
    DESA: getVal(1),
    SPAN: getVal(2),
    NOBID: getVal(3),
    LUAS: getVal(4),
    PENUTUP_LAHAN: getVal(5),
    STATUS_PENUTUP_LAHAN: getVal(6),
    STATUS_KEPEMILIKAN: getVal(7),
    NAMA: getVal(8),
    NIK: getVal(9),
    TTL: getVal(10),
    JENIS_KELAMIN: getVal(11),
    ALAMAT_KTP_BARIS_1: getVal(12),
    ALAMAT_KTP_BARIS_2: getVal(13),
    ALAMAT_KTP_BARIS_3: getVal(14),
    ALAMAT_KTP_BARIS_4: getVal(15),
    PEKERJAAN: getVal(16),
    JENIS_ALAS_HAK: getVal(17),
    NOMER_HAK: getVal(18),
    NAMA_ALAS_HAK: getVal(19),
    LUAS_YANG_ADA_PADA_ALAS_HAK: getVal(20),
    KETERANGAN_ALAS_HAK: "SESUAI",
  };

  // Buildings parsing (Starts at index 21)
  const buildings: BuildingData[] = [];
  let buildStartIdx = 21;
  for (let i = 0; i < 8; i++) {
    buildings.push({
      luas: getVal(buildStartIdx),
      bentuk: getVal(buildStartIdx + 1),
      jenis: getVal(buildStartIdx + 2)
    });
    buildStartIdx += 3;
  }
  record.buildings = buildings;

  // Plants parsing (Starts at index 45)
  const plants: PlantData[] = [];
  let plantStartIdx = 45;
  for (let i = 0; i < 30; i++) {
    plants.push({
      jenis: getVal(plantStartIdx),
      sudah_menghasilkan: getVal(plantStartIdx + 1),
      belum_menghasilkan: getVal(plantStartIdx + 2),
      kecil: getVal(plantStartIdx + 3),
      sedang: getVal(plantStartIdx + 4),
      besar: getVal(plantStartIdx + 5)
    });
    plantStartIdx += 6;
  }
  record.plants = plants;

  // Admin and progress fields (Starts at index 225)
  let adminStartIdx = 225;
  record.STATUS_DESA = getVal(adminStartIdx);
  record.STATUS_KEPALA = getVal(adminStartIdx + 1);
  record.NAMA_KADES = getVal(adminStartIdx + 2);
  record.NAMA_SAKSI_1 = getVal(adminStartIdx + 3);
  record.NAMA_SAKSI_2 = getVal(adminStartIdx + 4);
  record.nama_tim_1 = getVal(adminStartIdx + 5);
  record.nama_tim_2 = getVal(adminStartIdx + 6);
  record.TANGGAL_PELAKSANAAN = getVal(adminStartIdx + 7);
  record.KECAMATAN = getVal(adminStartIdx + 8);
  record.KABUPATEN = getVal(adminStartIdx + 9);
  record.KONFIRMASI_BPN = getVal(adminStartIdx + 10);
  record.PROGRES_PEMBERKASAN = getVal(adminStartIdx + 11);
  record.PROGRES_UPLOAD_TRABAS = getVal(adminStartIdx + 12);
  record.KEKURANGAN_BERKAS = getVal(adminStartIdx + 13);
  record.KETERANGAN = getVal(adminStartIdx + 14);
  
  record.LINK_KTP = getVal(adminStartIdx + 15);
  record.LINK_KK = getVal(adminStartIdx + 16);
  record.LINK_ALAS_HAK = getVal(adminStartIdx + 17);
  record.LINK_PERALIHAN_HAK = getVal(adminStartIdx + 18);

  const qcStatusVal = getVal(adminStartIdx + 19);
  record.QC_STATUS = (qcStatusVal === 'APPROVED' || qcStatusVal === 'REJECTED' ? qcStatusVal : 'PENDING') as any;
  record.QC_NOTES = getVal(adminStartIdx + 20);
  record.QC_BY = getVal(adminStartIdx + 21);
  record.QC_DATE = getVal(adminStartIdx + 22);

  // Syncing ID and extra metadata
  let idUnik = getVal(adminStartIdx + 23);
  if (!idUnik) {
    // Generate a deterministic and backward compatible ID from CODE or a random suffix
    const suffix = index !== undefined ? `_${index}` : '';
    idUnik = record.CODE ? `ID-${record.CODE.replace(/[\s-]/g, '_')}${suffix}` : `ID-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
  }
  record.ID_UNIK = idUnik;
  record.JENIS_PERALIHAN_HAK = getVal(adminStartIdx + 24) || "JUAL-BELI";
  if (index !== undefined) {
    record.rowNumber = index + 2;
  }

  record.LINK_JUAL_BELI = getVal(adminStartIdx + 25);
  record.LINK_KETERANGAN_WARIS = getVal(adminStartIdx + 26);
  record.LINK_KUASA_WARIS = getVal(adminStartIdx + 27);
  record.LINK_SURAT_KUASA = getVal(adminStartIdx + 28);
  record.LINK_KET_BEDA_NAMA = getVal(adminStartIdx + 29);
  record.LINK_WAKAF = getVal(adminStartIdx + 30);
  record.LINK_KLAIM_TANAMAN = getVal(adminStartIdx + 31);
  record.LINK_KLAIM_BANGUNAN = getVal(adminStartIdx + 32);
  record.LINK_DOKUMEN_LAIN = getVal(adminStartIdx + 33);
  record.LINK_DOKUMENTASI_BIDANG = getVal(adminStartIdx + 34);
  record.LINK_DOKUMENTASI_BIDANG_2 = getVal(adminStartIdx + 35);
  record.LINK_DOKUMENTASI_BIDANG_3 = getVal(adminStartIdx + 36);
  record.LINK_WAJAH_PEMILIK = getVal(adminStartIdx + 37);
  record.DRIVE_FOLDER_ID = getVal(adminStartIdx + 38);

  record.BATAS_UTARA = getVal(adminStartIdx + 39);
  record.BATAS_SELATAN = getVal(adminStartIdx + 40);
  record.BATAS_TIMUR = getVal(adminStartIdx + 41);
  record.BATAS_BARAT = getVal(adminStartIdx + 42);

  return record as LandRecord;
};

export const createEmptyRecord = (): LandRecord => {
  const buildings: BuildingData[] = Array.from({ length: 8 }, () => ({ luas: "", bentuk: "", jenis: "" }));
  const plants: PlantData[] = Array.from({ length: 30 }, () => ({
    jenis: "", sudah_menghasilkan: "", belum_menghasilkan: "", kecil: "", sedang: "", besar: ""
  }));

  return {
    CODE: "", DESA: "", SPAN: "", NOBID: "", LUAS: "",
    PENUTUP_LAHAN: "SAWAH", STATUS_PENUTUP_LAHAN: "TANAH MASYARAKAT", STATUS_KEPEMILIKAN: "PEMILIK DIKETAHUI",
    NAMA: "", NIK: "", TTL: "", JENIS_KELAMIN: "Laki-laki",
    ALAMAT_KTP_BARIS_1: "", ALAMAT_KTP_BARIS_2: "", ALAMAT_KTP_BARIS_3: "", ALAMAT_KTP_BARIS_4: "",
    PEKERJAAN: "", JENIS_ALAS_HAK: "SERTIPIKAT HAK MILIK", NOMER_HAK: "", NAMA_ALAS_HAK: "", LUAS_YANG_ADA_PADA_ALAS_HAK: "", KETERANGAN_ALAS_HAK: "SESUAI",
    buildings,
    plants,
    STATUS_DESA: "", STATUS_KEPALA: "", NAMA_KADES: "", NAMA_SAKSI_1: "", NAMA_SAKSI_2: "",
    nama_tim_1: "", nama_tim_2: "", TANGGAL_PELAKSANAAN: "", KECAMATAN: "", KABUPATEN: "",
    KONFIRMASI_BPN: "", PROGRES_PEMBERKASAN: "", PROGRES_UPLOAD_TRABAS: "", KEKURANGAN_BERKAS: "", KETERANGAN: "",
    LINK_KTP: "", LINK_KK: "", LINK_ALAS_HAK: "", LINK_PERALIHAN_HAK: "",
    QC_STATUS: "PENDING", QC_NOTES: "", QC_BY: "", QC_DATE: "",
    ID_UNIK: `ID-${Math.random().toString(36).substring(2, 11).toUpperCase()}`,
    JENIS_PERALIHAN_HAK: "JUAL-BELI",
    LINK_JUAL_BELI: "",
    LINK_KETERANGAN_WARIS: "",
    LINK_KUASA_WARIS: "",
    LINK_SURAT_KUASA: "",
    LINK_KET_BEDA_NAMA: "",
    LINK_WAKAF: "",
    LINK_KLAIM_TANAMAN: "",
    LINK_KLAIM_BANGUNAN: "",
    LINK_DOKUMEN_LAIN: "",
    LINK_DOKUMENTASI_BIDANG: "",
    LINK_DOKUMENTASI_BIDANG_2: "",
    LINK_DOKUMENTASI_BIDANG_3: "",
    LINK_WAJAH_PEMILIK: "",
    DRIVE_FOLDER_ID: "",
    BATAS_UTARA: "",
    BATAS_SELATAN: "",
    BATAS_TIMUR: "",
    BATAS_BARAT: ""
  };
};

export function compareLandRecords(a: LandRecord, b: LandRecord): number {
  // Sort by DESA first (case-insensitive, natural sort)
  const desaA = a.DESA || '';
  const desaB = b.DESA || '';
  const desaComp = desaA.localeCompare(desaB, undefined, { numeric: true, sensitivity: 'base' });
  if (desaComp !== 0) return desaComp;

  // Sort by SPAN second (case-insensitive, natural sort)
  const spanA = a.SPAN || '';
  const spanB = b.SPAN || '';
  const spanComp = spanA.localeCompare(spanB, undefined, { numeric: true, sensitivity: 'base' });
  if (spanComp !== 0) return spanComp;

  // Sort by NOBID third (case-insensitive, natural sort)
  const nobidA = a.NOBID || '';
  const nobidB = b.NOBID || '';
  return nobidA.localeCompare(nobidB, undefined, { numeric: true, sensitivity: 'base' });
}

export interface OperatorConfig {
  id: string; // Document/username ID
  username: string;
  password?: string; // Stored in plain text for simplicity as requested/used in this admin setup
  name: string;
  role: 'ADMIN' | 'FIELD' | 'QC';
  projectId: string; // The specific project ID they are restricted to (or 'all')
  createdAt: number;
}

