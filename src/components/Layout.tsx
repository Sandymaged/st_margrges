import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { LogOut, User as UserIcon, Home, LayoutDashboard, Menu, X, ChevronDown, Camera, Edit2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GeneralSettings, ScoutProfile } from '../types';
import { logout as authLogout, getStoredToken } from '../authClient';

interface LayoutProps {
  children: React.ReactNode;
  user: { id: string; phone: string; role: string } | null;
  profile: ScoutProfile | null;
  view?: 'profile' | 'dashboard';
  setView?: (view: 'profile' | 'dashboard') => void;
  generalSettings: GeneralSettings;
}

export default function Layout({ children, user, profile, view, setView, generalSettings }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingLogo, setIsUpdatingLogo] = useState(false);

  const [isNavigating, setIsNavigating] = useState(false);

  const handleNavigateToProfile = () => {
    if (setView && view !== 'profile') {
      setIsNavigating(true);
      setTimeout(() => {
        setView('profile');
        setIsNavigating(false);
      }, 600);
    }
  };

  const adminPhone = import.meta.env.VITE_SUPER_ADMIN_PHONE;
  const adminEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL;

  const isSuperAdmin = 
    (adminPhone && profile?.number === adminPhone) || 
    (adminEmail && profile?.email === adminEmail) || 
    (adminPhone && (profile?.email === `${adminPhone}@scouts.local` || profile?.email === `${adminPhone}@st-margrges.vercel.app`)) ||
    profile?.permissions?.canManagePermissions;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة يجب أن يكون أقل من 2 ميجابايت');
      return;
    }

    setIsUpdatingLogo(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload('settings/logo', file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('assets').getPublicUrl('settings/logo');
      const token = getStoredToken();
      const { data: rpcResult } = await (await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          function: 'merge_app_settings',
          params: { p_key: 'general', p_patch: { logoUrl: `${publicUrlData.publicUrl}?t=${Date.now()}` } }
        }),
      })).json();
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('حدث خطأ أثناء رفع اللوجو');
    } finally {
      setIsUpdatingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpdateGroupName = async () => {
    const newName = window.prompt('أدخل اسم المجموعة الجديد:', generalSettings.scoutGroupName);
    if (newName && newName !== generalSettings.scoutGroupName) {
      const token = getStoredToken();
      const { data: rpcResult } = await (await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          function: 'merge_app_settings',
          params: { p_key: 'general', p_patch: { scoutGroupName: newName } }
        }),
      })).json();
    }
  };

  const handleLogout = () => {
    authLogout();
    setIsMenuOpen(false);
    window.location.reload();
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans" dir="rtl">
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center"
          >
            <div className="h-24 w-24 mb-6 flex items-center justify-center overflow-hidden animate-pulse">
              <img 
                src="/syncc.png" 
                alt="Scouts Logo" 
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex items-center gap-3 text-[#4285F4]">
              <Loader2 className="animate-spin" size={24} />
              <span className="font-bold text-lg">جاري التحميل...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="bg-[#4285F4] text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button 
                onClick={handleNavigateToProfile} 
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="h-14 w-14 flex items-center justify-center overflow-hidden">
                  <img 
                    src="/syncc.png" 
                    alt="Scouts Logo" 
                    className="h-full w-full object-contain"
                  />
                </div>
                <h1 className="text-xl font-bold">{generalSettings.scoutGroupName}</h1>
              </button>
              {isSuperAdmin && (
                <div className="absolute -bottom-2 -right-2 flex gap-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleUpdateGroupName(); }}
                    className="p-1 bg-white text-[#4285F4] rounded-full shadow-lg hover:bg-blue-50 transition-colors"
                    title="تغيير اسم المجموعة"
                  >
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4 relative" ref={menuRef}>
            {user && (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full">
                  <div className="bg-white/20 p-1 rounded-full">
                    <UserIcon size={14} />
                  </div>
                  <span className="text-sm font-bold">
                    {profile?.name || profile?.number || user.phone || 'مستخدم'}
                  </span>
                </div>

                <button 
                  onClick={toggleMenu}
                  className={`flex items-center gap-2 p-2 rounded-2xl transition-all ${isMenuOpen ? 'bg-white text-[#4285F4]' : 'bg-white/10 hover:bg-white/20'}`}
                  title="القائمة"
                >
                  {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                  <span className="hidden sm:inline font-bold">القائمة</span>
                </button>
              </div>
            )}

            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 top-full mt-2 w-64 bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden text-gray-800"
                >
                  <div className="p-4 border-b border-gray-50 md:hidden">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 p-2 rounded-2xl">
                        <UserIcon size={20} className="text-[#4285F4]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black truncate max-w-[160px]">
                          {profile?.name || 'مستخدم'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {profile?.number || user.phone}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    {(profile?.role === 'admin' || isSuperAdmin) && setView && (
                      <button 
                        onClick={() => {
                          setView('dashboard');
                          setIsMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-blue-50 text-[#4285F4]' : 'hover:bg-gray-50 text-gray-700'}`}
                      >
                        <LayoutDashboard size={20} />
                        <span className="font-bold">لوحة التحكم</span>
                      </button>
                    )}

                    <button 
                      onClick={() => {
                        setView && setView('profile');
                        setIsMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${view === 'profile' ? 'bg-blue-50 text-[#4285F4]' : 'hover:bg-gray-50 text-gray-700'}`}
                    >
                      <Home size={20} />
                      <span className="font-bold">الرئيسية</span>
                    </button>

                    <div className="h-px bg-gray-100 my-2 mx-2" />

                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all"
                    >
                      <LogOut size={20} />
                      <span className="font-bold">تسجيل الخروج</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
