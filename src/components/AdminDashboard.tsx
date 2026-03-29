import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
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
  PHONE_REGEX
} from '../types';
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
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import ScoreInput from './ScoreInput';

interface AdminDashboardProps {
  currentProfile?: ScoutProfile;
}

export default function AdminDashboard({ currentProfile }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'scouts' | 'settings' | 'grading'>('scouts');
  const [gradingSelectedBadge, setGradingSelectedBadge] = useState<string>('');
  const [gradingSearchTerm, setGradingSearchTerm] = useState<string>('');
  const [activeBadgeTab, setActiveBadgeTab] = useState<'badge1' | 'badge2' | 'badge3'>('badge1');
  const [scouts, setScouts] = useState<ScoutProfile[]>([]);
  const [badgeSettings, setBadgeSettings] = useState<BadgeSettings>({
    categories: DEFAULT_CATEGORIES,
    requirements: {},
    requirementMaxScores: {}
  });
  const [selectedBadgeForReq, setSelectedBadgeForReq] = useState<string>('');
  const [newRequirementInput, setNewRequirementInput] = useState('');
  const [settingsTab, setSettingsTab] = useState<'categories' | 'requirements' | 'cleanup'>('categories');
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newBadgeForCategory, setNewBadgeForCategory] = useState('');
  const [selectedStageForNewBadge, setSelectedStageForNewBadge] = useState<Stage | 'all'>('all');
  const [selectedStageForNewReq, setSelectedStageForNewReq] = useState<Stage | 'all'>('all');
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
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isDeletingAuth, setIsDeletingAuth] = useState(false);
  const [authPhoneToDelete, setAuthPhoneToDelete] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renamingCategoryName, setRenamingCategoryName] = useState('');
  const [showPassedOnly, setShowPassedOnly] = useState(false);

enum OperationType {
  GET = 'get',
  LIST = 'list',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  WRITE = 'write'
}

  const isSuperAdmin = currentProfile?.number === '01555165366' || currentProfile?.email === 'begolbahaa98@gmail.com' || currentProfile?.permissions?.canManagePermissions;

  const handleGrantAllPermissions = () => {
    setPermissionsForm({
      canManagePermissions: true,
      canManageAllBadges: true,
      canDeleteAccounts: true,
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
      managedStages: [],
      managedBadges: []
    });
  };
  
  const canManageAllBadges = isSuperAdmin || currentProfile?.permissions?.canManageAllBadges;
  const canDeleteAccounts = isSuperAdmin || currentProfile?.permissions?.canDeleteAccounts;
  
  const canDeleteThisScout = (scout: ScoutProfile) => {
    if (scout.uid === currentProfile?.uid) return false;
    if (scout.role === 'admin') return isSuperAdmin;
    return canDeleteAccounts;
  };
  
  // Helper to normalize Arabic strings for comparison
  const normalizeArabic = (str: string) => {
    if (!str) return '';
    return str
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/^شارة\s+/g, '')
      .replace(/^الشارة\s+/g, '')
      .trim();
  };

  const canEditBadge = (scoutStage: Stage, badgeName: string) => {
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
          requirementMaxScores: data.requirementMaxScores || {}
        });
      } else {
        setBadgeSettings({
          categories: DEFAULT_CATEGORIES,
          requirements: {},
          requirementMaxScores: {}
        });
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeSettings();
    };
  }, [isSuperAdmin]);

  const exportGradingToExcel = () => {
    if (!gradingSelectedBadge) return;

    const workbook = XLSX.utils.book_new();

    STAGES.forEach(stage => {
      const stageReqs = getScoutBadgeRequirements(gradingSelectedBadge, stage as Stage);
      const stageScouts = scouts.filter(s => {
        if (s.stage !== stage) return false;
        const normalizedBadge = normalizeArabic(gradingSelectedBadge);
        const hasBadge = normalizeArabic(s.badges.badge1.name) === normalizedBadge || 
                         normalizeArabic(s.badges.badge2.name) === normalizedBadge || 
                         normalizeArabic(s.badges.badge3.name) === normalizedBadge;
        if (!hasBadge) return false;

        // Apply 50% filter if active
        if (showPassedOnly) {
          const badgeKey = s.badges.badge1.name === gradingSelectedBadge ? 'badge1' 
                         : s.badges.badge2.name === gradingSelectedBadge ? 'badge2' 
                         : 'badge3';
          if ((s.badges[badgeKey].progress || 0) < 50) return false;
        }

        return true;
      });

      if (stageScouts.length === 0) return;

      const data = stageScouts.map(s => {
        const badgeKey = s.badges.badge1.name === gradingSelectedBadge ? 'badge1' 
                       : s.badges.badge2.name === gradingSelectedBadge ? 'badge2' 
                       : 'badge3';
        const badge = s.badges[badgeKey];
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
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, stage.substring(0, 31));
    });

    XLSX.writeFile(workbook, `تقييم_${gradingSelectedBadge}_${new Date().toLocaleDateString()}.xlsx`);
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
            await updateDoc(doc(db, 'users', scout.uid), {
              [`badges.${badgeKey}.requirementScores`]: newScores,
              [`badges.${badgeKey}.completedRequirements`]: newCompletedReqs,
              [`badges.${badgeKey}.progress`]: newProgress
            });
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

  const filteredAndSortedScouts = useMemo(() => {
    return scouts
      .filter(s => {
        // If not super admin, hide other admins and only show scouts they have permission to see
        if (!isSuperAdmin) {
          if (s.role === 'admin' && s.uid !== currentProfile?.uid) return false;
          // If it's a scout, check if they manage the stage or if they can edit at least one of their badges
          if (s.role !== 'admin' && !canEditScout(s)) return false;
        }

        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             s.number.includes(searchTerm);
        const matchesStage = !stageFilter || normalizeArabic(s.stage) === normalizeArabic(stageFilter);
        
        // Category Filter
        let matchesCategory = true;
        if (categoryFilter) {
          const availableBadgesInCategory = getAvailableBadges(categoryFilter, s.stage);
          matchesCategory = availableBadgesInCategory.some(b => normalizeArabic(b) === normalizeArabic(s.badges.badge1.name)) ||
                            availableBadgesInCategory.some(b => normalizeArabic(b) === normalizeArabic(s.badges.badge2.name)) ||
                            availableBadgesInCategory.some(b => normalizeArabic(b) === normalizeArabic(s.badges.badge3.name));
        }

        const matchesBadge = !badgeFilter || 
                            normalizeArabic(s.badges.badge1.name) === normalizeArabic(badgeFilter) || 
                            normalizeArabic(s.badges.badge2.name) === normalizeArabic(badgeFilter) || 
                            normalizeArabic(s.badges.badge3.name) === normalizeArabic(badgeFilter);

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
  }, [scouts, searchTerm, stageFilter, categoryFilter, badgeFilter, sortField, sortOrder, currentProfile, isSuperAdmin]);

  // Helper to get badges for a category and stage
  const getAvailableBadges = (categoryId: string, scoutStage?: Stage | '') => {
    const category = (badgeSettings.categories || []).find(c => c.id === categoryId);
    if (!category) return [];
    
    if (scoutStage) {
      // If there are stage-specific badges, use them
      const stageKey = Object.keys(category.stageBadges || {}).find(k => normalizeArabic(k) === normalizeArabic(scoutStage));
      if (stageKey && category.stageBadges && category.stageBadges[stageKey as Stage]) {
        return category.stageBadges[stageKey as Stage] || [];
      }
      // Otherwise return all badges in category
      return category.badges || [];
    }

    // If no stage provided, return all badges in this category across all stages
    const allBadges = new Set(category.badges || []);
    if (category.stageBadges) {
      Object.values(category.stageBadges).forEach(badges => {
        if (Array.isArray(badges)) {
          badges.forEach(b => allBadges.add(b));
        }
      });
    }
    return Array.from(allBadges);
  };

  const handleUpdateScout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScout || !editForm) return;

    const b1 = editingScout.badges.badge1.name;
    const b2 = editingScout.badges.badge2.name;
    const b3 = editingScout.badges.badge3.name;

    if ((b1 && b2 && b1 === b2) || (b1 && b3 && b1 === b3) || (b2 && b3 && b2 === b3)) {
      setMessage({ type: 'error', text: 'لا يمكن اختيار نفس الشارة أكثر من مرة' });
      return;
    }

    setEditLoading(true);
    try {
      const updates: any = {
        name: editForm.name,
        number: editForm.number,
        stage: editForm.stage,
        badges: editingScout.badges
      };

      await updateDoc(doc(db, 'users', editingScout.uid), updates);
      setMessage({ type: 'success', text: 'تم تحديث البيانات بنجاح' });
      setEditingScout(null);
      setEditForm(null);
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

      const updatedBadge = {
        ...currentBadge,
        ...updates,
        progress: newProgress
      };

      await updateDoc(doc(db, 'users', scout.uid), {
        [`badges.${badgeKey}`]: updatedBadge
      });
      
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

  const handleAddRequirement = async (badgeName: string, req: string, stage: Stage | 'all' = 'all') => {
    if (!badgeName || !req.trim()) return;
    
    const currentBadgeReqs = (badgeSettings.requirements || {})[badgeName] || {};
    
    let newBadgeReqs: Partial<Record<Stage | 'all', string[]>>;
    if (Array.isArray(currentBadgeReqs)) {
      newBadgeReqs = { all: [...currentBadgeReqs] };
    } else {
      newBadgeReqs = { ...currentBadgeReqs };
    }
    
    newBadgeReqs[stage] = [...(newBadgeReqs[stage] || []), req.trim()];

    const updatedRequirements = {
      ...(badgeSettings.requirements || {}),
      [badgeName]: newBadgeReqs
    };
    
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, requirements: updatedRequirements });
      setNewRequirementInput('');
      setMessage({ type: 'success', text: 'تم إضافة البند بنجاح' });
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
          ? 'خطأ في الخادم (Vercel). تأكد من صحة مفتاح Firebase Service Account في الإعدادات.'
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
        totalScore += requirementScores[req] || 0;
      } else {
        totalMaxScore += 1;
        totalScore += completedReqs.includes(req) ? 1 : 0;
      }
    });
    
    return totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
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
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'users', deletingScout.uid));
      
      // 2. Try to delete from Firebase Authentication via our backend API
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#4285F4] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 pb-4">
        <button
          onClick={() => setActiveTab('scouts')}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
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
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
            activeTab === 'grading' 
              ? 'bg-[#4285F4] text-white shadow-md' 
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <BarChart3 size={20} />
          تقييم البنود
        </button>
        {canManageAllBadges && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
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

      {activeTab === 'settings' && canManageAllBadges ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-8">
          <div className="flex gap-4 border-b border-gray-100 pb-4">
            <button
              onClick={() => setSettingsTab('categories')}
              className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'categories' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              تصنيف الشارات
            </button>
            <button
              onClick={() => setSettingsTab('requirements')}
              className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'requirements' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              بنود الشارات
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setSettingsTab('cleanup')}
                className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'cleanup' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                إزالة الحسابات العالقة
              </button>
            )}
          </div>

          {settingsTab === 'categories' ? (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">إدارة تصنيفات الشارات</h2>
                  <p className="text-gray-500">قم بإضافة أو حذف التصنيفات والشارات المتاحة في النظام.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="اسم التصنيف الجديد..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    className="px-4 py-2 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] disabled:opacity-50 transition-colors font-bold flex items-center gap-2"
                  >
                    <Plus size={18} />
                    إضافة تصنيف
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
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">شارات عامة (لكل المراحل)</h4>
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
                          <h4 className="text-[10px] font-bold text-[#4285F4] uppercase tracking-wider mb-2">شارات مرحلة: {stage}</h4>
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
          ) : settingsTab === 'requirements' ? (
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
                    ]))).map(b => (
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

                      <div className="space-y-6 mb-6">
                        {/* All Stages */}
                        <div>
                          <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            لكل المراحل
                          </h4>
                          <div className="space-y-2">
                            {getReqsForStage(selectedBadgeForReq, 'all').map((req, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm gap-3">
                                <span className="font-bold text-gray-700 text-sm flex-1">{req}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button 
                                    onClick={() => handleRemoveRequirement(selectedBadgeForReq, req, 'all')}
                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {getReqsForStage(selectedBadgeForReq, 'all').length === 0 && (
                              <p className="text-[10px] text-gray-400 italic py-2">لا توجد بنود عامة</p>
                            )}
                          </div>
                        </div>

                        {/* Specific Stages */}
                        {STAGES.map(stage => (
                          <div key={stage}>
                            <h4 className="text-xs font-black text-[#4285F4] uppercase tracking-wider mb-3 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
                              مرحلة: {stage}
                            </h4>
                            <div className="space-y-2">
                              {getReqsForStage(selectedBadgeForReq, stage).map((req, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm gap-3">
                                  <span className="font-bold text-gray-700 text-sm flex-1">{req}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                      onClick={() => handleRemoveRequirement(selectedBadgeForReq, req, stage)}
                                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {getReqsForStage(selectedBadgeForReq, stage).length === 0 && (
                                <p className="text-[10px] text-gray-400 italic py-2">لا توجد بنود لهذه المرحلة</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3 pt-6 border-t border-gray-200">
                        <div className="flex gap-2">
                          <select
                            value={selectedStageForNewReq}
                            onChange={(e) => setSelectedStageForNewReq(e.target.value as Stage | 'all')}
                            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 outline-none text-xs font-bold bg-white"
                          >
                            <option value="all">لكل المراحل</option>
                            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="أضف بنداً جديداً..."
                            value={newRequirementInput}
                            onChange={(e) => setNewRequirementInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddRequirement(selectedBadgeForReq, newRequirementInput, selectedStageForNewReq)}
                            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                          />
                          <button
                            onClick={() => handleAddRequirement(selectedBadgeForReq, newRequirementInput, selectedStageForNewReq)}
                            disabled={!newRequirementInput.trim()}
                            className="px-6 py-3 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] disabled:opacity-50 transition-colors font-bold flex items-center gap-2"
                          >
                            <Plus size={20} />
                            إضافة
                          </button>
                        </div>
                      </div>
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
          ) : (
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
              </div>
            )}
          </div>
        ) : activeTab === 'grading' ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center border-b border-gray-100 pb-6">
            <h2 className="text-2xl font-black text-gray-800">تقييم البنود</h2>
            <div className="flex flex-wrap gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
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
                className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#4285F4] outline-none font-bold text-gray-700"
              >
                <option value="">اختر الشارة للتقييم</option>
                {Array.from(new Set([
                  ...scouts.flatMap(s => [s.badges.badge1.name, s.badges.badge2.name, s.badges.badge3.name]),
                  ...(badgeSettings.categories || []).flatMap(c => [
                    ...(c.badges || []),
                    ...Object.values(c.stageBadges || {}).flat()
                  ])
                ]))
                  .filter(Boolean)
                  .filter(badgeName => {
                    if (canManageAllBadges) return true;
                    if (!currentProfile?.permissions) return false;
                    const { managedBadges, managedStages } = currentProfile.permissions;
                    
                    // 1. Explicitly managed badges
                    if ((managedBadges || []).some(mb => normalizeArabic(mb) === normalizeArabic(badgeName as string))) return true;
                    
                    // 2. Badges that belong to managed stages (from settings)
                    const isBadgeInManagedStage = (badgeSettings.categories || []).some(cat => {
                      // Check general badges
                      if ((cat.badges || []).some(b => normalizeArabic(b) === normalizeArabic(badgeName as string))) {
                        return (managedStages || []).length > 0;
                      }
                      // Check stage-specific badges
                      return (managedStages || []).some(stage => 
                        (cat.stageBadges?.[stage] || []).some(b => normalizeArabic(b) === normalizeArabic(badgeName as string))
                      );
                    });
                    
                    if (isBadgeInManagedStage) return true;

                    // 3. Badges that belong to managed stages (from scouts currently in the list)
                    return scouts.some(s => (managedStages || []).some(ms => normalizeArabic(ms) === normalizeArabic(s.stage || '')) && 
                      (s.badges.badge1.name === badgeName || s.badges.badge2.name === badgeName || s.badges.badge3.name === badgeName)
                    );
                  })
                  .map(badgeName => (
                  <option key={badgeName as string} value={badgeName as string}>{badgeName as string}</option>
                ))}
              </select>

              {gradingSelectedBadge && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPassedOnly(!showPassedOnly)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all font-bold text-sm ${showPassedOnly ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    title="عرض الناجحين فقط (50%+)"
                  >
                    <CheckCircle2 size={16} />
                    <span className="hidden lg:inline">ناجح (50%+)</span>
                  </button>
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
              )}
            </div>
          </div>
          
          {gradingSelectedBadge ? (
            <div className="space-y-8">
              {(() => {
                const renderedStages = STAGES.map(stage => {
                  const stageReqs = getScoutBadgeRequirements(gradingSelectedBadge, stage as Stage);
                  const stageScoutsWithBadge = scouts.filter(s => {
                    if (s.stage !== stage) return false;
                    const normalizedBadge = normalizeArabic(gradingSelectedBadge);
                    const hasBadge = normalizeArabic(s.badges.badge1.name) === normalizedBadge || 
                                     normalizeArabic(s.badges.badge2.name) === normalizedBadge || 
                                     normalizeArabic(s.badges.badge3.name) === normalizedBadge;
                    if (!hasBadge) return false;
                    return canEditBadge(s.stage, gradingSelectedBadge);
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
                    // Apply 50% filter if active
                    if (showPassedOnly) {
                      const badgeKey = s.badges.badge1.name === gradingSelectedBadge ? 'badge1' 
                                     : s.badges.badge2.name === gradingSelectedBadge ? 'badge2' 
                                     : 'badge3';
                      if ((s.badges[badgeKey].progress || 0) < 50) return false;
                    }

                    if (gradingSearchTerm) {
                      const search = gradingSearchTerm.toLowerCase().trim();
                      return s.name.toLowerCase().includes(search) || s.number.includes(search);
                    }
                    return true;
                  });

                  return (
                    <div key={stage} className="space-y-4">
                      <h3 className="text-xl font-bold text-[#4285F4]">{stage}</h3>
                      <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                        <table className="w-full text-right border-collapse min-w-max">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="p-4 font-bold text-gray-600 w-64 sticky right-0 bg-gray-50 z-10 border-l border-gray-200">بيانات الكشاف</th>
                              {stageReqs.map((req, idx) => {
                                const maxScore = badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req];
                                return (
                                  <th key={idx} className="p-4 font-bold text-gray-600 min-w-[200px] border-l border-gray-200 last:border-l-0">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-sm truncate" title={req}>{req}</span>
                                      {maxScore && maxScore > 0 && (
                                        <span className="text-xs text-[#4285F4] bg-[#4285F4]/10 px-2 py-1 rounded-full w-fit">
                                          من {maxScore}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                );
                              })}
                              <th className="p-4 font-bold text-gray-600 w-32 border-l border-gray-200">النسبة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Final Score Row (Super Admin and Manage All Badges only) */}
                            {(isSuperAdmin || canManageAllBadges) && (
                              <tr className="bg-blue-50/50 border-b border-blue-100">
                                <td className="p-4 sticky right-0 bg-blue-50 z-10 border-l border-gray-200 font-black text-[#4285F4]">
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
                                <td className="p-4 sticky right-0 bg-white z-10 border-l border-gray-200">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-gray-800">{scout.name}</span>
                                    <span className="text-sm text-gray-500">{scout.number}</span>
                                  </div>
                                </td>
                                {stageReqs.map((req, idx) => {
                                  const maxScore = badgeSettings.requirementMaxScores?.[gradingSelectedBadge]?.[req];
                                  const isCompleted = completedReqs.includes(req);
                                  const currentScore = scores[req];
                                  const canEdit = canEditBadge(scout.stage, gradingSelectedBadge);

                                  return (
                                    <td key={idx} className="p-4 border-l border-gray-200 last:border-l-0">
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
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
                  {scouts.reduce((acc, s) => acc + [s.badges.badge1, s.badges.badge2, s.badges.badge3].filter(b => {
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
                            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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

                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                    <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div className="text-xs text-amber-800 font-bold leading-relaxed">
                      لتغيير كلمة المرور لهذا المستخدم، يرجى التواصل مع المسؤول التقني أو حذف الحساب وإعادة إنشائه بكلمة مرور جديدة، حيث لا يمكن تغيير كلمة مرور مستخدم آخر مباشرة لأسباب أمنية.
                    </div>
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
                    const canEdit = canEditBadge(editingScout.stage, badgeName);
                    
                    // Badge Selection Logic
                    const scoutCategory = (badgeSettings.categories || []).find(c => c.id === 'scout');
                    const otherCategories = (badgeSettings.categories || []).filter(c => c.id !== 'scout');
                    
                    return (
                    <div key={key} className={`space-y-4 p-6 rounded-3xl border ${canEdit ? 'bg-gray-50 border-gray-100' : 'bg-gray-100/50 border-gray-200 opacity-75'}`}>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-black text-gray-800 flex items-center gap-3">
                            <Award size={22} className={canEdit ? "text-[#4285F4]" : "text-gray-400"} />
                            {BADGE_LABELS[key]}
                            {!canEdit && <span className="text-xs font-normal text-red-500 bg-red-50 px-2 py-1 rounded-lg">لا تملك صلاحية التعديل</span>}
                          </h4>
                        </div>

                        {(canManageAllBadges || (currentProfile?.permissions?.managedBadges?.length || 0) > 0 || (currentProfile?.permissions?.managedStages?.length || 0) > 0) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {key === 'badge1' ? (
                              <div className="col-span-2">
                                <label className="text-xs font-bold text-gray-500 mb-1 block">اختر الشارة الكشفية:</label>
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
                                  className="w-full px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm bg-white"
                                >
                                  <option value="">-- اختر شارة --</option>
                                  {getAvailableBadges('scout', editingScout.stage)
                                    .filter(b => canManageAllBadges || canEditBadge(editingScout.stage, b))
                                    .map(b => <option key={b} value={b} disabled={b === editingScout.badges.badge2.name || b === editingScout.badges.badge3.name}>{b}</option>)}
                                </select>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">اختر التصنيف:</label>
                                  <select
                                    value={selectedCategoryForBadgeSelection[key] || ''}
                                    onChange={(e) => {
                                      const newCategory = e.target.value;
                                      setSelectedCategoryForBadgeSelection(prev => ({ ...prev, [key]: newCategory }));
                                      setEditingScout(prev => prev ? {
                                        ...prev,
                                        badges: {
                                          ...prev.badges,
                                          [key]: { name: '', progress: 0, notes: '', completedRequirements: [], requirementScores: {} }
                                        }
                                      } : null);
                                    }}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm bg-white"
                                  >
                                    <option value="">-- اختر تصنيف --</option>
                                    {(badgeSettings.categories || [])
                                      .filter(c => {
                                        if (canManageAllBadges) return true;
                                        const catBadges = [...(c.badges || []), ...Object.values(c.stageBadges || {}).flat()];
                                        return catBadges.some(b => canEditBadge(editingScout.stage, b));
                                      })
                                      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">اختر الشارة:</label>
                                  <select
                                    disabled={!selectedCategoryForBadgeSelection[key]}
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
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm bg-white disabled:bg-gray-50"
                                  >
                                    <option value="">-- اختر شارة --</option>
                                    {selectedCategoryForBadgeSelection[key] && getAvailableBadges(selectedCategoryForBadgeSelection[key]!, editingScout.stage)
                                      .filter(b => canManageAllBadges || canEditBadge(editingScout.stage, b))
                                      .map(b => (
                                        <option key={b} value={b} disabled={b === editingScout.badges[key === 'badge2' ? 'badge1' : 'badge1'].name || b === editingScout.badges[key === 'badge2' ? 'badge3' : 'badge2'].name}>{b}</option>
                                      ))}
                                  </select>
                                </div>
                              </>
                            )}
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
                                      value={badge.progress}
                                      onChange={(e) => updateBadgeValue(key, 'progress', parseInt(e.target.value) || 0)}
                                      className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-center font-black text-[#4285F4] text-lg disabled:bg-gray-100 disabled:text-gray-500"
                                    />
                                    <span className="text-lg font-black text-gray-400">%</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {hasReqs ? (
                              <div className="space-y-2 bg-white p-4 rounded-2xl border border-gray-100">
                                <h5 className="text-sm font-bold text-gray-700 mb-3">متطلبات الشارة:</h5>
                                {reqs.map((req, idx) => {
                                  const maxScore = badgeSettings.requirementMaxScores?.[badge.name]?.[req] || 0;
                                  const isCompleted = completedReqs.includes(req);
                                  const currentScore = badge.requirementScores?.[req] || 0;
                                  
                                  return (
                                    <div key={idx} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl transition-colors ${canEdit ? 'hover:bg-gray-50' : ''}`}>
                                      {maxScore > 0 ? (
                                        <>
                                          <span className="text-sm font-bold text-gray-700 flex-1">{req}</span>
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
                                        </>
                                      ) : (
                                        <label className={`flex items-start gap-3 w-full ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
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
                                          <span className={`text-sm font-bold ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                            {req}
                                          </span>
                                        </label>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <input
                                type="range"
                                min="0"
                                max="100"
                                disabled={!canEdit}
                                value={badge.progress}
                                onChange={(e) => updateBadgeValue(key, 'progress', parseInt(e.target.value))}
                                className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#4285F4] disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            )}

                            <div className="space-y-2 pt-4">
                              <label className="text-xs font-black text-gray-500 mr-2 uppercase tracking-wider">ملاحظات المسؤول:</label>
                              <textarea
                                disabled={!canEdit}
                                value={badge.notes}
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
      </AnimatePresence>
    </div>
  );
}
