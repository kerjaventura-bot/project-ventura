import { jsPDF } from 'jspdf';
import { type LandRecord } from '../types';

/**
 * Generates a beautiful, high-fidelity 2-page Formulir Inventarisasi PDF
 * based on the provided LandRecord and Project Name.
 */
export function generateInventoryPDF(record: LandRecord, projectName: string): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Set A4 dimensions
  const pageWidth = 210;
  const pageHeight = 297;
  const leftMargin = 15;
  const rightMargin = 195;
  const contentWidth = rightMargin - leftMargin; // 180mm

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
    // 1. Danantara Indonesia Logo (Left side)
    // Draw red & black elegant geometric triangles
    doc.setFillColor(accentRed[0], accentRed[1], accentRed[2]);
    doc.triangle(15, 12, 19, 12, 15, 17, 'F');
    doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.triangle(19, 12, 23, 12, 19, 17, 'F');
    doc.setFillColor(accentRed[0], accentRed[1], accentRed[2]);
    doc.triangle(17, 14, 21, 14, 17, 19, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text('Danantara', 25, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Indonesia', 25, 18);

    // 2. ID Survey Logo (Middle)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text('ID Survey', 105, 14, { align: 'center' });
    
    // Draw small green check accent under ID Survey text
    doc.setDrawColor(tealAccent[0], tealAccent[1], tealAccent[2]);
    doc.setLineWidth(0.45);
    doc.line(100, 16, 103, 18);
    doc.line(103, 18, 110, 15);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Testing · Inspection · Certification', 105, 21, { align: 'center' });

    // 3. Surveyor Indonesia Logo (Right side)
    // Small globe-like blue lines
    doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.setLineWidth(0.3);
    doc.circle(185, 14, 3.5, 'S');
    doc.line(181.5, 14, 188.5, 14);
    doc.line(185, 10.5, 185, 17.5);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text('SURVEYOR INDONESIA', 185, 20, { align: 'center' });
    
    // Header bottom line
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.2);
    doc.line(15, 24, 195, 24);
  };

  // Helper function to draw contact info footer at the bottom of both pages
  const drawPageFooter = (pNum: number) => {
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
    doc.text(`Halaman ${pNum} dari 2`, 195, 290, { align: 'right' });
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
    { label: 'RT/RW - Desa/Kelurahan', value: `${record.ALAMAT_KTP_BARIS_1 || 'RT/RW -'} · Desa ${record.DESA}` },
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
  drawPageHeader(2);

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

  // Draw header block background
  doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.rect(leftMargin, y2, contentWidth, 11, 'F');

  // Headers texts
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  
  doc.text('NO', xCol1 + 4, y2 + 7, { align: 'left' });
  doc.text('JENIS TANAMAN', xCol2 + 6, y2 + 7, { align: 'left' });
  
  doc.text('JUMLAH TANAMAN BUAH', xCol3 + colWidthsCrop[2] / 2, y2 + 3.5, { align: 'center' });
  doc.text('PRODUKTIF', xCol3 + subWidthsBuah[0] / 2, y2 + 8.5, { align: 'center' });
  doc.text('NON-PRODUKTIF', xCol3 + subWidthsBuah[0] + subWidthsBuah[1] / 2, y2 + 8.5, { align: 'center' });

  doc.text('JUMLAH TANAMAN KERAS', xCol4 + colWidthsCrop[3] / 2, y2 + 3.5, { align: 'center' });
  doc.text('KECIL', xCol4 + subWidthsKeras[0] / 2, y2 + 8.5, { align: 'center' });
  doc.text('SEDANG', xCol4 + subWidthsKeras[0] + subWidthsKeras[1] / 2, y2 + 8.5, { align: 'center' });
  doc.text('BESAR', xCol4 + subWidthsKeras[0] + subWidthsKeras[1] + subWidthsKeras[2] / 2, y2 + 8.5, { align: 'center' });

  // Divider lines inside header
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.25);
  // Horizontal splits
  doc.line(xCol3, y2 + 5, rightMargin, y2 + 5);
  // Vertical splits
  doc.line(xCol3 + subWidthsBuah[0], y2 + 5, xCol3 + subWidthsBuah[0], y2 + 11);
  doc.line(xCol4 + subWidthsKeras[0], y2 + 5, xCol4 + subWidthsKeras[0], y2 + 11);
  doc.line(xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2 + 5, xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2 + 11);

  y2 += 11;

  // Filter crops with name
  const activePlants = (record.plants || []).filter(p => p.jenis && p.jenis.trim() !== "");
  
  // Total target rows (15 is a standard neat count that leaves enough room for signatures!)
  const totalPlantRows = 14;
  const plantRowsToDraw: any[] = [];
  
  for (let i = 0; i < totalPlantRows; i++) {
    if (i < activePlants.length) {
      plantRowsToDraw.push(activePlants[i]);
    } else {
      plantRowsToDraw.push({ jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' });
    }
  }

  const rowHeight2 = 5.2;
  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.3);
  doc.rect(leftMargin, y2, contentWidth, totalPlantRows * rowHeight2);

  plantRowsToDraw.forEach((row, idx) => {
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

    // Vertical black lines
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.2);
    doc.line(xCol2, y2, xCol2, y2 + rowHeight2);
    doc.line(xCol3, y2, xCol3, y2 + rowHeight2);
    doc.line(xCol4, y2, xCol4, y2 + rowHeight2);
    // Sub-vertical lines
    doc.line(xCol3 + subWidthsBuah[0], y2, xCol3 + subWidthsBuah[0], y2 + rowHeight2);
    doc.line(xCol4 + subWidthsKeras[0], y2, xCol4 + subWidthsKeras[0], y2 + rowHeight2);
    doc.line(xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2, xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2 + rowHeight2);

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
    doc.text(row.besar || (row.jenis ? '0' : ''), xCol4 + xCol4 + subWidthsKeras[0] + subWidthsKeras[1] + subWidthsKeras[2]/2 - xCol4, y2 + 3.6, { align: 'center' });

    y2 += rowHeight2;
  });

  y2 += 6;

  // --- DECLARATION TEXT BLOCK ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  
  const closingText = 'Yang bertanda tangan di bawah ini menyatakan bahwa secara bersama-sama telah melakukan inventarisasi dengan hasil yang sesuai dengan di lapangan, dan tidak akan mengubah hasil inventarisasi ini sampai proses pembayaran kompensasi selesai.';
  const lines = doc.splitTextToSize(closingText, contentWidth - 4);
  
  // Clean background box for closure
  doc.setFillColor(243, 244, 246); // gray-100
  doc.rect(leftMargin, y2, contentWidth, lines.length * 4.2 + 4, 'F');
  
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

  y2 += 12;

  // Signature row 1: Petugas 1 / Pemilik / Saksi 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

  doc.text(`1. ${record.nama_tim_1 || 'Petugas 1'}`, sigCol1 + 4, y2);
  doc.text(record.NAMA || 'Nama Pemilik', sigCol2 + 4, y2);
  doc.text(`1. ${record.NAMA_SAKSI_1 || 'Saksi 1'}`, sigCol3 + 4, y2);

  // Line placeholders for signature lines
  doc.setDrawColor(156, 163, 175); // gray-400
  doc.setLineWidth(0.15);
  doc.line(sigCol1 + colWidth - 18, y2 + 0.5, sigCol1 + colWidth - 3, y2 + 0.5);
  doc.line(sigCol2 + colWidth - 18, y2 + 0.5, sigCol2 + colWidth - 3, y2 + 0.5);
  doc.line(sigCol3 + colWidth - 18, y2 + 0.5, sigCol3 + colWidth - 3, y2 + 0.5);

  y2 += 7;

  // Signature row 2: Petugas 2 / Empty / Saksi 2
  doc.text(`2. ${record.nama_tim_2 || 'Petugas 2'}`, sigCol1 + 4, y2);
  doc.text(`2. ${record.NAMA_SAKSI_2 || 'Saksi 2'}`, sigCol3 + 4, y2);

  doc.line(sigCol1 + colWidth - 18, y2 + 0.5, sigCol1 + colWidth - 3, y2 + 0.5);
  doc.line(sigCol3 + colWidth - 18, y2 + 0.5, sigCol3 + colWidth - 3, y2 + 0.5);

  y2 += 10;

  // --- KADES KEPALA DESA RECOGNITION (Bottom Center) ---
  const centerColX = leftMargin + contentWidth / 2;
  
  // Elegant geometric background shape overlay (green brush shape like in reference screenshot)
  doc.setFillColor(16, 185, 129, 0.1); // subtle light transparent emerald ellipse
  doc.ellipse(centerColX, y2 + 10, 42, 14, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  doc.text(`Mojokerto, ${formattedDate}`, centerColX, y2, { align: 'center' });
  doc.text('Mengetahui,', centerColX, y2 + 3.5, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(`KEPALA DESA ${record.DESA?.toUpperCase() || 'DESA'}`, centerColX, y2 + 7, { align: 'center' });

  // Seal placeholder stamp
  doc.setDrawColor(tealAccent[0], tealAccent[1], tealAccent[2], 0.35);
  doc.setLineWidth(0.4);
  doc.circle(centerColX - 25, y2 + 14, 5, 'S');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(tealAccent[0], tealAccent[1], tealAccent[2], 0.6);
  doc.text('CAP DESA', centerColX - 25, y2 + 14.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(record.NAMA_KADES || 'H. MULYONO', centerColX, y2 + 20, { align: 'center' });
  
  // underline the Kades name
  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.2);
  const nameLen = doc.getTextWidth(record.NAMA_KADES || 'H. MULYONO');
  doc.line(centerColX - nameLen/2, y2 + 21, centerColX + nameLen/2, y2 + 21);

  drawPageFooter(2);

  return doc;
}
