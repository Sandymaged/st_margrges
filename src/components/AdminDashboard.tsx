import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  ScoutProfile, 
  STAGES, 
  BadgeSettings, 
  Stage, 
  AdminPermissions, 
  BadgeCategory, 
  DEFAULT_CATEGORIES, 
  BADGE_LABELS 
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
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  ShieldX,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminDashboardProps {
  currentProfile?: ScoutProfile;
}

export default function AdminDashboard({ currentProfile }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'scouts' | 'settings'>('scouts');
  const [activeBadgeTab, setActiveBadgeTab] = useState<'badge1' | 'badge2' | 'badge3'>('badge1');
  const [scouts, setScouts] = useState<ScoutProfile[]>([]);
  const [badgeSettings, setBadgeSettings] = useState<BadgeSettings>({
    categories: DEFAULT_CATEGORIES,
    requirements: {}
  });
  const [selectedBadgeForReq, setSelectedBadgeForReq] = useState<string>('');
  const [newRequirementInput, setNewRequirementInput] = useState('');
  const [settingsTab, setSettingsTab] = useState<'categories' | 'requirements'>('categories');
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newBadgeForCategory, setNewBadgeForCategory] = useState('');
  const [selectedStageForNewBadge, setSelectedStageForNewBadge] = useState<Stage | 'all'>('all');
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
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [newBadgeInputs, setNewBadgeInputs] = useState<Record<Stage, string>>({
    'أشبال وزهرات': '',
    'كشاف ومرشدات': '',
    'متقدم ورائدات': ''
  });

enum OperationType {
  GET = 'get',
  LIST = 'list',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  WRITE = 'write'
}

  const isSuperAdmin = currentProfile?.number === '01552698433' || currentProfile?.email === 'begolbahaa98@gmail.com' || currentProfile?.permissions?.canManagePermissions;

  const handleGrantAllPermissions = () => {
    setPermissionsForm({
      canManagePermissions: true,
      canManageAllBadges: true,
      canDeleteAccounts: true,
      managedStages: [...STAGES],
      managedBadges: (badgeSettings.categories || []).flatMap(c => c.badges)
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
  
  const canEditBadge = (scoutStage: Stage, badgeName: string) => {
    if (canManageAllBadges) return true;
    if (!currentProfile?.permissions) return false;
    
    const { managedStages, managedBadges } = currentProfile.permissions;
    return managedStages.includes(scoutStage) && managedBadges.includes(badgeName);
  };
  
  const canEditScout = (scout: ScoutProfile) => {
    if (canManageAllBadges) return true;
    if (!currentProfile?.permissions) return false;
    
    // They can edit the scout if they can edit at least one of their badges
    return canEditBadge(scout.stage, scout.badges.badge1.name) ||
           canEditBadge(scout.stage, scout.badges.badge2.name) ||
           canEditBadge(scout.stage, scout.badges.badge3.name);
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
      // If super admin, show all users including admins (so they can manage them if needed), otherwise just scouts
      setScouts(data.filter(s => isSuperAdmin ? true : s.role === 'scout'));
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
          requirements: data.requirements || {}
        });
      } else {
        setBadgeSettings({
          categories: DEFAULT_CATEGORIES,
          requirements: {}
        });
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeSettings();
    };
  }, [isSuperAdmin]);

  const filteredAndSortedScouts = useMemo(() => {
    return scouts
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             s.number.includes(searchTerm);
        const matchesStage = !stageFilter || s.stage === stageFilter;
        const matchesBadge = !badgeFilter || 
                            s.badges.badge1.name === badgeFilter || 
                            s.badges.badge2.name === badgeFilter || 
                            s.badges.badge3.name === badgeFilter;
        return matchesSearch && matchesStage && matchesBadge;
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
  }, [scouts, searchTerm, stageFilter, badgeFilter, sortField, sortOrder]);

  // Helper to get badges for a category and stage
  const getAvailableBadges = (categoryId: string, scoutStage: Stage) => {
    const category = (badgeSettings.categories || []).find(c => c.id === categoryId);
    if (!category) return [];
    
    // If there are stage-specific badges, use them
    if (category.stageBadges && category.stageBadges[scoutStage]) {
      return category.stageBadges[scoutStage] || [];
    }
    
    // Otherwise return all badges in category
    return category.badges || [];
  };

  const handleUpdateScout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScout || !editForm) return;

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

  const updateBadgeValue = (badgeKey: 'badge1' | 'badge2' | 'badge3', field: 'progress' | 'notes' | 'completedRequirements', value: any) => {
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

  const handleAddRequirement = async (badgeName: string, req: string) => {
    if (!badgeName || !req.trim()) return;
    const updatedRequirements = {
      ...(badgeSettings.requirements || {}),
      [badgeName]: [...((badgeSettings.requirements || {})[badgeName] || []), req.trim()]
    };
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, requirements: updatedRequirements });
      setNewRequirementInput('');
      setMessage({ type: 'success', text: 'تم إضافة البند بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
  };

  const handleRemoveRequirement = async (badgeName: string, req: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا البند؟')) return;
    const updatedRequirements = {
      ...(badgeSettings.requirements || {}),
      [badgeName]: ((badgeSettings.requirements || {})[badgeName] || []).filter(r => r !== req)
    };
    try {
      await setDoc(doc(db, 'settings', 'badges'), { ...badgeSettings, requirements: updatedRequirements });
      setMessage({ type: 'success', text: 'تم حذف البند بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/badges');
    }
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
    if (!deletingScout || !canDeleteAccounts) return;
    
    setDeleteLoading(true);
    try {
      await deleteDoc(doc(db, 'users', deletingScout.uid));
      setMessage({ type: 'success', text: 'تم حذف الحساب بنجاح' });
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
                      <h3 className="text-xl font-black text-[#4285F4]">{category.name}</h3>
                      <button
                        onClick={() => handleRemoveCategory(category.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف التصنيف"
                      >
                        <Trash2 size={18} />
                      </button>
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
          ) : (
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
                    {badgeSettings.categories.flatMap(c => c.badges).map(b => (
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

                      <div className="space-y-3 mb-6">
                        {(badgeSettings.requirements[selectedBadgeForReq] || []).map((req, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-[#4285F4] flex items-center justify-center text-xs font-bold shrink-0">
                                {idx + 1}
                              </div>
                              <span className="font-bold text-gray-700">{req}</span>
                            </div>
                            <button 
                              onClick={() => handleRemoveRequirement(selectedBadgeForReq, req)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                              title="حذف البند"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                        {(badgeSettings.requirements[selectedBadgeForReq] || []).length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                            لا توجد بنود لهذه الشارة حتى الآن
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="أضف بنداً جديداً..."
                          value={newRequirementInput}
                          onChange={(e) => setNewRequirementInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddRequirement(selectedBadgeForReq, newRequirementInput)}
                          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm font-bold"
                        />
                        <button
                          onClick={() => handleAddRequirement(selectedBadgeForReq, newRequirementInput)}
                          disabled={!newRequirementInput.trim()}
                          className="px-6 py-3 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] disabled:opacity-50 transition-colors font-bold flex items-center gap-2"
                        >
                          <Plus size={20} />
                          إضافة
                        </button>
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
                    const reqs = badgeSettings.requirements[b.name] || [];
                    const hasReqs = reqs.length > 0;
                    const completedReqs = (b.completedRequirements || []).filter(r => reqs.includes(r));
                    const progress = hasReqs ? Math.round((completedReqs.length / reqs.length) * 100) : b.progress;
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
                      {categoryFilter && getAvailableBadges(categoryFilter, stageFilter as Stage || STAGES[0]).map(b => (
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
                            const reqs = (badgeSettings.requirements || {})[b.name] || [];
                            const hasReqs = reqs.length > 0;
                            const completedReqs = (b.completedRequirements || []).filter(r => reqs.includes(r));
                            const progress = hasReqs ? Math.round((completedReqs.length / reqs.length) * 100) : b.progress;
                            
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
                          {canEditScout(scout) && (
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
                          )}
                          {canDeleteAccounts && (
                            <button
                              onClick={() => setDeletingScout(scout)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title="حذف الحساب"
                            >
                              <Trash2 size={18} />
                            </button>
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
                لا توجد نتائج تطابق بحثك
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
                    const reqs = (badgeSettings.requirements || {})[badgeName] || [];
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

                        {canEdit && (
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
                                        [key]: { name: newName, progress: 0, notes: '', completedRequirements: [] }
                                      }
                                    } : null);
                                  }}
                                  className="w-full px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm bg-white"
                                >
                                  <option value="">-- اختر شارة --</option>
                                  {getAvailableBadges('scout', editingScout.stage).map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">اختر التصنيف:</label>
                                  <select
                                    value={selectedCategoryForBadgeSelection[key] || ''}
                                    onChange={(e) => setSelectedCategoryForBadgeSelection(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm bg-white"
                                  >
                                    <option value="">-- اختر تصنيف --</option>
                                    {(badgeSettings.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                                          [key]: { name: newName, progress: 0, notes: '', completedRequirements: [] }
                                        }
                                      } : null);
                                    }}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm bg-white disabled:bg-gray-50"
                                  >
                                    <option value="">-- اختر شارة --</option>
                                    {selectedCategoryForBadgeSelection[key] && getAvailableBadges(selectedCategoryForBadgeSelection[key]!, editingScout.stage).map(b => (
                                      <option key={b} value={b}>{b}</option>
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
                                    {Math.round((completedReqs.length / reqs.length) * 100)}%
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
                                  const isCompleted = completedReqs.includes(req);
                                  return (
                                    <label key={idx} className={`flex items-start gap-3 p-2 rounded-xl transition-colors ${canEdit ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-not-allowed'}`}>
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
                                            updateBadgeValue(key, 'progress', Math.round((newCompleted.length / reqs.length) * 100));
                                          }}
                                          className="w-5 h-5 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4] cursor-pointer"
                                        />
                                      </div>
                                      <span className={`text-sm font-bold ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                        {req}
                                      </span>
                                    </label>
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
                          {(badgeSettings.categories || []).flatMap(c => c.badges).map(badge => (
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
