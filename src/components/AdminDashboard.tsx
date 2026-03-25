import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { ScoutProfile, STAGES, BADGE_OPTIONS, BadgeSettings, Stage } from '../types';
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
    'أشبال وزهرات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] },
    'كشاف ومرشدات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] },
    'متقدم ورائدات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] }
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
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
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [newBadgeInputs, setNewBadgeInputs] = useState<Record<Stage, string>>({
    'أشبال وزهرات': '',
    'كشاف ومرشدات': '',
    'متقدم ورائدات': ''
  });

  const isSuperAdmin = currentProfile?.number === '01552698433' || currentProfile?.email === 'begolbahaa98@gmail.com';

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
      const data = snapshot.docs.map(doc => doc.data() as ScoutProfile);
      // If super admin, show all users including admins (so they can manage them if needed), otherwise just scouts
      setScouts(data.filter(s => isSuperAdmin ? true : s.role === 'scout'));
      setLoading(false);
    }, (error) => {
      console.error('Firestore error:', error);
      setLoading(false);
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'badges'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const newSettings: BadgeSettings = {
          'أشبال وزهرات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] },
          'كشاف ومرشدات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] },
          'متقدم ورائدات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] }
        };
        
        Object.keys(data).forEach(stage => {
          if (Array.isArray(data[stage])) {
            newSettings[stage] = {
              badge1: data[stage],
              badge2: data[stage],
              badge3: data[stage]
            };
          } else if (data[stage]) {
            newSettings[stage] = data[stage];
          }
        });
        
        setBadgeSettings(newSettings);
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

  const updateBadgeValue = (badgeKey: 'badge1' | 'badge2' | 'badge3', field: 'progress' | 'notes', value: any) => {
    if (!editingScout) return;
    setEditingScout({
      ...editingScout,
      badges: {
        ...editingScout.badges,
        [badgeKey]: {
          ...editingScout.badges[badgeKey],
          [field]: value
        }
      }
    });
  };

  const handleAddBadge = async (stage: Stage) => {
    const newBadge = newBadgeInputs[stage].trim();
    if (!newBadge) return;
    
    const stageSettings = badgeSettings[stage] || { badge1: [], badge2: [], badge3: [] };
    const currentBadges = stageSettings[activeBadgeTab] || [];
    if (currentBadges.includes(newBadge)) {
      alert('هذه الشارة موجودة بالفعل');
      return;
    }

    const newSettings = {
      ...badgeSettings,
      [stage]: {
        ...stageSettings,
        [activeBadgeTab]: [...currentBadges, newBadge]
      }
    };

    try {
      await setDoc(doc(db, 'settings', 'badges'), newSettings);
      setNewBadgeInputs({ ...newBadgeInputs, [stage]: '' });
    } catch (error) {
      console.error('Error saving badge:', error);
      alert('حدث خطأ أثناء حفظ الشارة');
    }
  };

  const handleRemoveBadge = async (stage: Stage, badgeToRemove: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف شارة "${badgeToRemove}" من مرحلة ${stage}؟`)) return;
    
    const stageSettings = badgeSettings[stage] || { badge1: [], badge2: [], badge3: [] };
    const newSettings = {
      ...badgeSettings,
      [stage]: {
        ...stageSettings,
        [activeBadgeTab]: (stageSettings[activeBadgeTab] || []).filter(b => b !== badgeToRemove)
      }
    };

    try {
      await setDoc(doc(db, 'settings', 'badges'), newSettings);
    } catch (error) {
      console.error('Error removing badge:', error);
      alert('حدث خطأ أثناء حذف الشارة');
    }
  };

  const handleToggleAdmin = async (scoutId: string, currentRole: string) => {
    if (!isSuperAdmin) return;
    
    const newRole = currentRole === 'admin' ? 'scout' : 'admin';
    const actionText = newRole === 'admin' ? 'ترقية إلى مسؤول' : 'إزالة صلاحيات المسؤول';
    
    if (!window.confirm(`هل أنت متأكد من ${actionText} لهذا المستخدم؟`)) return;

    try {
      await updateDoc(doc(db, 'users', scoutId), { role: newRole });
    } catch (error) {
      console.error('Error updating role:', error);
      alert('حدث خطأ أثناء تغيير الصلاحيات');
    }
  };

  const handleDeleteScout = async () => {
    if (!deletingScout) return;
    
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
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
            activeTab === 'settings' 
              ? 'bg-[#4285F4] text-white shadow-md' 
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <Settings size={20} />
          إعدادات الشارات
        </button>
      </div>

      {activeTab === 'settings' ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-gray-800 mb-2">إعدادات الشارات حسب المرحلة</h2>
              <p className="text-gray-500">قم بإضافة أو حذف الشارات المتاحة لكل مرحلة كشفية.</p>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              {(['badge1', 'badge2', 'badge3'] as const).map(b => (
                <button
                  key={b}
                  onClick={() => setActiveBadgeTab(b)}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeBadgeTab === b ? 'bg-white text-[#4285F4] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {b === 'badge1' ? 'شارة 1' : b === 'badge2' ? 'شارة 2' : 'شارة 3'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STAGES.map((stage) => {
              const stageSettings = badgeSettings[stage] || { badge1: [], badge2: [], badge3: [] };
              const currentBadges = stageSettings[activeBadgeTab] || [];
              
              return (
                <div key={stage} className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col h-full">
                  <h3 className="text-xl font-black text-[#4285F4] mb-4 pb-4 border-b border-gray-200">
                    {stage}
                  </h3>
                  
                  <div className="flex-1 space-y-3 mb-6">
                    {currentBadges.map((badge) => (
                      <div key={badge} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                        <span className="font-bold text-gray-700">{badge}</span>
                        <button 
                          onClick={() => handleRemoveBadge(stage, badge)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف الشارة"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                    {currentBadges.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">لا توجد شارات مضافة</p>
                    )}
                  </div>

                  <div className="mt-auto flex gap-2">
                    <input
                      type="text"
                      placeholder="اسم الشارة الجديدة..."
                      value={newBadgeInputs[stage]}
                      onChange={(e) => setNewBadgeInputs({...newBadgeInputs, [stage]: e.target.value})}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddBadge(stage)}
                      className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-sm"
                    />
                    <button
                      onClick={() => handleAddBadge(stage)}
                      disabled={!newBadgeInputs[stage].trim()}
                      className="p-2 bg-[#4285F4] text-white rounded-xl hover:bg-[#357ABD] disabled:opacity-50 transition-colors"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
                  {scouts.reduce((acc, s) => acc + [s.badges.badge1, s.badges.badge2, s.badges.badge3].filter(b => b.progress > 0 && b.progress < 100).length, 0)}
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

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 mr-2">تصفية حسب الشارة:</label>
                <select
                  value={badgeFilter}
                  onChange={(e) => setBadgeFilter(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white font-bold text-gray-700"
                >
                  <option value="">كل الشارات</option>
                  {Array.from(new Set(Object.values(badgeSettings).flatMap((s: any) => [...(s.badge1 || []), ...(s.badge2 || []), ...(s.badge3 || [])]))).map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
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
                          {[scout.badges.badge1, scout.badges.badge2, scout.badges.badge3].map((b, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 w-16 truncate">{b.name}</span>
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[#4285F4]" style={{ width: `${b.progress}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-[#4285F4]">{b.progress}%</span>
                            </div>
                          ))}
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
                          {isSuperAdmin && scout.uid !== currentProfile?.uid && (
                            <button
                              onClick={() => handleToggleAdmin(scout.uid, scout.role)}
                              className={`p-2 rounded-xl transition-all ${
                                scout.role === 'admin' 
                                  ? 'text-amber-500 hover:bg-amber-50' 
                                  : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                              }`}
                              title={scout.role === 'admin' ? 'إزالة صلاحيات المسؤول' : 'ترقية إلى مسؤول'}
                            >
                              <ShieldAlert size={18} />
                            </button>
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
                  {(['badge1', 'badge2', 'badge3'] as const).map((key) => (
                    <div key={key} className="space-y-4 p-6 bg-gray-50 rounded-3xl border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-black text-gray-800 flex items-center gap-3">
                        <Award size={22} className="text-[#4285F4]" />
                        {editingScout.badges[key].name}
                      </h4>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editingScout.badges[key].progress}
                          onChange={(e) => updateBadgeValue(key, 'progress', parseInt(e.target.value) || 0)}
                          className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-center font-black text-[#4285F4] text-lg"
                        />
                        <span className="text-lg font-black text-gray-400">%</span>
                      </div>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={editingScout.badges[key].progress}
                      onChange={(e) => updateBadgeValue(key, 'progress', parseInt(e.target.value))}
                      className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#4285F4]"
                    />

                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-black text-gray-500 mr-2 uppercase tracking-wider">ملاحظات المسؤول:</label>
                      <textarea
                        value={editingScout.badges[key].notes}
                        onChange={(e) => updateBadgeValue(key, 'notes', e.target.value)}
                        placeholder="أضف ملاحظاتك هنا..."
                        className="w-full px-5 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all text-sm font-medium"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
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
      </AnimatePresence>
    </div>
  );
}
