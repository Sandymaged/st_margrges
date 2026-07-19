import React, { useState, useEffect, useCallback } from 'react';
import { usePolling } from './lib/usePolling';
import { useSSE } from './lib/useSSE';
import { ScoutProfile, GeneralSettings } from './types';
import Layout from './components/Layout';
import Auth from './components/Auth';
import ScoutProfileView from './components/ScoutProfile';
import AdminDashboard from './components/AdminDashboard';
import { LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSession, logout as authLogout, getStoredToken, getStoredUser, clearSession } from './authClient';

const SkeletonLoader = () => (
  <div className="space-y-8 animate-pulse" dir="rtl">
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
      <div className="flex flex-col md:flex-row items-center gap-8">
        <div className="h-32 w-32 bg-gray-200 rounded-3xl"></div>
        <div className="flex-1 text-center md:text-right space-y-4 w-full">
          <div className="h-8 bg-gray-200 rounded-lg w-1/3 mx-auto md:mx-0"></div>
          <div className="flex flex-wrap justify-center md:justify-start gap-4">
            <div className="h-10 bg-gray-200 rounded-xl w-32"></div>
            <div className="h-10 bg-gray-200 rounded-xl w-32"></div>
            <div className="h-10 bg-gray-200 rounded-xl w-40"></div>
          </div>
        </div>
      </div>
    </div>
    <div className="space-y-6">
      <div className="h-8 bg-gray-200 rounded-lg w-48"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 h-64"></div>
        ))}
      </div>
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<{ id: string; phone: string; role: string } | null>(null);
  const [profile, setProfile] = useState<ScoutProfile | null>(null);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    logoUrl: '/syncc.png',
    scoutGroupName: 'مجموعة مارجرجس الكشفية'
  });
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'profile' | 'dashboard'>('profile');

  usePolling(async () => {
    try {
      const res = await fetch('/api/app-settings?key=general');
      const result = await res.json();
      if (!res.ok) {
        console.warn('Failed to fetch general settings:', result.error);
        return;
      }
      const value = result.data?.value as GeneralSettings | undefined;
      if (value) {
        setGeneralSettings({ ...value, logoUrl: '/syncc.png' });
      }
    } catch (error) {
      console.warn('Failed to fetch general settings:', error);
    }
  }, 10000);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsAuthReady(true);
      setLoading(false);
      return;
    }

    getSession().then(session => {
      if (session) {
        setUser(session.user);
        setProfile(session.profile);
      } else {
        clearSession();
        setUser(null);
        setProfile(null);
      }
      setIsAuthReady(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user || profile !== null || !getStoredToken()) return;

    const adminEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL;
    const adminPhone = import.meta.env.VITE_SUPER_ADMIN_PHONE;
    const isSuperAdmin =
      (adminEmail && user.phone === adminEmail) ||
      (adminPhone && user.phone === adminPhone);

    if (!isSuperAdmin) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const authToken = getStoredToken();
    fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        function: 'bootstrap_first_admin',
        params: {
          p_name: 'مسؤول النظام',
          p_number: adminPhone || '0',
          p_email: user.phone || adminEmail || '',
        }
      }),
    }).then(res => res.json()).then(() => {
      getSession().then(session => {
        if (session?.profile) {
          setProfile(session.profile);
        }
        setLoading(false);
      });
    });
  }, [user]);

  const handleProfileUpdated = useCallback((event: { userId: string }) => {
    const storedUser = getStoredUser();
    if (!storedUser || storedUser.id !== event.userId) return;

    getSession().then(session => {
      if (session?.profile) {
        setProfile(session.profile);
      }
    });
  }, []);

  useSSE({ onProfileUpdated: handleProfileUpdated }, !!getStoredUser());

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <img
            src="/syncc.png"
            alt="Scouts Logo"
            className="h-24 w-24 animate-pulse object-contain"
          />
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#4285F4] border-t-transparent" />
        </motion.div>
      </div>
    );
  }

  return (
    <Layout user={user} profile={profile} view={view} setView={setView} generalSettings={generalSettings}>
      <AnimatePresence mode="wait">
        {user && loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SkeletonLoader />
          </motion.div>
        ) : !user ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Auth />
          </motion.div>
        ) : !profile ? (
          <motion.div
            key="auth-complete"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen bg-[#F0F2F5] p-4 flex flex-col items-center justify-center"
          >
            <Auth />
            <button
              onClick={() => { authLogout(); setUser(null); setProfile(null); }}
              className="mt-8 text-gray-500 font-bold hover:text-red-600 transition-all flex items-center gap-2"
            >
              <LogOut size={20} />
              <span>تسجيل الخروج والعودة للرئيسية</span>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={`content-${view}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
          >
            {((profile.role === 'admin' || profile.permissions?.canManagePermissions ||
             (import.meta.env.VITE_SUPER_ADMIN_EMAIL && profile.email === import.meta.env.VITE_SUPER_ADMIN_EMAIL) ||
             (import.meta.env.VITE_SUPER_ADMIN_PHONE && profile.number === import.meta.env.VITE_SUPER_ADMIN_PHONE)) && view === 'dashboard') ? (
              <AdminDashboard currentProfile={profile} />
            ) : (
              <ScoutProfileView profile={profile} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
