import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, deleteDoc, serverTimestamp, deleteField, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { 
  ScoutProfile, 
  STAGES, 
  BadgeSettings, 
  Stage, 
  AdminPermissions, 
  BadgeCategory, 
  DEFAULT_CATEGORIES, 
  BADGE_LABELS,
  BadgeProgress,
  PHONE_REGEX,
  GeneralSettings,
  BadgeCancellationRequest
} from '../types';
import { logActivity } from '../utils/logger';
import QRScanner from './QRScanner';
import { 
  Search, 
  Filter, 
  Edit2, 
  X, 
  Save, 
  CheckCircle2, 
  Award, 
  Users, 
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Settings,
  Plus,
  Trash2,
  Check,
  Hash,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  ShieldX,
  Calendar,
  UserX,
  Download,
  XCircle,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import ScoreInput from './ScoreInput';

interface AdminDashboardProps {
  currentProfile?: ScoutProfile;
}

export default function AdminDashboard({ currentProfile }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'scouts' | 'settings' | 'grading' | 'cancellationRequests'>('scouts');
  const [gradingSelectedBadge, setGradingSelectedBadge] = useState<string>('');
  const [gradingSearchTerm, setGradingSearchTerm] = useState<string>('');
  const [gradingStageFilter, setGradingStageFilter] = useState<Stage | 'all'>('all');
  
  // Quick Score Assignment States
  const [quickScoreCategory, setQuickScoreCategory] = useState<string>('all');
  const [quickScoreReq, setQuickScoreReq] = useState<string>('');
  const [quickScoreValue, setQuickScoreValue] = useState<string>('');
  const [quickScoreGlobalValue, setQuickScoreGlobalValue] = useState<string>('');
  
  const [activeBadgeTab, setActiveBadgeTab] = useState<'badge1' | 'badge2' | 'badge3'>('badge1');
  const [scouts, setScouts] = useState<ScoutProfile[]>([]);
  const [cancellationRequests, setCancellationRequests] = useState<BadgeCancellationRequest[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [deletedAccountsLogs, setDeletedAccountsLogs] = useState<any[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [selectedDeletedLogs, setSelectedDeletedLogs] = useState<string[]>([]);
  const [logDateFilter, setLogDateFilter] = useState('');
  const [badgeSettings, setBadgeSettings] = useState<BadgeSettings>({
    categories: DEFAULT_CATEGORIES,
    requirements: {},
    requirementMaxScores: {},
    requirementCategories: {},
    groupLinks: {}
  });
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    logoUrl: '/syncc.png',
    scoutGroupName: 'مجموعة مارجرجس الكشفية',
    allowedRegistrationStages: [...STAGES],
    badgePrice: 30,
    attendanceDates: []
  });
  const [selectedBadgeForReq, setSelectedBadgeForReq] = useState<string>('');
  const [newRequirementInput, setNewRequirementInput] = useState('');
  const [newRequirementCategory, setNewRequirementCategory] = useState('');
  const [newRequirementScore, setNewRequirementScore] = useState('');
  const [settingsTab, setSettingsTab] = useState<'categories' | 'requirements' | 'cleanup' | 'general' | 'attendance' | 'groupLinks' | 'cancellationRequests'>('categories');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerDate, setScannerDate] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<{uid: string, name: string, time: string, action: string}[]>([]);
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newBadgeForCategory, setNewBadgeForCategory] = useState('');
  const [selectedStageForNewBadge, setSelectedStageForNewBadge] = useState<Stage | 'all'>('all');
  const [selectedStageForNewReq, setSelectedStageForNewReq] = useState<Stage[] | 'all'>('all');
  const [newAttendanceDate, setNewAttendanceDate] = useState('');
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('');
  const [attendanceStageFilter, setAttendanceStageFilter] = useState<Stage | 'all'>('all');
  const [attendanceBadgeCountFilter, setAttendanceBadgeCountFilter] = useState<'all' | '1' | '2' | '3'>('all');
  const [selectedCategoryForBadgeSelection, setSelectedCategoryForBadgeSelection] = useState<Record<'badge1' | 'badge2' | 'badge3', string | null>>({
    badge1: 'scout',
    badge2: null,
    badge3: null
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [badgeFilter, setBadgeFilter] = useState<string>('');
  const [sortField, setSortField] = useState<'name' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingScout, setEditingScout] = useState<ScoutProfile | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    number: string;
    stage: Stage;
  } | null>(null);
  const [deletingScout, setDeletingScout] = useState<ScoutProfile | null>(null);
  const [editingPermissionsFor, setEditingPermissionsFor] = useState<ScoutProfile | null>(null);
  const [permissionsForm, setPermissionsForm] = useState<AdminPermissions>({
    canManageAllBadges: false,
    canDeleteAccounts: false,
    managedStages: [],
    managedBadges: []
  });
  const [editingRequirement, setEditingRequirement] = useState<{
    badgeName: string;
    oldText: string;
    newText: string;
    category: string;
    stage: Stage | 'all';
    maxScore: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isDeletingAuth, setIsDeletingAuth] = useState(false);
  const [authPhoneToDelete, setAuthPhoneToDelete] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renamingCategoryName, setRenamingCategoryName] = useState('');
  const [badgePassFilter, setBadgePassFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [newAccountForm, setNewAccountForm] = useState({
    name: '',
    phone: '',
    password: '',
    stage: STAGES[0] as Stage,
    role: 'scout' as 'scout' | 'admin'
  });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [changingPasswordFor, setChangingPasswordFor] = useState<ScoutProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [adminStatus, setAdminStatus] = useState<{ 
    initialized: boolean; 
    envSet: boolean; 
    error?: string | null;
  } | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setMessage({ type: 'success', text: 'تم الاتصال بالإنترنت وتم تحديث البيانات' });
    };
    const handleOffline = () => {
      setIsOffline(true);
      setMessage({ type: 'error', text: 'أنت الآن تعمل بدون إنترنت (أوفلاين). سيتم حفظ التعديلات عند الاتصال.' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

enum OperationType {
  GET = 'get',
  LIST = 'list',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  WRITE = 'write'
}

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (isOffline) return;
      try {
        const res = await fetch('/api/admin/status');
        const data = await res.json();
        setAdminStatus(data);
      } catch (e) {
        console.error('Error checking admin status:', e);
        setAdminStatus({ initialized: false, envSet: false });
      }
    };
    checkAdminStatus();
  }, [isOffline]);

  const adminPhone = import.meta.env.VITE_SUPER_ADMIN_PHONE;
  const adminEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL;

  const isSuperAdmin = 
    (adminPhone && currentProfile?.number === adminPhone) || 
    (adminEmail && currentProfile?.email === adminEmail) ||
    (adminPhone && currentProfile?.email === `${adminPhone}@scouts.local`) ||
    currentProfile?.permissions?.canManagePermissions;

  const handleGrantAllPermissions = () => {
    setPermissionsForm({
      canManagePermissions: true,
      canManageAllBadges: true,
      canDeleteAccounts: true,
      canManageAttendance: true,
      canManagePayments: true,
      canManageBadgeRequirements: true,
      managedStages: [...STAGES],
      managedBadges: Array.from(new Set((badgeSettings.categories || []).flatMap(c => [
        ...(c.badges || []),
        ...Object.values(c.stageBadges || {}).flat()
      ])))
    });
  };

  const handleClearAllPermissions = () => {
    setPermissionsForm({
      canManagePermissions: false,
      canManageAllBadges: false,
      canDeleteAccounts: false,
      canManageAttendance: false,
      canManagePayments: false,
      canManageBadgeRequirements: false,
      managedStages: [],
      managedBadges: []
    });
  };
  
  const canManageAllBadges = isSuperAdmin || currentProfile?.permissions?.canManageAllBadges;
  const canDeleteAccounts = isSuperAdmin || currentProfile?.permissions?.canDeleteAccounts;
  const canManageAttendance = isSuperAdmin || currentProfile?.permissions?.canManageAttendance;
  const canManagePayments = isSuperAdmin || currentProfile?.permissions?.canManagePayments;
  const canManageBadgeRequirements = isSuperAdmin || currentProfile?.permissions?.canManageBadgeRequirements;
  const canAccessSettings = canManageAllBadges || canManageAttendance || canManagePayments || canDeleteAccounts || canManageBadgeRequirements;
  
  const canDeleteThisScout = (scout: ScoutProfile) => {
    if (scout.uid === currentProfile?.uid) return false;
    if (scout.role === 'admin') return isSuperAdmin;
    return canDeleteAccounts;
  };
  
  // Helper to normalize Arabic strings for comparison
  const normalizeArabic = (str: string | undefined | null) => {
    if (!str) return '';
    return str
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/^شارة\s+/g, '')
      .replace(/^الشارة\s+/g, '')
      .trim();
  };

  const normalizeNumbers = (str: string) => {
    if (!str) return '';
    return str.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
  };

  const canEditBadge = (scoutStage: Stage, badgeName: string, scoutUid?: string, scoutRole?: string) => {
    if (scoutUid && scoutUid === currentProfile?.uid) return false;
    
    // If target is an admin, only super admin can grade them
    if (scoutRole === 'admin' && !isSuperAdmin) return false;

    if (canManageAllBadges) return true;
    if (!currentProfile?.permissions) return false;
    
    const { managedStages, managedBadges } = currentProfile.permissions;
    const hasManagedStages = (managedStages || []).length > 0;
    const hasManagedBadges = (managedBadges || []).length > 0;

    if (!hasManagedStages && !hasManagedBadges) return false;

    const matchesStage = !hasManagedStages || (managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(scoutStage || ''));
    const matchesBadge = !hasManagedBadges || (managedBadges || []).some(mb => normalizeArabic(mb) === normalizeArabic(badgeName || ''));
    
    // If both are provided, they must both match (User's request for "registered for these same things")
    if (hasManagedStages && hasManagedBadges) {
      return matchesStage && matchesBadge;
    }
    
    // If only one is provided, that one must match (the other is true by default)
    return matchesStage && matchesBadge;
  };
  
  const canEditScout = (scout: ScoutProfile) => {
    if (canManageAllBadges) return true;
    if (!currentProfile?.permissions) return false;
    
    const { managedStages, managedBadges } = currentProfile.permissions;
    const hasManagedStages = (managedStages || []).length > 0;
    const hasManagedBadges = (managedBadges || []).length > 0;

    if (!hasManagedStages && !hasManagedBadges) return false;

    const matchesStage = !hasManagedStages || (scout.stage && (managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(scout.stage)));
    
    const scoutBadgeNames = [
      scout.badges?.badge1?.name,
      scout.badges?.badge2?.name,
      scout.badges?.badge3?.name
    ].filter(Boolean);
    
    const matchesBadge = !hasManagedBadges || scoutBadgeNames.some(b => (managedBadges || []).some(mb => normalizeArabic(mb) === normalizeArabic(b)));

    // If both are provided, they must both match
    if (hasManagedStages && hasManagedBadges) {
      return matchesStage && matchesBadge;
    }
    
    return matchesStage && matchesBadge;
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleFirestoreError = (error: any, operation: string, path: string) => {
    console.error(`Firestore Error (${operation}) at ${path}:`, error);
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes('permission-denied')) {
      setMessage({ type: 'error', text: 'ليس لديك صلاحية للقيام بهذا الإجراء' });
    } else {
      setMessage({ type: 'error', text: `حدث خطأ: ${errorMsg}` });
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as ScoutProfile));
      // Store all users, we will filter in the UI
      setScouts(data);
      setLoading(false);
    }, (error) => {
      console.error('Firestore error:', error);
      setLoading(false);
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'badges'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as BadgeSettings;
        setBadgeSettings({
          categories: data.categories || DEFAULT_CATEGORIES,
          requirements: data.requirements || {},
          requirementMaxScores: data.requirementMaxScores || {},
          requirementCategories: data.requirementCategories || {},
          groupLinks: data.groupLinks || {}
        });
      } else {
        setBadgeSettings({
          categories: DEFAULT_CATEGORIES,
          requirements: {},
          requirementMaxScores: {},
          requirementCategories: {}
        });
      }
    });

    const unsubscribeGeneralSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GeneralSettings;
        setGeneralSettings({
          logoUrl: '/syncc.png',
          scoutGroupName: data.scoutGroupName || 'مجموعة مارجرجس الكشفية',
          allowedRegistrationStages: data.allowedRegistrationStages || [...STAGES],
          badgePrice: data.badgePrice || 30,
          attendanceDates: data.attendanceDates || []
        });
      }
    });

    let unsubscribeLogs: any = null;
    let unsubscribeDeletedLogs: any = null;
    if (isSuperAdmin) {
      unsubscribeLogs = onSnapshot(query(collection(db, 'activity_logs')), (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        logs.sort((a: any, b: any) => {
          const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
          const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
          return timeB - timeA;
        });
        setActivityLogs(logs);
      });

      unsubscribeDeletedLogs = onSnapshot(query(collection(db, 'deleted_accounts_logs')), (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        logs.sort((a: any, b: any) => {
          const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
          const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
          return timeB - timeA;
        });
        setDeletedAccountsLogs(logs);
      });
    }

    const unsubscribeCancellationRequests = onSnapshot(query(collection(db, 'cancellationRequests')), (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BadgeCancellationRequest));
      setCancellationRequests(requests);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeSettings();
      unsubscribeGeneralSettings();
      unsubscribeCancellationRequests();
      if (unsubscribeLogs) unsubscribeLogs();
      if (unsubscribeDeletedLogs) unsubscribeDeletedLogs();
    };
  }, [isSuperAdmin]);

  const handleApproveCancellations = async () => {
    try {
      setLoading(true);
      const batch = writeBatch(db);
      const requestsToProcess = cancellationRequests.filter(r => selectedRequests.includes(r.id));
      
      for (const req of requestsToProcess) {
        const userDoc = doc(db, 'users', req.userId);
        batch.update(userDoc, {
          [`badges.${req.badgeKey}`]: { name: '', progress: 0, notes: '', completedRequirements: [] }
        });
        
        const reqDoc = doc(db, 'cancellationRequests', req.id);
        batch.delete(reqDoc);
      }
      
      await batch.commit();
      setSelectedRequests([]);
      setMessage({ type: 'success', text: 'تم الموافقة على الطلبات المحددة بنجاح' });
    } catch (error) {
      handleFirestoreError(error, 'Approve Cancellations', 'batch');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectCancellations = async () => {
    try {
      setLoading(true);
      const batch = writeBatch(db);
      selectedRequests.forEach(id => {
        batch.delete(doc(db, 'cancellationRequests', id));
      });
      await batch.commit();
      setSelectedRequests([]);
      setMessage({ type: 'success', text: 'تم رفض الطلبات المحددة وإزالتها' });
    } catch (error) {
      handleFirestoreError(error, 'Reject Cancellations', 'batch');
    } finally {
      setLoading(false);
    }
  };

  const handleEndWave1 = async () => {
    if (!window.confirm('هل أنت متأكد من إنهاء الدفعة الأولى؟ سيتم حفظ نتائج الكشافة الحالية في أرشيف الدفعة الأولى، ونقل الشارات الناجحة، والسماح لهم باختيار شارات الدفعة الثانية. هذا الإجراء لا يمكن التراجع عنه بسهولة.')) return;
    
    try {
      setLoading(true);
      
      const chunkArray = (arr: any[], size: number) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
          arr.slice(i * size, i * size + size)
        );
      };
      
      const scoutChunks = chunkArray(scouts, 490);
      
      for (const chunk of scoutChunks) {
        const batch = writeBatch(db);
        chunk.forEach(scout => {
          const passed: string[] = [];
          // Check badge1, badge2, badge3
          ['badge1', 'badge2', 'badge3'].forEach(key => {
            const b = scout.badges[key as keyof typeof scout.badges];
            if (b && b.name) {
              const reqs = badgeSettings.requirements[b.name]?.[scout.stage] || [];
              if (reqs.length > 0 && (b.completedRequirements || []).length === reqs.length) {
                passed.push(b.name);
              }
            }
          });

          const newPassedBadges = Array.from(new Set([...(scout.passedBadges || []), ...passed]));
          
          batch.update(doc(db, 'users', scout.uid), {
            pastWaves: {
              ...(scout.pastWaves || {}),
              wave1: { badges: scout.badges }
            },
            passedBadges: newPassedBadges,
            badges: {
              badge1: { name: '', progress: 0, notes: '', completedRequirements: [] },
              badge2: { name: '', progress: 0, notes: '', completedRequirements: [] },
              badge3: { name: '', progress: 0, notes: '', completedRequirements: [] }
            }
          });
        });
        await batch.commit();
      }
      
      const settingsBatch = writeBatch(db);
      settingsBatch.update(doc(db, 'settings', 'general'), {
        activeWave: 'wave2',
        showResults: true
      });
      await settingsBatch.commit();
      
      setMessage({ type: 'success', text: 'تم إنهاء الدفعة الأولى بنجاح، وتم تفعيل الدفعة الثانية وإظهار النتائج.' });
    } catch (error) {
      handleFirestoreError(error, 'End Wave 1', 'batch');
    } finally {
      setLoading(false);
    }
  };

  const exportGradingToExcel = () => {
    if (!gradingSelectedBadge) return;

    const workbook = XLSX.utils.book_new();

    STAGES.forEach(stage => {
      const stageReqs = getScoutBadgeRequirements(gradingSelectedBadge, stage as Stage);
      const stageScouts = scouts.filter(s => {
        if (s.stage !== stage) return false;
        const normalizedBadge = normalizeArabic(gradingSelectedBadge);
        const hasBadge = normalizeArabic(s.badges?.badge1?.name) === normalizedBadge || 
                         normalizeArabic(s.badges?.badge2?.name) === normalizedBadge || 
                         normalizeArabic(s.badges?.badge3?.name) === normalizedBadge;
        if (!hasBadge) return false;

        // Apply filter if active
        if (badgePassFilter !== 'all') {
          const badgeKey = s.badges?.badge1?.name === gradingSelectedBadge ? 'badge1' 
                         : s.badges?.badge2?.name === gradingSelectedBadge ? 'badge2' 
                         : 'badge3';
          const badge = s.badges?.[badgeKey];
          if (!badge) return false;
          const hasPassed = checkBadgePassStatus(gradingSelectedBadge, stageReqs, badge.completedRequirements || [], badge.requirementScores || {});
          
          if (badgePassFilter === 'passed' && !hasPassed) return false;
          if (badgePassFilter === 'failed' && hasPassed) return false;
        }

        return true;
      });

      if (stageScouts.length === 0) return;

      const data = stageScouts.map(s => {
        const badgeKey = s.badges?.badge1?.name === gradingSelectedBadge ? 'badge1' 
                       : s.badges?.badge2?.name === gradingSelectedBadge ? 'badge2' 
                       : 'badge3';
        const badge = s.badges?.[badgeKey];
        if (!badge) return { name: s.name, number: s.number, stage: s.stage, totalScore: 0, status: 'لم يكتمل' };
        const scores = badge.requirementScores || {};
        
        const row: any = {
          'الاسم': s.name,
          'رقم الهاتف': s.number,
          'المرحلة': s.stage
        };

        stageReqs.forEach(req => {
          row[req] = scores[req] || 0;
        });

        row['النسبة المئوية'] = `${Math.round(badge.progress || 0)}%`;
        row['النتيجة'] = checkBadgePassStatus(gradingSelectedBadge, stageReqs, badge.completedRequirements || [], scores) ? 'اجتاز' : 'لم يجتز';
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, stage.substring(0, 31));
    });

    XLSX.writeFile(workbook, `تقييم_${gradingSelectedBadge}_${new Date().toLocaleDateString()}.xlsx`);
  };

  const migrateOldStages = async () => {
    if (!isSuperAdmin) return;
    
    const oldToNewMap: Record<string, Stage[]> = {
      'أشبال وزهرات مبتدأ': ['أشبال مبتدأ', 'زهرات مبتدأ'],
      'أشبال وزهرات': ['أشبال', 'زهرات'],
      'كشاف ومرشدات': ['كشاف', 'مرشدات'],
      'متقدم ورائدات': ['متقدم', 'رائدات'],
      'جوالة وقادة': ['جوالة', 'قادة']
    };

    let hasChanges = false;
    const updatedRequirements = { ...badgeSettings.requirements };

    Object.keys(updatedRequirements).forEach(badgeName => {
      const reqs = updatedRequirements[badgeName];
      if (!reqs || Array.isArray(reqs)) return;

      Object.keys(oldToNewMap).forEach(oldStage => {
        if (reqs[oldStage as Stage]) {
          const oldReqs = reqs[oldStage as Stage] || [];
          oldToNewMap[oldStage].forEach(newStage => {
            if (!reqs[newStage as Stage]) {
              reqs[newStage as Stage] = [...oldReqs];
              hasChanges = true;
            }
          });
        }
      });
    });

    const updatedCategories = badgeSettings.categories.map(category => {
      if (!category.stageBadges) return category;
      
      let categoryChanged = false;
      const newStageBadges = { ...category.stageBadges };
      
      Object.keys(oldToNewMap).forEach(oldStage => {
        if (newStageBadges[oldStage as Stage]) {
          const oldBadges = newStageBadges[oldStage as Stage] || [];
          oldToNewMap[oldStage].forEach(newStage => {
            if (!newStageBadges[newStage as Stage]) {
              newStageBadges[newStage as Stage] = [...oldBadges];
              categoryChanged = true;
              hasChanges = true;
            }
          });
        }
      });
      
      if (categoryChanged) {
        return { ...category, stageBadges: newStageBadges };
      }
      return category;
    });

    if (hasChanges) {
      try {
        await setDoc(doc(db, 'settings', 'badges'), {
          ...badgeSettings,
          requirements: updatedRequirements,
          categories: updatedCategories
        });
        setMessage({ type: 'success', text: 'تم تحديث متطلبات وتصنيفات الشارات للمراحل الجديدة بنجاح' });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
      }
    } else {
      setMessage({ type: 'success', text: 'لا توجد بيانات قديمة تحتاج للتحديث' });
    }
  };

  const handleScanSuccess = async (scannedUid: string) => {
    if (!scannerDate) return;
    
    const scout = scouts.find(s => s.uid === scannedUid);
    if (!scout) {
      setMessage({ type: 'error', text: 'لم يتم العثور على الكشاف' });
      return;
    }

    if (scout.attendance?.[scannerDate]) {
      setMessage({ type: 'error', text: `تم تسجيل حضور ${scout.name} مسبقاً` });
      return;
    }

    try {
      await updateDoc(doc(db, 'users', scout.uid), {
        [`attendance.${scannerDate}`]: true
      });
      
      const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setScanLogs(prev => [{ uid: scout.uid, name: scout.name, time: timeStr, action: 'تسجيل حضور' }, ...prev]);
      
      setMessage({ type: 'success', text: `تم تسجيل حضور ${scout.name} بنجاح` });

      await logActivity(
        'تسجيل حضور (QR)',
        `تم تسجيل حضور ليوم ${scannerDate} عبر مسح الكود`,
        currentProfile.uid,
        currentProfile.name || 'مسؤول',
        scout.uid,
        scout.name
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${scout.uid}`);
    }
  };

  const handleUndoScan = async (scoutUid: string, logIndex: number) => {
    if (!scannerDate) return;
    try {
      await updateDoc(doc(db, 'users', scoutUid), {
        [`attendance.${scannerDate}`]: false
      });
      
      setScanLogs(prev => prev.map((log, idx) => 
        idx === logIndex ? { ...log, action: 'إلغاء حضور' } : log
      ));
      
      const scout = scouts.find(s => s.uid === scoutUid);
      if (scout) {
        await logActivity(
          'إلغاء حضور (QR)',
          `تم إلغاء حضور ليوم ${scannerDate} من خلال سجل المسح`,
          currentProfile?.uid || '',
          currentProfile?.name || 'مسؤول',
          scout.uid,
          scout.name
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${scoutUid}`);
    }
  };

  const findCategoryForBadge = (badgeName: string | undefined): string | null => {
    if (!badgeName) return null;
    const cat = (badgeSettings.categories || []).find(c => {
      const allBadges = [
        ...(c.badges || []),
        ...Object.values(c.stageBadges || {}).flat()
      ];
      return allBadges.some(b => normalizeArabic(b) === normalizeArabic(badgeName));
    });
    return cat ? cat.id : null;
  };

  const handleCreateAccount = async () => {
    if (!isSuperAdmin || creatingAccount) return;
    if (!newAccountForm.name || !newAccountForm.phone || !newAccountForm.password) {
      setMessage({ type: 'error', text: 'يرجى ملء جميع البيانات المطلوبة' });
      return;
    }

    const detectCodeInjection = (text: string) => {
      const patterns = [
        /select\s+.*?\s+from/i,
        /insert\s+into/i,
        /drop\s+(table|database)/i,
        /update\s+.*?\s+set/i,
        /delete\s+from/i,
        /union\s+select/i,
        /<script.*?>/i,
        /(javascript|vbscript):/i,
        /1\s*=\s*1/i
      ];
      return patterns.some(p => p.test(text));
    };

    if (detectCodeInjection(newAccountForm.password) || detectCodeInjection(newAccountForm.name)) {
      setMessage({ type: 'error', text: 'لأسباب أمنية، غير مسموح باستخدام أسماء تحتوي على أي رموز مثل * < #' });
      return;
    }

    if (!/^[\u0600-\u06FFa-zA-Z0-9\s]+$/.test(newAccountForm.name.trim())) {
      setMessage({ type: 'error', text: 'الاسم يجب أن يحتوي على حروف عربية أو إنجليزية أو أرقام ومسافات فقط.' });
      return;
    }

    if (!PHONE_REGEX.test(newAccountForm.phone)) {
      setMessage({ type: 'error', text: 'رقم الهاتف غير صحيح (يجب أن يكون 11 رقم)' });
      return;
    }

    setCreatingAccount(true);
    let secondaryApp;
    try {
      const secondaryAppName = `secondary-app-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      const fakeEmail = `${newAccountForm.phone}@scouts.local`;
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, fakeEmail, newAccountForm.password);
      const user = userCredential.user;

      const profile: ScoutProfile = {
        uid: user.uid,
        name: newAccountForm.name,
        email: fakeEmail,
        stage: newAccountForm.stage,
        number: newAccountForm.phone,
        badges: {
          badge1: { name: '', progress: 0, notes: '', completedRequirements: [] },
          badge2: { name: '', progress: 0, notes: '', completedRequirements: [] },
          badge3: { name: '', progress: 0, notes: '', completedRequirements: [] },
        },
        role: newAccountForm.role,
        isVerified: true,
        createdAt: serverTimestamp(),
        joinDate: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', user.uid), profile);
      await logActivity(
        'إنشاء حساب',
        `تم إنشاء حساب جديد بدور ${newAccountForm.role}`,
        currentProfile.uid,
        currentProfile.name || 'مسؤول',
        user.uid,
        newAccountForm.name
      );
      await signOut(secondaryAuth);
      
      setMessage({ type: 'success', text: 'تم إنشاء الحساب بنجاح' });
      setNewAccountForm({
        name: '',
        phone: '',
        password: '',
        stage: STAGES[0] as Stage,
        role: 'scout'
      });
    } catch (error: any) {
      console.error('Error creating account:', error);
      let errorMsg = 'حدث خطأ أثناء إنشاء الحساب';
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = 'هذا الرقم مسجل بالفعل';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'كلمة المرور ضعيفة جداً';
      }
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error('Error deleting secondary app:', e);
        }
      }
      setCreatingAccount(false);
    }
  };

  const importFromExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        setLoading(true);
        let updatedCount = 0;

        for (const row of data) {
          const number = String(row['رقم الهاتف'] || row['Number'] || '').trim();
          if (!number) continue;

          const scout = scouts.find(s => s.number === number);
          if (!scout) continue;

          const badgeKey = scout.badges.badge1.name === gradingSelectedBadge ? 'badge1' 
                         : scout.badges.badge2.name === gradingSelectedBadge ? 'badge2' 
                         : scout.badges.badge3.name === gradingSelectedBadge ? 'badge3' : null;
          
          if (!badgeKey) continue;

          const stageReqs = getScoutBadgeRequirements(gradingSelectedBadge, scout.stage);
          const currentBadge = scout.badges[badgeKey];
          const newScores = { ...(currentBadge.requirementScores || {}) };
          const newCompletedReqs = [...(currentBadge.completedRequirements || [])];

          let changed = false;
          stageReqs.forEach(req => {
            if (row[req] !== undefined) {
              const val = parseFloat(row[req]);
              const maxScore = badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req] || 0;
              
              if (!isNaN(val)) {
                newScores[req] = Math.min(Math.max(0, val), maxScore);
                changed = true;
                
                if (newScores[req] > 0 && !newCompletedReqs.includes(req)) {
                  newCompletedReqs.push(req);
                }
              }
            }
          });

          if (changed) {
            const newProgress = calculateBadgeProgress(gradingSelectedBadge, stageReqs, newCompletedReqs, newScores);
            const firestoreUpdates: Record<string, any> = {};
            firestoreUpdates[`badges.${badgeKey}.progress`] = newProgress;
            
            // requirementScores
            const origScores = currentBadge.requirementScores || {};
            for (const req in newScores) {
              if (newScores[req] !== origScores[req]) {
                firestoreUpdates[`badges.${badgeKey}.requirementScores.${req}`] = newScores[req];
              }
            }
            
            // completedRequirements
            const origCompleted = currentBadge.completedRequirements || [];
            const added = newCompletedReqs.filter(r => !origCompleted.includes(r));
            if (added.length > 0) {
              firestoreUpdates[`badges.${badgeKey}.completedRequirements`] = arrayUnion(...added);
            }

            await updateDoc(doc(db, 'users', scout.uid), firestoreUpdates);
            await logActivity(
              'تقييم جماعي',
              `تم تحديث تقييم شارة ${gradingSelectedBadge}`,
              currentProfile.uid,
              currentProfile.name || 'مسؤول',
              scout.uid,
              scout.name
            );
            updatedCount++;
          }
        }

        setMessage({ type: 'success', text: `تم تحديث بيانات ${updatedCount} كشاف بنجاح` });
      } catch (error) {
        console.error('Import error:', error);
        setMessage({ type: 'error', text: 'حدث خطأ أثناء استيراد البيانات. تأكد من صحة تنسيق الملف.' });
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Helper to get badges for a category and stage
  const getAvailableBadges = (categoryId: string, scoutStage?: Stage | ''): string[] => {
    const category = (badgeSettings.categories || []).find(c => c.id === categoryId);
    if (!category) return [];
    
    if (scoutStage) {
      const uniqueMap = new Map<string, string>();
      (category.badges || []).forEach(b => uniqueMap.set(normalizeArabic(b.trim()), b));
      
      if (category.stageBadges) {
        const stageKey = Object.keys(category.stageBadges).find(k => normalizeArabic(k) === normalizeArabic(scoutStage));
        if (stageKey) {
          const specificBadges = (category.stageBadges[stageKey as Stage] || []) as string[];
          specificBadges.forEach(b => uniqueMap.set(normalizeArabic(b.trim()), b));
        }
      }
      
      return Array.from(uniqueMap.values());
    }

    // If no stage provided, return all badges in this category across all stages
    const uniqueMap = new Map<string, string>();
    (category.badges || []).forEach(b => uniqueMap.set(normalizeArabic(b.trim()), b));
    if (category.stageBadges) {
      Object.values(category.stageBadges).forEach(badges => {
        if (Array.isArray(badges)) {
          (badges as string[]).forEach(b => uniqueMap.set(normalizeArabic(b.trim()), b));
        }
      });
    }
    return Array.from(uniqueMap.values());
  };

  const filteredAndSortedScouts = useMemo(() => {
    try {
      return scouts
        .filter(s => {
          // If not super admin, hide other admins and only show scouts they have permission to see
          if (!isSuperAdmin) {
            if (s.role === 'admin' && s.uid !== currentProfile?.uid) return false;
            // If it's a scout, check if they manage the stage or if they can edit at least one of their badges
            if (s.role !== 'admin' && !canEditScout(s)) return false;
          }

          const normalizedSearch = normalizeNumbers(searchTerm);
          const matchesSearch = (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase())) || 
                              (s.number && s.number.includes(normalizedSearch));
          const matchesStage = !stageFilter || normalizeArabic(s.stage) === normalizeArabic(stageFilter);
          
          // Category Filter
          let matchesCategory = true;
          if (categoryFilter) {
            const availableBadgesInCategory = getAvailableBadges(categoryFilter, s.stage);
            matchesCategory = availableBadgesInCategory.some(b => normalizeArabic(b) === normalizeArabic(s.badges?.badge1?.name)) ||
                              availableBadgesInCategory.some(b => normalizeArabic(b) === normalizeArabic(s.badges?.badge2?.name)) ||
                              availableBadgesInCategory.some(b => normalizeArabic(b) === normalizeArabic(s.badges?.badge3?.name));
          }

          const matchesBadge = !badgeFilter || 
                              normalizeArabic(s.badges?.badge1?.name) === normalizeArabic(badgeFilter) || 
                              normalizeArabic(s.badges?.badge2?.name) === normalizeArabic(badgeFilter) || 
                              normalizeArabic(s.badges?.badge3?.name) === normalizeArabic(badgeFilter);

          return matchesSearch && matchesStage && matchesCategory && matchesBadge;
        })
        .sort((a, b) => {
          let comparison = 0;
          if (sortField === 'name') {
            comparison = a.name.localeCompare(b.name);
          } else {
            const dateA = a.joinDate || a.createdAt;
            const dateB = b.joinDate || b.createdAt;
            comparison = (dateA?.seconds || 0) - (dateB?.seconds || 0);
          }
          return sortOrder === 'asc' ? comparison : -comparison;
        });
    } catch (err) {
      console.error('Error filtering scouts:', err);
      return [];
    }
  }, [scouts, searchTerm, stageFilter, categoryFilter, badgeFilter, sortField, sortOrder, currentProfile, isSuperAdmin, badgeSettings]);

  const handleUpdateScout = async (e?: React.FormEvent, closeAfterSave = true) => {
    if (e) e.preventDefault();
    if (!editingScout || !editForm) return;

    const detectCodeInjection = (text: string) => {
      const patterns = [
        /select\s+.*?\s+from/i,
        /insert\s+into/i,
        /drop\s+(table|database)/i,
        /update\s+.*?\s+set/i,
        /delete\s+from/i,
        /union\s+select/i,
        /<script.*?>/i,
        /(javascript|vbscript):/i,
        /1\s*=\s*1/i
      ];
      return patterns.some(p => p.test(text));
    };

    if (editForm.name) {
      if (detectCodeInjection(editForm.name)) {
        setMessage({ type: 'error', text: 'لأسباب أمنية، غير مسموح باستخدام أسماء تحتوي على أي رموز مثل * < #' });
        return;
      }

      if (!/^[\u0600-\u06FFa-zA-Z0-9\s]+$/.test(editForm.name.trim())) {
        setMessage({ type: 'error', text: 'الاسم يجب أن يحتوي على حروف عربية أو إنجليزية أو أرقام ومسافات فقط.' });
        return;
      }
    }

    const b1 = editingScout.badges.badge1.name;
    const b2 = editingScout.badges.badge2.name;
    const b3 = editingScout.badges.badge3.name;

    if ((b1 && b2 && b1 === b2) || (b1 && b3 && b1 === b3) || (b2 && b3 && b2 === b3)) {
      setMessage({ type: 'error', text: 'لا يمكن اختيار نفس الشارة أكثر من مرة' });
      return;
    }

    setEditLoading(true);
    try {
      const originalScout = scouts.find(s => s.uid === editingScout.uid);
      const firestoreUpdates: Record<string, any> = {};

      if (originalScout) {
        if (editForm.name !== originalScout.name) firestoreUpdates.name = editForm.name;
        if (editForm.number !== originalScout.number) firestoreUpdates.number = editForm.number;
        if (editForm.stage !== originalScout.stage) firestoreUpdates.stage = editForm.stage;

        // Compare badges
        const badgeKeys: ('badge1' | 'badge2' | 'badge3')[] = ['badge1', 'badge2', 'badge3'];
        badgeKeys.forEach(key => {
          const origBadge = originalScout.badges[key];
          const newBadge = editingScout.badges[key];

          if (origBadge.name !== newBadge.name) {
            firestoreUpdates[`badges.${key}.name`] = newBadge.name;
            // If badge name changed, reset progress
            firestoreUpdates[`badges.${key}.progress`] = 0;
            firestoreUpdates[`badges.${key}.completedRequirements`] = [];
            firestoreUpdates[`badges.${key}.requirementScores`] = {};
            firestoreUpdates[`badges.${key}.notes`] = '';
          } else {
            if (origBadge.progress !== newBadge.progress) firestoreUpdates[`badges.${key}.progress`] = newBadge.progress;
            if (origBadge.notes !== newBadge.notes) firestoreUpdates[`badges.${key}.notes`] = newBadge.notes;

            // requirementScores
            const origScores = origBadge.requirementScores || {};
            const newScores = newBadge.requirementScores || {};
            for (const req in newScores) {
              if (newScores[req] !== origScores[req]) {
                firestoreUpdates[`badges.${key}.requirementScores.${req}`] = newScores[req];
              }
            }
            for (const req in origScores) {
              if (!(req in newScores)) {
                firestoreUpdates[`badges.${key}.requirementScores.${req}`] = deleteField();
              }
            }

            // completedRequirements
            const origCompleted = origBadge.completedRequirements || [];
            const newCompleted = newBadge.completedRequirements || [];
            const added = newCompleted.filter(r => !origCompleted.includes(r));
            const removed = origCompleted.filter(r => !newCompleted.includes(r));
            
            if (added.length > 0 && removed.length === 0) {
              firestoreUpdates[`badges.${key}.completedRequirements`] = arrayUnion(...added);
            } else if (removed.length > 0 && added.length === 0) {
              firestoreUpdates[`badges.${key}.completedRequirements`] = arrayRemove(...removed);
            } else if (added.length > 0 && removed.length > 0) {
              firestoreUpdates[`badges.${key}.completedRequirements`] = newCompleted;
            }
          }
        });
      } else {
        // Fallback if original scout not found
        firestoreUpdates.name = editForm.name;
        firestoreUpdates.number = editForm.number;
        firestoreUpdates.stage = editForm.stage;
        firestoreUpdates.badges = editingScout.badges;
      }

      if (Object.keys(firestoreUpdates).length > 0) {
        // If phone number changed, update it in Firebase Auth via API
        if (firestoreUpdates.number) {
          const user = auth.currentUser;
          if (user) {
            const adminToken = await user.getIdToken();
            const response = await fetch('/api/admin/update-phone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                uid: editingScout.uid, 
                newPhone: firestoreUpdates.number,
                adminToken 
              })
            });
            if (!response.ok) {
              const errData = await response.json();
              console.error('Failed to update phone in Auth:', errData);
              if (errData.error && errData.error.includes('email-already-exists')) {
                throw new Error('رقم الهاتف هذا مسجل لحساب آخر بالفعل');
              }
              throw new Error(errData.error || 'فشل تحديث رقم الهاتف في نظام الدخول');
            }
          }
        }

        await updateDoc(doc(db, 'users', editingScout.uid), firestoreUpdates);
        await logActivity(
          'تعديل بيانات',
          `تم تعديل بيانات المستخدم الأساسية`,
          currentProfile.uid,
          currentProfile.name || 'مسؤول',
          editingScout.uid,
          editingScout.name
        );
      }
      
      setMessage({ type: 'success', text: 'تم تحديث البيانات بنجاح' });
      if (closeAfterSave) {
        setEditingScout(null);
        setEditForm(null);
      }
    } catch (error) {
      handleFirestoreError(error, 'update', `users/${editingScout.uid}`);
    } finally {
      setEditLoading(false);
    }
  };

  const updateBadgeValue = (badgeKey: 'badge1' | 'badge2' | 'badge3', field: 'progress' | 'notes' | 'completedRequirements' | 'requirementScores', value: any) => {
    setEditingScout(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        badges: {
          ...prev.badges,
          [badgeKey]: {
            ...prev.badges[badgeKey],
            [field]: value
          }
        }
      };
    });
  };

  const handleUpdateScoutBadge = async (scout: ScoutProfile, badgeKey: 'badge1' | 'badge2' | 'badge3', updates: Partial<BadgeProgress>) => {
    try {
      const currentBadge = scout.badges[badgeKey];
      
      // Calculate new progress if scores or completed requirements changed
      let newProgress = currentBadge.progress;
      if (updates.requirementScores !== undefined || updates.completedRequirements !== undefined) {
        const reqs = getScoutBadgeRequirements(currentBadge.name, scout.stage);
        const completedReqs = updates.completedRequirements !== undefined ? updates.completedRequirements : (currentBadge.completedRequirements || []);
        const scores = updates.requirementScores !== undefined ? updates.requirementScores : (currentBadge.requirementScores || {});
        newProgress = calculateBadgeProgress(currentBadge.name, reqs, completedReqs, scores);
      }

      const firestoreUpdates: Record<string, any> = {};
      
      // Update progress
      if (newProgress !== currentBadge.progress) {
        firestoreUpdates[`badges.${badgeKey}.progress`] = newProgress;
      }

      // Update notes
      if (updates.notes !== undefined && updates.notes !== currentBadge.notes) {
        firestoreUpdates[`badges.${badgeKey}.notes`] = updates.notes;
      }

      // Update requirementScores using dot notation for specific fields
      if (updates.requirementScores !== undefined) {
        const currentScores = currentBadge.requirementScores || {};
        const newScores = updates.requirementScores;
        
        // Find changed or added scores
        for (const req in newScores) {
          if (newScores[req] !== currentScores[req]) {
            firestoreUpdates[`badges.${badgeKey}.requirementScores.${req}`] = newScores[req];
          }
        }
        // Find deleted scores
        for (const req in currentScores) {
          if (!(req in newScores)) {
            firestoreUpdates[`badges.${badgeKey}.requirementScores.${req}`] = deleteField();
          }
        }
      }

      // Update completedRequirements using arrayUnion and arrayRemove
      if (updates.completedRequirements !== undefined) {
        const currentCompleted = currentBadge.completedRequirements || [];
        const newCompleted = updates.completedRequirements;
        
        const added = newCompleted.filter(r => !currentCompleted.includes(r));
        const removed = currentCompleted.filter(r => !newCompleted.includes(r));
        
        if (added.length > 0 && removed.length === 0) {
           firestoreUpdates[`badges.${badgeKey}.completedRequirements`] = arrayUnion(...added);
        } else if (removed.length > 0 && added.length === 0) {
           firestoreUpdates[`badges.${badgeKey}.completedRequirements`] = arrayRemove(...removed);
        } else if (added.length > 0 && removed.length > 0) {
           // If both added and removed, just overwrite to be safe
           firestoreUpdates[`badges.${badgeKey}.completedRequirements`] = newCompleted;
        }
      }

      if (Object.keys(firestoreUpdates).length === 0) {
        return; // Nothing to update
      }

      console.log('Updating badge for scout:', scout.uid, 'Badge:', badgeKey, 'Updates:', firestoreUpdates);
      await updateDoc(doc(db, 'users', scout.uid), firestoreUpdates);
      
      await logActivity(
        'تحديث شارة',
        `تم تحديث تقييم شارة ${currentBadge.name}`,
        currentProfile.uid,
        currentProfile.name || 'مسؤول',
        scout.uid,
        scout.name
      );
      console.log('Badge updated successfully');
      
      setMessage({ type: 'success', text: 'تم حفظ التقييم بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${scout.uid}`);
      setMessage({ type: 'error', text: 'حدث خطأ أثناء حفظ التقييم' });
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const newCategory: BadgeCategory = {
      id: Date.now().toString(),
      name: newCategoryName.trim(),
      badges: []
    };
    const updatedCategories = [...(badgeSettings.categories || []), newCategory];
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, categories: updatedCategories });
      setNewCategoryName('');
      setMessage({ type: 'success', text: 'تم إضافة التصنيف بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleRemoveCategory = async (categoryId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return;
    const updatedCategories = (badgeSettings.categories || []).filter(c => c.id !== categoryId);
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, categories: updatedCategories });
      setMessage({ type: 'success', text: 'تم حذف التصنيف بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleRenameCategory = async (categoryId: string) => {
    if (!renamingCategoryName.trim()) return;
    const updatedCategories = (badgeSettings.categories || []).map(c => {
      if (c.id === categoryId) {
        return { ...c, name: renamingCategoryName.trim() };
      }
      return c;
    });
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, categories: updatedCategories });
      setRenamingCategoryId(null);
      setRenamingCategoryName('');
      setMessage({ type: 'success', text: 'تم إعادة تسمية التصنيف بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleAddBadgeToCategory = async (categoryId: string) => {
    if (!newBadgeForCategory.trim()) return;
    const updatedCategories = (badgeSettings.categories || []).map(c => {
      if (c.id === categoryId) {
        if (selectedStageForNewBadge === 'all') {
          return { ...c, badges: [...(c.badges || []), newBadgeForCategory.trim()] };
        } else {
          const stageBadges = { ...(c.stageBadges || {}) };
          stageBadges[selectedStageForNewBadge] = [...(stageBadges[selectedStageForNewBadge] || []), newBadgeForCategory.trim()];
          return { ...c, stageBadges };
        }
      }
      return c;
    });
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, categories: updatedCategories });
      setNewBadgeForCategory('');
      setMessage({ type: 'success', text: 'تم إضافة الشارة بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleRemoveBadgeFromCategory = async (categoryId: string, badgeName: string, stage?: Stage) => {
    if (!window.confirm(`هل أنت متأكد من حذف شارة "${badgeName}"؟`)) return;
    const updatedCategories = (badgeSettings.categories || []).map(c => {
      if (c.id === categoryId) {
        if (!stage) {
          return { ...c, badges: (c.badges || []).filter(b => b !== badgeName) };
        } else {
          const stageBadges = { ...(c.stageBadges || {}) };
          if (stageBadges[stage]) {
            stageBadges[stage] = stageBadges[stage]!.filter(b => b !== badgeName);
          }
          return { ...c, stageBadges };
        }
      }
      return c;
    });
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, categories: updatedCategories });
      setMessage({ type: 'success', text: 'تم حذف الشارة بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleAddRequirement = async (badgeName: string, req: string, stages: Stage[] | 'all' = 'all', category: string = 'عام', score: string = '') => {
    if (!badgeName || !req.trim()) return;
    
    const currentBadgeReqs = (badgeSettings.requirements || {})[badgeName] || {};
    
    let newBadgeReqs: Partial<Record<Stage | 'all', string[]>>;
    if (Array.isArray(currentBadgeReqs)) {
      newBadgeReqs = { all: [...currentBadgeReqs] };
    } else {
      newBadgeReqs = { ...currentBadgeReqs };
    }
    
    if (stages === 'all') {
      newBadgeReqs['all'] = [...(newBadgeReqs['all'] || []), req.trim()];
    } else {
      stages.forEach(stage => {
        newBadgeReqs[stage] = [...(newBadgeReqs[stage] || []), req.trim()];
      });
    }

    const updatedRequirements = {
      ...(badgeSettings.requirements || {}),
      [badgeName]: newBadgeReqs
    };
    
    const updatedCategories = {
      ...(badgeSettings.requirementCategories || {}),
      [badgeName]: {
        ...(badgeSettings.requirementCategories?.[badgeName] || {}),
        [req.trim()]: category.trim() || 'عام'
      }
    };
    
    const updatedMaxScores = {
      ...(badgeSettings.requirementMaxScores || {})
    };
    if (score && !isNaN(parseInt(score))) {
      updatedMaxScores[badgeName] = {
        ...(updatedMaxScores[badgeName] || {}),
        [req.trim()]: parseInt(score)
      };
    }
    
    try {
      await setDoc(doc(db, 'settings', 'badges'), { 
        ...badgeSettings, 
        requirements: updatedRequirements,
        requirementCategories: updatedCategories,
        ...(score && !isNaN(parseInt(score)) ? { requirementMaxScores: updatedMaxScores } : {})
      });
      setNewRequirementInput('');
      setNewRequirementCategory('');
      setNewRequirementScore('');
      setMessage({ type: 'success', text: 'تم إضافة البند بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleEditRequirement = async () => {
    if (!editingRequirement || !editingRequirement.newText.trim()) return;
    
    const { badgeName, oldText, newText, category, stage } = editingRequirement;
    const currentBadgeReqs = (badgeSettings.requirements || {})[badgeName] || {};
    
    let newBadgeReqs: Partial<Record<Stage | 'all', string[]>>;
    if (Array.isArray(currentBadgeReqs)) {
      newBadgeReqs = { all: [...currentBadgeReqs] };
    } else {
      newBadgeReqs = { ...currentBadgeReqs };
    }
    
    if (newBadgeReqs[stage]) {
      newBadgeReqs[stage] = newBadgeReqs[stage]!.map(r => r === oldText ? newText.trim() : r);
    }

    const updatedRequirements = {
      ...(badgeSettings.requirements || {}),
      [badgeName]: newBadgeReqs
    };

    // Update category
    const updatedCategories = {
      ...(badgeSettings.requirementCategories || {}),
      [badgeName]: {
        ...(badgeSettings.requirementCategories?.[badgeName] || {}),
        [newText.trim()]: category.trim() || 'عام'
      }
    };
    
    // Remove old category if text changed
    if (oldText !== newText.trim()) {
      delete updatedCategories[badgeName][oldText];
    }
    
    // Always update max scores if provided or if text changed
    const updatedMaxScores = {
      ...(badgeSettings.requirementMaxScores || {})
    };
    
    // Initialize badge object if needed
    if (!updatedMaxScores[badgeName]) {
      updatedMaxScores[badgeName] = {};
    }

    if (oldText !== newText.trim() && updatedMaxScores[badgeName][oldText] !== undefined) {
       // move old score to new text if it exists and text changed
       updatedMaxScores[badgeName][newText.trim()] = updatedMaxScores[badgeName][oldText];
       delete updatedMaxScores[badgeName][oldText];
    }

    // Now set the new score if provided
    if (editingRequirement.maxScore && !isNaN(parseInt(editingRequirement.maxScore))) {
      updatedMaxScores[badgeName] = {
        ...updatedMaxScores[badgeName],
        [newText.trim()]: parseInt(editingRequirement.maxScore)
      };
    }

    try {
      await setDoc(doc(db, 'settings', 'badges'), { 
        ...badgeSettings, 
        requirements: updatedRequirements,
        requirementCategories: updatedCategories,
        requirementMaxScores: updatedMaxScores
      });
      setEditingRequirement(null);
      setMessage({ type: 'success', text: 'تم تعديل البند بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleRemoveRequirement = async (badgeName: string, req: string, stage: Stage | 'all' = 'all') => {
    if (!window.confirm('هل أنت متأكد من حذف هذا البند؟')) return;
    
    const currentBadgeReqs = (badgeSettings.requirements || {})[badgeName] || {};
    
    let newBadgeReqs: Partial<Record<Stage | 'all', string[]>>;
    if (Array.isArray(currentBadgeReqs)) {
      newBadgeReqs = { all: [...currentBadgeReqs] };
    } else {
      newBadgeReqs = { ...currentBadgeReqs };
    }
    
    if (newBadgeReqs[stage]) {
      newBadgeReqs[stage] = newBadgeReqs[stage]!.filter(r => r !== req);
    }

    const updatedRequirements = {
      ...(badgeSettings.requirements || {}),
      [badgeName]: newBadgeReqs
    };
    
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, requirements: updatedRequirements });
      setMessage({ type: 'success', text: 'تم حذف البند بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleSetRequirementMaxScore = async (badgeName: string, req: string, maxScore: number) => {
    const updatedMaxScores = {
      ...(badgeSettings.requirementMaxScores || {}),
      [badgeName]: {
        ...(badgeSettings.requirementMaxScores?.[badgeName] || {}),
        [req]: maxScore
      }
    };
    
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, requirementMaxScores: updatedMaxScores });
      setMessage({ type: 'success', text: 'تم تحديث الدرجة النهائية للبند بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleForceDeleteAuth = async () => {
    if (!authPhoneToDelete || !PHONE_REGEX.test(authPhoneToDelete)) {
      setMessage({ type: 'error', text: 'يرجى إدخال رقم هاتف صحيح (11 رقم)' });
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف حساب رقم ${authPhoneToDelete} من نظام الدخول؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }

    setIsDeletingAuth(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('يجب تسجيل الدخول كمسؤول');

      const adminToken = await user.getIdToken();
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: authPhoneToDelete, adminToken })
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response from server:', text);
        throw new Error(text.includes('A server error occurred') 
          ? 'خطأ في الخادم. تأكد من صحة مفتاح Firebase Service Account في الإعدادات.'
          : 'حدث خطأ غير متوقع في الخادم');
      }

      if (!response.ok) {
        throw new Error(data.error || 'فشل حذف الحساب');
      }

      setMessage({ type: 'success', text: 'تم حذف الحساب بنجاح من نظام الدخول. يمكنك الآن تسجيله مرة أخرى.' });
      setAuthPhoneToDelete('');
    } catch (error: any) {
      console.error('Error force deleting auth:', error);
      setMessage({ type: 'error', text: error.message || 'حدث خطأ أثناء حذف الحساب' });
    } finally {
      setIsDeletingAuth(false);
    }
  };

  const calculateBadgeProgress = (badgeName: string, reqs: string[], completedReqs: string[], requirementScores: Record<string, number> = {}) => {
    if (reqs.length === 0) return 0;
    
    let totalScore = 0;
    let totalMaxScore = 0;
    
    reqs.forEach(req => {
      const maxScore = badgeSettings.requirementMaxScores?.[badgeName]?.[req] || 0;
      if (maxScore > 0) {
        totalMaxScore += maxScore;
        const score = requirementScores[req] || 0;
        if (score >= maxScore * 0.5) {
          totalScore += score;
        }
      } else {
        totalMaxScore += 1;
        totalScore += completedReqs.includes(req) ? 1 : 0;
      }
    });
    
    return totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
  };

  const checkBadgePassStatus = (badgeName: string, reqs: string[], completedReqs: string[], requirementScores: Record<string, number> = {}) => {
    if (reqs.length === 0) return false;

    // 1. All items must be submitted
    const allSubmitted = reqs.every(req => completedReqs.includes(req));
    if (!allSubmitted) return false;

    // Group requirements by category
    const reqsByCategory: Record<string, string[]> = {};
    reqs.forEach(req => {
      const cat = badgeSettings.requirementCategories?.[badgeName]?.[req] || 'عام';
      if (!reqsByCategory[cat]) reqsByCategory[cat] = [];
      reqsByCategory[cat].push(req);
    });

    // 2 & 3. Check each category
    for (const cat in reqsByCategory) {
      const catReqs = reqsByCategory[cat];
      let catTotalScore = 0;
      let catMaxScore = 0;

      catReqs.forEach(req => {
        const maxScore = badgeSettings.requirementMaxScores?.[badgeName]?.[req] || 0;
        if (maxScore > 0) {
          catMaxScore += maxScore;
          const score = requirementScores[req] || 0;
          if (score >= maxScore * 0.5) {
            catTotalScore += score;
          }
        } else {
          catMaxScore += 1;
          catTotalScore += completedReqs.includes(req) ? 1 : 0;
        }
      });

      if (catMaxScore > 0) {
        const catPercentage = (catTotalScore / catMaxScore) * 100;
        if (catPercentage < 60) {
          return false; // Failed this category
        }
      }
    }

    return true;
  };

  const getReqsForStage = (badgeName: string, stage: Stage | 'all') => {
    const badgeReqs = (badgeSettings.requirements || {})[badgeName] || {};
    if (Array.isArray(badgeReqs)) {
      return stage === 'all' ? badgeReqs : [];
    }
    return badgeReqs[stage] || [];
  };

  const getScoutBadgeRequirements = (badgeName: string, stage: Stage) => {
    const badgeReqs = (badgeSettings.requirements || {})[badgeName] || {};
    if (Array.isArray(badgeReqs)) {
      return badgeReqs;
    }
    return [
      ...(badgeReqs.all || []),
      ...(badgeReqs[stage] || [])
    ];
  };

  const handleUpdatePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !editingPermissionsFor) return;

    setEditLoading(true);
    try {
      await updateDoc(doc(db, 'users', editingPermissionsFor.uid), {
        permissions: permissionsForm
      });
      await logActivity(
        'تحديث صلاحيات',
        `تم تحديث صلاحيات المستخدم`,
        currentProfile.uid,
        currentProfile.name || 'مسؤول',
        editingPermissionsFor.uid,
        editingPermissionsFor.name
      );
      setMessage({ type: 'success', text: 'تم تحديث الصلاحيات بنجاح' });
      setEditingPermissionsFor(null);
    } catch (error) {
      console.error('Error updating permissions:', error);
      setMessage({ type: 'error', text: 'حدث خطأ أثناء تحديث الصلاحيات' });
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleAdmin = async (scoutId: string, currentRole: string) => {
    if (!isSuperAdmin) return false;
    
    const newRole = currentRole === 'admin' ? 'scout' : 'admin';
    const actionText = newRole === 'admin' ? 'ترقية إلى مسؤول' : 'إزالة صلاحيات المسؤول';
    
    if (!window.confirm(`هل أنت متأكد من ${actionText} لهذا المستخدم؟`)) return false;

    try {
      await updateDoc(doc(db, 'users', scoutId), { role: newRole });
      const targetScout = scouts.find(s => s.uid === scoutId);
      await logActivity(
        'تغيير دور',
        actionText,
        currentProfile.uid,
        currentProfile.name || 'مسؤول',
        scoutId,
        targetScout?.name
      );
      setMessage({ type: 'success', text: `تم ${actionText} بنجاح` });
      return true;
    } catch (error) {
      console.error('Error updating role:', error);
      setMessage({ type: 'error', text: 'حدث خطأ أثناء تغيير الصلاحيات' });
      return false;
    }
  };

  const handleDeleteScout = async () => {
    if (!deletingScout) return;
    
    const allowed = canDeleteThisScout(deletingScout);
    if (!allowed) return;
    
    setDeleteLoading(true);
    try {
      // 1. Write custom log to deleted_accounts_logs
      await setDoc(doc(collection(db, 'deleted_accounts_logs')), {
        deletedScoutNumber: deletingScout.number || 'بدون رقم',
        deletedByUid: currentProfile.uid,
        deletedByName: currentProfile.name || 'مسؤول',
        timestamp: serverTimestamp()
      });

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'users', deletingScout.uid));
      await logActivity(
        'حذف حساب',
        `تم حذف حساب المستخدم`,
        currentProfile.uid,
        currentProfile.name || 'مسؤول',
        deletingScout.uid,
        'حساب محذوف'
      );
      
      // 3. Try to delete from Firebase Authentication via our backend API
      const user = auth.currentUser;
      if (user) {
        const adminToken = await user.getIdToken();
        try {
          const response = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: deletingScout.uid, adminToken })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.warn('Authentication deletion failed:', errorData.error);
            setMessage({ 
              type: 'success', 
              text: 'تم حذف بيانات الكشاف من قاعدة البيانات، ولكن يرجى حذف حسابه يدوياً من لوحة تحكم Firebase (Authentication) لضمان الحذف الكامل.' 
            });
          } else {
            setMessage({ type: 'success', text: 'تم حذف الحساب بالكامل بنجاح' });
          }
        } catch (apiError) {
          console.error('API Error deleting user:', apiError);
          setMessage({ 
            type: 'success', 
            text: 'تم حذف بيانات الكشاف من قاعدة البيانات، ولكن تعذر الاتصال بالخادم لحذف حسابه من نظام الدخول.' 
          });
        }
      } else {
        setMessage({ type: 'success', text: 'تم حذف الحساب من قاعدة البيانات' });
      }
      
      setDeletingScout(null);
    } catch (error) {
      handleFirestoreError(error, 'delete', `users/${deletingScout.uid}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!isSuperAdmin) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      await deleteDoc(doc(db, 'activity_logs', logId));
      setMessage({ type: 'success', text: 'تم حذف السجل بنجاح' });
    } catch (error) {
      handleFirestoreError(error, 'delete', `activity_logs/${logId}`);
    }
  };

  const handleDeleteSelectedLogs = async () => {
    if (!isSuperAdmin || selectedLogs.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedLogs.length} سجل(ات)؟`)) return;
    try {
      // In a real production scenario with many records, you'd use a batch. 
      // Doing it sequentially here since logs amount might not be that huge or batch limits might be hit.
      // Better to use batch, but for simplicity we can promise.all
      await Promise.all(selectedLogs.map(logId => deleteDoc(doc(db, 'activity_logs', logId))));
      setMessage({ type: 'success', text: 'تم حذف السجلات بنجاح' });
      setSelectedLogs([]);
    } catch (error) {
      handleFirestoreError(error, 'delete', 'activity_logs/batch');
    }
  };

  const handleDeleteAllFilteredLogs = async () => {
    if (!isSuperAdmin) return;
    const logsToDelete = filteredActivityLogs;

    if (logsToDelete.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${logsToDelete.length} سجل(ات) معروضة حاليا؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;

    try {
      await Promise.all(logsToDelete.map(log => deleteDoc(doc(db, 'activity_logs', log.id))));
      setMessage({ type: 'success', text: 'تم حذف السجلات بنجاح' });
      setSelectedLogs([]);
    } catch (error) {
      handleFirestoreError(error, 'delete', 'activity_logs/batch');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !changingPasswordFor || !newPassword) return;

    const detectCodeInjection = (text: string) => {
      const patterns = [
        /select\s+.*?\s+from/i,
        /insert\s+into/i,
        /drop\s+(table|database)/i,
        /update\s+.*?\s+set/i,
        /delete\s+from/i,
        /union\s+select/i,
        /<script.*?>/i,
        /(javascript|vbscript):/i,
        /1\s*=\s*1/i
      ];
      return patterns.some(p => p.test(text));
    };

    if (detectCodeInjection(newPassword)) {
      setMessage({ type: 'error', text: 'لأسباب أمنية، غير مسموح باستخدام أسماء تحتوي على أي رموز مثل * < #' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      return;
    }

    setPasswordLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');
      
      const adminToken = await user.getIdToken();
      const response = await fetch('/api/admin/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          uid: changingPasswordFor.uid, 
          newPassword, 
          adminToken 
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update password');
      }

      setMessage({ type: 'success', text: 'تم تحديث كلمة المرور بنجاح' });
      setChangingPasswordFor(null);
      setNewPassword('');
    } catch (error: any) {
      console.error('Error updating password:', error);
      setMessage({ type: 'error', text: `حدث خطأ: ${error.message}` });
    } finally {
      setPasswordLoading(false);
    }
  };

  const availableTabs = [];
  if (canManageAllBadges) {
    availableTabs.push('categories');
  }
  if (isSuperAdmin) {
    availableTabs.push('groupLinks');
  }
  if (canManageAllBadges || canManageBadgeRequirements) availableTabs.push('requirements');
  if (isSuperAdmin) availableTabs.push('general', 'activity_logs', 'deleted_accounts_logs');
  if (canManageAttendance || canManagePayments) availableTabs.push('attendance');
  if (canDeleteAccounts) availableTabs.push('cleanup');

  const activeSettingsTab = availableTabs.includes(settingsTab) ? settingsTab : (availableTabs[0] || 'categories');

  const filteredActivityLogs = useMemo(() => {
    return activityLogs.filter(log => !log.action.includes('غياب') && !log.action.includes('حضور')).filter(log => {
      if (!logDateFilter) return true;
      if (!log.timestamp?.toDate) return false;
      const logDate = log.timestamp.toDate();
      const [y, m, d] = logDateFilter.split('-');
      return logDate.getFullYear() === parseInt(y, 10) && 
             logDate.getMonth() === parseInt(m, 10) - 1 && 
             logDate.getDate() === parseInt(d, 10);
    });
  }, [activityLogs, logDateFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#4285F4] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isOffline && (
        <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 rounded-xl shadow-sm flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          <div>
            <p className="font-bold">أنت الآن تعمل بدون إنترنت (أوفلاين)</p>
            <p className="text-sm">يمكنك الاستمرار في التقييم، وسيتم مزامنة التعديلات تلقائياً عند عودة الاتصال.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 pb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          onClick={() => setActiveTab('scouts')}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shrink-0 ${
            activeTab === 'scouts' 
              ? 'bg-[#4285F4] text-white shadow-md' 
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <Users size={20} />
          إدارة الكشافة
        </button>
        <button
          onClick={() => setActiveTab('grading')}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shrink-0 ${
            activeTab === 'grading' 
              ? 'bg-[#4285F4] text-white shadow-md' 
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <BarChart3 size={20} />
          تقييم البنود
        </button>
        {canAccessSettings && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shrink-0 ${
              activeTab === 'settings' 
                ? 'bg-[#4285F4] text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <Settings size={20} />
            إعدادات النظام
          </button>
        )}
      </div>

      {activeTab === 'settings' && canAccessSettings ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-8">
          <div className="flex gap-4 border-b border-gray-100 pb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
            {canManageAllBadges && (
              <button
                onClick={() => setSettingsTab('categories')}
                className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'categories' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                تصنيف الشارات
              </button>
            )}
            {(canManageAllBadges || isSuperAdmin) && (
              <button
                onClick={() => setSettingsTab('cancellationRequests')}
                className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'cancellationRequests' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                طلبات الإلغاء
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={() => setSettingsTab('groupLinks')}
                className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'groupLinks' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                روابط المجموعات
              </button>
            )}
            {(canManageAllBadges || canManageBadgeRequirements) && (
              <button
                onClick={() => setSettingsTab('requirements')}
                className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'requirements' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                بنود الشارات
              </button>
            )}
            {isSuperAdmin && (
              <>
                <button
                  onClick={() => setSettingsTab('general')}
                  className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'general' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  إعدادات عامة
                </button>
                <button
                  onClick={() => setSettingsTab('activity_logs')}
                  className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'activity_logs' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  سجل النشاطات
                </button>
                <button
                  onClick={() => setSettingsTab('deleted_accounts_logs')}
                  className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'deleted_accounts_logs' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  سجل الحسابات المحذوفة
                </button>
              </>
            )}
            {(canManageAttendance || canManagePayments) && (
              <button
                onClick={() => setSettingsTab('attendance')}
                className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'attendance' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                الغياب والاشتراك
              </button>
            )}
            {canDeleteAccounts && (
              <button
                onClick={() => setSettingsTab('cleanup')}
                className={`px-6 py-2 rounded-xl font-bold transition-all shrink-0 ${activeSettingsTab === 'cleanup' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                إزالة الحسابات العالقة
              </button>
            )}
          </div>

          {activeSettingsTab === 'cancellationRequests' ? (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">طلبات إلغاء الشارات</h2>
                  <p className="text-gray-500">طلبات الكشافة لإلغاء شاراتهم الحالية للتقديم على شارات أخرى.</p>
                </div>
                {selectedRequests.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleApproveCancellations}
                      disabled={loading}
                      className="px-4 py-2 bg-[#34A853] text-white rounded-xl font-bold hover:bg-green-600 transition-colors flex items-center gap-2 text-sm"
                    >
                      <CheckCircle2 size={16} />
                      موافقة ({selectedRequests.length})
                    </button>
                    <button
                      onClick={handleRejectCancellations}
                      disabled={loading}
                      className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors flex items-center gap-2 text-sm"
                    >
                      <XCircle size={16} />
                      رفض ({selectedRequests.length})
                    </button>
                  </div>
                )}
              </div>

              {cancellationRequests.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <ShieldCheck size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-xl font-bold text-gray-600 mb-2">لا توجد طلبات إلغاء</h3>
                  <p className="text-gray-500">لا يوجد أي طلبات قيد الانتظار حالياً.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right whitespace-nowrap">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="p-4 w-12">
                            <input
                              type="checkbox"
                              checked={selectedRequests.length === cancellationRequests.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRequests(cancellationRequests.map(r => r.id));
                                } else {
                                  setSelectedRequests([]);
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                            />
                          </th>
                          <th className="p-4 font-bold text-gray-700 text-sm">اسم الكشاف</th>
                          <th className="p-4 font-bold text-gray-700 text-sm">المرحلة</th>
                          <th className="p-4 font-bold text-gray-700 text-sm">الشارة المطلوب إلغاؤها</th>
                          <th className="p-4 font-bold text-gray-700 text-sm">تاريخ الطلب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cancellationRequests.map(req => (
                          <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="p-4">
                              <input
                                type="checkbox"
                                checked={selectedRequests.includes(req.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRequests(prev => [...prev, req.id]);
                                  } else {
                                    setSelectedRequests(prev => prev.filter(id => id !== req.id));
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                              />
                            </td>
                            <td className="p-4 font-bold text-gray-800">{req.userName}</td>
                            <td className="p-4 text-gray-600">{req.stage}</td>
                            <td className="p-4">
                              <span className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-sm font-bold">
                                {req.badgeName}
                              </span>
                            </td>
                            <td className="p-4 text-gray-500 text-sm">
                              {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString('ar-EG') : 'غير متوفر'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : activeSettingsTab === 'categories' ? (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">إدارة تصنيفات الشارات</h2>
                  <p className="text-gray-500">قم بإضافة أو حذف التصنيفات والشارات المتاحة في النظام.</p>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="اسم التصنيف الجديد..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold w-40"
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    className="px-3 py-1.5 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] disabled:opacity-50 transition-colors font-bold flex items-center gap-1 text-sm whitespace-nowrap"
                  >
                    <Plus size={16} />
                    إضافة
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(badgeSettings.categories || []).map((category) => (
                  <div key={category.id} className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                      {renamingCategoryId === category.id ? (
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            value={renamingCategoryName}
                            onChange={(e) => setRenamingCategoryName(e.target.value)}
                            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-[#4285F4]"
                            autoFocus
                            onKeyPress={(e) => e.key === 'Enter' && handleRenameCategory(category.id)}
                          />
                          <button
                            onClick={() => handleRenameCategory(category.id)}
                            className="p-1 text-green-500 hover:bg-green-50 rounded-lg"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setRenamingCategoryId(null)}
                            className="p-1 text-gray-400 hover:bg-gray-50 rounded-lg"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-black text-[#4285F4] truncate">{category.name}</h3>
                          <div className="flex gap-1">
                            {isSuperAdmin && (
                              <button
                                onClick={() => {
                                  setRenamingCategoryId(category.id);
                                  setRenamingCategoryName(category.name);
                                }}
                                className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                title="إعادة تسمية التصنيف"
                              >
                                <Edit2 size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveCategory(category.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="حذف التصنيف"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex-1 space-y-4 mb-6 overflow-y-auto max-h-[300px] pr-2">
                      {/* General Badges */}
                      <div>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">شارات عامة (لكل المراحل)</h4>
                        <div className="space-y-2">
                          {(category.badges || []).map((badge) => (
                            <div key={badge} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                              <span className="font-bold text-gray-700">{badge}</span>
                              <button
                                onClick={() => handleRemoveBadgeFromCategory(category.id, badge)}
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          {(!category.badges || category.badges.length === 0) && (
                            <p className="text-[10px] text-gray-400 text-center py-2 italic">لا توجد شارات عامة</p>
                          )}
                        </div>
                      </div>

                      {/* Stage Specific Badges */}
                      {STAGES.map(stage => (
                        <div key={stage}>
                          <h4 className="text-[10px] font-bold text-[#4285F4] uppercase mb-2">شارات مرحلة: {stage}</h4>
                          <div className="space-y-2">
                            {(category.stageBadges?.[stage] || []).map((badge) => (
                              <div key={badge} className="flex items-center justify-between bg-blue-50/30 p-3 rounded-xl border border-blue-100 shadow-sm">
                                <span className="font-bold text-gray-700">{badge}</span>
                                <button
                                  onClick={() => handleRemoveBadgeFromCategory(category.id, badge, stage)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}
                            {(!category.stageBadges?.[stage] || category.stageBadges[stage]!.length === 0) && (
                              <p className="text-[10px] text-gray-400 text-center py-2 italic">لا توجد شارات لهذه المرحلة</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 pt-4 border-t border-gray-200">
                      <div className="flex gap-2">
                        <select
                          value={selectedCategoryForEdit === category.id ? selectedStageForNewBadge : 'all'}
                          onChange={(e) => {
                            setSelectedCategoryForEdit(category.id);
                            setSelectedStageForNewBadge(e.target.value as Stage | 'all');
                          }}
                          className="flex-1 px-2 py-2 rounded-xl border border-gray-200 outline-none text-[10px] font-bold bg-white"
                        >
                          <option value="all">لكل المراحل</option>
                          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="اسم الشارة..."
                          value={selectedCategoryForEdit === category.id ? newBadgeForCategory : ''}
                          onChange={(e) => {
                            setSelectedCategoryForEdit(category.id);
                            setNewBadgeForCategory(e.target.value);
                          }}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddBadgeToCategory(category.id)}
                          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-xs font-bold"
                        />
                        <button
                          onClick={() => handleAddBadgeToCategory(category.id)}
                          disabled={selectedCategoryForEdit !== category.id || !newBadgeForCategory.trim()}
                          className="p-2 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] disabled:opacity-50 transition-colors"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeSettingsTab === 'groupLinks' ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-black text-gray-800 mb-2">روابط المجموعات (WhatsApp)</h2>
                <p className="text-gray-500">قم بإضافة روابط مجموعات الواتساب الخاصة بكل شارة ومرحلة. ستظهر هذه الروابط للكشاف بعد التسجيل مباشرة.</p>
              </div>

              <div className="space-y-6">
                {badgeSettings.categories.map(category => (
                  <div key={category.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">{category.name}</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {getAvailableBadges(category.id).map(badge => (
                        <details key={badge} className="bg-white rounded-xl border border-gray-200 group overflow-hidden">
                          <summary className="font-bold text-[#4285F4] p-4 cursor-pointer flex items-center justify-between hover:bg-blue-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                            <span>{badge}</span>
                            <ChevronDown size={20} className="transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="p-4 pt-0 space-y-3 border-t border-gray-50 mt-2">
                            {STAGES.map(stage => {
                              // If it's a general badge, it's available for all stages
                              const isGeneralBadge = category.badges?.some(b => normalizeArabic(b.trim()) === normalizeArabic(badge.trim()));
                              
                              // If it's a stage-specific badge, check if it's allowed for this stage
                              const isStageBadge = category.stageBadges?.[stage]?.some(b => normalizeArabic(b.trim()) === normalizeArabic(badge.trim()));
                              
                              if (!isGeneralBadge && !isStageBadge) {
                                return null;
                              }

                              const currentLink = badgeSettings.groupLinks?.[badge]?.[stage] || '';
                              console.log('Badge:', badge, 'Link:', currentLink, 'GroupLinks:', badgeSettings.groupLinks);

                              return (
                                <div key={stage} className="flex flex-col sm:flex-row sm:items-center gap-3">
                                  <label className="text-sm font-bold text-gray-700 w-24 shrink-0">{stage}:</label>
                                  <input 
                                    id={`link-${badge}-${stage}`}
                                    type="url"
                                    placeholder="رابط المجموعة (مثال: https://chat.whatsapp.com/...)"
                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-[#4285F4] outline-none text-left"
                                    dir="ltr"
                                    defaultValue={currentLink}
                                  />
                                  <button
                                    onClick={async (e) => {
                                      const input = document.getElementById(`link-${badge}-${stage}`) as HTMLInputElement;
                                      const newLink = input.value.trim();
                                      
                                      const newGroupLinks = {
                                        ...(badgeSettings.groupLinks || {}),
                                        [badge]: {
                                          ...(badgeSettings.groupLinks?.[badge] || {}),
                                          [stage]: newLink
                                        }
                                      };
                                      
                                      try {
                                        await updateDoc(doc(db, 'settings', 'badges'), { 
                                          groupLinks: newGroupLinks 
                                        });
                                        setMessage({ type: 'success', text: 'تم حفظ الرابط بنجاح' });
                                      } catch (error) {
                                        handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
                                      }
                                    }}
                                    className="px-4 py-2 bg-[#4285F4] text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors"
                                  >
                                    حفظ
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeSettingsTab === 'requirements' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-gray-800 mb-2">بنود ومتطلبات الشارات</h2>
                <p className="text-gray-500">قم بتحديد البنود المطلوبة لاجتياز كل شارة.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-4">
                  <label className="text-sm font-bold text-gray-700">اختر الشارة:</label>
                  <select
                    value={selectedBadgeForReq}
                    onChange={(e) => setSelectedBadgeForReq(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none bg-white font-bold text-gray-700"
                  >
                    <option value="">-- اختر شارة --</option>
                    {Array.from(new Set(badgeSettings.categories.flatMap(c => [
                      ...c.badges,
                      ...Object.values(c.stageBadges || {}).flat()
                    ])))
                    .filter(badgeName => {
                      if (isSuperAdmin || canManageAllBadges) return true;
                      if (!currentProfile?.permissions?.canManageBadgeRequirements) return false;
                      const { managedBadges, managedStages } = currentProfile.permissions || {};
                      
                      const hasManagedStages = (managedStages || []).length > 0;
                      const hasManagedBadges = (managedBadges || []).length > 0;
                      
                      const normCurrentBadge = normalizeArabic(badgeName as string);

                      // 1. If no explicit permissions at all, deny access
                      if (!hasManagedStages && !hasManagedBadges) return false;

                      // 2. If specific badges are managed, this badge MUST be one of them
                      if (hasManagedBadges) {
                        const matchesExplicitBadge = (managedBadges || []).some(mb => normalizeArabic(mb) === normCurrentBadge);
                        if (!matchesExplicitBadge) return false;
                      }

                      // 3. If specific stages are managed, the badge must belong to at least one of those managed stages 
                      // (or be a general badge in a category that contains those stages)
                      if (hasManagedStages) {
                        const isBadgeInManagedStage = (badgeSettings.categories || []).some(cat => {
                          // Check stage-specific badges
                          const inSpecificStage = Object.entries(cat.stageBadges || {}).some(([stage, stageBadges]) => {
                            const isManagedStage = (managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(stage));
                            return isManagedStage && (stageBadges as string[] || []).some(sb => normalizeArabic(sb) === normCurrentBadge);
                          });
                          if (inSpecificStage) return true;

                          // Check general badges for a category that relevant to the managed stages
                          const isGeneralToCategory = (cat.badges || []).some(cb => normalizeArabic(cb) === normCurrentBadge);
                          const categoryHasManagedStage = Object.keys(cat.stageBadges || {}).some(stage => 
                            (managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(stage))
                          );
                          return isGeneralToCategory && categoryHasManagedStage;
                        });
                        
                        // If it doesn't match any managed stage criteria, it's only allowed if it was explicitly managed in step 2
                        // BUT if we want stages to be a mandatory filter too, we return false here.
                        // Usually, stage management is about WHICH scouts you can see, 
                        // while badge management is about WHICH badges you can edit.
                        // For the dropdown, we'll allow it if explicitly in managedBadges OR in managedStages.
                        if (!isBadgeInManagedStage && !hasManagedBadges) return false;
                      }

                      return true;
                    })
                    .map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  {selectedBadgeForReq ? (
                    <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200">
                      <h3 className="text-xl font-black text-[#4285F4] mb-4 pb-4 border-b border-gray-200">
                        بنود شارة: {selectedBadgeForReq}
                      </h3>

                      {(() => {
                        const hasManagedStages = (currentProfile?.permissions?.managedStages || []).length > 0;
                        const hasManagedBadges = (currentProfile?.permissions?.managedBadges || []).length > 0;
                        const explicitlyManagesBadge = hasManagedBadges && (currentProfile?.permissions?.managedBadges || []).some(mb => normalizeArabic(mb) === normalizeArabic(selectedBadgeForReq));
                        const canEditAllStagesForBadge = isSuperAdmin || canManageAllBadges || (!hasManagedStages && explicitlyManagesBadge) || (!hasManagedStages && !hasManagedBadges);
                        
                        let allowedStagesForSelectedBadge = STAGES;
                        if (!isSuperAdmin && !canManageAllBadges) {
                           if (hasManagedStages) {
                             allowedStagesForSelectedBadge = STAGES.filter(s => (currentProfile?.permissions?.managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(s)));
                           } else if (hasManagedBadges && explicitlyManagesBadge) {
                             allowedStagesForSelectedBadge = STAGES;
                           } else if (!hasManagedStages && !hasManagedBadges) {
                             allowedStagesForSelectedBadge = STAGES;
                           } else {
                             allowedStagesForSelectedBadge = [];
                           }
                        }

                        return (
                          <>
                            <div className="space-y-6 mb-6">
                              {/* All Stages */}
                              {canEditAllStagesForBadge && (
                                <div>
                                  <h4 className="text-xs font-black text-gray-400 uppercase mb-3 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                    لكل المراحل
                                  </h4>
                                  <div className="space-y-4">
                                    {getReqsForStage(selectedBadgeForReq, 'all').length > 0 ? (
                                      Object.entries(
                                        getReqsForStage(selectedBadgeForReq, 'all').reduce((acc: Record<string, string[]>, req: string) => {
                                          const category = badgeSettings.requirementCategories?.[selectedBadgeForReq]?.[req] || 'عام';
                                          if (!acc[category]) acc[category] = [];
                                          acc[category].push(req);
                                          return acc;
                                        }, {})
                                      ).map(([category, reqs]) => (
                                        <div key={category} className="space-y-2">
                                          <h5 className="text-sm font-bold text-[#4285F4] border-b border-gray-100 pb-1 mb-2">
                                            {category} :-
                                          </h5>
                                          {(reqs as string[]).map((req, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm gap-3">
                                              <span className="font-bold text-gray-700 text-sm flex-1">
                                                {req}
                                              </span>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <button 
                                                  onClick={() => setEditingRequirement({
                                                    badgeName: selectedBadgeForReq,
                                                    oldText: req,
                                                    newText: req,
                                                    category: category,
                                                    stage: 'all',
                                                    maxScore: (badgeSettings.requirementMaxScores?.[selectedBadgeForReq]?.[req] || '').toString()
                                                  })}
                                                  className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                  title="تعديل البند"
                                                >
                                                  <Edit2 size={16} />
                                                </button>
                                                <button 
                                                  onClick={() => handleRemoveRequirement(selectedBadgeForReq, req, 'all')}
                                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                  <Trash2 size={16} />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-[10px] text-gray-400 italic py-2">لا توجد بنود عامة</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Specific Stages */}
                              {allowedStagesForSelectedBadge.map(stage => (
                                <div key={stage}>
                                  <h4 className="text-xs font-black text-[#4285F4] uppercase mb-3 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
                                    مرحلة: {stage}
                                  </h4>
                                  <div className="space-y-4">
                                    {getReqsForStage(selectedBadgeForReq, stage).length > 0 ? (
                                      Object.entries(
                                        getReqsForStage(selectedBadgeForReq, stage).reduce((acc: Record<string, string[]>, req: string) => {
                                          const category = badgeSettings.requirementCategories?.[selectedBadgeForReq]?.[req] || 'عام';
                                          if (!acc[category]) acc[category] = [];
                                          acc[category].push(req);
                                          return acc;
                                        }, {})
                                      ).map(([category, reqs]) => (
                                        <div key={category} className="space-y-2">
                                          <h5 className="text-sm font-bold text-[#4285F4] border-b border-gray-100 pb-1 mb-2">
                                            {category} :-
                                          </h5>
                                          {(reqs as string[]).map((req, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm gap-3">
                                              <span className="font-bold text-gray-700 text-sm flex-1">
                                                {req}
                                              </span>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <button 
                                                  onClick={() => setEditingRequirement({
                                                    badgeName: selectedBadgeForReq,
                                                    oldText: req,
                                                    newText: req,
                                                    category: category,
                                                    stage: stage,
                                                    maxScore: (badgeSettings.requirementMaxScores?.[selectedBadgeForReq]?.[req] || '').toString()
                                                  })}
                                                  className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                  title="تعديل البند"
                                                >
                                                  <Edit2 size={16} />
                                                </button>
                                                <button 
                                                  onClick={() => handleRemoveRequirement(selectedBadgeForReq, req, stage)}
                                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                  <Trash2 size={16} />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-[10px] text-gray-400 italic py-2">لا توجد بنود لهذه المرحلة</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="space-y-3 pt-6 border-t border-gray-200">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500">اختر المراحل:</label>
                                <div className="flex flex-wrap gap-2">
                                  {canEditAllStagesForBadge && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStageForNewReq('all')}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        selectedStageForNewReq === 'all'
                                          ? 'bg-[#4285F4] text-white'
                                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      }`}
                                    >
                                      الكل
                                    </button>
                                  )}
                                  {allowedStagesForSelectedBadge.map(s => {
                                    const isSelected = selectedStageForNewReq !== 'all' && selectedStageForNewReq.includes(s);
                                    return (
                                      <button
                                        key={s}
                                        type="button"
                                        onClick={() => {
                                          if (selectedStageForNewReq === 'all') {
                                            setSelectedStageForNewReq([s]);
                                          } else {
                                            if (isSelected) {
                                              const newSelection = selectedStageForNewReq.filter(st => st !== s);
                                              setSelectedStageForNewReq(newSelection.length > 0 ? newSelection : (canEditAllStagesForBadge ? 'all' : [allowedStagesForSelectedBadge[0]]));
                                            } else {
                                              setSelectedStageForNewReq([...selectedStageForNewReq, s]);
                                            }
                                          }
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                          isSelected
                                            ? 'bg-[#4285F4] text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                      >
                                        {s}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                  type="text"
                                  placeholder="التصنيف (مثال: روحي، عملي)..."
                                  value={newRequirementCategory}
                                  onChange={(e) => setNewRequirementCategory(e.target.value)}
                                  className="w-full sm:w-48 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="الدرجة النهائية..."
                                  value={newRequirementScore}
                                  onChange={(e) => setNewRequirementScore(e.target.value)}
                                  className="w-full sm:w-32 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold text-center"
                                />
                                <input
                                  type="text"
                                  placeholder="أضف بنداً جديداً..."
                                  value={newRequirementInput}
                                  onChange={(e) => setNewRequirementInput(e.target.value)}
                                  onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        const finalStages = selectedStageForNewReq === 'all' 
                                          ? (canEditAllStagesForBadge ? 'all' : allowedStagesForSelectedBadge)
                                          : selectedStageForNewReq;
                                        handleAddRequirement(selectedBadgeForReq, newRequirementInput, finalStages, newRequirementCategory, newRequirementScore);
                                      }
                                  }}
                                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                                />
                                <button
                                  onClick={() => {
                                      const finalStages = selectedStageForNewReq === 'all' 
                                        ? (canEditAllStagesForBadge ? 'all' : allowedStagesForSelectedBadge)
                                        : selectedStageForNewReq;
                                      handleAddRequirement(selectedBadgeForReq, newRequirementInput, finalStages, newRequirementCategory, newRequirementScore);
                                  }}
                                  disabled={!newRequirementInput.trim()}
                                  className="px-6 py-3 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] disabled:opacity-50 transition-colors font-bold flex items-center gap-2"
                                >
                                  <Plus size={20} />
                                  إضافة
                                </button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center p-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                      <p className="text-gray-400 font-bold text-center">
                        يرجى اختيار شارة من القائمة لعرض وتعديل بنودها
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeSettingsTab === 'activity_logs' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">سجل النشاطات</h2>
                  <p className="text-gray-500 font-bold">سجل بجميع التعديلات التي تمت على النظام والأفراد.</p>
                </div>
                
                {isSuperAdmin && (
                  <div className="flex items-center gap-3">
                    <input
                      type="date"
                      value={logDateFilter}
                      onChange={(e) => setLogDateFilter(e.target.value)}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold text-gray-700"
                    />
                    {selectedLogs.length > 0 && (
                      <button
                        onClick={handleDeleteSelectedLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-bold text-sm"
                      >
                        <Trash2 size={18} />
                        حذف المحدد ({selectedLogs.length})
                      </button>
                    )}
                    <button
                      onClick={handleDeleteAllFilteredLogs}
                      className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-colors font-bold text-sm"
                    >
                      <Trash2 size={18} />
                      حذف الكل
                    </button>
                  </div>
                )}
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="bg-gray-50 text-gray-700">
                        {isSuperAdmin && (
                          <th className="p-4 w-12">
                            <input
                              type="checkbox"
                              checked={filteredActivityLogs.length > 0 && selectedLogs.length === filteredActivityLogs.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLogs(filteredActivityLogs.map(l => l.id));
                                } else {
                                  setSelectedLogs([]);
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                            />
                          </th>
                        )}
                        <th className="p-4 font-bold">التاريخ والوقت</th>
                        <th className="p-4 font-bold">المسؤول</th>
                        <th className="p-4 font-bold">الإجراء</th>
                        <th className="p-4 font-bold">التفاصيل</th>
                        <th className="p-4 font-bold">المستخدم المستهدف</th>
                        <th className="p-4 font-bold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivityLogs.length === 0 ? (
                        <tr>
                          <td colSpan={isSuperAdmin ? 7 : 6} className="p-8 text-center text-gray-500 font-bold">
                            لا توجد نشاطات مسجلة حتى الآن
                          </td>
                        </tr>
                      ) : (
                        filteredActivityLogs.map((log) => (
                          <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                            {isSuperAdmin && (
                              <td className="p-4">
                                <input
                                  type="checkbox"
                                  checked={selectedLogs.includes(log.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedLogs([...selectedLogs, log.id]);
                                    } else {
                                      setSelectedLogs(selectedLogs.filter(id => id !== log.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                                />
                              </td>
                            )}
                            <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                              {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ar-EG', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'غير متوفر'}
                            </td>
                            <td className="p-4 font-bold text-gray-800 whitespace-nowrap">{log.adminName}</td>
                            <td className="p-4 whitespace-nowrap">
                              <span className="px-3 py-1 bg-blue-50 text-[#4285F4] rounded-full text-xs font-bold inline-block">
                                {log.action}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-gray-600">{log.details}</td>
                            <td className="p-4 font-bold text-gray-800 whitespace-nowrap">{log.targetUserName || '-'}</td>
                            <td className="p-4 text-center">
                              {isSuperAdmin && (
                                <button
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors"
                                  title="حذف السجل"
                                >
                                  <X size={18} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeSettingsTab === 'deleted_accounts_logs' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">سجل الحسابات المحذوفة</h2>
                  <p className="text-gray-500 font-bold">يحتوي على أرقام الحسابات المحذوفة ولمن قام بحذفها.</p>
                </div>
                {isSuperAdmin && (
                  <div className="flex items-center gap-2">
                    {selectedDeletedLogs.length > 0 && (
                      <button
                        onClick={async () => {
                          if (window.confirm(`هل أنت متأكد من حذف ${selectedDeletedLogs.length} سجل محذوف؟`)) {
                            try {
                              for (const id of selectedDeletedLogs) {
                                await deleteDoc(doc(db, 'deleted_accounts_logs', id));
                              }
                              setSelectedDeletedLogs([]);
                              setMessage({ type: 'success', text: 'تم حذف السجلات المحددة بنجاح' });
                            } catch (error) {
                              setMessage({ type: 'error', text: 'حدث خطأ أثناء حذف السجلات' });
                            }
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors shrink-0"
                      >
                        <Trash2 size={18} />
                        <span>حذف المحدد ({selectedDeletedLogs.length})</span>
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (window.confirm('هل أنت متأكد من حذف جميع سجلات الحسابات المحذوفة نهائياً؟')) {
                          try {
                            const batch = writeBatch(db);
                            deletedAccountsLogs.forEach(log => {
                              batch.delete(doc(db, 'deleted_accounts_logs', log.id));
                            });
                            await batch.commit();
                            setSelectedDeletedLogs([]);
                            setMessage({ type: 'success', text: 'تم حذف جميع السجلات بنجاح' });
                          } catch (error) {
                            setMessage({ type: 'error', text: 'حدث خطأ أثناء حذف السجلات' });
                          }
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors shrink-0 shadow-sm"
                    >
                      <Trash2 size={18} />
                      <span className="hidden sm:inline">حذف الكل</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {isSuperAdmin && (
                          <th className="p-4 w-12 text-center">
                            <input
                              type="checkbox"
                              checked={selectedDeletedLogs.length === deletedAccountsLogs.length && deletedAccountsLogs.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDeletedLogs(deletedAccountsLogs.map(log => log.id));
                                } else {
                                  setSelectedDeletedLogs([]);
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                            />
                          </th>
                        )}
                        <th className="p-4 font-bold text-gray-700 whitespace-nowrap">الوقت والتاريخ</th>
                        <th className="p-4 font-bold text-gray-700 whitespace-nowrap">قام بالحذف</th>
                        <th className="p-4 font-bold text-gray-700 whitespace-nowrap">رقم الحساب المحذوف</th>
                        <th className="p-4 font-bold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedAccountsLogs.length === 0 ? (
                        <tr>
                          <td colSpan={isSuperAdmin ? 5 : 4} className="p-8 text-center text-gray-500 font-bold">
                            لا توجد حسابات محذوفة مسجلة
                          </td>
                        </tr>
                      ) : (
                        deletedAccountsLogs.map((log) => (
                          <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                            {isSuperAdmin && (
                              <td className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedDeletedLogs.includes(log.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedDeletedLogs([...selectedDeletedLogs, log.id]);
                                    } else {
                                      setSelectedDeletedLogs(selectedDeletedLogs.filter(id => id !== log.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                                />
                              </td>
                            )}
                            <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                              {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ar-EG', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'غير متوفر'}
                            </td>
                            <td className="p-4 font-bold text-gray-800 whitespace-nowrap">{log.deletedByName}</td>
                            <td className="p-4 font-bold text-gray-800 whitespace-nowrap">{log.deletedScoutNumber}</td>
                            <td className="p-4 text-center">
                              {isSuperAdmin && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await deleteDoc(doc(db, 'deleted_accounts_logs', log.id));
                                      setMessage({ type: 'success', text: 'تم حذف السجل بنجاح' });
                                    } catch (error) {
                                      setMessage({ type: 'error', text: 'حدث خطأ أثناء حذف السجل' });
                                    }
                                  }}
                                  className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors"
                                  title="حذف السجل"
                                >
                                  <X size={18} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeSettingsTab === 'cleanup' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">إدارة الحسابات العالقة</h2>
                  <p className="text-gray-500 font-bold">استخدم هذا الخيار إذا كان الرقم مسجلاً بالفعل ولكن لا يظهر في القائمة (حساب محذوف جزئياً)</p>
                </div>

                <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-red-100 rounded-2xl text-red-600 shadow-sm">
                      <UserX size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-red-800">حذف نهائي من النظام</h3>
                      <p className="text-sm text-red-600 font-bold opacity-80">سيتم حذف الحساب من نظام الدخول بالكامل، مما يتيح إعادة تسجيله.</p>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Hash className="absolute right-4 top-1/2 -translate-y-1/2 text-red-300" size={20} />
                      <input
                        type="tel"
                        value={authPhoneToDelete}
                        onChange={(e) => setAuthPhoneToDelete(e.target.value)}
                        placeholder="أدخل رقم الهاتف (11 رقم)"
                        className="w-full pl-4 pr-12 py-4 rounded-2xl border border-red-200 outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 font-bold text-red-900 placeholder:text-red-200 transition-all"
                        maxLength={11}
                      />
                    </div>
                    <button
                      onClick={handleForceDeleteAuth}
                      disabled={isDeletingAuth || !authPhoneToDelete}
                      className="px-8 py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-red-200 active:scale-[0.98]"
                    >
                      {isDeletingAuth ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/50 border-t-white" />
                      ) : (
                        <>
                          <Trash2 size={20} />
                          <span>حذف نهائي من النظام</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 p-8 rounded-[2.5rem] border border-blue-100 mt-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-blue-100 rounded-2xl text-blue-600 shadow-sm">
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-blue-800">تحديث بيانات المراحل القديمة</h3>
                      <p className="text-sm text-blue-600 font-bold opacity-80">استخدم هذا الخيار لنقل متطلبات الشارات من المراحل المدمجة القديمة (مثل أشبال وزهرات مبتدأ) إلى المراحل المنفصلة الجديدة.</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={migrateOldStages}
                      className="px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-200 active:scale-[0.98]"
                    >
                      <Save size={20} />
                      <span>تحديث البيانات</span>
                    </button>
                  </div>
                </div>
              </div>
          ) : activeSettingsTab === 'general' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-gray-800 mb-2">الإعدادات العامة</h2>
                <p className="text-gray-500 font-bold">تحكم في إعدادات النظام العامة وصلاحيات التسجيل.</p>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">اسم المجموعة الكشفية</h3>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <input
                      type="text"
                      value={generalSettings.scoutGroupName || ''}
                      onChange={(e) => setGeneralSettings(prev => ({ ...prev, scoutGroupName: e.target.value }))}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold bg-white"
                      placeholder="مثال: مجموعة مارجرجس الكشفية"
                    />
                    <button
                      onClick={async () => {
                        try {
                          await setDoc(doc(db, 'settings', 'general'), {
                            scoutGroupName: generalSettings.scoutGroupName
                          }, { merge: true });
                          setMessage({ type: 'success', text: 'تم حفظ اسم المجموعة بنجاح' });
                        } catch (error) {
                          console.error('Error updating group name:', error);
                          setMessage({ type: 'error', text: 'حدث خطأ أثناء حفظ اسم المجموعة' });
                        }
                      }}
                      className="px-8 py-3 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] transition-colors font-bold text-sm whitespace-nowrap shadow-sm"
                    >
                      حفظ التعديل
                    </button>
                  </div>
                </div>

                <div className="bg-purple-50 p-6 rounded-3xl border border-purple-100">
                  <h3 className="text-lg font-bold text-purple-900 mb-4">نظام الدفعات (Waves)</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-bold text-purple-900">الدفعة الحالية</p>
                        <p className="text-xs text-purple-700">تحديد الدفعة النشطة حالياً.</p>
                      </div>
                      <select
                        value={generalSettings.activeWave || 'wave1'}
                        onChange={async (e) => {
                          const val = e.target.value as 'wave1' | 'wave2';
                          await setDoc(doc(db, 'settings', 'general'), {
                            activeWave: val
                          }, { merge: true });
                        }}
                        className="px-4 py-2 rounded-xl border border-purple-200 outline-none font-bold text-sm bg-white"
                      >
                        <option value="wave1">الدفعة الأولى (Wave 1)</option>
                        <option value="wave2">الدفعة الثانية (Wave 2)</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-bold text-purple-900">إظهار نتائج النجاح للكشافة</p>
                        <p className="text-xs text-purple-700">إذا تم التفعيل، سيتمكن الكشافة من رؤية ما إذا كانوا قد اجتازوا شاراتهم.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={generalSettings.showResults || false}
                          onChange={async (e) => {
                            await setDoc(doc(db, 'settings', 'general'), {
                              showResults: e.target.checked
                            }, { merge: true });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    {generalSettings.activeWave === 'wave1' && (
                      <div className="pt-4 border-t border-purple-200">
                        <button
                          onClick={handleEndWave1}
                          disabled={loading}
                          className="w-full py-3 bg-purple-600 text-white font-black rounded-xl hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                          إنهاء الدفعة الأولى (Wave 1) وبدء الدفعة الثانية
                        </button>
                        <p className="text-xs text-purple-600 mt-2 text-center font-bold">
                          تنبيه: سيتم حفظ نتائج الكشافة الحالية، ونقل الشارات الناجحة، وتفريغ الاختيارات لبدء الدفعة الثانية.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {isSuperAdmin && (
                  <>
                    <hr className="border-gray-100" />
                    <div className="space-y-6 relative">
                      {creatingAccount && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                          <div className="w-10 h-10 border-4 border-[#4285F4]/30 border-t-[#4285F4] rounded-full animate-spin mb-3" />
                          <p className="font-bold text-[#4285F4]">جاري إنشاء الحساب...</p>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-[#4285F4]/10 rounded-2xl text-[#4285F4]">
                          <ShieldPlus size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-800">إنشاء حساب جديد</h3>
                          <p className="text-sm text-gray-500">أضف مسؤولاً أو كشافاً جديداً مباشرة من هنا.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 px-1">الاسم بالكامل</label>
                          <input
                            type="text"
                            value={newAccountForm.name}
                            onChange={(e) => setNewAccountForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                            placeholder="أدخل الاسم"
                          />
                          <p className="text-xs text-yellow-600 font-bold mt-1">برجاء ادخال الاسم ثلاثي بالعربي فقط</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 px-1">رقم الهاتف</label>
                          <input
                            type="tel"
                            value={newAccountForm.phone}
                            onChange={(e) => setNewAccountForm(prev => ({ ...prev, phone: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                            placeholder="01xxxxxxxxx"
                            maxLength={11}
                          />
                          <p className="text-xs text-yellow-600 font-bold mt-1">برجاء التأكد من صحة الرقم المدخل قبل إنشاء الحساب</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 px-1">كلمة المرور</label>
                          <input
                            type="password"
                            value={newAccountForm.password}
                            onChange={(e) => setNewAccountForm(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                            placeholder="••••••••"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 px-1">المرحلة</label>
                          <select
                            value={newAccountForm.stage}
                            onChange={(e) => setNewAccountForm(prev => ({ ...prev, stage: e.target.value as Stage }))}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold bg-white"
                          >
                            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 px-1">نوع الحساب</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setNewAccountForm(prev => ({ ...prev, role: 'scout' }))}
                              className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${newAccountForm.role === 'scout' ? 'bg-[#4285F4] text-white border-[#4285F4]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            >
                              كشاف
                            </button>
                            <button
                              onClick={() => setNewAccountForm(prev => ({ ...prev, role: 'admin' }))}
                              className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${newAccountForm.role === 'admin' ? 'bg-[#4285F4] text-white border-[#4285F4]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            >
                              مسؤول
                            </button>
                          </div>
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={handleCreateAccount}
                            disabled={creatingAccount}
                            className="w-full py-3 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] transition-colors font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {creatingAccount ? (
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Plus size={20} />
                            )}
                            إنشاء الحساب
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <hr className="border-gray-100" />

                <div>
                  <h3 className="text-xl font-bold text-gray-800 mb-4">المراحل المسموح لها بالتسجيل</h3>
                  <p className="text-sm text-gray-500 mb-6">اختر المراحل التي يمكنها إنشاء حسابات جديدة حالياً. المراحل غير المحددة لن تتمكن من التسجيل.</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {STAGES.map(stage => {
                      const isAllowed = generalSettings.allowedRegistrationStages?.includes(stage) ?? true;
                      return (
                        <label key={stage} className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${isAllowed ? 'border-[#4285F4] bg-[#4285F4]/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input
                            type="checkbox"
                            checked={isAllowed}
                            onChange={async (e) => {
                              const currentAllowed = generalSettings.allowedRegistrationStages || [...STAGES];
                              const newAllowed = e.target.checked
                                ? [...currentAllowed, stage]
                                : currentAllowed.filter(s => s !== stage);
                              
                              try {
                                await setDoc(doc(db, 'settings', 'general'), {
                                  allowedRegistrationStages: newAllowed
                                }, { merge: true });
                              } catch (error) {
                                console.error('Error updating allowed stages:', error);
                                alert('حدث خطأ أثناء تحديث الإعدادات');
                              }
                            }}
                            className="w-5 h-5 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                          />
                          <span className={`font-bold ${isAllowed ? 'text-[#4285F4]' : 'text-gray-600'}`}>{stage}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : activeSettingsTab === 'attendance' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-gray-800 mb-2">الغياب والاشتراك</h2>
                <p className="text-gray-500 font-bold">إدارة غياب الأفراد والاشتراكات المالية.</p>
              </div>

              {isSuperAdmin && (
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between max-w-sm">
                  <h3 className="text-lg font-bold text-gray-800">سعر الشارة:</h3>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      max="99"
                      maxLength={2}
                      value={generalSettings.badgePrice || 30}
                      onChange={async (e) => {
                        let newPrice = Number(e.target.value);
                        if (newPrice > 99) newPrice = 99;
                        setGeneralSettings(prev => ({ ...prev, badgePrice: newPrice }));
                        try {
                          await setDoc(doc(db, 'settings', 'general'), { badgePrice: newPrice }, { merge: true });
                        } catch (error) {
                          handleFirestoreError(error, OperationType.UPDATE, 'settings/general');
                        }
                      }}
                      className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-center font-bold"
                    />
                    <span className="font-bold text-gray-500 text-sm">جنيه</span>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <h3 className="text-xl font-bold text-gray-800">سجل الغياب والاشتراكات</h3>
                  {isSuperAdmin && (
                    <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                      <input
                        type="date"
                        value={newAttendanceDate}
                        onChange={(e) => setNewAttendanceDate(e.target.value)}
                        className="flex-1 md:flex-none px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none font-bold text-sm min-w-[130px]"
                      />
                      <button
                        onClick={async () => {
                          if (!newAttendanceDate) return;
                          const dates = generalSettings.attendanceDates || [];
                          if (dates.includes(newAttendanceDate)) {
                            setMessage({ type: 'error', text: 'هذا التاريخ مضاف بالفعل' });
                            return;
                          }
                          const newDates = [...dates, newAttendanceDate].sort();
                          try {
                            await setDoc(doc(db, 'settings', 'general'), { attendanceDates: newDates }, { merge: true });
                            setNewAttendanceDate('');
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, 'settings/general');
                          }
                        }}
                        className="px-4 py-2 bg-[#4285F4] text-white font-bold rounded-xl hover:bg-blue-600 transition-all text-sm whitespace-nowrap flex-shrink-0 shadow-sm"
                      >
                        إضافة يوم
                      </button>
                    </div>
                  )}
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      placeholder="بحث بالاسم..."
                      value={attendanceSearchQuery}
                      onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                      className="w-full pl-4 pr-10 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none"
                    />
                  </div>
                  <select
                    value={attendanceStageFilter}
                    onChange={(e) => setAttendanceStageFilter(e.target.value as Stage | 'all')}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none"
                  >
                    <option value="all">جميع المراحل</option>
                    {STAGES.map(stage => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                  <select
                    value={attendanceBadgeCountFilter}
                    onChange={(e) => setAttendanceBadgeCountFilter(e.target.value as any)}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none"
                  >
                    <option value="all">جميع أعداد الشارات</option>
                    <option value="1">شارة واحدة</option>
                    <option value="2">شارتين</option>
                    <option value="3">3 شارات</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-gray-200 text-gray-700 text-sm">
                        <th className="p-3 border border-gray-300 font-bold">اسم الفرد</th>
                        <th className="p-3 border border-gray-300 font-bold">المرحلة</th>
                        <th className="p-3 border border-gray-300 font-bold text-center">كام شارة</th>
                        <th className="p-3 border border-gray-300 font-bold text-center">الاشتراك</th>
                        {(generalSettings.attendanceDates || []).map(date => {
                          const d = new Date(date);
                          const day = d.getDate();
                          const month = d.getMonth() + 1;
                          const monthName = d.toLocaleDateString('en-GB', { month: 'short' });
                          
                          return (
                            <th key={date} className="p-2 border border-gray-300 font-bold text-center relative group min-w-[80px]">
                              <div className="flex flex-col items-center justify-center leading-tight">
                                <div className="flex items-center gap-1">
                                  <span>{day}</span>
                                  <span>-</span>
                                  <span>{monthName}</span>
                                </div>
                                <span className="text-xs text-gray-500">({month}/{day})</span>
                                <button
                                  onClick={() => {
                                    if (scannerDate !== date) {
                                      setScanLogs([]);
                                    }
                                    setScannerDate(date);
                                    setIsScannerOpen(true);
                                  }}
                                  className="mt-1 flex items-center gap-1 text-xs bg-blue-50 text-[#4285F4] px-2 py-1 rounded-md hover:bg-blue-100 transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path><rect x="7" y="7" width="10" height="10"></rect></svg>
                                  Scanner
                                </button>
                              </div>
                              {isSuperAdmin && (
                                <button
                                  onClick={async () => {
                                    if (window.confirm('هل أنت متأكد من حذف هذا اليوم؟')) {
                                      const newDates = (generalSettings.attendanceDates || []).filter(d => d !== date);
                                      try {
                                        await setDoc(doc(db, 'settings', 'general'), { attendanceDates: newDates }, { merge: true });
                                      } catch (error) {
                                        handleFirestoreError(error, OperationType.UPDATE, 'settings/general');
                                      }
                                    }
                                  }}
                                  className="absolute top-0.5 left-0.5 text-red-500 p-1 hover:bg-red-50 rounded"
                                  title="حذف اليوم"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {scouts.filter(scout => {
                        const matchesSearch = scout.name.toLowerCase().includes(attendanceSearchQuery.toLowerCase()) || 
                                              (scout.number && scout.number.includes(attendanceSearchQuery));
                        const matchesStage = attendanceStageFilter === 'all' || scout.stage === attendanceStageFilter;
                        const badgesCount = [scout.badges.badge1.name, scout.badges.badge2.name, scout.badges.badge3.name].filter(Boolean).length;
                        const matchesBadgeCount = attendanceBadgeCountFilter === 'all' || badgesCount.toString() === attendanceBadgeCountFilter;
                        return matchesSearch && matchesStage && matchesBadgeCount;
                      }).map(scout => {
                        const badgesCount = [scout.badges.badge1.name, scout.badges.badge2.name, scout.badges.badge3.name].filter(Boolean).length;
                        const totalRequired = badgesCount * (generalSettings.badgePrice || 30);
                        const amountPaid = scout.amountPaid || 0;
                        
                        return (
                          <tr key={scout.uid} className="hover:bg-gray-100 transition-colors">
                            <td className="p-3 border border-gray-300">
                              <div className="font-bold">{scout.name}</div>
                              {scout.number && <div className="text-xs text-gray-500">{scout.number}</div>}
                            </td>
                            <td className="p-3 border border-gray-300 text-center font-bold text-gray-600">{scout.stage}</td>
                            <td className="p-3 border border-gray-300 text-center font-bold text-[#4285F4]">{badgesCount}</td>
                            <td className="p-3 border border-gray-300 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {canManagePayments ? (
                                  <input
                                    type="number"
                                    value={amountPaid || 0}
                                    onChange={async (e) => {
                                      try {
                                        await updateDoc(doc(db, 'users', scout.uid), { amountPaid: Number(e.target.value) });
                                        await logActivity(
                                          'تحديث اشتراك',
                                          `تم تحديث المبلغ المدفوع إلى ${e.target.value}`,
                                          currentProfile.uid,
                                          currentProfile.name || 'مسؤول',
                                          scout.uid,
                                          scout.name
                                        );
                                      } catch (error) {
                                        handleFirestoreError(error, OperationType.UPDATE, `users/${scout.uid}`);
                                      }
                                    }}
                                    className="w-12 text-center bg-transparent border-b border-gray-300 focus:border-[#4285F4] outline-none"
                                  />
                                ) : (
                                  <span className="font-bold text-gray-800">{amountPaid}</span>
                                )}
                                <span className="text-gray-500">/ {totalRequired}</span>
                              </div>
                            </td>
                            {(generalSettings.attendanceDates || []).map(date => (
                              <td key={date} className="p-3 border border-gray-300 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!canManageAttendance}
                                  checked={scout.attendance?.[date] || false}
                                  onChange={async (e) => {
                                    try {
                                      await updateDoc(doc(db, 'users', scout.uid), {
                                        [`attendance.${date}`]: e.target.checked
                                      });
                                      await logActivity(
                                        'تسجيل غياب',
                                        `تم ${e.target.checked ? 'تسجيل حضور' : 'إلغاء حضور'} ليوم ${date}`,
                                        currentProfile.uid,
                                        currentProfile.name || 'مسؤول',
                                        scout.uid,
                                        scout.name
                                      );
                                    } catch (error) {
                                      handleFirestoreError(error, OperationType.UPDATE, `users/${scout.uid}`);
                                    }
                                  }}
                                  className="w-5 h-5 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : activeTab === 'grading' ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center border-b border-gray-100 pb-6">
            <h2 className="text-2xl font-black text-gray-800">تقييم البنود</h2>
            <div className="flex flex-wrap gap-4 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="ابحث عن كشاف..."
                  value={gradingSearchTerm}
                  onChange={(e) => setGradingSearchTerm(e.target.value)}
                  className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#4285F4] focus:border-transparent outline-none font-bold text-gray-700 transition-all"
                />
              </div>
              <select
                value={gradingSelectedBadge}
                onChange={(e) => setGradingSelectedBadge(e.target.value)}
                className="w-full md:w-auto px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#4285F4] outline-none font-bold text-gray-700"
              >
                <option value="">اختر الشارة للتقييم</option>
                {Array.from(new Set([
                  ...scouts.flatMap(s => [s.badges?.badge1?.name, s.badges?.badge2?.name, s.badges?.badge3?.name]),
                  ...(badgeSettings.categories || []).flatMap(c => [
                    ...(c.badges || []),
                    ...Object.values(c.stageBadges || {}).flat()
                  ])
                ]))
                  .filter(Boolean)
                  .filter(badgeName => {
                    if (isSuperAdmin || canManageAllBadges) return true;
                    if (!currentProfile?.permissions) return false;
                    const { managedBadges, managedStages } = currentProfile.permissions;
                    
                    const hasManagedStages = (managedStages || []).length > 0;
                    const hasManagedBadges = (managedBadges || []).length > 0;
                    const normCurrentBadge = normalizeArabic(badgeName as string);

                    if (!hasManagedStages && !hasManagedBadges) return false;

                    // If badges are selected, user MUST be restricted to them
                    if (hasManagedBadges) {
                      const matchesExplicit = (managedBadges || []).some(mb => normalizeArabic(mb) === normCurrentBadge);
                      if (!matchesExplicit) return false;
                    }

                    // If stages are selected, the badge must be relevant to those stages
                    if (hasManagedStages) {
                      const inManagedStage = (badgeSettings.categories || []).some(cat => {
                        const inSpecificStage = Object.entries(cat.stageBadges || {}).some(([stage, stageBadges]) => {
                          return (managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(stage)) &&
                                 (stageBadges as string[] || []).some(sb => normalizeArabic(sb) === normCurrentBadge);
                        });
                        if (inSpecificStage) return true;

                        const isGeneralToCategory = (cat.badges || []).some(cb => normalizeArabic(cb) === normCurrentBadge);
                        const categoryHasManagedStage = Object.keys(cat.stageBadges || {}).some(stage => 
                          (managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(stage))
                        );
                        return isGeneralToCategory && categoryHasManagedStage;
                      });

                      if (!inManagedStage && !hasManagedBadges) return false;
                    }
                    
                    return true;
                  })
                  .map(badgeName => (
                  <option key={badgeName as string} value={badgeName as string}>{badgeName as string}</option>
                ))}
              </select>

              {gradingSelectedBadge && (
                <div className="flex flex-col gap-4 w-full">
                  <div className="flex flex-wrap gap-2 w-full">
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-2xl p-1 w-full md:w-auto overflow-x-auto scrollbar-hide">
                      <button
                        onClick={() => setBadgePassFilter('all')}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${badgePassFilter === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        الكل
                      </button>
                      <button
                        onClick={() => setBadgePassFilter('passed')}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${badgePassFilter === 'passed' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        اجتاز
                      </button>
                      <button
                        onClick={() => setBadgePassFilter('failed')}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${badgePassFilter === 'failed' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        لم يجتز
                      </button>
                    </div>
                    <button
                      onClick={exportGradingToExcel}
                      className="flex items-center gap-2 px-4 py-3 rounded-2xl border bg-white text-gray-600 border-gray-200 hover:bg-gray-50 transition-all font-bold text-sm"
                      title="تصدير للتقييم الحالي"
                    >
                      <Download size={16} />
                      <span className="hidden lg:inline">تصدير Excel</span>
                    </button>
                    <label className="flex items-center gap-2 px-4 py-3 rounded-2xl border bg-white text-gray-600 border-gray-200 hover:bg-gray-50 transition-all font-bold text-sm cursor-pointer">
                      <Plus size={16} />
                      <span className="hidden lg:inline">استيراد Excel</span>
                      <input type="file" accept=".xlsx, .xls" onChange={importFromExcel} className="hidden" />
                    </label>
                  </div>
                  <div className="hidden md:flex flex-wrap gap-2">
                    <button
                      onClick={() => setGradingStageFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        gradingStageFilter === 'all'
                          ? 'bg-[#4285F4] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      كل المراحل
                    </button>
                    {STAGES.map(s => (
                      <button
                        key={s}
                        onClick={() => setGradingStageFilter(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          gradingStageFilter === s
                            ? 'bg-[#4285F4] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex md:hidden items-center gap-2 w-full">
                    <button
                      onClick={() => setGradingStageFilter('all')}
                      className={`px-4 py-3 rounded-xl border text-sm font-bold transition-all whitespace-nowrap min-w-[70px] ${
                        gradingStageFilter === 'all'
                          ? 'bg-[#4285F4] text-white border-transparent'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      الكل
                    </button>
                    <select
                      value={gradingStageFilter === 'all' ? '' : gradingStageFilter}
                      onChange={(e) => setGradingStageFilter(e.target.value as any || 'all')}
                      className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm outline-none focus:ring-2 focus:ring-[#4285F4]"
                    >
                      <option value="" disabled hidden>المرحلة</option>
                      {STAGES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {gradingSelectedBadge && (isSuperAdmin || canManageAllBadges) && (
            <div className="bg-white p-4 lg:p-6 rounded-2xl border border-gray-200 shadow-sm mb-8">
              <div className="flex items-center gap-2 mb-6 text-[#4285F4]">
                <Settings size={20} />
                <h3 className="font-bold text-lg">أدوات الدرجات السريعة (إدارة الشارات)</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 1. Set Global Max Score for all Requirements in Badge */}
                <div className="space-y-4 border-b md:border-b-0 md:border-l border-gray-100 pb-6 md:pb-0 md:pl-8">
                  <h4 className="font-bold text-gray-700 text-sm">تعيين درجة موحدة لجميع بنود الشارة</h4>
                  <p className="text-xs text-gray-500">سيتم تطبيق هذه الدرجة على جميع البنود في جميع المراحل لهذه الشارة.</p>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      min="0"
                      placeholder="الدرجة"
                      className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-center font-bold"
                      value={quickScoreGlobalValue}
                      onChange={e => setQuickScoreGlobalValue(e.target.value)}
                    />
                    <button
                      disabled={!quickScoreGlobalValue}
                      onClick={() => {
                        const score = parseInt(quickScoreGlobalValue);
                        if(isNaN(score)) return;
                        
                        const allReqsForBadge = new Set<string>();
                        STAGES.forEach(stage => {
                          getScoutBadgeRequirements(gradingSelectedBadge, stage as Stage).forEach(r => allReqsForBadge.add(r));
                        });
                        
                        const updatedMaxScores = { ...(badgeSettings.requirementMaxScores || {}) };
                        const badgeScores = { ...(updatedMaxScores[gradingSelectedBadge] || {}) };
                        
                        allReqsForBadge.forEach(req => {
                          badgeScores[req] = score;
                        });
                        
                        updatedMaxScores[gradingSelectedBadge] = badgeScores;
                        
                        setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, requirementMaxScores: updatedMaxScores })
                          .then(() => {
                             setMessage({ type: 'success', text: 'تم توحيد الدرجات بنجاح' });
                             setQuickScoreGlobalValue('');
                          })
                          .catch(() => setMessage({ type: 'error', text: 'حدث خطأ أثناء توحيد الدرجات' }));
                      }}
                      className="flex-1 px-4 py-3 bg-[#4285F4] text-white rounded-xl hover:bg-blue-600 transition-colors font-bold text-sm disabled:opacity-50"
                    >
                      تطبيق على الكل
                    </button>
                  </div>
                </div>

                {/* 2. Set Score for Specific Requirement by Category */}
                <div className="space-y-4 pr-0 md:pr-4">
                  <h4 className="font-bold text-gray-700 text-sm">تعديل درجة بند محدد</h4>
                  
                  {(() => {
                    const allReqsForBadge = new Set<string>();
                    STAGES.forEach(stage => {
                      getScoutBadgeRequirements(gradingSelectedBadge, stage as Stage).forEach(r => allReqsForBadge.add(r));
                    });
                    
                    const reqCats = badgeSettings.requirementCategories?.[gradingSelectedBadge] || {};
                    const categoriesAvailable = Array.from(new Set(Array.from(allReqsForBadge).map(req => reqCats[req] || 'عام')));
                    
                    const filteredReqs = Array.from(allReqsForBadge).filter(req => {
                      const reqCat = reqCats[req] || 'عام';
                      return quickScoreCategory === 'all' || reqCat === quickScoreCategory;
                    });

                    return (
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={quickScoreCategory}
                            onChange={(e) => {
                              setQuickScoreCategory(e.target.value);
                              setQuickScoreReq('');
                              setQuickScoreValue('');
                            }}
                            className="flex-1 sm:w-1/3 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-[#4285F4]"
                          >
                            <option value="all">كل التصنيفات</option>
                            {categoriesAvailable.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          
                          <select
                            value={quickScoreReq}
                            onChange={(e) => {
                              setQuickScoreReq(e.target.value);
                              setQuickScoreValue((badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[e.target.value] || 0).toString());
                            }}
                            className="flex-[2] px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-[#4285F4]"
                          >
                            <option value="" disabled>اختر البند...</option>
                            {filteredReqs.map(r => (
                              <option key={r} value={r}>{r.length > 50 ? r.substring(0, 50) + '...' : r}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input 
                            type="number"
                            min="0"
                            placeholder="الدرجة"
                            className="w-24 px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-center font-bold"
                            value={quickScoreValue}
                            onChange={e => setQuickScoreValue(e.target.value)}
                            disabled={!quickScoreReq}
                          />
                          <button
                            disabled={!quickScoreReq || !quickScoreValue}
                            onClick={() => {
                              const score = parseInt(quickScoreValue);
                              if(isNaN(score)) return;
                              handleSetRequirementMaxScore(gradingSelectedBadge, quickScoreReq, score).then(() => {
                                setMessage({ type: 'success', text: 'تم حفظ الدرجة بنجاح' });
                              });
                            }}
                            className="flex-1 px-4 py-2.5 bg-[#34A853] text-white rounded-xl hover:bg-green-600 transition-colors font-bold text-sm disabled:opacity-50"
                          >
                            حفظ الدرجة
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          
          {gradingSelectedBadge ? (
            <div className="space-y-8">
              {(() => {
                const renderedStages = STAGES.map(stage => {
                  if (gradingStageFilter !== 'all' && gradingStageFilter !== stage) return null;

                  const stageReqs = getScoutBadgeRequirements(gradingSelectedBadge, stage as Stage);
                  const stageScoutsWithBadge = scouts.filter(s => {
                    if (s.stage !== stage) return false;
                    const normalizedBadge = normalizeArabic(gradingSelectedBadge);
                    const hasBadge = normalizeArabic(s.badges?.badge1?.name) === normalizedBadge || 
                                     normalizeArabic(s.badges?.badge2?.name) === normalizedBadge || 
                                     normalizeArabic(s.badges?.badge3?.name) === normalizedBadge;
                    if (!hasBadge) return false;
                    return canEditBadge(s.stage, gradingSelectedBadge, s.uid, s.role);
                  });

                  // Show stage if it has scouts OR if it has requirements (for super admin or stage admin to set scores)
                  const canManageStage = isSuperAdmin || canManageAllBadges || (currentProfile?.permissions?.managedStages || []).includes(stage as Stage);
                  if (stageScoutsWithBadge.length === 0 && !(canManageStage && stageReqs.length > 0)) return null;

                  if (stageReqs.length === 0) {
                    return (
                      <div key={stage} className="space-y-4">
                        <h3 className="text-xl font-bold text-[#4285F4]">{stage}</h3>
                        <div className="p-8 bg-orange-50 border border-orange-100 rounded-2xl text-orange-700 text-center font-bold">
                          لم يتم إضافة متطلبات لهذه الشارة في مرحلة ({stage}). يرجى إضافتها من تبويب الإعدادات أولاً لتتمكن من التقييم.
                        </div>
                      </div>
                    );
                  }

                  const filteredScouts = stageScoutsWithBadge.filter(s => {
                    // Apply filter if active
                    if (badgePassFilter !== 'all') {
                      const badgeKey = s.badges?.badge1?.name === gradingSelectedBadge ? 'badge1' 
                                     : s.badges?.badge2?.name === gradingSelectedBadge ? 'badge2' 
                                     : 'badge3';
                      const badge = s.badges?.[badgeKey];
                      if (!badge) return false;
                      const hasPassed = checkBadgePassStatus(gradingSelectedBadge, stageReqs, badge.completedRequirements || [], badge.requirementScores || {});
                      
                      if (badgePassFilter === 'passed' && !hasPassed) return false;
                      if (badgePassFilter === 'failed' && hasPassed) return false;
                    }

                    if (gradingSearchTerm) {
                      const search = gradingSearchTerm.toLowerCase().trim();
                      const normalizedSearch = normalizeNumbers(search);
                      return (s.name && s.name.toLowerCase().includes(search)) || (s.number && s.number.includes(normalizedSearch));
                    }
                    return true;
                  });

                  return (
                    <div key={stage} className="space-y-4">
                      <h3 className="text-xl font-bold text-[#4285F4]">{stage}</h3>
                      <div className="hidden lg:block overflow-x-auto border border-gray-200 rounded-2xl">
                        <table className="w-full text-right border-collapse min-w-max">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="p-4 font-bold text-gray-600 w-[120px] md:w-[200px] min-w-[120px] md:min-w-[200px] max-w-[120px] md:max-w-[200px] sticky right-0 bg-gray-50 z-10 border-l border-gray-200">بيانات الكشاف</th>
                              {stageReqs.map((req, idx) => {
                                const maxScore = badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req];
                                const category = badgeSettings.requirementCategories?.[gradingSelectedBadge]?.[req] || 'عام';
                                return (
                                  <th key={idx} className="p-4 font-bold text-gray-600 min-w-[200px] border-l border-gray-200 last:border-l-0">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-sm truncate" title={req}>{req}</span>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-[#4285F4] bg-[#4285F4]/10 px-2 py-1 rounded-md inline-block leading-normal">
                                          {category}
                                        </span>
                                        {maxScore && maxScore > 0 && (
                                          <span className="text-xs text-[#4285F4] bg-[#4285F4]/10 px-3 py-1.5 rounded-full w-fit inline-block leading-normal">
                                            من {maxScore}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </th>
                                );
                              })}
                              <th className="p-4 font-bold text-gray-600 w-32 border-l border-gray-200">النسبة</th>
                              <th className="p-4 font-bold text-gray-600 w-32 border-l border-gray-200">النتيجة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Final Score Row */}
                            {(isSuperAdmin || canManageAllBadges || (canManageBadgeRequirements && canEditBadge(stage as Stage, gradingSelectedBadge))) && (
                              <tr className="bg-blue-50/50 border-b border-blue-100">
                                <td className="p-4 sticky right-0 bg-blue-50 z-10 border-l border-gray-200 font-black text-[#4285F4] w-[120px] md:w-[200px] min-w-[120px] md:min-w-[200px] max-w-[120px] md:max-w-[200px]">
                                  الدرجة النهائية
                                </td>
                                {stageReqs.map((req, idx) => (
                                  <td key={idx} className="p-4 border-l border-gray-200 last:border-l-0">
                                    <div className="flex items-center gap-2">
                                      <input 
                                        key={`${gradingSelectedBadge}-${req}-${badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req] || 0}`}
                                        type="number" 
                                        min="0"
                                        className="w-20 px-3 py-2 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-[#4285F4] outline-none text-center font-bold text-[#4285F4]"
                                        defaultValue={badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req] || 0}
                                        onBlur={(e) => handleSetRequirementMaxScore(gradingSelectedBadge, req, parseInt(e.target.value) || 0)}
                                      />
                                    </div>
                                  </td>
                                ))}
                                <td className="p-4 border-l border-gray-200 font-bold text-[#4285F4]">100%</td>
                                <td className="p-4 border-l border-gray-200 font-bold text-[#4285F4]">-</td>
                              </tr>
                            )}

                            {filteredScouts.length === 0 ? (
                              <tr>
                                <td colSpan={stageReqs.length + 2} className="p-12 text-center text-gray-400 italic font-bold">
                                  {gradingSearchTerm 
                                    ? `لا يوجد كشافين يطابقون "${gradingSearchTerm}" في هذه المرحلة` 
                                    : "لا يوجد كشافين مسجلين لهذه الشارة في هذه المرحلة"}
                                </td>
                              </tr>
                            ) : filteredScouts.map(scout => {
                            const badgeKey = scout.badges.badge1.name === gradingSelectedBadge ? 'badge1' 
                                           : scout.badges.badge2.name === gradingSelectedBadge ? 'badge2' 
                                           : 'badge3';
                            const badge = scout.badges[badgeKey];
                            const completedReqs = badge.completedRequirements || [];
                            const scores = badge.requirementScores || {};
                            const progress = calculateBadgeProgress(gradingSelectedBadge, stageReqs, completedReqs, scores);

                            return (
                              <tr key={scout.uid} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                                <td className="p-4 sticky right-0 bg-white z-10 border-l border-gray-200 w-[120px] md:w-[200px] min-w-[120px] md:min-w-[200px] max-w-[120px] md:max-w-[200px]">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-gray-800 truncate" title={scout.name}>{scout.name}</span>
                                    <span className="text-xs md:text-sm text-gray-500 truncate" title={scout.number}>{scout.number}</span>
                                  </div>
                                </td>
                                {stageReqs.map((req, idx) => {
                                  const maxScore = badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req];
                                  const isCompleted = completedReqs.includes(req);
                                  const currentScore = scores[req];
                                  const isSelf = scout.uid === currentProfile?.uid;
                                  const canEdit = canEditBadge(scout.stage, gradingSelectedBadge, scout.uid, scout.role);

                                  return (
                                    <td key={idx} className={`p-4 border-l border-gray-200 last:border-l-0 ${isSelf ? 'bg-gray-50/50' : ''}`}>
                                      <div className="flex items-center gap-3">
                                        {maxScore && maxScore > 0 && (
                                          <div className="flex items-center gap-2">
                                            <ScoreInput
                                              maxScore={maxScore}
                                              currentScore={currentScore}
                                              canEdit={canEdit}
                                              onSave={(numVal) => {
                                                const newScores = { ...scores };
                                                if (numVal === undefined) {
                                                  delete newScores[req];
                                                } else {
                                                  newScores[req] = numVal;
                                                }
                                                
                                                handleUpdateScoutBadge(scout, badgeKey, {
                                                  requirementScores: newScores
                                                });
                                              }}
                                            />
                                            <span className="text-sm text-gray-500 font-bold">/ {maxScore}</span>
                                          </div>
                                        )}
                                        
                                        <div className="flex-1 flex justify-end items-center gap-2">
                                          {isSelf && (
                                            <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded">لا يمكنك تقييم نفسك</span>
                                          )}
                                          <button
                                            onClick={() => {
                                              if (!canEdit) return;
                                              setMessage({ type: 'success', text: 'تم حفظ التعديلات بنجاح' });
                                            }}
                                            disabled={!canEdit}
                                            className="text-[10px] font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors leading-normal disabled:opacity-50"
                                          >
                                            حفظ
                                          </button>
                                          <button
                                            onClick={() => {
                                              if (!canEdit) return;
                                              const newCompleted = isCompleted
                                                ? completedReqs.filter(r => r !== req)
                                                : [...completedReqs, req];
                                              handleUpdateScoutBadge(scout, badgeKey, {
                                                completedRequirements: newCompleted
                                              });
                                            }}
                                            disabled={!canEdit}
                                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                              isCompleted
                                                ? 'bg-[#34A853] text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                            } ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
                                          >
                                            <Check size={16} className={isCompleted ? 'opacity-100' : 'opacity-0'} />
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="p-4 border-l border-gray-200">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-[#4285F4] rounded-full transition-all duration-500"
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                    <span className="text-sm font-bold text-gray-700 min-w-[3ch]">{Math.round(progress)}%</span>
                                  </div>
                                </td>
                                <td className="p-4 border-l border-gray-200">
                                  {checkBadgePassStatus(gradingSelectedBadge, stageReqs, completedReqs, scores) ? (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                      <CheckCircle2 size={14} />
                                      اجتاز
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                                      <XCircle size={14} />
                                      لم يجتز
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Accordion View */}
                    <div className="flex flex-col gap-3 lg:hidden">
                      {/* Final Score Row for Admins */}
                      {(isSuperAdmin || canManageAllBadges || (canManageBadgeRequirements && canEditBadge(stage as Stage, gradingSelectedBadge))) && (
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                          <div className="text-[#4285F4] font-black mb-3">الدرجة النهائية</div>
                          {stageReqs.map((req, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-3 mb-2 last:mb-0">
                              <span className="text-gray-700 text-sm font-bold truncate max-w-[200px]" title={req}>{req}</span>
                              <input 
                                type="number" 
                                min="0"
                                className="w-16 px-2 py-1.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285F4] outline-none text-center font-bold text-[#4285F4] text-sm transition-all"
                                defaultValue={badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req] || 0}
                                onBlur={(e) => handleSetRequirementMaxScore(gradingSelectedBadge, req, parseInt(e.target.value) || 0)}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {filteredScouts.length === 0 ? (
                        <div className="p-8 text-center bg-white rounded-xl border border-gray-200 shadow-sm">
                          <span className="text-gray-500 italic font-bold">
                            {gradingSearchTerm 
                              ? `لا يوجد كشافين يطابقون "${gradingSearchTerm}" في هذه المرحلة` 
                              : "لا يوجد كشافين مسجلين لهذه الشارة في هذه المرحلة"}
                          </span>
                        </div>
                      ) : filteredScouts.map(scout => {
                          const badgeKey = scout.badges.badge1.name === gradingSelectedBadge ? 'badge1' 
                                         : scout.badges.badge2.name === gradingSelectedBadge ? 'badge2' 
                                         : 'badge3';
                          const badge = scout.badges[badgeKey];
                          const completedReqs = badge.completedRequirements || [];
                          const scores = badge.requirementScores || {};
                          const progress = calculateBadgeProgress(gradingSelectedBadge, stageReqs, completedReqs, scores);

                          return (
                            <details key={scout.uid} className="group bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                              <summary className="p-4 flex items-center justify-between cursor-pointer list-none !outline-none hover:bg-gray-50 transition-colors">
                                <div className="flex flex-col flex-1 pl-4 text-right">
                                  <span className="font-bold text-gray-800 text-[15px] truncate max-w-[200px]" title={scout.name}>{scout.name}</span>
                                  <span className="text-xs text-gray-500 mt-1 truncate">{scout.number}</span>
                                </div>
                                <div className="flex flex-row-reverse items-center gap-3">
                                  <span className="text-[#4285F4] font-bold text-[15px] tracking-widest">{Math.round(progress)}%</span>
                                  <ChevronDown size={18} className="text-gray-400 transition-transform group-open:rotate-180" />
                                </div>
                              </summary>
                              
                              <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-4">
                                {stageReqs.map((req, idx) => {
                                  const maxScore = badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req];
                                  const isCompleted = completedReqs.includes(req);
                                  const currentScore = scores[req];
                                  const isSelf = scout.uid === currentProfile?.uid;
                                  const canEdit = canEditBadge(scout.stage, gradingSelectedBadge, scout.uid, scout.role);

                                  return (
                                    <div key={idx} className="flex flex-row-reverse items-center justify-between gap-2 border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                                      <div className="flex flex-col text-right flex-1 pl-2">
                                        <span className="text-sm font-bold text-gray-700 leading-tight">{req}</span>
                                        {maxScore && maxScore > 0 && <span className="text-xs text-gray-500 mt-1">من {maxScore}</span>}
                                      </div>
                                      <div className="flex items-center flex-row-reverse gap-2">
                                        {maxScore && maxScore > 0 && (
                                          <div className="w-[70px]">
                                            <ScoreInput
                                              maxScore={maxScore}
                                              currentScore={currentScore}
                                              canEdit={canEdit}
                                              onSave={(numVal) => {
                                                const newScores = { ...scores };
                                                if (numVal === undefined) {
                                                  delete newScores[req];
                                                } else {
                                                  newScores[req] = numVal;
                                                }
                                                handleUpdateScoutBadge(scout, badgeKey, { requirementScores: newScores });
                                              }}
                                            />
                                          </div>
                                        )}
                                        
                                        {isSelf ? (
                                          <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-1 rounded">لا تقيم نفسك</span>
                                        ) : (
                                          <>
                                            {maxScore && maxScore > 0 ? (
                                              <button
                                                onClick={() => {
                                                  if (!canEdit) return;
                                                  setMessage({ type: 'success', text: 'تم حفظ التعديلات' });
                                                }}
                                                disabled={!canEdit}
                                                className="text-xs font-bold border border-gray-300 text-gray-600 bg-white px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                                              >
                                                حفظ
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() => {
                                                  if (!canEdit) return;
                                                  const newCompleted = isCompleted
                                                    ? completedReqs.filter(r => r !== req)
                                                    : [...completedReqs, req];
                                                  handleUpdateScoutBadge(scout, badgeKey, {
                                                    completedRequirements: newCompleted
                                                  });
                                                }}
                                                disabled={!canEdit}
                                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                                                  isCompleted
                                                    ? 'bg-transparent border border-gray-300 text-transparent'
                                                    : 'bg-white border border-gray-200 text-gray-400 hover:bg-gray-50'
                                                } ${!canEdit && 'opacity-50 cursor-not-allowed'} ${isCompleted && 'bg-[#34A853] !border-none text-white'}`}
                                              >
                                                <Check size={18} className={isCompleted ? 'opacity-100' : 'opacity-0'} />
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                
                                <div className="flex flex-row-reverse items-center justify-between pt-2">
                                  <span className="text-sm font-bold text-gray-600">النتيجة</span>
                                  <div>
                                    {checkBadgePassStatus(gradingSelectedBadge, stageReqs, completedReqs, scores) ? (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#34A853]/10 text-[#34A853] border border-[#34A853]/20 text-xs font-bold">
                                        <CheckCircle2 size={14} /> اجتاز
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA4335]/10 text-[#EA4335] border border-[#EA4335]/20 text-xs font-bold">
                                        <XCircle size={14} /> لم يجتز
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </details>
                          );
                      })}
                    </div>
                  </div>
                );
              });

              const hasAnyContent = renderedStages.some(s => s !== null);
              return hasAnyContent ? renderedStages : (
                <div className="p-12 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                  <p className="text-gray-500 font-bold">
                    {gradingSearchTerm 
                      ? `لم يتم العثور على كشافين يطابقون "${gradingSearchTerm}" لهذه الشارة` 
                      : "لا يوجد كشافين مسجلين لهذه الشارة حالياً. تأكد من إضافة متطلبات الشارة في الإعدادات أولاً."}
                  </p>
                </div>
              );
            })()}
          </div>
          ) : (
            <div className="p-12 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
              <p className="text-gray-500 font-bold">اختر شارة من القائمة أعلاه للبدء في التقييم</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Admin SDK Warning */}
      {isSuperAdmin && adminStatus?.initialized === false && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-3xl flex items-start gap-3 mb-6">
          <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={20} />
          <div className="space-y-1">
            <h4 className="text-sm font-black text-amber-900">تنبيه: ميزات الإدارة المتقدمة غير مفعلة</h4>
            <p className="text-xs text-amber-800 font-bold leading-relaxed">
              {adminStatus.error ? (
                <span className="block mb-1">خطأ: {adminStatus.error}</span>
              ) : null}
              {adminStatus.envSet 
                ? `تم العثور على متغير البيئة FIREBASE_SERVICE_ACCOUNT ولكن فشل تهيئة Admin SDK. تأكد من أن محتوى JSON صحيح وكامل.`
                : (
                  <>
                    لم يتم العثور على متغير البيئة FIREBASE_SERVICE_ACCOUNT. ميزات مثل 'الحذف النهائي للحساب' و 'تغيير كلمة المرور' لن تعمل حتى يتم إضافة مفتاح الخدمة (Service Account) في إعدادات المشروع.
                    <p className="mt-1 text-[10px] font-bold text-amber-700 italic">
                      * ملاحظة: إذا قمت بإضافة المتغير للتو، قد تحتاج لإعادة تشغيل الخادم أو تحديث الصفحة بعد دقيقة.
                    </p>
                  </>
                )}
            </p>
          </div>
        </div>
      )}

      {/* Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="bg-[#4285F4]/10 p-3 rounded-2xl">
                <Users className="text-[#4285F4]" size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500">إجمالي الكشافة</p>
                <h3 className="text-2xl font-black text-gray-800">{scouts.length}</h3>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="bg-[#34A853]/10 p-3 rounded-2xl">
                <BarChart3 className="text-[#34A853]" size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500">نتائج البحث</p>
                <h3 className="text-2xl font-black text-gray-800">{filteredAndSortedScouts.length}</h3>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="bg-[#FBBC05]/10 p-3 rounded-2xl">
                <Award className="text-[#FBBC05]" size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500">شارات قيد التقدم</p>
                <h3 className="text-2xl font-black text-gray-800">
                  {scouts.reduce((acc, s) => acc + [s.badges?.badge1, s.badges?.badge2, s.badges?.badge3].filter(b => {
                    if (!b || !b.name) return false;
                    const reqs = getScoutBadgeRequirements(b.name, s.stage);
                    const hasReqs = reqs.length > 0;
                    const completedReqs = (b.completedRequirements || []).filter(r => reqs.includes(r));
                    const progress = hasReqs ? calculateBadgeProgress(b.name, reqs, completedReqs, b.requirementScores) : b.progress;
                    return progress > 0 && progress < 100;
                  }).length, 0)}
                </h3>
              </div>
            </div>
          </div>

          {/* Filters & Controls */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-12 pl-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all"
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSortField('name');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all font-bold text-sm ${sortField === 'name' ? 'bg-[#4285F4] text-white border-[#4285F4]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  <ArrowUpDown size={16} />
                  الاسم {sortField === 'name' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
                <button
                  onClick={() => {
                    setSortField('createdAt');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all font-bold text-sm ${sortField === 'createdAt' ? 'bg-[#4285F4] text-white border-[#4285F4]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  <ArrowUpDown size={16} />
                  التاريخ {sortField === 'createdAt' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 mr-2">تصفية حسب المرحلة:</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStageFilter('')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${!stageFilter ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    الكل
                  </button>
                  {STAGES.map(s => (
                    <button
                      key={s}
                      onClick={() => setStageFilter(s)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${stageFilter === s ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-bold text-gray-500 mr-2">تصفية حسب التصنيف:</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => {
                        setCategoryFilter(e.target.value);
                        setBadgeFilter('');
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white font-bold text-gray-700"
                    >
                      <option value="">كل التصنيفات</option>
                      {(badgeSettings.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-bold text-gray-500 mr-2">تصفية حسب الشارة:</label>
                    <select
                      value={badgeFilter}
                      onChange={(e) => setBadgeFilter(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white font-bold text-gray-700 disabled:bg-gray-50"
                      disabled={!categoryFilter}
                    >
                      <option value="">كل الشارات</option>
                      {categoryFilter && getAvailableBadges(categoryFilter, stageFilter as Stage || '').map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scouts Table/Grid */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 font-black text-gray-600">الكشاف</th>
                    <th className="px-6 py-4 font-black text-gray-600">رقم الهاتف</th>
                    <th className="px-6 py-4 font-black text-gray-600">المرحلة</th>
                    <th className="px-6 py-4 font-black text-gray-600">الشارات والتقدم</th>
                    <th className="px-6 py-4 font-black text-gray-600 text-center">تاريخ الانضمام</th>
                    <th className="px-6 py-4 font-black text-gray-600">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAndSortedScouts.map(scout => (
                    <tr key={scout.uid} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-gray-800">{scout.name}</div>
                          {scout.role === 'admin' && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full">
                              مسؤول
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-mono text-gray-600" dir="ltr">{scout.number}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-600">
                          {scout.stage}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          {[scout.badges.badge1, scout.badges.badge2, scout.badges.badge3].map((b, i) => {
                            const reqs = getScoutBadgeRequirements(b.name, scout.stage);
                            const hasReqs = reqs.length > 0;
                            const completedReqs = (b.completedRequirements || []).filter(r => reqs.includes(r));
                            const progress = hasReqs ? calculateBadgeProgress(b.name, reqs, completedReqs, b.requirementScores) : b.progress;
                            
                            return (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 w-16 truncate">{b.name}</span>
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[#4285F4]" style={{ width: `${progress}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-[#4285F4]">{progress}%</span>
                            </div>
                          )})}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="text-xs font-bold text-gray-600">
                          {(() => {
                            const timestamp = scout.joinDate || scout.createdAt;
                            if (!timestamp) return 'غير متوفر';
                            let date: Date;
                            if (timestamp.toDate) date = timestamp.toDate();
                            else if (timestamp._seconds) date = new Date(timestamp._seconds * 1000);
                            else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
                            else date = new Date(timestamp);
                            
                            if (isNaN(date.getTime())) return 'غير متوفر';
                            return date.toLocaleDateString('ar-EG');
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {canDeleteThisScout(scout) && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingScout(scout);
                                  setEditForm({
                                    name: scout.name,
                                    number: scout.number,
                                    stage: scout.stage
                                  });
                                  setSelectedCategoryForBadgeSelection({
                                    badge1: findCategoryForBadge(scout.badges?.badge1?.name) || (badgeSettings.categories?.[0]?.id || 'scout'),
                                    badge2: findCategoryForBadge(scout.badges?.badge2?.name) || (badgeSettings.categories?.[0]?.id || 'scout'),
                                    badge3: findCategoryForBadge(scout.badges?.badge3?.name) || (badgeSettings.categories?.[0]?.id || 'scout')
                                  });
                                }}
                                className="p-2 text-[#4285F4] hover:bg-[#4285F4]/10 rounded-xl transition-all"
                                title="تعديل البيانات"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => setDeletingScout(scout)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                title="حذف الحساب"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                          {isSuperAdmin && scout.uid !== currentProfile?.uid && (
                            <div className="flex items-center gap-1">
                              {scout.role === 'admin' ? (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingPermissionsFor(scout);
                                      setPermissionsForm({
                                        canManagePermissions: scout.permissions?.canManagePermissions || false,
                                        canManageAllBadges: scout.permissions?.canManageAllBadges || false,
                                        canDeleteAccounts: scout.permissions?.canDeleteAccounts || false,
                                        canManageAttendance: scout.permissions?.canManageAttendance || false,
                                        canManagePayments: scout.permissions?.canManagePayments || false,
                                        canManageBadgeRequirements: scout.permissions?.canManageBadgeRequirements || false,
                                        managedStages: scout.permissions?.managedStages || [],
                                        managedBadges: scout.permissions?.managedBadges || []
                                      });
                                    }}
                                    className="p-2 text-purple-500 hover:bg-purple-50 rounded-xl transition-all"
                                    title="صلاحيات المسؤول"
                                  >
                                    <ShieldCheck size={18} />
                                  </button>
                                  <button
                                    onClick={() => handleToggleAdmin(scout.uid, scout.role)}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                    title="إزالة من المسؤولين"
                                  >
                                    <ShieldX size={18} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleToggleAdmin(scout.uid, scout.role)}
                                  className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-xl transition-all"
                                  title="ترقية إلى مسؤول"
                                >
                                  <ShieldPlus size={18} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAndSortedScouts.length === 0 && (
              <div className="p-12 text-center text-gray-400 font-bold">
                {searchTerm || stageFilter || categoryFilter || badgeFilter 
                  ? "لا توجد نتائج تطابق بحثك" 
                  : !isSuperAdmin 
                    ? "لا يوجد كشافين متاحين للعرض بناءً على صلاحياتك الحالية للمرحلة أو الشارات المحددة" 
                    : "لا يوجد كشافين مسجلين حالياً"}
              </div>
            )}
          </div>
        </>
      )}

      {/* Messages */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 ${
              message.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
            <span className="font-bold">{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Password Change Modal */}
      <AnimatePresence>
        {changingPasswordFor && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !passwordLoading && setChangingPasswordFor(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck size={32} />
                </div>
                <h3 className="text-2xl font-bold text-center text-gray-900 mb-2">تغيير كلمة المرور</h3>
                <p className="text-center text-gray-500 mb-8">
                  أدخل كلمة المرور الجديدة للمستخدم <span className="font-bold text-gray-900">"{changingPasswordFor.name}"</span>
                </p>
                
                <form onSubmit={handleUpdatePassword} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 mr-2">كلمة المرور الجديدة:</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="6 أحرف على الأقل"
                      className="w-full px-5 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all text-sm font-bold"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setChangingPasswordFor(null)}
                      disabled={passwordLoading}
                      className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={passwordLoading}
                      className="flex-1 py-4 bg-[#4285F4] text-white rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {passwordLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Save size={18} />
                          <span>تحديث</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingScout && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deleteLoading && setDeletingScout(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-2xl font-bold text-center text-gray-900 mb-2">حذف الحساب</h3>
                <p className="text-center text-gray-500 mb-8">
                  هل أنت متأكد من حذف حساب <span className="font-bold text-gray-900">"{deletingScout.name}"</span>؟ 
                  هذا الإجراء لا يمكن التراجع عنه.
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setDeletingScout(null)}
                    disabled={deleteLoading}
                    className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleDeleteScout}
                    disabled={deleteLoading}
                    className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deleteLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={18} />
                        <span>حذف</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingScout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b flex items-center justify-between bg-[#4285F4] text-white">
                <div>
                  <h3 className="text-2xl font-black">{editingScout.name}</h3>
                  <p className="text-sm opacity-90 font-bold">{editingScout.stage} • {editingScout.number}</p>
                </div>
                <button onClick={() => setEditingScout(null)} className="p-3 hover:bg-white/20 rounded-2xl transition-colors">
                  <X size={28} />
                </button>
              </div>

              <form onSubmit={handleUpdateScout} className="p-8 space-y-8 overflow-y-auto">
                {/* Basic Info Section */}
                <div className="space-y-6 p-6 bg-blue-50/50 rounded-3xl border border-blue-100">
                  <h4 className="text-lg font-black text-blue-800 flex items-center gap-3">
                    <Users size={22} />
                    البيانات الأساسية
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 mr-2">الاسم بالكامل:</label>
                      <input
                        type="text"
                        required
                        value={editForm?.name || ''}
                        onChange={(e) => setEditForm(prev => prev ? { ...prev, name: e.target.value } : null)}
                        className="w-full px-5 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all text-sm font-bold"
                      />
                      <p className="text-xs text-yellow-600 font-bold mt-1">برجاء ادخال الاسم ثلاثي بالعربي فقط</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 mr-2">رقم الهاتف:</label>
                      <input
                        type="text"
                        required
                        value={editForm?.number || ''}
                        onChange={(e) => setEditForm(prev => prev ? { ...prev, number: e.target.value } : null)}
                        className="w-full px-5 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all text-sm font-bold"
                      />
                      <p className="text-xs text-yellow-600 font-bold mt-1">برجاء التأكد من صحة الرقم المدخل قبل إنشاء الحساب</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 mr-2">المرحلة الكشفية:</label>
                    <select
                      value={editForm?.stage || ''}
                      onChange={(e) => setEditForm(prev => prev ? { ...prev, stage: e.target.value as Stage } : null)}
                      className="w-full px-5 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all text-sm font-bold bg-white"
                    >
                      {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="text-blue-500 shrink-0 mt-0.5" size={18} />
                      <div className="text-xs text-blue-800 font-bold leading-relaxed">
                        بصفتك مسؤولاً كبيراً، يمكنك الآن تغيير كلمة مرور هذا المستخدم مباشرة.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChangingPasswordFor(editingScout)}
                      className="w-full py-2.5 bg-white border border-blue-200 text-blue-600 rounded-xl text-xs font-black hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={14} />
                      تغيير كلمة المرور
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-lg font-black text-gray-800 flex items-center gap-3 px-2">
                    <Award size={22} className="text-[#4285F4]" />
                    تقدم الشارات
                  </h4>
                  {(['badge1', 'badge2', 'badge3'] as const).map((key) => {
                    const badge = editingScout.badges[key];
                    const badgeName = badge.name;
                    const reqs = getScoutBadgeRequirements(badgeName, editingScout.stage);
                    const completedReqs = (badge.completedRequirements || []).filter(r => reqs.includes(r));
                    const hasReqs = reqs.length > 0;
                    const canEdit = canEditBadge(editingScout.stage, badgeName, editingScout.uid, editingScout.role);
                    
                    return (
                    <div key={key} className={`space-y-4 p-6 rounded-3xl border ${canEdit ? 'bg-gray-50 border-gray-100' : 'bg-gray-100/50 border-gray-200 opacity-75'}`}>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-black text-gray-800 flex items-center gap-3">
                            <Award size={22} className={canEdit ? "text-[#4285F4]" : "text-gray-400"} />
                            {BADGE_LABELS[key]}
                            {!canEdit && <span className="text-xs font-normal text-red-500 bg-red-50 px-3 py-1.5 rounded-lg leading-normal">لا تملك صلاحية التعديل</span>}
                          </h4>
                        </div>

                        {(canManageAllBadges || (currentProfile?.permissions?.managedBadges?.length || 0) > 0 || (currentProfile?.permissions?.managedStages?.length || 0) > 0) && (
                          <div className="flex flex-col gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">تغيير الشارة:</label>
                              <select
                                value={badgeName}
                                onChange={(e) => {
                                  const newName = e.target.value;
                                  setEditingScout(prev => prev ? {
                                    ...prev,
                                    badges: {
                                      ...prev.badges,
                                      [key]: { name: newName, progress: 0, notes: '', completedRequirements: [], requirementScores: {} }
                                    }
                                  } : null);
                                }}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 font-bold text-sm bg-white hover:border-[#4285F4] transition-colors focus:ring-2 focus:ring-[#4285F4]/20 outline-none"
                              >
                                <option value="">-- اختر شارة --</option>
                                {(badgeSettings.categories || []).map(c => {
                                  const cBadges = Array.from(new Set([
                                    ...(c.badges || []),
                                    ...Object.values(c.stageBadges || {}).flat()
                                  ] as string[]));
                                  
                                  const available = cBadges.filter(b => canManageAllBadges || canEditBadge(editingScout.stage, b));
                                  if (available.length === 0) return null;

                                  if (badgeName && cBadges.includes(badgeName) && !available.includes(badgeName)) {
                                    available.push(badgeName);
                                  }

                                  return (
                                    <optgroup key={c.id} label={c.name}>
                                      {available.map(b => {
                                        const otherKey1 = key === 'badge1' ? 'badge2' : (key === 'badge2' ? 'badge1' : 'badge1');
                                        const otherKey2 = key === 'badge1' ? 'badge3' : (key === 'badge2' ? 'badge3' : 'badge2');
                                        return (
                                          <option key={b} value={b} disabled={b === editingScout.badges[otherKey1].name || b === editingScout.badges[otherKey2].name}>{b}</option>
                                        );
                                      })}
                                    </optgroup>
                                  );
                                })}
                                {badgeName && !findCategoryForBadge(badgeName) && (
                                  <optgroup label="أخرى (غير مصنفة)">
                                    <option value={badgeName}>{badgeName}</option>
                                  </optgroup>
                                )}
                              </select>
                            </div>
                          </div>
                        )}

                        {badgeName && (
                          <div className="pt-4 border-t border-gray-200 mt-2">
                            <div className="flex items-center justify-between mb-4">
                              <span className="font-black text-[#4285F4]">{badgeName}</span>
                              <div className="flex items-center gap-3">
                                {hasReqs ? (
                                  <div className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-center font-black text-[#4285F4] text-lg">
                                    {calculateBadgeProgress(badgeName, reqs, completedReqs, badge.requirementScores)}%
                                  </div>
                                ) : (
                                  <>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      disabled={!canEdit}
                                      value={badge.progress || 0}
                                      onChange={(e) => updateBadgeValue(key, 'progress', parseInt(e.target.value) || 0)}
                                      className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-center font-black text-[#4285F4] text-lg disabled:bg-gray-100 disabled:text-gray-500"
                                    />
                                    <span className="text-lg font-black text-gray-400">%</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {hasReqs ? (
                              <div className="space-y-4 bg-white p-4 rounded-2xl border border-gray-100">
                                <h5 className="text-sm font-bold text-gray-700 mb-3">متطلبات الشارة:</h5>
                                {Object.entries(
                                  reqs.reduce((acc: Record<string, string[]>, req: string) => {
                                    const category = badgeSettings.requirementCategories?.[badge.name]?.[req] || 'عام';
                                    if (!acc[category]) acc[category] = [];
                                    acc[category].push(req);
                                    return acc;
                                  }, {})
                                ).map(([category, categoryReqs]) => (
                                  <div key={category} className="space-y-2">
                                    <h6 className="text-sm font-bold text-[#4285F4] border-b border-gray-100 pb-1 mb-2">
                                      {category} :-
                                    </h6>
                                    {(categoryReqs as string[]).map((req, idx) => {
                                      const maxScore = badgeSettings.requirementMaxScores?.[badge.name]?.[req] || 0;
                                      const isCompleted = completedReqs.includes(req);
                                      const currentScore = badge.requirementScores?.[req] || 0;
                                      
                                      return (
                                        <div key={idx} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl transition-colors ${canEdit ? 'hover:bg-gray-50' : ''}`}>
                                          <label className={`flex items-start gap-3 flex-1 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                            <div className="relative flex items-center justify-center mt-0.5">
                                              <input
                                                type="checkbox"
                                                disabled={!canEdit}
                                                checked={isCompleted}
                                                onChange={(e) => {
                                                  if (!canEdit) return;
                                                  let newCompleted = [...completedReqs];
                                                  if (e.target.checked) {
                                                    newCompleted.push(req);
                                                  } else {
                                                    newCompleted = newCompleted.filter(r => r !== req);
                                                  }
                                                  updateBadgeValue(key, 'completedRequirements', newCompleted);
                                                  updateBadgeValue(key, 'progress', calculateBadgeProgress(badge.name, reqs, newCompleted, badge.requirementScores));
                                                }}
                                                className="w-5 h-5 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4] cursor-pointer"
                                              />
                                            </div>
                                            <div className="flex flex-col">
                                              <span className={`text-sm font-bold ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                                {req}
                                              </span>
                                              <div className="flex items-center gap-3 mt-1">
                                                <span className={`text-xs font-bold ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                                                  {isCompleted ? 'تم التسليم' : 'تسليم'}
                                                </span>
                                              </div>
                                            </div>
                                          </label>
                                          
                                          {maxScore > 0 && (
                                            <div className="flex items-center gap-2 shrink-0 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                              <ScoreInput
                                                maxScore={maxScore}
                                                currentScore={currentScore}
                                                canEdit={canEdit}
                                                className="w-16 text-center bg-white border border-gray-300 rounded-md outline-none text-sm font-bold text-[#4285F4] disabled:bg-transparent disabled:border-transparent"
                                                onSave={(numVal) => {
                                                  const newScores = { ...(badge.requirementScores || {}) };
                                                  if (numVal === undefined) {
                                                    delete newScores[req];
                                                  } else {
                                                    newScores[req] = numVal;
                                                  }
                                                  updateBadgeValue(key, 'requirementScores', newScores);
                                                  updateBadgeValue(key, 'progress', calculateBadgeProgress(badge.name, reqs, completedReqs, newScores));
                                                }}
                                              />
                                              <span className="text-xs font-bold text-gray-500">من {maxScore}</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <input
                                type="range"
                                min="0"
                                max="100"
                                disabled={!canEdit}
                                value={badge.progress || 0}
                                onChange={(e) => updateBadgeValue(key, 'progress', parseInt(e.target.value))}
                                className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#4285F4] disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            )}

                            <div className="space-y-2 pt-4">
                              <label className="text-xs font-black text-gray-500 mr-2 uppercase">ملاحظات المسؤول:</label>
                              <textarea
                                disabled={!canEdit}
                                value={badge.notes || ''}
                                onChange={(e) => updateBadgeValue(key, 'notes', e.target.value)}
                                placeholder={canEdit ? "أضف ملاحظاتك هنا..." : "لا تملك صلاحية إضافة ملاحظات"}
                                className="w-full px-5 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all text-sm font-medium disabled:bg-gray-100 disabled:text-gray-500"
                                rows={3}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )})}
                </div>

                <button
                  disabled={editLoading}
                  type="submit"
                  className="w-full flex items-center justify-center gap-3 bg-[#34A853] hover:bg-[#2D8E47] text-white font-black py-5 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 text-lg"
                >
                  {editLoading ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-3 border-white/50 border-t-white" />
                  ) : (
                    <>
                      <Save size={24} />
                      <span>حفظ التعديلات النهائية</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Permissions Modal */}
        {editingPermissionsFor && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b flex items-center justify-between bg-purple-600 text-white">
                <div>
                  <h3 className="text-2xl font-black">صلاحيات المسؤول</h3>
                  <p className="text-sm opacity-90 font-bold">{editingPermissionsFor.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isSuperAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={handleGrantAllPermissions}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors"
                      >
                        منح الكل
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllPermissions}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors"
                      >
                        إزالة الكل
                      </button>
                    </>
                  )}
                  <button onClick={() => setEditingPermissionsFor(null)} className="p-3 hover:bg-white/20 rounded-2xl transition-colors">
                    <X size={28} />
                  </button>
                </div>
              </div>

              <form onSubmit={handleUpdatePermissions} className="p-8 space-y-8 overflow-y-auto">
                <div className="space-y-4">
                  <label className="flex items-center gap-3 p-4 border rounded-2xl cursor-pointer hover:bg-purple-50 transition-colors bg-purple-50/50 border-purple-200">
                    <input
                      type="checkbox"
                      checked={permissionsForm.canManagePermissions}
                      onChange={(e) => setPermissionsForm(prev => ({ ...prev, canManagePermissions: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600"
                    />
                    <div>
                      <div className="font-bold text-purple-900">إدارة الصلاحيات (أعلى صلاحية)</div>
                      <div className="text-sm text-purple-700">تمنح المسؤول كافة الصلاحيات بما فيها ترقية مسؤولين آخرين وتعديل صلاحياتهم</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border rounded-2xl transition-colors ${permissionsForm.canManagePermissions ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      disabled={permissionsForm.canManagePermissions}
                      checked={permissionsForm.canManagePermissions || permissionsForm.canManageAllBadges}
                      onChange={(e) => setPermissionsForm(prev => ({ ...prev, canManageAllBadges: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600 disabled:opacity-50"
                    />
                    <div>
                      <div className="font-bold text-gray-800">إدارة جميع الشارات</div>
                      <div className="text-sm text-gray-500">صلاحية رقم 1: حذف وتعديل في جميع الشارات لجميع المراحل</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border rounded-2xl transition-colors ${permissionsForm.canManagePermissions || permissionsForm.canManageAllBadges ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      disabled={permissionsForm.canManagePermissions || permissionsForm.canManageAllBadges}
                      checked={permissionsForm.canManagePermissions || permissionsForm.canManageAllBadges || permissionsForm.canManageBadgeRequirements}
                      onChange={(e) => setPermissionsForm(prev => ({ ...prev, canManageBadgeRequirements: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600 disabled:opacity-50"
                    />
                    <div>
                      <div className="font-bold text-gray-800">إدارة بنود الشارات المحددة</div>
                      <div className="text-sm text-gray-500">يسمح بإضافة وتعديل بنود الشارات والدرجة النهائية للشارات التي يديرها فقط</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border rounded-2xl transition-colors ${permissionsForm.canManagePermissions ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      disabled={permissionsForm.canManagePermissions}
                      checked={permissionsForm.canManagePermissions || permissionsForm.canDeleteAccounts}
                      onChange={(e) => setPermissionsForm(prev => ({ ...prev, canDeleteAccounts: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600 disabled:opacity-50"
                    />
                    <div>
                      <div className="font-bold text-gray-800">حذف الحسابات</div>
                      <div className="text-sm text-gray-500">صلاحية رقم 2: القدرة على حذف حسابات الكشافة</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border rounded-2xl transition-colors ${permissionsForm.canManagePermissions ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      disabled={permissionsForm.canManagePermissions}
                      checked={permissionsForm.canManagePermissions || permissionsForm.canManageAttendance}
                      onChange={(e) => setPermissionsForm(prev => ({ ...prev, canManageAttendance: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600 disabled:opacity-50"
                    />
                    <div>
                      <div className="font-bold text-gray-800">إدارة الغياب</div>
                      <div className="text-sm text-gray-500">القدرة على تسجيل حضور وغياب الأفراد في جدول الغياب والاشتراك</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border rounded-2xl transition-colors ${permissionsForm.canManagePermissions ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      disabled={permissionsForm.canManagePermissions}
                      checked={permissionsForm.canManagePermissions || permissionsForm.canManagePayments}
                      onChange={(e) => setPermissionsForm(prev => ({ ...prev, canManagePayments: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600 disabled:opacity-50"
                    />
                    <div>
                      <div className="font-bold text-gray-800">إدارة الاشتراكات</div>
                      <div className="text-sm text-gray-500">القدرة على تعديل المبالغ المدفوعة للاشتراكات</div>
                    </div>
                  </label>
                </div>

                {!(permissionsForm.canManageAllBadges || permissionsForm.canManagePermissions) && (
                  <div className="space-y-6 p-6 bg-gray-50 rounded-3xl border border-gray-100">
                    <h4 className="font-black text-gray-800">صلاحية رقم 3: إدارة شارات ومراحل محددة</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">المراحل المسموح بإدارتها:</label>
                        <div className="flex flex-wrap gap-2">
                          {STAGES.map(stage => (
                            <label key={stage} className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer transition-colors ${permissionsForm.managedStages.includes(stage) ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white hover:bg-gray-50'}`}>
                              <input
                                type="checkbox"
                                checked={permissionsForm.managedStages.includes(stage)}
                                onChange={(e) => {
                                  const newStages = e.target.checked 
                                    ? [...permissionsForm.managedStages, stage]
                                    : permissionsForm.managedStages.filter(s => s !== stage);
                                  setPermissionsForm(prev => ({ ...prev, managedStages: newStages }));
                                }}
                                className="hidden"
                              />
                              <span className="font-bold text-sm">{stage}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">الشارات المسموح بتعديلها:</label>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(new Set((badgeSettings.categories || []).flatMap(c => [
                            ...(c.badges || []),
                            ...Object.values(c.stageBadges || {}).flat()
                          ]))).map(badge => (
                            <label key={badge} className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer transition-colors ${permissionsForm.managedBadges.includes(badge) ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white hover:bg-gray-50'}`}>
                              <input
                                type="checkbox"
                                checked={permissionsForm.managedBadges.includes(badge)}
                                onChange={(e) => {
                                  const newBadges = e.target.checked 
                                    ? [...permissionsForm.managedBadges, badge]
                                    : permissionsForm.managedBadges.filter(b => b !== badge);
                                  setPermissionsForm(prev => ({ ...prev, managedBadges: newBadges }));
                                }}
                                className="hidden"
                              />
                              <span className="font-bold text-sm">{badge}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4 border-t">
                  <button
                    disabled={editLoading}
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-700 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 text-lg"
                  >
                    {editLoading ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-3 border-white/50 border-t-white" />
                    ) : (
                      <>
                        <Save size={24} />
                        <span>حفظ الصلاحيات</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* Edit Requirement Modal */}
        {editingRequirement && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100"
            >
              <div className="bg-[#4285F4] p-6 text-white flex justify-between items-center text-right" dir="rtl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Edit2 size={24} />
                  </div>
                  <h3 className="text-xl font-black">تعديل البند</h3>
                </div>
                <button onClick={() => setEditingRequirement(null)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6 text-right" dir="rtl">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">نص البند:</label>
                  <textarea
                    value={editingRequirement.newText || ''}
                    onChange={(e) => setEditingRequirement(prev => prev ? { ...prev, newText: e.target.value } : null)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none font-bold text-gray-700 min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">التصنيف:</label>
                  <input
                    type="text"
                    value={editingRequirement.category}
                    onChange={(e) => setEditingRequirement(prev => prev ? { ...prev, category: e.target.value } : null)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none font-bold text-gray-700"
                    placeholder="مثال: روحي، عملي..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">الدرجة النهائية:</label>
                  <input
                    type="number"
                    min="0"
                    value={editingRequirement.maxScore || ''}
                    onChange={(e) => setEditingRequirement(prev => prev ? { ...prev, maxScore: e.target.value } : null)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none font-bold text-gray-700"
                    placeholder="مثال: 10..."
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleEditRequirement}
                    className="flex-1 bg-[#4285F4] hover:bg-[#357ABD] text-white font-black py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Save size={20} />
                    حفظ التعديلات
                  </button>
                  <button
                    onClick={() => setEditingRequirement(null)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black py-4 rounded-2xl transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex-1 overflow-y-auto">
              <QRScanner 
                onScanSuccess={handleScanSuccess} 
                onClose={() => {
                  setIsScannerOpen(false);
                }} 
              />
              
              {/* Scan Logs */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 min-h-[250px]">
                <h4 className="font-bold text-gray-800 mb-2 text-right">سجل الحضور ({scannerDate})</h4>
                {scanLogs.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">لم يتم مسح أي كود بعد</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                      <thead>
                        <tr className="bg-gray-100 text-gray-700 text-xs">
                          <th className="p-2 font-bold whitespace-nowrap">التاريخ والوقت</th>
                          <th className="p-2 font-bold whitespace-nowrap">المسؤول</th>
                          <th className="p-2 font-bold whitespace-nowrap">الإجراء</th>
                          <th className="p-2 font-bold whitespace-nowrap">المستخدم المستهدف</th>
                          <th className="p-2 font-bold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanLogs.map((log, idx) => (
                          <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50 transition-colors text-sm">
                            <td className="p-2 text-gray-500 text-xs whitespace-nowrap">{log.time}</td>
                            <td className="p-2 font-bold text-gray-800 whitespace-nowrap">{currentProfile?.name || 'مسؤول'}</td>
                            <td className="p-2 whitespace-nowrap">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold inline-block ${log.action === 'إلغاء حضور' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-[#4285F4]'}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="p-2 font-bold text-gray-800 whitespace-nowrap">{log.name}</td>
                            <td className="p-2 text-center">
                              {log.action === 'تسجيل حضور' && (
                                <button
                                  onClick={() => handleUndoScan(log.uid, idx)}
                                  className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                  title="إلغاء الحضور"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
