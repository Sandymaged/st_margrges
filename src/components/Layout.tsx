import React, { useState, useRef, useEffect } from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LogOut, User as UserIcon, Home, LayoutDashboard, Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  profile: any;
  view?: 'profile' | 'dashboard';
  setView?: (view: 'profile' | 'dashboard') => void;
}

export default function Layout({ children, user, profile, view, setView }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
          <button 
            onClick={() => setView && setView('profile')} 
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="h-10 w-10 bg-white rounded-full p-1 flex items-center justify-center shadow-inner overflow-hidden">
              <img 
                src="/logo.png" 
                alt="Scouts Logo" 
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/initials/svg?seed=MG&backgroundColor=ffffff&transitionDuration=0';
                }}
              />
            </div>
            <h1 className="text-xl font-bold">مجموعة مارجرجس الكشفية</h1>
          </button>
          
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
