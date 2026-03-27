import React, { useState, useRef, useEffect } from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LogOut, User as UserIcon, Home, LayoutDashboard, Menu, X, ChevronDown, Camera, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GeneralSettings } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  profile: any;
  view?: 'profile' | 'dashboard';
  setView?: (view: 'profile' | 'dashboard') => void;
  generalSettings: GeneralSettings;
}

export default function Layout({ children, user, profile, view, setView, generalSettings }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isUpdatingLogo, setIsUpdatingLogo] = useState(false);

  const isSuperAdmin = profile?.number === '01552698433' || profile?.email === 'begolbahaa98@gmail.com' || profile?.permissions?.canManagePermissions;

  const handleUpdateLogo = async () => {
    const newUrl = window.prompt('أدخل رابط صورة اللوجو الجديد:', generalSettings.logoUrl);
    if (newUrl && newUrl !== generalSettings.logoUrl) {
      setIsUpdatingLogo(true);
      try {
        await updateDoc(doc(db, 'settings', 'general'), { logoUrl: newUrl });
      } catch (error) {
        console.error('Error updating logo:', error);
        alert('حدث خطأ أثناء تحديث اللوجو');
      } finally {
        setIsUpdatingLogo(false);
      }
    }
  };

  const handleUpdateGroupName = async () => {
    const newName = window.prompt('أدخل اسم المجموعة الجديد:', generalSettings.scoutGroupName);
    if (newName && newName !== generalSettings.scoutGroupName) {
      try {
        await updateDoc(doc(db, 'settings', 'general'), { scoutGroupName: newName });
      } catch (error) {
        console.error('Error updating group name:', error);
        alert('حدث خطأ أثناء تحديث اسم المجموعة');
      }
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setIsMenuOpen(false);
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
      {/* Header */}
      <header className="bg-[#4285F4] text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button 
                onClick={() => setView && setView('profile')} 
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="h-10 w-10 bg-white rounded-full p-1 flex items-center justify-center shadow-inner overflow-hidden">
                  <img 
                    src={generalSettings.logoUrl} 
                    alt="Scouts Logo" 
                    className="h-full w-full object-contain"
                  />
                </div>
                <h1 className="text-xl font-bold">{generalSettings.scoutGroupName}</h1>
              </button>
              {isSuperAdmin && (
                <div className="absolute -bottom-2 -right-2 flex gap-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleUpdateLogo(); }}
                    className="p-1 bg-white text-[#4285F4] rounded-full shadow-lg hover:bg-blue-50 transition-colors"
                    title="تغيير اللوجو"
                  >
                    <Camera size={12} />
                  </button>
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
                    {profile?.name || profile?.number || user.phoneNumber || 'مستخدم'}
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
                          {profile?.number || user.phoneNumber}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    {profile?.role === 'admin' && setView && (
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
