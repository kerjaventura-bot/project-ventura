import React, { useMemo, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, FileText, CheckCircle2, Clock, AlertCircle, Map, Home, Sprout,
  ShieldCheck, FolderCheck, CloudUpload, MapPin, Search, X, FileDown
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { LandRecord } from '../types';

interface DashboardProps {
  records: LandRecord[];
  role?: string | null;
  activeProjectName?: string;
}

export default function Dashboard({ records, role, activeProjectName }: DashboardProps) {
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

  const [selectedCategory, setSelectedCategory] = useState<'SELESAI' | 'KONSINYASI' | 'BELUM' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecordsByCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return records.filter(r => {
      if (selectedCategory === 'SELESAI') {
        return r.PROGRES_PEMBERKASAN === 'SELESAI';
      } else if (selectedCategory === 'KONSINYASI') {
        return r.PROGRES_PEMBERKASAN === 'KONSINYASI';
      } else { // 'BELUM'
        return r.PROGRES_PEMBERKASAN !== 'SELESAI' && r.PROGRES_PEMBERKASAN !== 'KONSINYASI';
      }
    });
  }, [records, selectedCategory]);

  const searchedRecords = useMemo(() => {
    if (!searchQuery.trim()) return filteredRecordsByCategory;
    const q = searchQuery.toLowerCase();
    return filteredRecordsByCategory.filter(r => {
      return (
        (r.DESA || '').toLowerCase().includes(q) ||
        (r.SPAN || '').toLowerCase().includes(q) ||
        (r.NOBID || '').toLowerCase().includes(q) ||
        (r.KETERANGAN || '').toLowerCase().includes(q)
      );
    });
  }, [filteredRecordsByCategory, searchQuery]);

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

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      
      // Set metadata
      doc.setProperties({
        title: `Laporan Progres - ${activeProjectName || 'Project Ventura'}`,
        subject: 'Progres Pembebasan Lahan & Pemberkasan',
        author: 'Project Ventura GIS System',
      });

      const primaryColor = [79, 70, 229]; // Indigo hex #4f46e5
      const darkSlate = [15, 23, 42]; // Slate-900 hex #0f172a
      const textGray = [71, 85, 105]; // Slate-600 hex #475569
      const lightGray = [241, 245, 249]; // Slate-100 hex #f1f5f9
      const borderGray = [226, 232, 240]; // Slate-200 hex #e2e8f0

      // Timestamp & Metadata (Footer & Headers)
      const today = new Date();
      const formattedDate = today.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' WIB';

      // Keep track of current page
      let pageNum = 1;

      // Clean footer drawing function
      const drawFooter = (docInstance: typeof doc, pNum: number) => {
        docInstance.setFont('helvetica', 'italic');
        docInstance.setFontSize(7.5);
        docInstance.setTextColor(148, 163, 184); // slate-400
        
        // Draw a clean divider line near the bottom
        docInstance.setDrawColor(226, 232, 240); // slate-200
        docInstance.setLineWidth(0.15);
        docInstance.line(15, 280, 195, 280);
        
        docInstance.text(`Sistem Informasi Terintegrasi - Project Ventura GIS`, 15, 285);
        docInstance.text(`Dicetak pada: ${formattedDate}   |   Halaman ${pNum}`, 190, 285, { align: 'right' });
      };

      // Draw initial footer for page 1
      drawFooter(doc, pageNum);

      // Header Banner
      doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.rect(15, 15, 180, 28, 'F');

      // Title in Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('LAPORAN PROGRES PERTANAHAN & PEMBEBASAN', 20, 24);

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(251, 191, 36); // amber-400 for contrast
      doc.text(`JALUR PROYEK: ${activeProjectName ? activeProjectName.toUpperCase() : 'SEMUA JALUR'}`, 20, 31);

      let y = 52;

      // --- SECTION 1: RINGKASAN UTAMA ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text('1. RINGKASAN CAPAIAN PROYEK', 15, y);
      
      // Draw decorative indicator
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.8);
      doc.line(15, y + 2, 60, y + 2);
      
      y += 8;

      // KPI Box 1: Total Bidang Lahan
      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.rect(15, y, 42, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(String(stats.total), 36, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text('TOTAL BIDANG', 36, y + 14, { align: 'center' });

      // KPI Box 2: Total Luas Lahan
      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.rect(60, y, 42, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(`${stats.totalLuas.toLocaleString('id-ID')} m²`, 81, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text('TOTAL LUAS', 81, y + 14, { align: 'center' });

      // KPI Box 3: Total Bangunan
      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.rect(105, y, 42, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(`${stats.totalBuildings} Unit`, 126, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text('BANGUNAN TERDATA', 126, y + 14, { align: 'center' });

      // KPI Box 4: Total Tanaman
      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.rect(150, y, 45, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(`${stats.totalPlantsCount} Pohon`, 172, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text('POHON & TANAMAN', 172, y + 14, { align: 'center' });

      y += 24;

      // --- NEW: GRAPHICAL GRAND TOTAL PROGRESS BAR ---
      const grandSelesaiPct = stats.total > 0 ? Math.round((stats.pemberkasanSelesai / stats.total) * 100) : 0;
      const grandKonsinyasiPct = stats.total > 0 ? Math.round((stats.pemberkasanKonsinyasi / stats.total) * 100) : 0;
      const grandBelumPct = stats.total > 0 ? Math.round((stats.pemberkasanBelumSelesai / stats.total) * 100) : 0;

      doc.setFillColor(248, 250, 252); // slate-50 background card
      doc.rect(15, y, 180, 22, 'F');
      doc.setDrawColor(226, 232, 240); // border
      doc.setLineWidth(0.2);
      doc.rect(15, y, 180, 22, 'D');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text('AKUMULASI PROGRES PEMBERKASAN JALUR AKTIF:', 20, y + 5);

      const grandBarX = 20;
      const grandBarY = y + 7.5;
      const grandBarW = 170;
      const grandBarH = 5;

      const grandSWidth = (grandSelesaiPct / 100) * grandBarW;
      const grandKWidth = (grandKonsinyasiPct / 100) * grandBarW;
      const grandBWidth = (grandBelumPct / 100) * grandBarW;

      let currentGrandX = grandBarX;
      // Selesai (Emerald)
      if (grandSWidth > 0) {
        doc.setFillColor(16, 185, 129); 
        doc.rect(currentGrandX, grandBarY, grandSWidth, grandBarH, 'F');
        currentGrandX += grandSWidth;
      }
      // Konsinyasi (Amber)
      if (grandKWidth > 0) {
        doc.setFillColor(245, 158, 11); 
        doc.rect(currentGrandX, grandBarY, grandKWidth, grandBarH, 'F');
        currentGrandX += grandKWidth;
      }
      // Belum Selesai (Rose)
      if (grandBWidth > 0) {
        doc.setFillColor(244, 63, 94); 
        doc.rect(currentGrandX, grandBarY, grandBWidth, grandBarH, 'F');
      }

      // Legend & Counts
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(16, 185, 129);
      doc.text(`Selesai Berkas: ${stats.pemberkasanSelesai} Bidang (${grandSelesaiPct}%)`, 20, y + 17);

      doc.setTextColor(245, 158, 11);
      doc.text(`Konsinyasi: ${stats.pemberkasanKonsinyasi} Bidang (${grandKonsinyasiPct}%)`, 80, y + 17);

      doc.setTextColor(244, 63, 94);
      doc.text(`Belum Selesai: ${stats.pemberkasanBelumSelesai} Bidang (${grandBelumPct}%)`, 140, y + 17);

      y += 28;

      // --- SECTION 2: DETAIL PROGRES ADMINISTRASI & TRABAS ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text('2. PROGRES PEMBERKASAN & INTEGRASI TRABAS', 15, y);
      doc.line(15, y + 2, 90, y + 2);

      y += 8;

      // Let's draw sub-categories with percentages
      const selesaiPct = stats.total > 0 ? Math.round((stats.pemberkasanSelesai / stats.total) * 100) : 0;
      const konsinyasiPct = stats.total > 0 ? Math.round((stats.pemberkasanKonsinyasi / stats.total) * 100) : 0;
      const belumPct = stats.total > 0 ? Math.round((stats.pemberkasanBelumSelesai / stats.total) * 100) : 0;
      const trabasPct = stats.total > 0 ? Math.round((stats.trabasSudah / stats.total) * 100) : 0;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      
      // Column left: Pemberkasan
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('A. Pemberkasan Lapangan:', 15, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`• Berkas Selesai:  ${stats.pemberkasanSelesai} Bidang (${selesaiPct}%)`, 20, y + 5);
      doc.text(`• Berkas Konsinyasi:  ${stats.pemberkasanKonsinyasi} Bidang (${konsinyasiPct}%)`, 20, y + 10);
      doc.text(`• Belum Diproses:  ${stats.pemberkasanBelumSelesai} Bidang (${belumPct}%)`, 20, y + 15);

      // Column right: TRABAS
      doc.setFont('helvetica', 'bold');
      doc.text('B. Integrasi Portal TRABAS:', 110, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`• Sudah Upload:  ${stats.trabasSudah} Bidang (${trabasPct}%)`, 115, y + 5);
      doc.text(`• Belum Upload:  ${stats.trabasBelum} Bidang (${100 - trabasPct}%)`, 115, y + 10);

      y += 24;

      // --- SECTION 3: PROGRESS KOMPARASI PER DESA ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text('3. CAPAIAN PROGRES PER WILAYAH DESA (GRAFIK KOMPARASI)', 15, y);
      doc.line(15, y + 2, 80, y + 2);

      y += 8;

      // Table Header for Graphical Representation
      doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.rect(15, y, 180, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('No', 18, y + 5.5);
      doc.text('Wilayah Desa & Total Bidang', 25, y + 5.5);
      doc.text('Grafik Progres (Pemberkasan & TRABAS)', 67, y + 5.5);
      doc.text('Rincian Angka (S/K/B & Sd/Bl)', 127, y + 5.5);
      doc.text('Persentase', 172, y + 5.5);

      y += 8;

      // Table Rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      
      desaProgressData.forEach((desa, index) => {
        // Each custom graphical row needs 14mm of height
        const rowHeight = 14;

        // Check for page break
        if (y + rowHeight > 270) {
          doc.addPage();
          pageNum++;
          drawFooter(doc, pageNum);
          y = 20;
          
          // Re-draw Table Header on new page
          doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
          doc.rect(15, y, 180, 8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text('No', 18, y + 5.5);
          doc.text('Wilayah Desa & Total Bidang', 25, y + 5.5);
          doc.text('Grafik Progres (Pemberkasan & TRABAS)', 67, y + 5.5);
          doc.text('Rincian Angka (S/K/B & Sd/Bl)', 127, y + 5.5);
          doc.text('Persentase', 172, y + 5.5);
          y += 8;
        }

        // Zebra striping
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252); // slate-50
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(15, y, 180, rowHeight, 'F');

        // Draw left purple indicator line to give premium dashboard look
        doc.setFillColor(79, 70, 229);
        doc.rect(15, y, 1.2, rowHeight, 'F');

        // Thin bottom border
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.15);
        doc.line(15, y + rowHeight, 195, y + rowHeight);

        // Column 1: No
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(String(index + 1), 18, y + 5.5);

        // Column 2: Nama Desa
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(desa.name, 25, y + 5.5);

        // Total Bidang subtext
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`(${desa.total} Bidang)`, 25, y + 10);

        // --- GRAPH 1: PEMBERKASAN ---
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text('Pemberkasan:', 67, y + 5);

        const barX = 85;
        const barWidth = 38; // 38mm fits perfectly without any overlap
        const barHeight = 2.5;

        const sWidth = desa.total > 0 ? (desa.selesai / desa.total) * barWidth : 0;
        const kWidth = desa.total > 0 ? (desa.konsinyasi / desa.total) * barWidth : 0;
        const bWidth = desa.total > 0 ? (desa.belum / desa.total) * barWidth : 0;

        let currentX = barX;
        // Selesai (Green)
        if (sWidth > 0) {
          doc.setFillColor(16, 185, 129); // emerald-500
          doc.rect(currentX, y + 2.8, sWidth, barHeight, 'F');
          currentX += sWidth;
        }
        // Konsinyasi (Amber)
        if (kWidth > 0) {
          doc.setFillColor(245, 158, 11); // amber-500
          doc.rect(currentX, y + 2.8, kWidth, barHeight, 'F');
          currentX += kWidth;
        }
        // Belum (Rose)
        if (bWidth > 0) {
          doc.setFillColor(244, 63, 94); // rose-500
          doc.rect(currentX, y + 2.8, bWidth, barHeight, 'F');
        }

        // Border around bar
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.1);
        doc.rect(barX, y + 2.8, barWidth, barHeight, 'D');

        // --- GRAPH 2: TRABAS ---
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text('Upload TRABAS:', 67, y + 10);

        const trabasSudahWidth = desa.total > 0 ? (desa.trabasSudah / desa.total) * barWidth : 0;
        const trabasBelumWidth = desa.total > 0 ? (desa.trabasBelum / desa.total) * barWidth : 0;

        // Sudah (Blue)
        doc.setFillColor(59, 130, 246); // blue-500
        doc.rect(barX, y + 7.8, trabasSudahWidth, barHeight, 'F');

        // Belum (Gray)
        doc.setFillColor(203, 213, 225); // slate-300
        doc.rect(barX + trabasSudahWidth, y + 7.8, trabasBelumWidth, barHeight, 'F');

        // Border around TRABAS bar
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.1);
        doc.rect(barX, y + 7.8, barWidth, barHeight, 'D');

        // --- Column 3: Rincian Angka ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(`S:${desa.selesai} | K:${desa.konsinyasi} | B:${desa.belum}`, 127, y + 5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`Sd:${desa.trabasSudah} | Bl:${desa.trabasBelum}`, 127, y + 10);

        // --- Column 4: Percentages & Summary ---
        const selesaiPctDesa = desa.total > 0 ? Math.round((desa.selesai / desa.total) * 100) : 0;
        const trabasPctDesa = desa.total > 0 ? Math.round((desa.trabasSudah / desa.total) * 100) : 0;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(16, 185, 129); // emerald-500
        doc.text(`Berkas: ${selesaiPctDesa}%`, 172, y + 5);
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(59, 130, 246); // blue-500
        doc.text(`TRABAS: ${trabasPctDesa}%`, 172, y + 10);

        y += rowHeight;
      });

      y += 10;

      // Sign off note
      if (y > 270) {
        doc.addPage();
        pageNum++;
        drawFooter(doc, pageNum);
        y = 20;
      }
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text('* Laporan ini dihasilkan secara otomatis oleh Project Ventura GIS & Land Management System.', 15, y);
      doc.text('* Untuk konfirmasi atau pembaruan berkas, silakan hubungi tim Verifikasi QC atau Administrator.', 15, y + 4.5);

      // Save/Download PDF
      const cleanFileName = (activeProjectName || 'Project_Ventura').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      doc.save(`Laporan_Progres_${cleanFileName}_${today.toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("Gagal mengekspor PDF:", err);
      alert("Terjadi kesalahan saat menghasilkan PDF. Silakan coba lagi.");
    }
  };

  return (
    <div className="space-y-8" id="sip_dashboard">
      {/* Upper Welcome and Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">Ringkasan Data Pertanahan Desa</h1>
          <p className="text-slate-300 text-sm mt-1">
            {role === 'GUEST' 
              ? 'Pantau progres berkas pertanahan, luas bidang tanah, bangunan, dan tanaman secara real-time.'
              : 'Pantau progres berkas pertanahan, luas bidang tanah, bangunan, tanaman, dan hasil verifikasi QC.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 self-start md:self-center">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
            title="Ekspor Ringkasan Dashboard ke PDF untuk WhatsApp"
          >
            <FileDown className="w-4 h-4" />
            EKSPOR LAPORAN PDF
          </button>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-500/20 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Terhubung Google Sheets
          </span>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${role === 'GUEST' ? '' : 'lg:grid-cols-4'} gap-5`}>
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

        {role !== 'GUEST' && (
          <>
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
          </>
        )}
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
          <div 
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedCategory(prev => prev === 'SELESAI' ? null : 'SELESAI');
              setSearchQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSelectedCategory(prev => prev === 'SELESAI' ? null : 'SELESAI');
                setSearchQuery('');
              }
            }}
            className={`glass-card p-5 rounded-2xl shadow-lg border flex flex-col justify-between hover:border-emerald-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer ${
              selectedCategory === 'SELESAI' ? 'ring-2 ring-emerald-500 bg-emerald-500/10 border-emerald-500/50' : 'border-white/5'
            }`}
          >
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
            {selectedCategory === 'SELESAI' && (
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider text-right mt-2 block animate-pulse">▼ Tabel Aktif</span>
            )}
          </div>

          {/* Konsinyasi Card */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedCategory(prev => prev === 'KONSINYASI' ? null : 'KONSINYASI');
              setSearchQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSelectedCategory(prev => prev === 'KONSINYASI' ? null : 'KONSINYASI');
                setSearchQuery('');
              }
            }}
            className={`glass-card p-5 rounded-2xl shadow-lg border flex flex-col justify-between hover:border-amber-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer ${
              selectedCategory === 'KONSINYASI' ? 'ring-2 ring-amber-500 bg-amber-500/10 border-amber-500/50' : 'border-white/5'
            }`}
          >
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
            {selectedCategory === 'KONSINYASI' && (
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider text-right mt-2 block animate-pulse">▼ Tabel Aktif</span>
            )}
          </div>

          {/* Belum Selesai Card */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedCategory(prev => prev === 'BELUM' ? null : 'BELUM');
              setSearchQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSelectedCategory(prev => prev === 'BELUM' ? null : 'BELUM');
                setSearchQuery('');
              }
            }}
            className={`glass-card p-5 rounded-2xl shadow-lg border flex flex-col justify-between hover:border-rose-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer ${
              selectedCategory === 'BELUM' ? 'ring-2 ring-rose-500 bg-rose-500/10 border-rose-500/40' : 'border-white/5'
            }`}
          >
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
            {selectedCategory === 'BELUM' && (
              <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider text-right mt-2 block animate-pulse">▼ Tabel Aktif</span>
            )}
          </div>
        </div>

        {/* Interactive Data Table for Guest view with Search */}
        {selectedCategory && (
          <div className="glass-card p-6 rounded-2xl border border-indigo-500/20 shadow-xl space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    selectedCategory === 'SELESAI' ? 'bg-emerald-500 animate-pulse' :
                    selectedCategory === 'KONSINYASI' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 animate-pulse'
                  }`} />
                  Tabel Data: {
                    selectedCategory === 'SELESAI' ? 'BERKAS SELESAI' :
                    selectedCategory === 'KONSINYASI' ? 'BERKAS KONSINYASI' : 'BELUM SELESAI'
                  }
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Menampilkan {searchedRecords.length} bidang dari total {filteredRecordsByCategory.length} bidang dalam kategori ini.
                </p>
              </div>
              <button 
                onClick={() => { setSelectedCategory(null); setSearchQuery(''); }}
                className="self-end sm:self-center px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white rounded-xl transition-colors text-[10px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
                Tutup Tabel
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search className="w-4 h-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Ketik nama desa, span, nomor bidang, atau keterangan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Village Details Table */}
            <div className="overflow-x-auto border border-white/5 rounded-xl bg-slate-950/40 shadow-inner">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3 font-bold">Desa</th>
                    <th className="px-4 py-3 font-bold">SPAN</th>
                    <th className="px-4 py-3 font-bold">No Bidang</th>
                    <th className="px-4 py-3 font-bold text-right">Luas (m²)</th>
                    <th className="px-4 py-3 font-bold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {searchedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-400 italic font-sans">
                        Tidak ada data yang cocok dengan kriteria pencarian
                      </td>
                    </tr>
                  ) : (
                    searchedRecords.map((r, i) => (
                      <tr key={`${r.ID_UNIK || r.CODE || 'row'}-${i}`} className="hover:bg-white/5 transition-colors duration-150">
                        <td className="px-4 py-3 font-medium text-slate-200 font-sans whitespace-nowrap">{r.DESA || '-'}</td>
                        <td className="px-4 py-3 font-mono text-slate-300 font-medium whitespace-nowrap">{r.SPAN || '-'}</td>
                        <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{r.NOBID || '-'}</td>
                        <td className="px-4 py-3 font-mono text-slate-300 text-right whitespace-nowrap">
                          {parseFloat(r.LUAS) ? parseFloat(r.LUAS).toLocaleString('id-ID') : r.LUAS || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-sans min-w-[250px] max-w-md whitespace-pre-wrap break-words" title={r.KETERANGAN}>
                          {r.KETERANGAN || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
      {role !== 'GUEST' && (
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
      )}
    </div>
  );
}
