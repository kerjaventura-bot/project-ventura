import { jsPDF } from 'jspdf';
import { type LandRecord } from '../types';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { loadGeoJSONLayerDoc } from './geojsonStorage';

const findPropInObj = (obj: any, keys: string[]): string => {
  if (!obj) return '';
  const objKeys = Object.keys(obj);
  for (const k of keys) {
    const found = objKeys.find(ok => ok.toLowerCase() === k.toLowerCase());
    if (found && obj[found] !== undefined && obj[found] !== null) {
      return String(obj[found]).trim();
    }
  }
  return '';
};

const normalizeString = (val: string): string => {
  return String(val || '').trim().toLowerCase();
};

const normalizeNobid = (val: string): string => {
  const s = normalizeString(val);
  return s.replace(/^0+/, '') || '0';
};

const normalizeSpan = (val: string): string => {
  const s = normalizeString(val);
  return s
    .replace(/[\s\-_.]/g, '')
    .replace(/0+(\d+)/g, '$1');
};

const isRecordMatched = (
  featNobid: string,
  featDesa: string,
  featSpan: string,
  recordNobid: string,
  recordDesa: string,
  recordSpan: string
): boolean => {
  const nFeatNobid = normalizeNobid(featNobid);
  const nRecordNobid = normalizeNobid(recordNobid);
  if (!nFeatNobid || !nRecordNobid || nFeatNobid !== nRecordNobid) {
    return false;
  }

  const nFeatDesa = normalizeString(featDesa);
  const nRecordDesa = normalizeString(recordDesa);
  if (nFeatDesa && nRecordDesa && nFeatDesa.length >= 3 && nRecordDesa.length >= 3) {
    if (!nFeatDesa.includes(nRecordDesa) && !nRecordDesa.includes(nFeatDesa)) {
      return false;
    }
  }

  const nFeatSpan = normalizeSpan(featSpan);
  const nRecordSpan = normalizeSpan(recordSpan);
  if (nFeatSpan && nRecordSpan && nFeatSpan.length >= 2 && nRecordSpan.length >= 2) {
    if (!nFeatSpan.includes(nRecordSpan) && !nRecordSpan.includes(nFeatSpan)) {
      return false;
    }
  }

  return true;
};

function latLngToUTM49S(lng: number, lat: number): { x: number; y: number } {
  // WGS84 constants
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = (a*a - b*b) / (a*a);
  const eOct2 = e2 / (1 - e2);
  
  const k0 = 0.9996;
  const falseEasting = 500000.0;
  const falseNorthing = 10000000.0; // Southern hemisphere offset
  
  // Central meridian for UTM Zone 49 is 111 degrees East
  const centralMeridian = 111.0 * Math.PI / 180;
  
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;
  
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = eOct2 * Math.cos(latRad) * Math.cos(latRad);
  const A = (lngRad - centralMeridian) * Math.cos(latRad);
  
  const M = a * (
    (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2/256) * latRad
    - (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024) * Math.sin(2*latRad)
    + (15*e2*e2/256 + 45*e2*e2*e2/1024) * Math.sin(4*latRad)
    - (35*e2*e2*e2/3072) * Math.sin(6*latRad)
  );
  
  const x = falseEasting + k0 * N * (
    A + (1 - T + C) * A*A*A / 6
    + (5 - 18*T + T*T + 72*C - 58*eOct2) * A*A*A*A*A / 120
  );
  
  const y = falseNorthing + k0 * (
    M + N * Math.tan(latRad) * (
      A*A / 2 + (5 - T + 9*C + 4*C*C) * A*A*A*A / 24
      + (61 - 58*T + T*T + 600*C - 330*eOct2) * A*A*A*A*A*A / 720
    )
  );
  
  return { x, y };
}

/**
 * Converts a Google Drive URL or standard URL into embeddable direct image URLs.
 */
function getDirectImageUrls(url: string): string[] {
  if (!url || typeof url !== 'string') return [];
  const trimmed = url.trim();
  if (!trimmed) return [];
  
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) {
    return [trimmed];
  }

  let fileId = '';
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) {
    fileId = dMatch[1];
  } else {
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      fileId = idMatch[1];
    }
  }

  if (fileId) {
    return [
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      trimmed
    ];
  }

  return [trimmed];
}

/**
 * Helper to load an image from URL, resize it to a maximum width to reduce file size, and return its Base64 representation.
 */
async function loadImageAsBase64(url: string, maxWidth: number = 800, isLogo: boolean = false): Promise<string> {
  if (!url) return '';
  const candidateUrls = getDirectImageUrls(url);
  if (candidateUrls.length === 0) return '';

  for (const srcUrl of candidateUrls) {
    if (srcUrl.startsWith('data:image/')) return srcUrl;

    const result = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let w = img.width || 400;
          let h = img.height || 300;
          
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          
          canvas.width = Math.max(w, 1);
          canvas.height = Math.max(h, 1);
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('');
            return;
          }
          
          // Fill pure white background first so transparent PNG logos render on white background, not black!
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);

          ctx.drawImage(img, 0, 0, w, h);
          if (isLogo) {
            resolve(canvas.toDataURL('image/png'));
          } else {
            // Compress photos with high-efficiency JPEG format
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          }
        } catch (err) {
          console.warn('Canvas image drawing error:', err);
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = srcUrl;
    });

    if (result && result.startsWith('data:image/')) {
      return result;
    }
  }

  // Fallback: try direct fetch as Blob -> FileReader with canvas compression
  for (const srcUrl of candidateUrls) {
    try {
      const res = await fetch(srcUrl);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) {
          const blobUrl = URL.createObjectURL(blob);
          const compressed = await new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                let w = img.width || 400;
                let h = img.height || 300;
                if (w > maxWidth) {
                  h = Math.round((h * maxWidth) / w);
                  w = maxWidth;
                }
                canvas.width = Math.max(w, 1);
                canvas.height = Math.max(h, 1);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillRect(0, 0, w, h);
                  ctx.drawImage(img, 0, 0, w, h);
                  if (isLogo) {
                    resolve(canvas.toDataURL('image/png'));
                  } else {
                    resolve(canvas.toDataURL('image/jpeg', 0.72));
                  }
                  return;
                }
              } catch (e) {}
              resolve('');
            };
            img.onerror = () => resolve('');
            img.src = blobUrl;
          });
          URL.revokeObjectURL(blobUrl);
          if (compressed && compressed.startsWith('data:image/')) {
            return compressed;
          }
        }
      }
    } catch {
      // ignore fetch errors
    }
  }

  return '';
}

/**
 * Generates a beautiful, high-fidelity 2-page Formulir Inventarisasi PDF
 * based on the provided LandRecord and Project Name.
 */
export async function generateInventoryPDF(record: LandRecord, projectName: string): Promise<jsPDF> {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Set A4 dimensions
  const pageWidth = 210;
  const pageHeight = 297;
  const leftMargin = 15;
  const rightMargin = 195;
  const contentWidth = rightMargin - leftMargin; // 180mm

  // Preload logo images with crisp resolution
  let danantaraBase64 = '';
  let idsurveyBase64 = '';
  let surveyorBase64 = '';

  try {
    danantaraBase64 = await loadImageAsBase64('/danantara.png', 500, true);
  } catch (e) {
    console.warn('Failed to load danantara.png:', e);
  }

  try {
    idsurveyBase64 = await loadImageAsBase64('/idsurvey.png', 500, true);
  } catch (e) {
    console.warn('Failed to load idsurvey.png:', e);
  }

  try {
    surveyorBase64 = await loadImageAsBase64('/surveyor.png', 500, true);
  } catch (e) {
    console.warn('Failed to load surveyor.png:', e);
  }

  // Formatted date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Color Palette
  const darkSlate = [15, 23, 42]; // #0f172a
  const textGray = [55, 65, 81]; // #374151
  const borderGray = [209, 213, 219]; // #d1d5db
  const primaryBlue = [3, 105, 161]; // #0369a1
  const accentRed = [185, 28, 28]; // #b91c1c
  const tealAccent = [13, 148, 136]; // #0d9488

  // Helper function to draw the elegant corporate header on both pages
  const drawPageHeader = (pNum: number) => {
    // Header bottom line
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.2);
    doc.line(15, 24, 195, 24);

    // 1. Danantara Indonesia Logo (Left side)
    if (danantaraBase64) {
      // ratio: 3.798. height: 8.5mm, width: 8.5 * 3.798 = 32.28mm.
      doc.addImage(danantaraBase64, 'PNG', 15, 10.5, 32.28, 8.5, undefined, 'NONE');
    } else {
      // Draw a premium gold & crimson corporate crest
      doc.setFillColor(178, 34, 34); // Crimson
      doc.rect(15, 11, 4, 8, 'F');
      doc.setFillColor(212, 175, 55); // Gold
      doc.rect(19, 11, 2, 8, 'F');
      doc.setFillColor(15, 23, 42); // Dark slate
      doc.rect(21, 11, 1, 8, 'F');
      
      // Draw stylized layered triangles (crown/crest) above
      doc.setFillColor(178, 34, 34);
      doc.triangle(15, 11, 19, 11, 17, 8, 'F');
      doc.setFillColor(212, 175, 55);
      doc.triangle(19, 11, 21, 11, 20, 8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('DANANTARA', 24, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('REPUBLIK INDONESIA', 24, 18);
    }

    // 2. ID Survey Logo (Middle)
    if (idsurveyBase64) {
      // ratio: 3.255. height: 8.5mm, width: 8.5 * 3.255 = 27.67mm.
      // center it: 105 - (27.67 / 2) = 91.17
      doc.addImage(idsurveyBase64, 'PNG', 91.17, 10.5, 27.67, 8.5, undefined, 'NONE');
    } else {
      // Draw a modern holding icon: circle enclosing checkmark
      doc.setFillColor(2, 132, 199); // Blue
      doc.circle(92, 13.5, 3, 'F');
      doc.setFillColor(255, 255, 255); // white punch hole
      doc.circle(92, 13.5, 1.8, 'F');
      
      // Green check mark on top
      doc.setDrawColor(16, 185, 129); // Green
      doc.setLineWidth(0.6);
      doc.line(91.5, 13.5, 92.5, 14.5);
      doc.line(92.5, 14.5, 94.5, 12.5);

      // ID Survey Typography
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('id', 97, 15);
      doc.setFont('helvetica', 'normal');
      doc.text('survey', 100.5, 15);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Testing · Inspection · Certification', 105, 19, { align: 'center' });
    }

    // 3. Surveyor Indonesia Logo (Right side)
    if (surveyorBase64) {
      // ratio: 1.414. width: 17mm, height: 17 / 1.414 = 12.02mm.
      // x: 195 - 17 = 178
      doc.addImage(surveyorBase64, 'PNG', 178, 8, 17, 12.02, undefined, 'NONE');
    } else {
      const xRight = 171;
      // Draw globe icon with latitude/longitude lines
      doc.setDrawColor(2, 132, 199); // Blue
      doc.setLineWidth(0.2);
      doc.circle(xRight - 4, 14, 3, 'S'); // Outer circle
      doc.ellipse(xRight - 4, 14, 1.2, 3, 'S'); // Longitude arc
      doc.line(xRight - 7, 14, xRight - 1, 14); // Equator
      
      // Add corporate brand name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(2, 132, 199); // Brand Blue
      doc.text('SURVEYOR', xRight + 1, 13);
      doc.text('INDONESIA', xRight + 1, 16);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Member of ID Survey', xRight + 1, 19);
    }
  };

  // Helper function to draw contact info footer at the bottom of both pages
  const drawPageFooter = (pNum: number, totalPages: number = 4) => {
    // Top border line
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.15);
    doc.line(15, 282, 195, 282);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // Slate-500

    // Center phone & email
    const phoneText = '(62-24) 845 0918';
    const emailText = 'surveyorindonesia@ptsi.co.id';
    const webText = 'www.ptsi.co.id';

    doc.text(`Telp: ${phoneText}   |   Email: ${emailText}`, 105, 286, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(webText, 105, 290, { align: 'center' });

    // Page indicator
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Halaman ${pNum} dari ${totalPages}`, 195, 290, { align: 'right' });
    doc.text(`Kode Lahan: ${record.CODE}`, 15, 290);
  };

  // Helper to draw clean table grids with key-value rows
  const drawKeyValueTable = (
    startY: number, 
    data: { label: string; value: string }[], 
    columnWidths: [number, number, number] // [labelWidth, spacerWidth, valueWidth]
  ): number => {
    let currentY = startY;
    const rowHeight = 6.2;
    const tableWidth = contentWidth;

    // Outer table border
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.3);
    doc.rect(leftMargin, startY, tableWidth, data.length * rowHeight);

    data.forEach((row, idx) => {
      // Row background zebra striping (alternate)
      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 251); // gray-50
        doc.rect(leftMargin + 0.15, currentY + 0.15, tableWidth - 0.3, rowHeight - 0.3, 'F');
      }

      // Horizontal dividers
      if (idx > 0) {
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.15);
        doc.line(leftMargin, currentY, rightMargin, currentY);
      }

      // Vertical columns lines
      doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.setLineWidth(0.2);
      
      const col1Right = leftMargin + columnWidths[0];
      const col2Right = col1Right + columnWidths[1];

      // Inner vertical lines
      doc.line(col1Right, currentY, col1Right, currentY + rowHeight);
      doc.line(col2Right, currentY, col2Right, currentY + rowHeight);

      // Labels Text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text(`${idx + 1}.`, leftMargin + 2, currentY + 4.2);
      doc.text(row.label, leftMargin + 6, currentY + 4.2);

      // Spacer Column (usually contains ':')
      doc.text(':', col1Right + 1.8, currentY + 4.2);

      // Value text
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(row.value || '-', col2Right + 3, currentY + 4.2);

      currentY += rowHeight;
    });

    return currentY;
  };


  // ==========================================
  // PAGE 1: Transmisi, Pihak Berhak, Lahan, Tanah & Bangunan
  // ==========================================
  drawPageHeader(1);

  // Document main title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('FORMULIR INVENTARISASI', 105, 31, { align: 'center' });
  doc.text('PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK', 105, 36, { align: 'center' });
  doc.setFontSize(10);
  doc.text(projectName.toUpperCase(), 105, 41, { align: 'center' });

  let y = 47;

  // --- SECTION I: DATA JARINGAN TRANSMISI ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('I. DATA JARINGAN TRANSMISI', leftMargin, y);
  
  y += 3;
  const section1Data = [
    { label: 'Jaringan Transmisi', value: projectName },
    { label: 'Nomor SPAN (Tower)', value: record.SPAN },
    { label: 'Nomor Bidang Lahan', value: record.NOBID }
  ];
  y = drawKeyValueTable(y, section1Data, [45, 6, 129]);

  y += 5;

  // --- SECTION II: DATA PIHAK YANG BERHAK ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('II. DATA PIHAK YANG BERHAK', leftMargin, y);

  y += 3;
  const section2Data = [
    { label: 'Status Kepemilikan', value: record.STATUS_KEPEMILIKAN },
    { label: 'Nama Lengkap Pemilik', value: record.NAMA },
    { label: 'Pekerjaan', value: record.PEKERJAAN },
    { label: 'Nomor Identitas (NIK)', value: record.NIK }
  ];
  y = drawKeyValueTable(y, section2Data, [45, 6, 129]);

  y += 5;

  // --- SECTION III: DATA BIDANG TANAH ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('III. DATA BIDANG TANAH', leftMargin, y);

  y += 3;
  const section3Data = [
    { label: 'Koordinat Universal Transverse Mercator', value: '49 S (Zone UTM)' },
    { label: 'Desa / Kelurahan', value: record.DESA ? (record.DESA.toUpperCase().startsWith('DESA') || record.DESA.toUpperCase().startsWith('KELURAHAN') ? record.DESA : `Desa ${record.DESA}`) : '-' },
    { label: 'Kecamatan', value: record.KECAMATAN },
    { label: 'Kabupaten/Kota', value: record.KABUPATEN },
    { label: 'Jenis Bukti Kepenguasaan / Kepemilikan', value: `${record.JENIS_ALAS_HAK} ${record.NOMER_HAK ? '(No: ' + record.NOMER_HAK + ')' : ''}` },
    { label: 'Penutup Lahan / Kondisi Fisik Lahan', value: record.PENUTUP_LAHAN }
  ];
  y = drawKeyValueTable(y, section3Data, [62, 6, 112]);

  y += 5;

  // --- SECTION IV: DATA TANAH DAN BANGUNAN ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('IV. DATA TANAH DAN BANGUNAN', leftMargin, y);

  y += 3;
  
  // Custom styled table for buildings and land
  const table4Widths = [12, 88, 35, 45]; // Total = 180mm
  const col1 = leftMargin;
  const col2 = col1 + table4Widths[0];
  const col3 = col2 + table4Widths[1];
  const col4 = col3 + table4Widths[2];

  // Header row for Table IV
  doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.rect(leftMargin, y, contentWidth, 6.5, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('NO', col1 + 4, y + 4.5);
  doc.text('URAIAN', col2 + 4, y + 4.5);
  doc.text('LUAS (M²)', col3 + 4, y + 4.5);
  doc.text('KETERANGAN / SPESIFIKASI', col4 + 4, y + 4.5);

  y += 6.5;

  // Compile Tanah + 5 Buildings to print
  const table4Rows = [
    { no: '1.', uraian: 'Luas Tanah', luas: record.LUAS, ket: `Kondisi: ${record.PENUTUP_LAHAN}` },
    { 
      no: '2.', 
      uraian: 'Luas Bangunan 1', 
      luas: record.buildings?.[0]?.luas || '', 
      ket: record.buildings?.[0]?.luas ? `${record.buildings[0].bentuk || ''} · ${record.buildings[0].jenis || ''}` : '' 
    },
    { 
      no: '3.', 
      uraian: 'Luas Bangunan 2', 
      luas: record.buildings?.[1]?.luas || '', 
      ket: record.buildings?.[1]?.luas ? `${record.buildings[1].bentuk || ''} · ${record.buildings[1].jenis || ''}` : '' 
    },
    { 
      no: '4.', 
      uraian: 'Luas Bangunan 3', 
      luas: record.buildings?.[2]?.luas || '', 
      ket: record.buildings?.[2]?.luas ? `${record.buildings[2].bentuk || ''} · ${record.buildings[2].jenis || ''}` : '' 
    },
    { 
      no: '5.', 
      uraian: 'Luas Bangunan 4', 
      luas: record.buildings?.[3]?.luas || '', 
      ket: record.buildings?.[3]?.luas ? `${record.buildings[3].bentuk || ''} · ${record.buildings[3].jenis || ''}` : '' 
    },
    { 
      no: '6.', 
      uraian: 'Luas Bangunan 5', 
      luas: record.buildings?.[4]?.luas || '', 
      ket: record.buildings?.[4]?.luas ? `${record.buildings[4].bentuk || ''} · ${record.buildings[4].jenis || ''}` : '' 
    }
  ];

  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.3);
  doc.rect(leftMargin, y, contentWidth, table4Rows.length * 6);

  table4Rows.forEach((row, idx) => {
    // Alternating background
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(leftMargin + 0.15, y + 0.15, contentWidth - 0.3, 5.7, 'F');
    }

    // Dividers
    if (idx > 0) {
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, y, rightMargin, y);
    }

    // Vertical line split
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.2);
    doc.line(col2, y, col2, y + 6);
    doc.line(col3, y, col3, y + 6);
    doc.line(col4, y, col4, y + 6);

    // Text Values
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text(row.no, col1 + 4, y + 4.2);
    doc.text(row.uraian, col2 + 4, y + 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(row.luas ? `${row.luas} m²` : '-', col3 + 4, y + 4.2);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(row.ket || '-', col4 + 4, y + 4.2);

    y += 6;
  });

  drawPageFooter(1);


  // ==========================================
  // PAGE 2: Daftar Tanaman & Blok Tanda Tangan
  // ==========================================
  doc.addPage();
  let currentPNum = 2;
  drawPageHeader(currentPNum);

  let y2 = 30;

  // --- SECTION V: DATA TANAMAN ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('V. DATA TANAMAN', leftMargin, y2);

  y2 += 3.5;

  // Setup complex crop table layout
  const colWidthsCrop = [12, 58, 55, 55]; // NO, JENIS, TANAMAN BUAH (PROD/NON-PROD), TANAMAN KERAS (KECIL/SEDANG/BESAR)
  const subWidthsBuah = [27.5, 27.5];
  const subWidthsKeras = [18.3, 18.3, 18.4];

  const xCol1 = leftMargin;
  const xCol2 = xCol1 + colWidthsCrop[0];
  const xCol3 = xCol2 + colWidthsCrop[1];
  const xCol4 = xCol3 + colWidthsCrop[2];

  const drawCropTableHeader = (startY: number) => {
    doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.rect(leftMargin, startY, contentWidth, 11, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    
    doc.text('NO', xCol1 + 4, startY + 7, { align: 'left' });
    doc.text('JENIS TANAMAN', xCol2 + 6, startY + 7, { align: 'left' });
    
    doc.text('JUMLAH TANAMAN BUAH', xCol3 + colWidthsCrop[2] / 2, startY + 3.5, { align: 'center' });
    doc.text('PRODUKTIF', xCol3 + subWidthsBuah[0] / 2, startY + 8.5, { align: 'center' });
    doc.text('NON-PRODUKTIF', xCol3 + subWidthsBuah[0] + subWidthsBuah[1] / 2, startY + 8.5, { align: 'center' });

    doc.text('JUMLAH TANAMAN KERAS', xCol4 + colWidthsCrop[3] / 2, startY + 3.5, { align: 'center' });
    doc.text('KECIL', xCol4 + subWidthsKeras[0] / 2, startY + 8.5, { align: 'center' });
    doc.text('SEDANG', xCol4 + subWidthsKeras[0] + subWidthsKeras[1] / 2, startY + 8.5, { align: 'center' });
    doc.text('BESAR', xCol4 + subWidthsKeras[0] + subWidthsKeras[1] + subWidthsKeras[2] / 2, startY + 8.5, { align: 'center' });

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.line(xCol3, startY + 5, rightMargin, startY + 5);
    doc.line(xCol3 + subWidthsBuah[0], startY + 5, xCol3 + subWidthsBuah[0], startY + 11);
    doc.line(xCol4 + subWidthsKeras[0], startY + 5, xCol4 + subWidthsKeras[0], startY + 11);
    doc.line(xCol4 + subWidthsKeras[0] + subWidthsKeras[1], startY + 5, xCol4 + subWidthsKeras[0] + subWidthsKeras[1], startY + 11);
  };

  drawCropTableHeader(y2);
  y2 += 11;

  // Filter crops with name
  const activePlants = (record.plants || []).filter(p => p.jenis && p.jenis.trim() !== "");
  
  // Total target rows (30 is max)
  const totalPlantRows = Math.max(14, Math.min(30, activePlants.length));
  const plantRowsToDraw: any[] = [];
  
  for (let i = 0; i < totalPlantRows; i++) {
    if (i < activePlants.length) {
      plantRowsToDraw.push(activePlants[i]);
    } else {
      plantRowsToDraw.push({ jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' });
    }
  }

  const rowHeight2 = 5.2;

  plantRowsToDraw.forEach((row, idx) => {
    // Check if we need to add a page due to height overflow
    if (y2 + rowHeight2 > 265) {
      doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.setLineWidth(0.3);
      doc.line(leftMargin, y2, rightMargin, y2);

      doc.addPage();
      currentPNum++;
      drawPageHeader(currentPNum);
      y2 = 30;
      drawCropTableHeader(y2);
      y2 += 11;
    }

    // Zebra Striping
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(leftMargin + 0.15, y2 + 0.15, contentWidth - 0.3, rowHeight2 - 0.3, 'F');
    }

    // Dividers
    if (idx > 0) {
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, y2, rightMargin, y2);
    }

    // Vertical lines
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.2);
    doc.line(xCol1, y2, xCol1, y2 + rowHeight2);
    doc.line(xCol2, y2, xCol2, y2 + rowHeight2);
    doc.line(xCol3, y2, xCol3, y2 + rowHeight2);
    doc.line(xCol4, y2, xCol4, y2 + rowHeight2);
    doc.line(rightMargin, y2, rightMargin, y2 + rowHeight2);
    
    // Sub-vertical lines
    doc.line(xCol3 + subWidthsBuah[0], y2, xCol3 + subWidthsBuah[0], y2 + rowHeight2);
    doc.line(xCol4 + subWidthsKeras[0], y2, xCol4 + subWidthsKeras[0], y2 + rowHeight2);
    doc.line(xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2, xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2 + rowHeight2);

    // Horizontal border at bottom
    doc.line(leftMargin, y2 + rowHeight2, rightMargin, y2 + rowHeight2);

    // Write text values
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text(`${idx + 1}`, xCol1 + 4, y2 + 3.6);

    doc.setFont('helvetica', row.jenis ? 'bold' : 'normal');
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(row.jenis || '', xCol2 + 4, y2 + 3.6);

    doc.setFont('helvetica', 'bold');
    doc.text(row.sudah_menghasilkan || (row.jenis ? '0' : ''), xCol3 + subWidthsBuah[0]/2, y2 + 3.6, { align: 'center' });
    doc.text(row.belum_menghasilkan || (row.jenis ? '0' : ''), xCol3 + subWidthsBuah[0] + subWidthsBuah[1]/2, y2 + 3.6, { align: 'center' });

    doc.text(row.kecil || (row.jenis ? '0' : ''), xCol4 + subWidthsKeras[0]/2, y2 + 3.6, { align: 'center' });
    doc.text(row.sedang || (row.jenis ? '0' : ''), xCol4 + subWidthsKeras[0] + subWidthsKeras[1]/2, y2 + 3.6, { align: 'center' });
    doc.text(row.besar || (row.jenis ? '0' : ''), xCol4 + subWidthsKeras[0] + subWidthsKeras[1] + subWidthsKeras[2]/2, y2 + 3.6, { align: 'center' });

    y2 += rowHeight2;
  });

  y2 += 6;

  // --- DECLARATION TEXT BLOCK ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  
  const closingText = 'Yang bertanda tangan di bawah ini menyatakan bahwa secara bersama-sama telah melakukan inventarisasi dengan hasil yang sesuai dengan di lapangan, dan tidak akan mengubah hasil inventarisasi ini sampai proses pembayaran kompensasi selesai.';
  const lines = doc.splitTextToSize(closingText, contentWidth - 4);

  // Check if declaration and signatures fit on this page
  const signaturesHeight = 20 + 28 + 14 + 14; 
  if (y2 + lines.length * 4.2 + 10 + signaturesHeight > 270) {
    doc.addPage();
    currentPNum++;
    drawPageHeader(currentPNum);
    y2 = 30;
  }
  
  // Grey background box removed per User Request 4!
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(55, 65, 81);
  lines.forEach((line: string, i: number) => {
    doc.text(line, leftMargin + 2, y2 + 4.2 + (i * 4.2));
  });

  y2 += lines.length * 4.2 + 10;

  // --- SIGNATURES GRID ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

  const colWidth = contentWidth / 3;
  const sigCol1 = leftMargin;
  const sigCol2 = sigCol1 + colWidth;
  const sigCol3 = sigCol2 + colWidth;

  // Headings
  doc.text('TIM INVENTARISASI', sigCol1 + colWidth / 2, y2, { align: 'center' });
  doc.text('PIHAK YANG BERHAK', sigCol2 + colWidth / 2, y2, { align: 'center' });
  doc.text('PARA SAKSI', sigCol3 + colWidth / 2, y2, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Nama dan Jabatan / Tanda Tangan', sigCol1 + colWidth / 2, y2 + 3.5, { align: 'center' });
  doc.text('Pemilik Lahan / Ahli Waris', sigCol2 + colWidth / 2, y2 + 3.5, { align: 'center' });
  doc.text('Saksi Batas / Keluarga', sigCol3 + colWidth / 2, y2 + 3.5, { align: 'center' });

  // Get name strings and wrap them to prevent any overlapping (max 20 chars per line, or wrap on space)
  const wrapName20 = (text: string, maxLen = 20): string[] => {
    if (!text || !text.trim()) return ['-'];
    const words = text.trim().split(/\s+/);
    const resultLines: string[] = [];
    let current = '';

    for (const w of words) {
      if (!current) {
        current = w;
      } else if ((current + ' ' + w).length <= maxLen) {
        current += ' ' + w;
      } else {
        resultLines.push(current);
        current = w;
      }
    }
    if (current) resultLines.push(current);
    return resultLines;
  };

  const nameTim1 = record.nama_tim_1 || 'DARMAWAN DWI SANJAYA';
  const wrappedTim1 = wrapName20(`1. ${nameTim1}`, 20);

  const nameOwner = record.NAMA || 'MURSIDAH';
  const wrappedOwner = wrapName20(nameOwner, 20);

  const nameSaksi1 = record.NAMA_SAKSI_1 || 'RIZKI KURNIAWAN';
  const wrappedSaksi1 = wrapName20(`1. ${nameSaksi1}`, 20);

  const nameTim2 = record.nama_tim_2 || 'SATRIA ARYA WIBISONO';
  const wrappedTim2 = wrapName20(`2. ${nameTim2}`, 20);

  const nameSaksi2 = record.NAMA_SAKSI_2 || 'AHMAD CHORIIN';
  const wrappedSaksi2 = wrapName20(`2. ${nameSaksi2}`, 20);

  const nameKades = record.NAMA_KADES || 'TARYONO';
  const wrappedKades = doc.splitTextToSize(nameKades, 50);

  // Dynamic positioning of signature elements based on wrapped name heights
  const sigStartY = y2 + 18;

  // Signature row 1: Petugas 1 / Pemilik / Saksi 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

  // Tim 1 Name
  wrappedTim1.forEach((line: string, idx: number) => {
    doc.text(line, sigCol1 + 2, sigStartY + (idx * 3.5));
  });
  doc.text('(', sigCol1 + 41, sigStartY);
  doc.line(sigCol1 + 43, sigStartY + 0.8, sigCol1 + 54, sigStartY + 0.8);
  doc.text(')', sigCol1 + 55, sigStartY);

  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.2);
  const lastLineTim1Y = sigStartY + (wrappedTim1.length - 1) * 3.5;
  const textWidthTim1 = doc.getTextWidth(wrappedTim1[wrappedTim1.length - 1]);
  doc.line(sigCol1 + 2, lastLineTim1Y + 0.8, sigCol1 + 2 + Math.min(textWidthTim1, 38), lastLineTim1Y + 0.8);

  // Owner Signature Block (Pihak Yang Berhak / Warga Penerima) - formatted like Tim & Saksi
  wrappedOwner.forEach((line: string, idx: number) => {
    doc.text(line, sigCol2 + 2, sigStartY + (idx * 3.5));
  });
  doc.text('(', sigCol2 + 41, sigStartY);
  doc.line(sigCol2 + 43, sigStartY + 0.8, sigCol2 + 54, sigStartY + 0.8);
  doc.text(')', sigCol2 + 55, sigStartY);

  const lastLineOwnerY = sigStartY + (wrappedOwner.length - 1) * 3.5;
  const textWidthOwner = doc.getTextWidth(wrappedOwner[wrappedOwner.length - 1]);
  doc.line(sigCol2 + 2, lastLineOwnerY + 0.8, sigCol2 + 2 + Math.min(textWidthOwner, 38), lastLineOwnerY + 0.8);

  // Saksi 1 Name
  wrappedSaksi1.forEach((line: string, idx: number) => {
    doc.text(line, sigCol3 + 2, sigStartY + (idx * 3.5));
  });
  doc.text('(', sigCol3 + 41, sigStartY);
  doc.line(sigCol3 + 43, sigStartY + 0.8, sigCol3 + 54, sigStartY + 0.8);
  doc.text(')', sigCol3 + 55, sigStartY);

  const lastLineSaksi1Y = sigStartY + (wrappedSaksi1.length - 1) * 3.5;
  const textWidthSaksi1 = doc.getTextWidth(wrappedSaksi1[wrappedSaksi1.length - 1]);
  doc.line(sigCol3 + 2, lastLineSaksi1Y + 0.8, sigCol3 + 2 + Math.min(textWidthSaksi1, 38), lastLineSaksi1Y + 0.8);

  // Calculate dynamic starting Y for Row 2 to ensure NO overlap
  const row1Height = Math.max(wrappedTim1.length, wrappedOwner.length, wrappedSaksi1.length) * 3.5;
  const sigStartY2 = sigStartY + row1Height + 11; // minimum 11mm of gap

  // Tim 2 Name
  wrappedTim2.forEach((line: string, idx: number) => {
    doc.text(line, sigCol1 + 2, sigStartY2 + (idx * 3.5));
  });
  doc.text('(', sigCol1 + 41, sigStartY2);
  doc.line(sigCol1 + 43, sigStartY2 + 0.8, sigCol1 + 54, sigStartY2 + 0.8);
  doc.text(')', sigCol1 + 55, sigStartY2);

  const lastLineTim2Y = sigStartY2 + (wrappedTim2.length - 1) * 3.5;
  const textWidthTim2 = doc.getTextWidth(wrappedTim2[wrappedTim2.length - 1]);
  doc.line(sigCol1 + 2, lastLineTim2Y + 0.8, sigCol1 + 2 + Math.min(textWidthTim2, 38), lastLineTim2Y + 0.8);

  // Saksi 2 Name
  wrappedSaksi2.forEach((line: string, idx: number) => {
    doc.text(line, sigCol3 + 2, sigStartY2 + (idx * 3.5));
  });
  doc.text('(', sigCol3 + 41, sigStartY2);
  doc.line(sigCol3 + 43, sigStartY2 + 0.8, sigCol3 + 54, sigStartY2 + 0.8);
  doc.text(')', sigCol3 + 55, sigStartY2);

  const lastLineSaksi2Y = sigStartY2 + (wrappedSaksi2.length - 1) * 3.5;
  const textWidthSaksi2 = doc.getTextWidth(wrappedSaksi2[wrappedSaksi2.length - 1]);
  doc.line(sigCol3 + 2, lastLineSaksi2Y + 0.8, sigCol3 + 2 + Math.min(textWidthSaksi2, 38), lastLineSaksi2Y + 0.8);

  // Calculate dynamic starting Y for Kades block to prevent ANY overlapping
  const row2Height = Math.max(wrappedTim2.length, wrappedSaksi2.length) * 3.5;
  const centerColX = leftMargin + contentWidth / 2;
  const kadesStartY = sigStartY2 + row2Height + 14; // generous 14mm of gap

  const rawKab = record.KABUPATEN || 'MOJOKERTO';
  const cleanKab = rawKab.replace(/^(KAB\.?\s+|KABUPATEN\s+)/i, '');
  const formattedKab = cleanKab.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${formattedKab}, ${formattedDate}`, centerColX, kadesStartY, { align: 'center' });
  doc.text('Mengetahui,', centerColX, kadesStartY + 3.5, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(`KEPALA DESA ${record.DESA?.toUpperCase() || 'DESA'}`, centerColX, kadesStartY + 7, { align: 'center' });

  // Spacing for Kades actual signature area (32mm vertical height for extra space)
  const kadesNameY = kadesStartY + 32;

  // Kades Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  wrappedKades.forEach((line: string, idx: number) => {
    doc.text(line, centerColX, kadesNameY + (idx * 3.5), { align: 'center' });
  });
  
  // Underline Kades Name with expanded line length
  const lastLineKadesY = kadesNameY + (wrappedKades.length - 1) * 3.5;
  const textWidthKades = doc.getTextWidth(wrappedKades[wrappedKades.length - 1]);
  doc.setLineWidth(0.25);
  doc.line(centerColX - (textWidthKades / 2 + 18), lastLineKadesY + 1, centerColX + (textWidthKades / 2 + 18), lastLineKadesY + 1);


  // ==========================================
  // PAGE 3: Sketsa Bidang, Koordinat & Batas Lahan
  // ==========================================
  doc.addPage();
  currentPNum++;
  drawPageHeader(currentPNum);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('SITUASI DAN DENAH BIDANG TANAH UNTUK KOMPENSASI', 105, 30, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`NOMER BIDANG : ${record.NOBID || '-'}`, 105, 34, { align: 'center' });

  // Attempt to load and render polygon points dynamically!
  let polygonPoints: [number, number][] = [];
  let geojsonData: any = null;
  let matchedFeat: any = null;
  let rotationDeg = 0;
  let customMapping: any = null;

  try {
    const candidateGeoJSONs: { data: any; fieldMapping?: any }[] = [];

    // 1. Gather custom layers from localStorage
    try {
      const localLayers = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
      localLayers.forEach((l: any) => {
        if (l.data && l.data.features && (l.type === 'bidang' || !l.type)) {
          candidateGeoJSONs.push({ data: l.data, fieldMapping: l.fieldMapping });
        }
      });
    } catch (e) {}

    // 2. Gather custom layers and field mapping from Firestore
    try {
      const querySnapshot = await getDocs(collection(db, 'geojson_layers'));
      const docPromises = querySnapshot.docs.map(docSnap => loadGeoJSONLayerDoc(docSnap));
      const layers = await Promise.all(docPromises);

      layers.forEach((l) => {
        if (l.fieldMapping && !customMapping) {
          customMapping = l.fieldMapping;
        }
        if (l.data && l.data.features && (l.type === 'bidang' || !l.type)) {
          candidateGeoJSONs.push({ data: l.data, fieldMapping: l.fieldMapping });
        }
      });
    } catch (e) {
      console.warn('Gagal memuat custom mapping dari Firestore:', e);
    }

    // 3. Static fallback files
    const projName = projectName || '';
    const normalizedProj = projName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    
    const bids = projName ? [
      `/geojson/${projName}_BIDANG_WARGA.geojson`,
      `/geojson/${projName}_bidang_warga.geojson`,
      `/geojson/${projName}_BIDANG_TANAH.geojson`,
      `/geojson/${projName}_bidang_tanah.geojson`,
      `/geojson/${projName}_BIDANG.geojson`,
      `/geojson/${projName}_bidang.geojson`,
      `/geojson/${normalizedProj}_bidang_warga.geojson`,
      `/geojson/${normalizedProj}_bidang_tanah.geojson`,
      `/geojson/${normalizedProj}_bidang.geojson`,
    ] : [];
    bids.push('/geojson/bidang_tanah.geojson');
    
    for (const path of bids) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const fetchedJson = await response.json();
          if (fetchedJson && fetchedJson.features) {
            candidateGeoJSONs.push({ data: fetchedJson, fieldMapping: customMapping });
          }
        }
      } catch (err) {
        // try next
      }
    }

    // Search across all candidate GeoJSON datasets for matched parcel!
    for (const candidate of candidateGeoJSONs) {
      const gData = candidate.data;
      if (!gData || !Array.isArray(gData.features)) continue;
      const cMapping = candidate.fieldMapping || customMapping;

      const found = gData.features.find((f: any) => {
        const props = f.properties;
        if (!props) return false;

        let featDesa = '';
        let featSpan = '';
        let featNobid = '';

        if (cMapping) {
          if (cMapping.desa && props[cMapping.desa] !== undefined) featDesa = String(props[cMapping.desa] || '');
          if (cMapping.span && props[cMapping.span] !== undefined) featSpan = String(props[cMapping.span] || '');
          if (cMapping.nobid && props[cMapping.nobid] !== undefined) featNobid = String(props[cMapping.nobid] || '');
        }

        if (!featDesa) {
          featDesa = findPropInObj(props, ['desa', 'village', 'kelurahan', 'distrik', 'kecamatan', 'kabupaten']);
        }
        if (!featSpan) {
          featSpan = findPropInObj(props, ['span', 'section', 'jalur', 'row', 'koridor', 'corridor']);
        }
        if (!featNobid) {
          featNobid = findPropInObj(props, ['nobid', 'nobiddc', 'nobiddis', 'nobidis', 'no_bidang', 'no_bid', 'nomor', 'nomer', 'id', 'fid', 'objectid', 'nib']);
        }

        return isRecordMatched(
          String(featNobid), String(featDesa), String(featSpan),
          record.NOBID, record.DESA, record.SPAN
        );
      });

      if (found) {
        matchedFeat = found;
        geojsonData = gData;

        const geom = matchedFeat.geometry;
        if (geom) {
          if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
            polygonPoints = geom.coordinates[0];
          } else if (geom.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]) {
            polygonPoints = geom.coordinates[0][0];
          }
        }

        const props = matchedFeat.properties || {};
        if (cMapping && cMapping.rotasi && props[cMapping.rotasi] !== undefined) {
          rotationDeg = Number(props[cMapping.rotasi] || 0);
        } else {
          const rotVal = findPropInObj(props, ['rotate', 'rotasi', 'rotation', 'rotdetec', 'sudut', 'angle']);
          rotationDeg = Number(rotVal || 0);
        }

        if (isNaN(rotationDeg)) rotationDeg = 0;
        break;
      }
    }
  } catch (e) {
    console.warn('Gagal memuat GeoJSON untuk sketsa:', e);
  }

  // Draw clean container border for the map/sketch
  const boxW = 140; // width of drawing box in mm
  const boxH = 60;  // height of drawing box in mm
  const boxX = 35;  // start X
  const boxY = 40;  // start Y

  // Start by clearing background with white
  doc.setFillColor(255, 255, 255);
  doc.rect(boxX, boxY, boxW, boxH, 'F');

  if (polygonPoints && polygonPoints.length > 0) {
    // 1. Find the center of the matched polygon to rotate all parcels around it
    let centerLng = 0;
    let centerLat = 0;
    const count = polygonPoints.length > 1 ? polygonPoints.length - 1 : polygonPoints.length;
    for (let i = 0; i < count; i++) {
      centerLng += polygonPoints[i][0];
      centerLat += polygonPoints[i][1];
    }
    centerLng /= count;
    centerLat /= count;

    const latScaleFactor = Math.cos(centerLat * Math.PI / 180);

    // 2. Rotate helper: convert azimuth bearing into horizontal corridor rotation angle
    let effectiveRotDeg = rotationDeg;
    if (effectiveRotDeg > 45 && effectiveRotDeg < 225) {
      effectiveRotDeg -= 90;
    } else if (effectiveRotDeg >= 225) {
      effectiveRotDeg -= 270;
    } else if (effectiveRotDeg < -45) {
      effectiveRotDeg += 90;
    }
    effectiveRotDeg += 180; // Add 180 degrees so NOBID order runs left-to-right ascending

    let angleRad = effectiveRotDeg * Math.PI / 180;
    let cosA = Math.cos(angleRad);
    let sinA = Math.sin(angleRad);

    let getRotatedCoords = (lng: number, lat: number) => {
      const dx = (lng - centerLng) * latScaleFactor;
      const dy = lat - centerLat;
      const rotX = dx * cosA - dy * sinA;
      const rotY = dx * sinA + dy * cosA;
      return { rotX, rotY };
    };

    // 3. Find rotated bounding box of the matched parcel ONLY first
    let mMinX = Infinity, mMaxX = -Infinity;
    let mMinY = Infinity, mMaxY = -Infinity;

    polygonPoints.forEach(([lng, lat]) => {
      const { rotX, rotY } = getRotatedCoords(lng, lat);
      if (rotX < mMinX) mMinX = rotX;
      if (rotX > mMaxX) mMaxX = rotX;
      if (rotY < mMinY) mMinY = rotY;
      if (rotY > mMaxY) mMaxY = rotY;
    });

    let mWidth = mMaxX - mMinX;
    let mHeight = mMaxY - mMinY;

    // If bounding box is vertical (mWidth < mHeight), rotate 90 degrees to make corridor horizontal
    if (mWidth < mHeight) {
      effectiveRotDeg -= 90;
      angleRad = effectiveRotDeg * Math.PI / 180;
      cosA = Math.cos(angleRad);
      sinA = Math.sin(angleRad);

      getRotatedCoords = (lng: number, lat: number) => {
        const dx = (lng - centerLng) * latScaleFactor;
        const dy = lat - centerLat;
        const rotX = dx * cosA - dy * sinA;
        const rotY = dx * sinA + dy * cosA;
        return { rotX, rotY };
      };

      mMinX = Infinity; mMaxX = -Infinity;
      mMinY = Infinity; mMaxY = -Infinity;

      polygonPoints.forEach(([lng, lat]) => {
        const { rotX, rotY } = getRotatedCoords(lng, lat);
        if (rotX < mMinX) mMinX = rotX;
        if (rotX > mMaxX) mMaxX = rotX;
        if (rotY < mMinY) mMinY = rotY;
        if (rotY > mMaxY) mMaxY = rotY;
      });

      mWidth = mMaxX - mMinX;
      mHeight = mMaxY - mMinY;
    }

    // Zoom calculation: focus closely on the matched parcel so it occupies ~70-80% of the map face
    // making all vertices (P1, P2, P3...) and details crisp and clearly readable
    const midRotX = (mMinX + mMaxX) / 2;
    const midRotY = (mMinY + mMaxY) / 2;

    // Set target view dimensions directly based on rotated parcel dimensions with ~35% margin
    const targetW = Math.max(mWidth * 1.35, 0.00008);
    const targetH = Math.max(mHeight * 1.35, 0.00005);

    const containerAspect = boxW / boxH;
    let viewW = targetW;
    let viewH = targetH;

    if (viewW / viewH < containerAspect) {
      viewW = viewH * containerAspect;
    } else {
      viewH = viewW / containerAspect;
    }

    const wRot = viewW;
    const hRot = viewH;

    if (wRot > 0 && hRot > 0) {
      const scale = Math.min((boxW - 10) / wRot, (boxH - 6) / hRot);

      const screenCenterX = boxX + boxW / 2;
      const screenCenterY = boxY + boxH / 2;

      // Helper to compute centroid of polygon
      const getCentroid = (pts: { x: number; y: number }[]) => {
        const n = pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y
          ? pts.length - 1
          : pts.length;
        if (n <= 0) return { x: 0, y: 0 };
        let sumX = 0, sumY = 0;
        for (let i = 0; i < n; i++) {
          sumX += pts[i].x;
          sumY += pts[i].y;
        }
        return { x: sumX / n, y: sumY / n };
      };

      // 4. Draw all unhighlighted background parcels & features first
      if (geojsonData && Array.isArray(geojsonData.features)) {
        geojsonData.features.forEach((feature: any) => {
          if (feature === matchedFeat) return;

          const geom = feature.geometry;
          if (!geom) return;

          const props = feature.properties || {};

          // Tower point or Tower polygon handling
          const towerVal = findPropInObj(props, ['tower', 'tapaktower', 'no_tower', 'tapak']);
          if (geom.type === 'Point') {
            const [pLng, pLat] = geom.coordinates || [0, 0];
            const { rotX, rotY } = getRotatedCoords(pLng, pLat);
            const px = screenCenterX + (rotX - midRotX) * scale;
            const py = screenCenterY - (rotY - midRotY) * scale;

            if (px >= boxX && px <= boxX + boxW && py >= boxY && py <= boxY + boxH) {
              doc.setDrawColor(185, 28, 28);
              doc.setFillColor(255, 255, 255);
              doc.setLineWidth(0.3);
              doc.rect(px - 2.5, py - 2.5, 5, 5, 'FD');
              doc.line(px - 2.5, py - 2.5, px + 2.5, py + 2.5);
              doc.line(px - 2.5, py + 2.5, px + 2.5, py - 2.5);

              const twName = towerVal ? `T.${towerVal}` : 'Tower';
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(6);
              doc.setTextColor(185, 28, 28);
              doc.text(twName, px, py - 3, { align: 'center' });
            }
            return;
          }

          let featPoints: [number, number][] = [];
          if (geom.type === 'Polygon') {
            featPoints = geom.coordinates[0];
          } else if (geom.type === 'MultiPolygon') {
            featPoints = geom.coordinates[0][0];
          }

          if (featPoints && featPoints.length > 0) {
            const paperPts = featPoints.map(([lng, lat]) => {
              const { rotX, rotY } = getRotatedCoords(lng, lat);
              const px = screenCenterX + (rotX - midRotX) * scale;
              const py = screenCenterY - (rotY - midRotY) * scale;
              return { x: px, y: py };
            });

            // Fill unhighlighted background parcel with clean white/light slate and dark outline
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(51, 65, 85);
            doc.setLineWidth(0.2);

            if (typeof (doc as any).polygon === 'function') {
              (doc as any).polygon(paperPts, 'FD');
            } else {
              for (let i = 0; i < paperPts.length - 1; i++) {
                doc.line(paperPts[i].x, paperPts[i].y, paperPts[i + 1].x, paperPts[i + 1].y);
              }
            }

            // Extract NOBID label for unhighlighted polygon
            let fNobid = '';
            if (customMapping && customMapping.nobid && props[customMapping.nobid] !== undefined) {
              fNobid = String(props[customMapping.nobid] || '');
            }
            if (!fNobid) {
              fNobid = findPropInObj(props, ['nobid', 'nobiddc', 'nobiddis', 'nobidis', 'no_bidang', 'no_bid', 'nomor', 'nomer', 'id', 'fid', 'objectid', 'nib']);
            }
            if (!fNobid && towerVal) {
              fNobid = `T.${towerVal}`;
            }

            if (fNobid) {
              const { x: cx, y: cy } = getCentroid(paperPts);
              if (cx >= boxX + 2 && cx <= boxX + boxW - 2 && cy >= boxY + 2 && cy <= boxY + boxH - 2) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(15, 23, 42);
                doc.text(String(fNobid), cx, cy + 0.8, { align: 'center' });
              }
            }
          }
        });
      }

      // 5. Draw the highlighted selected matched parcel
      const paperPoints = polygonPoints.map(([lng, lat]) => {
        const { rotX, rotY } = getRotatedCoords(lng, lat);
        const px = screenCenterX + (rotX - midRotX) * scale;
        const py = screenCenterY - (rotY - midRotY) * scale;
        return { x: px, y: py };
      });

      // Fill with sky-blue / cyan and royal blue border (matching Image 2)
      doc.setFillColor(125, 211, 252);
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.4);

      if (typeof (doc as any).polygon === 'function') {
        (doc as any).polygon(paperPoints, 'FD');
      } else {
        for (let i = 0; i < paperPoints.length - 1; i++) {
          doc.line(paperPoints[i].x, paperPoints[i].y, paperPoints[i + 1].x, paperPoints[i + 1].y);
        }
      }

      // NOBID label inside highlighted polygon
      const { x: mcx, y: mcy } = getCentroid(paperPoints);
      if (mcx >= boxX && mcx <= boxX + boxW && mcy >= boxY && mcy <= boxY + boxH) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(String(record.NOBID || '15'), mcx, mcy + 0.8, { align: 'center' });
      }

      // 6. Draw 4 white masking rectangles outside the box container to clean any bleed
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 210, boxY, 'F');
      doc.rect(0, boxY + boxH, 210, 297 - (boxY + boxH), 'F');
      doc.rect(0, boxY, boxX, boxH, 'F');
      doc.rect(boxX + boxW, boxY, 210 - (boxX + boxW), boxH, 'F');

      // Redraw Header & Title over the top mask
      drawPageHeader(currentPNum);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text('SITUASI DAN DENAH BIDANG TANAH UNTUK KOMPENSASI', 105, 30, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`NOMER BIDANG : ${record.NOBID || '-'}`, 105, 34, { align: 'center' });

      // 7. Redraw the container border
      doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.setLineWidth(0.35);
      doc.rect(boxX, boxY, boxW, boxH, 'D');

      // 8. Draw Compass rose rotated with effective map rotation!
      const compX = boxX + boxW - 12;
      const compY = boxY + 12;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.15);
      doc.circle(compX, compY, 3.5, 'S');

      // Rotation needles
      const theta = -effectiveRotDeg * Math.PI / 180;
      const uX = compX + Math.sin(theta) * 3.5;
      const uY = compY - Math.cos(theta) * 3.5;
      const sX = compX - Math.sin(theta) * 3.5;
      const sY = compY + Math.cos(theta) * 3.5;

      const perpAngle = theta + Math.PI / 2;
      const w1X = compX + Math.sin(perpAngle) * 0.9;
      const w1Y = compY - Math.cos(perpAngle) * 0.9;
      const w2X = compX - Math.sin(perpAngle) * 0.9;
      const w2Y = compY + Math.cos(perpAngle) * 0.9;

      // Crimson triangle for North
      doc.setFillColor(185, 28, 28);
      doc.triangle(w1X, w1Y, w2X, w2Y, uX, uY, 'F');

      // Slate triangle for South
      doc.setFillColor(100, 116, 139);
      doc.triangle(w1X, w1Y, w2X, w2Y, sX, sY, 'F');

      // Labels (U, S, T, B) placed neatly on rotated axes
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.setTextColor(15, 23, 42);

      const labelDist = 5.2;
      doc.text('U', compX + Math.sin(theta) * labelDist, compY - Math.cos(theta) * labelDist + 0.8, { align: 'center' });
      doc.text('S', compX - Math.sin(theta) * labelDist, compY + Math.cos(theta) * labelDist + 0.8, { align: 'center' });
      doc.text('T', compX + Math.sin(perpAngle) * labelDist, compY - Math.cos(perpAngle) * labelDist + 0.8, { align: 'center' });
      doc.text('B', compX - Math.sin(perpAngle) * labelDist, compY + Math.cos(perpAngle) * labelDist + 0.8, { align: 'center' });

      // 9. Label vertex points on the matched polygon
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);

      const uniquePts = paperPoints.slice(0, paperPoints.length - 1);
      uniquePts.forEach((pt, i) => {
        if (pt.x >= boxX - 1 && pt.x <= boxX + boxW + 1 && pt.y >= boxY - 1 && pt.y <= boxY + boxH + 1) {
          doc.setFillColor(2, 132, 199);
          doc.circle(pt.x, pt.y, 0.8, 'F');
          doc.text(`P${i + 1}`, pt.x + 1.2, pt.y - 0.8);
        }
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Sketsa bidang tanah tidak tersedia', 105, boxY + boxH / 2, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Sketsa bidang tanah tidak tersedia (GeoJSON belum dimuat)', 105, boxY + boxH / 2, { align: 'center' });
  }

  // Add caption
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('SITUASI MENGGAMBARKAN KONDISI SEMPADAN DAN BIDANG TANAH', 105, boxY + boxH + 4, { align: 'center' });

  // COORDINATES TABLE / GRID
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('I. KOORDINAT BIDANG TANAH', leftMargin, 115);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);

  let coordY = 120;
  let lastCoordY = coordY;

  if (polygonPoints && polygonPoints.length > 0) {
    const uniquePoints = polygonPoints.slice(0, polygonPoints.length - 1);
    const totalPts = uniquePoints.length; // Show all points!
    const numCols = totalPts > 22 ? 3 : 2;
    const numRows = Math.ceil(totalPts / numCols);
    const rowHeight = totalPts > 18 ? 4.5 : 5.0;
    const colWidth = numCols === 3 ? 59 : 90;

    uniquePoints.forEach((pt, i) => {
      const utm = latLngToUTM49S(pt[0], pt[1]);
      const colIdx = Math.floor(i / numRows);
      const rowIdx = i % numRows;
      const px = leftMargin + (numCols === 3 ? 2 : 4) + (colIdx * colWidth);
      const py = coordY + (rowIdx * rowHeight);

      doc.setFont('helvetica', 'bold');
      doc.text(`Koordinat P${i+1}`, px, py);
      doc.setFont('helvetica', 'normal');
      if (numCols === 3) {
        doc.text(`X: ${utm.x.toFixed(2)} Y: ${utm.y.toFixed(2)}`, px + 18, py);
      } else {
        doc.text(`X: ${utm.x.toFixed(4)}   Y: ${utm.y.toFixed(4)}`, px + 22, py);
      }
    });

    lastCoordY = coordY + ((numRows - 1) * rowHeight) + 4;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.text('Data koordinat bidang tanah tidak tersedia.', leftMargin + 6, coordY);
    lastCoordY = coordY + 6;
  }

  // BOUNDARIES TABLE - Dynamically placed below Section I
  const batasYStart = Math.max(162, lastCoordY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('II. BATAS-BATAS TANAH', leftMargin, batasYStart);

  const dataBatas = [
    { no: '1.', arah: 'Utara berbatasan dengan', value: record.BATAS_UTARA || 'Sri Suyani' },
    { no: '2.', arah: 'Selatan berbatasan dengan', value: record.BATAS_SELATAN || 'Sri Suyani' },
    { no: '3.', arah: 'Timur berbatasan dengan', value: record.BATAS_TIMUR || 'Sri Suyani' },
    { no: '4.', arah: 'Barat berbatasan dengan', value: record.BATAS_BARAT || 'Tumirah' }
  ];

  let currBatasY = batasYStart + 3.5;
  const rowHeightB = 6.2;

  // Table outer border
  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.3);
  doc.rect(leftMargin, currBatasY, contentWidth, 4 * rowHeightB);

  dataBatas.forEach((b, idx) => {
    // Zebra striping
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(leftMargin + 0.15, currBatasY + 0.15, contentWidth - 0.3, rowHeightB - 0.3, 'F');
    }

    // Dividers
    if (idx > 0) {
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, currBatasY, rightMargin, currBatasY);
    }

    // Vertical splits
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.2);
    doc.line(leftMargin + 12, currBatasY, leftMargin + 12, currBatasY + rowHeightB);
    doc.line(leftMargin + 65, currBatasY, leftMargin + 65, currBatasY + rowHeightB);

    // Text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text(b.no, leftMargin + 4, currBatasY + 4.2);
    doc.text(b.arah, leftMargin + 15, currBatasY + 4.2);

    doc.text(':', leftMargin + 67, currBatasY + 4.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(b.value, leftMargin + 71, currBatasY + 4.2);

    currBatasY += rowHeightB;
  });


  // Preload photo images asynchronously
  const photoUrls = [
    record.LINK_DOKUMENTASI_BIDANG || '',
    record.LINK_DOKUMENTASI_BIDANG_2 || '',
    record.LINK_DOKUMENTASI_BIDANG_3 || record.LINK_WAJAH_PEMILIK || ''
  ];

  const photoBase64s = await Promise.all(
    photoUrls.map(url => url ? loadImageAsBase64(url, 700, false) : Promise.resolve(''))
  );

  // ==========================================
  // PAGE 4: Dokumentasi Situasi Bidang Tanah
  // ==========================================
  doc.addPage();
  currentPNum++;
  drawPageHeader(currentPNum);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('DOKUMENTASI SITUASI BIDANG TANAH', 105, 30, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`KODE LAHAN : ${record.CODE || '-'}`, 105, 34, { align: 'center' });

  // Large elegant container box for documentation photos (matching screenshot)
  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.rect(15, 45, 180, 110, 'FD');

  // Let's draw 3 beautiful landscape photo placeholder slots (matching the screenshot exactly)
  const picW = 51;
  const picH = 34;
  const picY = 83; // vertically centered in the 110mm height box
  const picGap = 8;
  const picStartX = 15 + 10; // offset of 10mm inside the 180mm container

  const photoLabels = [
    'Foto Kondisi Bidang Lahan 1',
    'Foto Kondisi Bidang Lahan 2',
    'Foto Kondisi Bidang Lahan 3'
  ];

  for (let i = 0; i < 3; i++) {
    const px = picStartX + i * (picW + picGap);
    const photoData = photoBase64s[i];
    
    // Draw photo outer border
    doc.setDrawColor(148, 163, 184); // slate-400
    doc.setLineWidth(0.2);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(px, picY, picW, picH, 'FD');

    if (photoData && photoData.startsWith('data:image/')) {
      try {
        // Embed the actual uploaded image inside the box!
        doc.addImage(photoData, 'JPEG', px + 0.8, picY + 0.8, picW - 1.6, picH - 1.6, undefined, 'FAST');
      } catch (err) {
        console.warn(`Failed to add image ${i+1} to PDF:`, err);
        // Fallback placeholder
        doc.setFillColor(241, 245, 249);
        doc.rect(px + 2, picY + 2, picW - 4, picH - 4, 'F');

        const cx = px + picW / 2;
        const cy = picY + picH / 2;
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.4);
        doc.circle(cx, cy, 3.5, 'S');
        doc.rect(cx - 5.5, cy - 3, 11, 6, 'S');
        doc.rect(cx - 2, cy - 4.5, 4, 1.5, 'S');
      }
    } else {
      // Inner photo area placeholder
      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(px + 2, picY + 2, picW - 4, picH - 4, 'F');

      // camera icon in center
      const cx = px + picW / 2;
      const cy = picY + picH / 2;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.circle(cx, cy, 3.5, 'S');
      doc.rect(cx - 5.5, cy - 3, 11, 6, 'S');
      doc.rect(cx - 2, cy - 4.5, 4, 1.5, 'S');
    }

    // label
    const cx = px + picW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(photoLabels[i], cx, picY + picH + 5, { align: 'center' });
  }

  // Draw some helpful descriptions
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DOKUMENTASI INVENTARISASI LAPANGAN OLEH TIM BERSAMA', 105, 165, { align: 'center' });


  // --- DYNAMIC PAGE NUMBERS LOOP ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawPageFooter(i, totalPages);
  }

  return doc;
}
