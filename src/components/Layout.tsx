import React from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LogOut, User as UserIcon, Home, LayoutDashboard } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  profile: any;
  view?: 'profile' | 'dashboard';
  setView?: (view: 'profile' | 'dashboard') => void;
}

export default function Layout({ children, user, profile, view, setView }: LayoutProps) {
  const handleLogout = () => signOut(auth);

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-[#4285F4] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={() => setView && setView('profile')} 
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img 
              src="/logo.png" 
              alt="Scouts Logo" 
              className="h-10 w-10 object-contain bg-white rounded-full p-1"
            />
            <h1 className="text-xl font-bold">مجموعة مارجرجس الكشفية</h1>
          </button>
          
          <div className="flex items-center gap-4">
            {profile?.role === 'admin' && setView && (
              <button 
                onClick={() => setView(view === 'dashboard' ? 'profile' : 'dashboard')}
                className={`p-2 rounded-full transition-colors flex items-center gap-2 ${view === 'dashboard' ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
                title="لوحة التحكم"
              >
                <LayoutDashboard size={18} />
                <span className="hidden sm:inline text-sm font-medium">لوحة التحكم</span>
              </button>
            )}

            <button 
              onClick={() => setView && setView('profile')}
              className={`p-2 rounded-full transition-colors flex items-center gap-2 ${view === 'profile' ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
              title="الرئيسية"
            >
              <Home size={18} />
              <span className="hidden sm:inline text-sm font-medium">الرئيسية</span>
            </button>
            
            {user && (
              <>
                <div className="flex items-center gap-2">
                  <div className="bg-white/20 p-1.5 rounded-full">
                    <UserIcon size={18} />
                  </div>
                  <span className="hidden sm:inline text-sm font-medium">
                    {profile?.name || profile?.number || user.phoneNumber || 'مستخدم'}
                  </span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
                  title="تسجيل الخروج"
                >
                  <LogOut size={18} />
                </button>
              </>
            )}
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
