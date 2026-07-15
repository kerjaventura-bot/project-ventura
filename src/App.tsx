import React, { useState, useEffect, useCallback } from 'react';
import { 
  googleSignIn, logout, auth, setAccessToken, db
} from './lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  findOrCreateSpreadsheet, fetchSpreadsheetRecords, saveRecordToSpreadsheet, setupProjectDriveStructure, findOrCreateFolder 
} from './lib/googleApi';
import { type LandRecord, compareLandRecords } from './types';
import Dashboard from './components/Dashboard';
import FormInput from './components/FormInput';
import DocUpload from './components/DocUpload';
import QCPanel from './components/QCPanel';
import { 
  Map, Database, UploadCloud, ShieldAlert, LogOut, 
  RefreshCw, FileSpreadsheet, KeyRound, CheckSquare,
  Plus, UserCheck, Settings, Folder, Key, Eye, EyeOff, Lock, Unlock, Info, ShieldCheck, HelpCircle, Briefcase,
  Pin, Menu
} from 'lucide-react';

interface ProjectConfig {
  id: string;
  name: string;
  folderId: string | null;
  spreadsheetId: string | null;
  uploadsFolderId: string | null;
}

const DEFAULT_PROJECTS: ProjectConfig[] = [
  { id: 'proj-1', name: 'KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN', folderId: null, spreadsheetId: null, uploadsFolderId: null },
  { id: 'proj-2', name: 'KOMPENSASI ROW 150 kV BANGIL - BULUKANDANG', folderId: null, spreadsheetId: null, uploadsFolderId: null },
  { id: 'proj-3', name: 'KOMPENSASI ROW 150 kV LAWANG - BULUKANDANG', folderId: null, spreadsheetId: null, uploadsFolderId: null },
  { id: 'proj-4', name: 'KOMPENSASI ROW 150 kV GRATI - BANGIL', folderId: null, spreadsheetId: null, uploadsFolderId: null },
];

export default function App() {
  // Auth state
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Role based access control (RBAC) states
  const [role, setRole] = useState<'ADMIN' | 'FIELD' | 'QC' | 'GUEST' | null>(() => {
    return (localStorage.getItem('project_ventura_role') as any) || null;
  });
  const [loginRole, setLoginRole] = useState<'ADMIN' | 'FIELD' | 'QC' | 'GUEST'>('ADMIN');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  // Default role PINs (editable/customizable by Admin in settings if needed, or static defaults)
  const [rolePins, setRolePins] = useState(() => {
    const saved = localStorage.getItem('project_ventura_role_pins');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      ADMIN: 'admin123',
      FIELD: 'lapangan123',
      QC: 'qc123',
      GUEST: 'tamu123'
    };
  });

  // Projects state
  const [projects, setProjects] = useState<ProjectConfig[]>(() => {
    const saved = localStorage.getItem('project_ventura_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return DEFAULT_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return localStorage.getItem('project_ventura_active_project_id') || 'proj-1';
  });

  // Main master records and Google Sheets states
  const [records, setRecords] = useState<LandRecord[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [projectUploadsFolderId, setProjectUploadsFolderId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<'dashboard' | 'input' | 'upload' | 'qc'>('dashboard');
  
  // Sidebar state
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    const saved = localStorage.getItem('project_ventura_sidebar_pinned');
    return saved === null ? true : saved === 'true';
  });
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  
  // Loading and feedback states
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [sheetNameInfo, setSheetNameInfo] = useState<string | null>(null);

  // Admin specific states
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showPinSettings, setShowPinSettings] = useState(false);
  const [newAdminPin, setNewAdminPin] = useState('');
  const [newFieldPin, setNewFieldPin] = useState('');
  const [newQcPin, setNewQcPin] = useState('');

  // Project ID configuration & Syncing tools
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editSpreadsheetId, setEditSpreadsheetId] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editUploadsFolderId, setEditUploadsFolderId] = useState('');
  
  const [showBackupTools, setShowBackupTools] = useState(false);
  const [backupJsonString, setBackupJsonString] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  // Save projects to Firestore cloud database (so other accounts can sync automatically)
  const saveProjectsToCloud = async (updatedProjects: ProjectConfig[]) => {
    try {
      await setDoc(doc(db, 'configs', 'projects'), {
        projectsList: updatedProjects,
        lastUpdated: Date.now(),
        updatedBy: user?.email || 'unknown'
      });
      console.log("Konfigurasi proyek berhasil disimpan di Firestore cloud!");
    } catch (err) {
      console.warn("Gagal menyimpan ke Firestore cloud (Mungkin Firestore belum diaktifkan):", err);
    }
  };

  // Load projects from Firestore cloud database (for automatic cross-device sync)
  const loadProjectsFromCloud = useCallback(async () => {
    try {
      const docRef = doc(db, 'configs', 'projects');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.projectsList) && data.projectsList.length > 0) {
          setProjects(data.projectsList);
          localStorage.setItem('project_ventura_projects', JSON.stringify(data.projectsList));
          console.log("Konfigurasi proyek disinkronkan dari Firestore cloud!");
          
          // Also verify active project still exists
          const currentActive = localStorage.getItem('project_ventura_active_project_id') || 'proj-1';
          const activeExists = data.projectsList.some((p: any) => p.id === currentActive);
          if (!activeExists) {
            const fallbackId = data.projectsList[0].id;
            setActiveProjectId(fallbackId);
            localStorage.setItem('project_ventura_active_project_id', fallbackId);
          }
        }
      }
    } catch (err) {
      console.warn("Gagal mengambil dari Firestore cloud (Menggunakan local storage):", err);
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadProjectsFromCloud();
      } else {
        setUser(null);
        setToken(null);
        setSpreadsheetId(null);
        setRecords([]);
      }
    });
    return () => unsubscribe();
  }, [loadProjectsFromCloud]);

  // Handle SignIn action
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setAuthError(err.message || 'Gagal masuk dengan akun Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout action
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setSpreadsheetId(null);
      setRecords([]);
      setRole(null);
      localStorage.removeItem('project_ventura_role');
      setActiveMenu('dashboard');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Connect and load/create project-specific Google Drive/Spreadsheet
  const loadProjectData = useCallback(async (accessToken: string, projectId: string) => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const activeProj = projects.find(p => p.id === projectId);
      if (!activeProj) throw new Error("Proyek tidak ditemukan.");
      
      let folderId = activeProj.folderId;
      let sheetId = activeProj.spreadsheetId;
      let uploadsFolderId = activeProj.uploadsFolderId;
      
      // If any is missing, automate creation in Drive under "PROJECT_VENTURA"
      if (!folderId || !sheetId || !uploadsFolderId) {
        const setup = await setupProjectDriveStructure(accessToken, activeProj.name);
        folderId = setup.folderId;
        sheetId = setup.spreadsheetId;
        uploadsFolderId = setup.uploadsFolderId;
        
        // Save back to projects state and localStorage
        const updatedProjects = projects.map(p => {
          if (p.id === projectId) {
            return { ...p, folderId, spreadsheetId: sheetId, uploadsFolderId };
          }
          return p;
        });
        setProjects(updatedProjects);
        localStorage.setItem('project_ventura_projects', JSON.stringify(updatedProjects));
        saveProjectsToCloud(updatedProjects);
      }
      
      setSpreadsheetId(sheetId);
      setProjectUploadsFolderId(uploadsFolderId);
      
      // Fetch all rows
      const items = await fetchSpreadsheetRecords(accessToken, sheetId);
      const sortedItems = [...items].sort(compareLandRecords);
      setRecords(sortedItems);
      setSheetNameInfo(activeProj.name);
    } catch (err: any) {
      console.error("Sync error:", err);
      setDataError(err.message || 'Gagal menyinkronkan data proyek dengan Google Drive/Sheets. Periksa koneksi internet atau hak akses.');
    } finally {
      setIsLoadingData(false);
    }
  }, [projects]);

  // Sync when token/projectId becomes available
  useEffect(() => {
    if (token && activeProjectId && role) {
      loadProjectData(token, activeProjectId);
    }
  }, [token, activeProjectId, role, loadProjectData]);

  // Re-sync button handler
  const handleManualSync = () => {
    if (token && activeProjectId) {
      loadProjectData(token, activeProjectId);
    }
  };

  // Callback to add/update a record in the sheet
  const handleSaveRecord = async (record: LandRecord, isEdit: boolean) => {
    if (!token || !spreadsheetId) {
      throw new Error('Koneksi Google Drive terputus. Silakan hubungkan ulang.');
    }
    
    // Save/append to spreadsheet
    await saveRecordToSpreadsheet(token, spreadsheetId, record, isEdit, records);
    
    // Refresh local list
    const updatedRecords = await fetchSpreadsheetRecords(token, spreadsheetId);
    const sortedRecords = [...updatedRecords].sort(compareLandRecords);
    setRecords(sortedRecords);
  };

  // Callback to update a record (e.g. after adding file links or admin QC)
  const handleUpdateRecord = async (updatedRecord: LandRecord) => {
    if (!token || !spreadsheetId) {
      throw new Error('Koneksi Google Drive terputus. Silakan hubungkan ulang.');
    }

    // Save full record back to spreadsheet
    await saveRecordToSpreadsheet(token, spreadsheetId, updatedRecord, true, records);
    
    // Refresh local list
    const refreshed = await fetchSpreadsheetRecords(token, spreadsheetId);
    const sortedRefreshed = [...refreshed].sort(compareLandRecords);
    setRecords(sortedRefreshed);
  };

  // Handle Role Verification
  const handleVerifyRole = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (loginRole === 'GUEST') {
      // Guest doesn't need strict PIN or can use tamu123
      if (pinInput && pinInput !== rolePins.GUEST) {
        setPinError('PIN Tamu salah. Masukkan "tamu123" atau biarkan kosong.');
        return;
      }
      setRole('GUEST');
      localStorage.setItem('project_ventura_role', 'GUEST');
      setActiveMenu('dashboard');
      setPinInput('');
      return;
    }

    const expectedPin = rolePins[loginRole];
    if (pinInput === expectedPin) {
      setRole(loginRole);
      localStorage.setItem('project_ventura_role', loginRole);
      setPinInput('');
      setActiveMenu('dashboard');
    } else {
      setPinError(`PIN untuk peran ${loginRole} salah.`);
    }
  };

  // Switch role action (returns to role selection screen)
  const handleSwitchRole = () => {
    setRole(null);
    localStorage.removeItem('project_ventura_role');
  };

  // Admin action: Add new project path
  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newProj: ProjectConfig = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim().toUpperCase(),
      folderId: null,
      spreadsheetId: null,
      uploadsFolderId: null
    };

    const updated = [...projects, newProj];
    setProjects(updated);
    localStorage.setItem('project_ventura_projects', JSON.stringify(updated));
    saveProjectsToCloud(updated);
    setActiveProjectId(newProj.id);
    localStorage.setItem('project_ventura_active_project_id', newProj.id);
    
    setNewProjectName('');
    setIsAddingProject(false);
  };

  // Admin action: Delete project path
  const handleDeleteProject = (id: string) => {
    if (projects.length <= 1) {
      alert("Harus ada minimal 1 proyek di aplikasi.");
      return;
    }
    if (confirm("Apakah Anda yakin ingin menghapus jalur proyek ini dari daftar aplikasi? (Data di Google Drive/Sheets tidak akan terhapus)")) {
      const updated = projects.filter(p => p.id !== id);
      setProjects(updated);
      localStorage.setItem('project_ventura_projects', JSON.stringify(updated));
      saveProjectsToCloud(updated);
      if (activeProjectId === id) {
        const nextActive = updated[0].id;
        setActiveProjectId(nextActive);
        localStorage.setItem('project_ventura_active_project_id', nextActive);
      }
    }
  };

  // Admin action: Save customized PIN codes
  const handleSavePins = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedPins = {
      ADMIN: newAdminPin || rolePins.ADMIN,
      FIELD: newFieldPin || rolePins.FIELD,
      QC: newQcPin || rolePins.QC,
      GUEST: rolePins.GUEST
    };
    setRolePins(updatedPins);
    localStorage.setItem('project_ventura_role_pins', JSON.stringify(updatedPins));
    setShowPinSettings(false);
    alert("PIN Akses berhasil diperbarui!");
  };

  // Start editing manual Spreadsheet & Folder IDs for a project
  const startEditingProject = (proj: ProjectConfig) => {
    setEditingProjectId(proj.id);
    setEditSpreadsheetId(proj.spreadsheetId || '');
    setEditFolderId(proj.folderId || '');
    setEditUploadsFolderId(proj.uploadsFolderId || '');
  };

  // Cancel editing IDs
  const cancelEditingProject = () => {
    setEditingProjectId(null);
    setEditSpreadsheetId('');
    setEditFolderId('');
    setEditUploadsFolderId('');
  };

  // Save manual Spreadsheet & Folder IDs
  const handleSaveProjectIDs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjectId) return;

    const updated = projects.map(p => {
      if (p.id === editingProjectId) {
        return {
          ...p,
          spreadsheetId: editSpreadsheetId.trim() || null,
          folderId: editFolderId.trim() || null,
          uploadsFolderId: editUploadsFolderId.trim() || null
        };
      }
      return p;
    });

    setProjects(updated);
    localStorage.setItem('project_ventura_projects', JSON.stringify(updated));
    saveProjectsToCloud(updated);

    // Force data reload if we just edited the active project
    if (activeProjectId === editingProjectId) {
      setSpreadsheetId(editSpreadsheetId.trim() || null);
      setProjectUploadsFolderId(editUploadsFolderId.trim() || null);
      if (token) {
        loadProjectData(token, activeProjectId);
      }
    }

    cancelEditingProject();
    alert("Konfigurasi ID Google Drive / Sheets berhasil disimpan!");
  };

  // Copy full project settings JSON to Clipboard
  const handleExportConfig = () => {
    const jsonStr = JSON.stringify(projects, null, 2);
    navigator.clipboard.writeText(jsonStr)
      .then(() => {
        alert("Konfigurasi proyek berhasil disalin ke Clipboard! Silakan paste (tempel) di menu Impor di web Anda.");
      })
      .catch(err => {
        console.error("Gagal menyalin:", err);
        // Fallback: show in textarea
        setBackupJsonString(jsonStr);
        alert("Gagal otomatis menyalin. Silakan salin teks dari kotak yang muncul di bawah.");
      });
  };

  // Import project settings from JSON
  const handleImportConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setImportStatus('idle');
    setImportMessage('');

    if (!backupJsonString.trim()) {
      setImportStatus('error');
      setImportMessage('Masukkan kode konfigurasi terlebih dahulu.');
      return;
    }

    try {
      const parsed = JSON.parse(backupJsonString.trim());
      if (!Array.isArray(parsed)) {
        throw new Error("Data konfigurasi harus berupa Array.");
      }

      // Basic structure validation
      const isValid = parsed.every(p => p && typeof p === 'object' && p.id && p.name);
      if (!isValid) {
        throw new Error("Format data tidak valid. Pastikan setiap proyek memiliki ID dan Nama.");
      }

      setProjects(parsed);
      localStorage.setItem('project_ventura_projects', JSON.stringify(parsed));
      saveProjectsToCloud(parsed);
      
      // Select the first project as active
      if (parsed.length > 0) {
        setActiveProjectId(parsed[0].id);
        localStorage.setItem('project_ventura_active_project_id', parsed[0].id);
        
        // Force refresh active spreadsheet configuration
        setSpreadsheetId(parsed[0].spreadsheetId || null);
        setProjectUploadsFolderId(parsed[0].uploadsFolderId || null);
        
        if (token) {
          loadProjectData(token, parsed[0].id);
        }
      }

      setImportStatus('success');
      setImportMessage('Konfigurasi berhasil diimpor! Data Anda sekarang sepenuhnya sinkron.');
      setBackupJsonString('');
      setTimeout(() => {
        setShowBackupTools(false);
        setImportStatus('idle');
      }, 3000);
    } catch (err: any) {
      setImportStatus('error');
      setImportMessage(`Gagal mengimpor: ${err.message || 'Format tidak valid.'}`);
    }
  };

  // Initialize Admin PIN settings form on open
  useEffect(() => {
    if (showPinSettings) {
      setNewAdminPin(rolePins.ADMIN);
      setNewFieldPin(rolePins.FIELD);
      setNewQcPin(rolePins.QC);
    }
  }, [showPinSettings, rolePins]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden" id="sip_root_app">
      {/* Dynamic Background Blur Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600 rounded-full blur-[130px] opacity-15 pointer-events-none z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-emerald-600 rounded-full blur-[150px] opacity-15 pointer-events-none z-0"></div>
      <div className="absolute top-[40%] right-[10%] w-[350px] h-[350px] bg-purple-600 rounded-full blur-[120px] opacity-10 pointer-events-none z-0"></div>

      {/* 1. TOP BAR NAVBAR */}
      <header className="glass-card border-t-0 border-x-0 sticky top-0 z-40 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30 shadow-inner">
            <Briefcase className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-pulse shadow-md shadow-indigo-400/50"></div>
            <div>
              <h1 className="text-md font-extrabold text-white tracking-tight leading-none font-sans uppercase">
                PROJECT <span className="text-indigo-400 font-light">VENTURA</span>
              </h1>
              <p className="text-[9px] text-slate-400 font-bold tracking-wider uppercase mt-1">Sistem Informasi Pertanahan Desa</p>
            </div>
          </div>
        </div>

        {/* Project Display Banner and Profile Area */}
        {user && role && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto self-stretch md:self-auto justify-end z-10">
            {/* Locked Project Display Banner */}
            <div className="flex items-center gap-2.5 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl w-full sm:w-auto sm:max-w-[320px] lg:max-w-[420px] truncate shadow-inner">
              <Briefcase className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-[9px] font-extrabold text-indigo-300 uppercase tracking-wider shrink-0">Jalur:</span>
              <span className="text-xs font-extrabold text-white truncate font-sans" title={projects.find(p => p.id === activeProjectId)?.name}>
                {projects.find(p => p.id === activeProjectId)?.name || 'MEMUAT...'}
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              {/* Sync Button */}
              {token ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleManualSync}
                    disabled={isLoadingData}
                    className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/10 hover:border-white/20 transition-all inline-flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"
                    title="Sinkronisasi Ulang Data Google Sheets"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                    Sync
                  </button>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Online
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-xl border border-amber-500/20 flex items-center gap-1 transition-all cursor-pointer shrink-0"
                  title="Hubungkan Google Drive Admin"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Hubungkan Drive
                </button>
              )}

              {/* Role Badge and Switch */}
              <div className="flex items-center gap-2 pl-2.5 border-l border-white/10 shrink-0">
                <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                  role === 'ADMIN' ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' :
                  role === 'FIELD' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                  role === 'QC' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                  'bg-slate-500/15 text-slate-300 border-slate-500/30'
                }`} title={`Peran saat ini: ${role}`}>
                  {role === 'ADMIN' ? 'Admin' : role === 'FIELD' ? 'Lapangan' : role === 'QC' ? 'QC' : 'Tamu'}
                </span>

                <button
                  onClick={handleSwitchRole}
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/10 hover:border-white/20 transition-all text-[10px] font-bold cursor-pointer shrink-0"
                  title="Ganti Jalur Proyek atau Hak Akses / Peran"
                >
                  Ganti Jalur/Peran
                </button>
              </div>

              {/* Profile Image & Logout */}
              <div className="flex items-center gap-2 pl-2.5 border-l border-white/10 shrink-0">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full border border-white/10" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                    {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 rounded-lg transition-colors cursor-pointer"
                  title="Keluar Google Account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 2. AUTHENTICATION & PORTAL LOGINS GATE */}
      {(!user || !token) ? (
        // A. Google Authentication Landing Card (Needs authorization first)
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col justify-center items-center z-10" id="sip_auth_landing">
          <div className="glass-card rounded-3xl overflow-hidden p-8 md:p-12 text-center space-y-8 max-w-lg w-full shadow-2xl border border-white/10">
            <div className="mx-auto w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg">
              <FileSpreadsheet className="w-8 h-8" />
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full uppercase tracking-wider">
                Desa Digital & Sertifikasi Tanah
              </span>
              <h2 className="text-2xl font-extrabold text-white tracking-tight font-sans uppercase">
                PROJECT VENTURA
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto">
                Silakan hubungkan akun Google Drive untuk menyinkronkan data lahan, berkas fisik PDF, jalur kompensasi ROW, serta administrasi quality control secara real-time.
              </p>
            </div>

            {authError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold rounded-xl flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                <p className="text-left">{authError}</p>
              </div>
            )}

            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-white/10 border border-white/15 hover:bg-white/15 hover:border-white/25 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/5"
            >
              <div className="flex items-center justify-center gap-3">
                <div className="shrink-0">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '20px', height: '20px' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                  {isLoggingIn ? 'Menghubungkan Google...' : 'Hubungkan Google Drive'}
                </span>
              </div>
            </button>

            <div className="border-t border-white/5 pt-6 text-left space-y-3.5 text-xs text-slate-400">
              <p className="font-semibold text-slate-300 text-center mb-1 text-[11px] uppercase tracking-wide">Persyaratan Akses Sistem</p>
              <div className="flex gap-2.5">
                <div className="text-indigo-400 shrink-0 font-bold">1.</div>
                <p><strong>Admin / Creator:</strong> Harus masuk dengan Google Account yang memiliki lisensi Google Drive & Sheets untuk inisialisasi struktur file.</p>
              </div>
              <div className="flex gap-2.5">
                <div className="text-indigo-400 shrink-0 font-bold">2.</div>
                <p><strong>Staf Lapangan / QC / Tamu:</strong> Masuk menggunakan tautan Google yang sama atau yang telah diberi izin akses ke Google Drive Folder proyek oleh Admin.</p>
              </div>
            </div>
          </div>
        </main>
      ) : !role ? (
        // B. Role Selection Gate & PIN Verification Card (Google is connected, select role and enter PIN)
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col justify-center items-center z-10" id="sip_role_gate">
          <div className="glass-card rounded-3xl overflow-hidden p-8 md:p-10 max-w-lg w-full shadow-2xl border border-white/10 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center border border-white/5 mx-auto">
                <UserCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight font-sans">Verifikasi Akses Peran</h2>
              <p className="text-xs text-slate-400 leading-normal max-w-xs mx-auto">
                Terhubung sebagai <span className="font-semibold text-indigo-400 font-mono">{user.email}</span>. Pilih peran Anda untuk melanjutkan.
              </p>
            </div>

            <form onSubmit={handleVerifyRole} className="space-y-5">
              {/* Step 1: Project / Transmission Path Selection */}
              <div className="space-y-2">
                <label htmlFor="login_project_select" className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Langkah 1: Pilih Jalur Transmisi / Proyek
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-indigo-400">
                    <Briefcase className="w-4 h-4" />
                  </span>
                  <select
                    id="login_project_select"
                    value={activeProjectId}
                    onChange={(e) => {
                      setActiveProjectId(e.target.value);
                      localStorage.setItem('project_ventura_active_project_id', e.target.value);
                    }}
                    className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-sans font-bold"
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id} className="bg-slate-950 text-white font-semibold">
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Seluruh pengisian data lahan, berkas fisik PDF, & QC akan difokuskan khusus untuk jalur proyek yang Anda pilih ini.
                </p>
              </div>

              {/* Step 2: Role selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Langkah 2: Pilih Peran Pekerjaan Anda
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => { setLoginRole('ADMIN'); setPinError(null); }}
                    className={`px-4 py-3 rounded-xl border text-left flex justify-between items-center transition-all cursor-pointer ${
                      loginRole === 'ADMIN' 
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg' 
                        : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <strong className="text-xs block text-left">1. Administrator (Admin)</strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5 text-left">Kelola seluruh data, tambah jalur proyek, & atur PIN akses</span>
                    </div>
                    {loginRole === 'ADMIN' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0"></div>}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setLoginRole('FIELD'); setPinError(null); }}
                    className={`px-4 py-3 rounded-xl border text-left flex justify-between items-center transition-all cursor-pointer ${
                      loginRole === 'FIELD' 
                        ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-lg' 
                        : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <strong className="text-xs block text-left">2. Petugas Lapangan (Lapangan)</strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5 text-left">Pengisian data lahan, tanaman, bangunan, & upload berkas PDF</span>
                    </div>
                    {loginRole === 'FIELD' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"></div>}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setLoginRole('QC'); setPinError(null); }}
                    className={`px-4 py-3 rounded-xl border text-left flex justify-between items-center transition-all cursor-pointer ${
                      loginRole === 'QC' 
                        ? 'bg-amber-600/20 border-amber-500 text-white shadow-lg' 
                        : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <strong className="text-xs block text-left">3. Verifikator Quality Control (QC)</strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5 text-left">Cek kelayakan data, isi status QC berkas, & unggah berkas</span>
                    </div>
                    {loginRole === 'QC' && <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></div>}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setLoginRole('GUEST'); setPinError(null); }}
                    className={`px-4 py-3 rounded-xl border text-left flex justify-between items-center transition-all cursor-pointer ${
                      loginRole === 'GUEST' 
                        ? 'bg-slate-700/35 border-slate-500 text-white shadow-lg' 
                        : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <strong className="text-xs block text-left">4. Tamu Kontraktor (Tamu)</strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5 text-left">Akses Dashboard Utama, visualisasi, dan grafik progres (Read-Only)</span>
                    </div>
                    {loginRole === 'GUEST' && <div className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0"></div>}
                  </button>
                </div>
              </div>

              {/* Step 3: PIN Code entry */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="role_pin_input" className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                    Langkah 3: {loginRole === 'GUEST' ? 'PIN Tamu (Opsional / tamu123)' : `Masukkan PIN Akses ${loginRole}`}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold cursor-pointer"
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPin ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Key className="w-4 h-4" />
                  </span>
                  <input
                    id="role_pin_input"
                    type={showPin ? 'text' : 'password'}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder={loginRole === 'GUEST' ? 'Masukkan tamu123 atau biarkan kosong' : `Sandi PIN ${loginRole}...`}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 tracking-widest placeholder:tracking-normal placeholder:text-slate-500 font-mono"
                  />
                </div>
                

              </div>

              {pinError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <p>{pinError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 py-2.5 bg-slate-900 border border-white/10 hover:bg-slate-950 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Ganti Akun Google
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
                >
                  Verifikasi & Masuk
                </button>
              </div>
            </form>
          </div>
        </main>
      ) : (
        /* 3. CORE APP VIEW (NAVBAR + VIEW PANEL) */
        <div className="flex-1 flex flex-col md:flex-row max-w-full w-full p-4 sm:p-6 lg:p-8 gap-6 z-10 relative" id="sip_main_layout">
          
          {/* Backdrop overlay when sidebar is auto-hiding and opened */}
          {!isSidebarPinned && isSidebarHovered && (
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-xs z-45 transition-opacity duration-300"
              onClick={() => setIsSidebarHovered(false)}
            />
          )}

          {/* Floating trigger button and hover strip when unpinned */}
          {!isSidebarPinned && (
            <div className="fixed left-0 top-[120px] z-40 flex items-center">
              {/* Floating Tab Button */}
              <button
                onMouseEnter={() => setIsSidebarHovered(true)}
                onClick={() => setIsSidebarHovered(true)}
                className="p-3 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-r-2xl shadow-xl border border-l-0 border-indigo-400/30 transition-all hover:pr-5 cursor-pointer flex items-center justify-center group"
                title="Arahkan kursor atau klik untuk membuka menu"
              >
                <Menu className="w-4 h-4 animate-pulse group-hover:scale-110 transition-all" />
              </button>
              
              {/* Secret hover-trigger border zone */}
              <div 
                onMouseEnter={() => setIsSidebarHovered(true)}
                className="fixed inset-y-0 left-0 w-3.5 z-30"
              />
            </div>
          )}

          {/* Menu Sidebar */}
          <aside 
            onMouseEnter={() => setIsSidebarHovered(true)}
            onMouseLeave={() => setIsSidebarHovered(false)}
            className={`
              transition-all duration-300 ease-in-out shadow-lg flex flex-col gap-1.5 shrink-0
              ${isSidebarPinned 
                ? 'md:w-64 glass-card p-4 rounded-2xl h-fit' 
                : `fixed top-0 left-0 h-full w-72 p-6 z-50 bg-slate-950/98 backdrop-blur-md border-r border-white/10 shadow-2xl transform ${
                    isSidebarHovered ? 'translate-x-0' : '-translate-x-full'
                  }`
              }
            `}
          >
            {/* Sidebar Title with Pinned/Unpinned toggle button */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-2.5 px-1">
              <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">
                Menu Aplikasi
              </span>
              <button
                type="button"
                onClick={() => {
                  const newPinned = !isSidebarPinned;
                  setIsSidebarPinned(newPinned);
                  localStorage.setItem('project_ventura_sidebar_pinned', String(newPinned));
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer"
                title={isSidebarPinned ? "Sembunyikan menu otomatis (Auto-hide)" : "Sematkan menu di samping (Pinned)"}
              >
                {isSidebarPinned ? (
                  <Pin className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <Pin className="w-3.5 h-3.5 rotate-45 text-slate-500 hover:text-indigo-400" />
                )}
              </button>
            </div>

            {/* Menu 1. Dashboard Utama - All roles can see */}
            <button
              onClick={() => {
                setActiveMenu('dashboard');
                if (!isSidebarPinned) setIsSidebarHovered(false);
              }}
              className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                activeMenu === 'dashboard' 
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Map className="w-4 h-4 shrink-0" />
              1. Dashboard Utama
            </button>

            {/* Menu 2. Input & Edit Lahan - Locked for Guests */}
            {role !== 'GUEST' && (
              <button
                onClick={() => {
                  setActiveMenu('input');
                  if (!isSidebarPinned) setIsSidebarHovered(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                  activeMenu === 'input' 
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-inner' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <Database className="w-4 h-4 shrink-0" />
                2. Input & Edit Lahan
              </button>
            )}

            {/* Menu 3. Berkas Drive (PDF) - Locked for Guests */}
            {role !== 'GUEST' && (
              <button
                onClick={() => {
                  setActiveMenu('upload');
                  if (!isSidebarPinned) setIsSidebarHovered(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                  activeMenu === 'upload' 
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-inner' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <UploadCloud className="w-4 h-4 shrink-0" />
                3. Berkas Drive (PDF)
              </button>
            )}

            {/* Menu 4. Verifikasi & QC - Admin and QC only */}
            {(role === 'ADMIN' || role === 'QC') && (
              <button
                onClick={() => {
                  setActiveMenu('qc');
                  if (!isSidebarPinned) setIsSidebarHovered(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                  activeMenu === 'qc' 
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-inner' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                4. Verifikasi & QC
              </button>
            )}

            {/* ADMIN-ONLY PROJECT PATH CREATOR & SETTINGS */}
            {role === 'ADMIN' && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-2" id="admin_settings_sidebar">
                <span className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase px-3 py-1.5 block">
                  Manajemen Proyek & PIN
                </span>
                
                {/* Tambah Jalur Proyek Button */}
                <button
                  onClick={() => setIsAddingProject(!isAddingProject)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2.5 cursor-pointer border ${
                    isAddingProject 
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' 
                      : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  {isAddingProject ? 'Selesai Tambah' : 'Tambah Jalur Baru'}
                </button>

                {/* Edit PIN Settings Button */}
                <button
                  onClick={() => setShowPinSettings(!showPinSettings)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2.5 cursor-pointer border ${
                    showPinSettings 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                      : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 shrink-0" />
                  Kelola PIN Akses
                </button>

                {/* Backup & Sync Database Button */}
                <button
                  onClick={() => setShowBackupTools(!showBackupTools)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2.5 cursor-pointer border ${
                    showBackupTools 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                      : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  Ekspor & Impor Database
                </button>
              </div>
            )}

            {/* Connected Sheet Display */}
            {sheetNameInfo && (
              <div className="mt-4 p-3.5 bg-white/5 rounded-xl border border-white/5 text-[10px] text-slate-400 space-y-1.5 font-sans shadow-inner">
                <span className="font-bold text-slate-200 uppercase tracking-wide block">PROYEK AKTIF</span>
                <p className="font-semibold text-indigo-400 truncate font-mono">{sheetNameInfo}</p>
                <div className="text-[9px] text-slate-500 leading-normal pt-1 border-t border-white/5 space-y-0.5">
                  <p>Database: <span className="font-mono text-slate-400">Google Sheets</span></p>
                  <p>Hak Akses: <span className="font-semibold text-slate-300">{role === 'ADMIN' ? 'Akses Penuh' : role === 'FIELD' ? 'Staf Lapangan' : role === 'QC' ? 'Verifikator' : 'Tamu'}</span></p>
                </div>
              </div>
            )}
          </aside>

          {/* Main Display Panel */}
          <main className="flex-1 min-w-0 space-y-6">
            
            {/* INLINE ADMIN FORM: ADD PROJECT PATH */}
            {role === 'ADMIN' && isAddingProject && (
              <div className="glass-card p-5 rounded-2xl border border-indigo-500/30 shadow-lg space-y-3 animate-fadeIn" id="admin_add_project_form">
                <div className="flex items-center gap-1.5 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                  <Plus className="w-4 h-4" />
                  Tambah Jalur Kompensasi Baru
                </div>
                <p className="text-xs text-slate-400">
                  Masukkan nama jalur kompensasi ROW baru. Sistem akan otomatis membuat folder penyimpanan utama, folder dokumen terpisah, dan database Google Sheets baru untuk jalur ini di Google Drive Admin.
                </p>
                <form onSubmit={handleAddProject} className="flex flex-col sm:flex-row gap-2 mt-2">
                  <input
                    type="text"
                    required
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Contoh: KOMPENSASI ROW 150 kV GRATI - BANGIL"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase font-semibold placeholder:normal-case placeholder:font-normal"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingProject(false)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-slate-300 text-xs font-bold rounded-xl border border-white/10 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md"
                    >
                      Simpan & Buat Folder
                    </button>
                  </div>
                </form>

                 {/* List of current projects with Delete & Edit option */}
                 <div className="border-t border-white/5 pt-3 mt-3">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Daftar Jalur Saat Ini & ID Koneksi:</span>
                   <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                     {projects.map(proj => (
                       <div key={proj.id} className="flex flex-col gap-1 bg-white/5 p-3 rounded-lg border border-white/5">
                         <div className="flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-200 truncate pr-4">{proj.name}</span>
                           <div className="flex items-center gap-1.5 shrink-0">
                             <span className="text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300">
                               {proj.spreadsheetId ? 'Tersinkron' : 'Belum Setup'}
                             </span>
                             <button
                               type="button"
                               onClick={() => startEditingProject(proj)}
                               className="text-amber-400 hover:text-amber-300 text-[10px] font-bold px-2 py-1 bg-amber-500/10 rounded-md cursor-pointer border border-amber-500/15 hover:bg-amber-500/20"
                               title="Edit Manual ID Spreadsheet & Folder"
                             >
                               Edit ID
                             </button>
                             <button
                               type="button"
                               onClick={() => handleDeleteProject(proj.id)}
                               className="text-rose-400 hover:text-rose-300 text-[10px] font-bold px-2 py-1 bg-rose-500/10 rounded-md cursor-pointer border border-rose-500/15 hover:bg-rose-500/20"
                             >
                               Hapus
                             </button>
                           </div>
                         </div>
                         {proj.spreadsheetId && (
                           <div className="text-[9px] font-mono text-slate-500 truncate pt-1 border-t border-white/5 flex flex-col gap-0.5">
                             <span>Sheet ID: <span className="text-slate-400">{proj.spreadsheetId}</span></span>
                             {proj.folderId && <span>Folder ID: <span className="text-slate-400">{proj.folderId}</span></span>}
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* Manual IDs editor section */}
                 {editingProjectId && (
                   <form onSubmit={handleSaveProjectIDs} className="mt-4 p-4 bg-slate-900 rounded-xl border border-amber-500/30 space-y-3 animate-fadeIn">
                     <div className="flex items-center justify-between">
                       <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
                         Edit ID Google Drive & Sheets untuk Jalur:
                       </span>
                       <button 
                         type="button"
                         onClick={cancelEditingProject}
                         className="text-slate-400 hover:text-slate-200 font-bold text-xs"
                       >
                         ✕
                       </button>
                     </div>
                     <p className="text-[11px] text-white font-bold font-mono truncate">
                       {projects.find(p => p.id === editingProjectId)?.name}
                     </p>
                     
                     <div className="space-y-3">
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Google Spreadsheet ID</label>
                         <input
                           type="text"
                           required
                           value={editSpreadsheetId}
                           onChange={(e) => setEditSpreadsheetId(e.target.value)}
                           placeholder="Contoh: 1aBcDeFgH123456789..."
                           className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                         />
                         <span className="text-[8px] text-slate-500 leading-none">ID dari URL spreadsheet: https://docs.google.com/spreadsheets/d/<span className="font-bold text-slate-400">SPREADSHEET_ID</span>/edit</span>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-2">
                         <div>
                           <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Folder Utama ID (Optional)</label>
                           <input
                             type="text"
                             value={editFolderId}
                             onChange={(e) => setEditFolderId(e.target.value)}
                             placeholder="Contoh: 1XyZ..."
                             className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-200 font-mono focus:outline-none"
                           />
                         </div>
                         <div>
                           <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Folder PDF ID (Optional)</label>
                           <input
                             type="text"
                             value={editUploadsFolderId}
                             onChange={(e) => setEditUploadsFolderId(e.target.value)}
                             placeholder="Contoh: 1AbC..."
                             className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-200 font-mono focus:outline-none"
                           />
                         </div>
                       </div>
                     </div>

                     <div className="flex justify-end gap-1.5 pt-1.5 border-t border-white/5">
                       <button
                         type="button"
                         onClick={cancelEditingProject}
                         className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-slate-400 text-[10px] font-bold rounded-lg border border-white/10"
                       >
                         Batal
                       </button>
                       <button
                         type="submit"
                         className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg"
                       >
                         Simpan ID & Sinkronkan
                       </button>
                     </div>
                   </form>
                 )}
              </div>
            )}

            {/* INLINE ADMIN FORM: MANAGE Access PIN codes */}
            {role === 'ADMIN' && showPinSettings && (
              <form onSubmit={handleSavePins} className="glass-card p-5 rounded-2xl border border-amber-500/30 shadow-lg space-y-4 animate-fadeIn" id="admin_manage_pins">
                <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold uppercase tracking-wider">
                  <Settings className="w-4 h-4" />
                  Pengaturan Keamanan: Kelola PIN Akses Peran
                </div>
                <p className="text-xs text-slate-400 leading-normal">
                  Kustomisasi PIN sandi untuk masing-masing level peran pekerjaan lapangan agar keamanan berkas dan spreadsheet terjamin.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Admin</label>
                    <input
                      type="text"
                      required
                      value={newAdminPin}
                      onChange={(e) => setNewAdminPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Lapangan (Field)</label>
                    <input
                      type="text"
                      required
                      value={newFieldPin}
                      onChange={(e) => setNewFieldPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Verifikator (QC)</label>
                    <input
                      type="text"
                      required
                      value={newQcPin}
                      onChange={(e) => setNewQcPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowPinSettings(false)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-slate-300 text-xs font-bold rounded-xl border border-white/10 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md"
                  >
                    Perbarui PIN
                  </button>
                </div>
              </form>
            )}

            {/* Backup & Import Configurations Tools */}
            {role === 'ADMIN' && showBackupTools && (
              <div className="glass-card p-5 rounded-2xl border border-emerald-500/30 shadow-lg space-y-4 animate-fadeIn" id="admin_backup_sync">
                <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  Alat Migrasi & Sinkronisasi Database (Google Drive & Sheets)
                </div>
                
                <p className="text-xs text-slate-400 leading-relaxed">
                  Gunakan alat ini untuk memindahkan konfigurasi ID Spreadsheet/Folder Google Drive Anda dari halaman Pratinjau (AI Studio) ke Web Mandiri Anda (atau sebaliknya). Ini memastikan data Anda yang berisi ribuan baris langsung tersambung sempurna tanpa harus setup ulang.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                  {/* Export section */}
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-3">
                    <span className="text-[10px] font-extrabold text-emerald-300 uppercase tracking-wider block">1. Ekspor Konfigurasi</span>
                    <p className="text-[11px] text-slate-400">
                      Klik tombol di bawah untuk menyalin seluruh konfigurasi ID jalur proyek saat ini ke clipboard Anda.
                    </p>
                    <button
                      type="button"
                      onClick={handleExportConfig}
                      className="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 text-xs font-bold rounded-xl cursor-pointer transition-all"
                    >
                      Salin Kode Konfigurasi Ke Clipboard
                    </button>
                    <p className="text-[9px] text-slate-500 italic">
                      Lakukan ini di halaman tempat data Anda muncul dengan benar (misalnya di panel Pratinjau AI Studio).
                    </p>
                  </div>

                  {/* Import section */}
                  <form onSubmit={handleImportConfig} className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-3">
                    <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider block">2. Impor Konfigurasi</span>
                    <p className="text-[11px] text-slate-400">
                      Tempel (paste) kode konfigurasi yang telah Anda ekspor di sini untuk menyinkronkan seluruh ID secara instan.
                    </p>
                    <textarea
                      rows={3}
                      value={backupJsonString}
                      onChange={(e) => setBackupJsonString(e.target.value)}
                      placeholder='Tempel kode JSON di sini (diawali dengan "[" dan diakhiri "]")'
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-[11px] font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    
                    {importStatus === 'success' && (
                      <p className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">{importMessage}</p>
                    )}
                    {importStatus === 'error' && (
                      <p className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">{importMessage}</p>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setBackupJsonString('');
                          setImportStatus('idle');
                        }}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-slate-400 text-xs font-bold rounded-lg border border-white/10"
                      >
                        Clear
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg"
                      >
                        Impor & Sinkronkan
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Main view container display state */}
            {isLoadingData ? (
              <div className="glass-card p-12 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 min-h-[350px] shadow-lg">
                <div className="w-8 h-8 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-semibold text-slate-200 font-sans">Mengkoneksikan Google Drive & Memuat Data Proyek...</p>
                <p className="text-[10px] text-slate-400 italic font-sans">Ini memakan waktu beberapa saat untuk memverifikasi folder di Google Drive Anda.</p>
              </div>
            ) : dataError ? (
              <div className="glass-card p-8 rounded-2xl space-y-4 shadow-lg">
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold rounded-xl flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
                  <div>
                    <strong className="block text-white font-sans">Sinkronisasi Proyek Gagal</strong>
                    <p className="font-sans text-[11px] mt-0.5">{dataError}</p>
                  </div>
                </div>
                <button
                  onClick={handleManualSync}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/10 cursor-pointer"
                >
                  Coba Sinkronisasi Ulang
                </button>
              </div>
            ) : (
              <div className="animate-fadeIn">
                {activeMenu === 'dashboard' && <Dashboard records={records} />}
                
                {activeMenu === 'input' && role !== 'GUEST' && (
                  <FormInput records={records} onSave={handleSaveRecord} />
                )}
                
                {activeMenu === 'upload' && role !== 'GUEST' && (
                  <DocUpload 
                    records={records} 
                    accessToken={token!} 
                    onUpdateRecord={handleUpdateRecord} 
                    uploadsFolderId={projectUploadsFolderId || undefined}
                  />
                )}
                
                {activeMenu === 'qc' && (role === 'ADMIN' || role === 'QC') && (
                  <QCPanel records={records} adminEmail={user?.email || 'Admin'} onSaveQC={handleUpdateRecord} />
                )}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
