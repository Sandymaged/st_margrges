/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ScoutProfile, GeneralSettings } from './types';
import Layout from './components/Layout';
import Auth from './components/Auth';
import ScoutProfileView from './components/ScoutProfile';
import AdminDashboard from './components/AdminDashboard';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ScoutProfile | null>(null);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    logoUrl: '/logo.png',
    scoutGroupName: 'مجموعة مارجرجس الكشفية'
  });
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'profile' | 'dashboard'>('profile');

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'general'), (snapshot) => {
      if (snapshot.exists()) {
        setGeneralSettings(snapshot.data() as GeneralSettings);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as ScoutProfile;
        setProfile(data);
        
        // Super Admin status is checked in components
      } else {
        setProfile(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('Profile fetch error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (!isAuthReady || (user && loading)) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <img 
            src={generalSettings.logoUrl} 
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
        {!user ? (
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
            key="no-profile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center p-12 bg-white rounded-3xl shadow-sm"
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">لم يتم العثور على ملفك الشخصي</h2>
            <p className="text-gray-600">يرجى التواصل مع المسؤول لتفعيل حسابك.</p>
          </motion.div>
        ) : profile.isVerified === false ? (
          <motion.div
            key="pending-verification"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center p-8 bg-white rounded-3xl shadow-xl border border-blue-100"
          >
            <div className="h-20 w-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" 
                alt="WhatsApp" 
                className="h-12 w-12"
              />
            </div>
            <h2 className="text-2xl font-black text-gray-800 mb-4">حسابك قيد المراجعة</h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              شكراً لانضمامك إلينا! يرجى الضغط على الزر أدناه لإرسال رسالة التفعيل للمسؤول عبر واتساب.
            </p>
            
            <button
              onClick={() => {
                const adminNumber = '01555165366';
                const message = `VERIFY_USER_PHONE_${profile.number}`;
                window.open(`https://wa.me/2${adminNumber}?text=${encodeURIComponent(message)}`, '_blank');
              }}
              className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-[0.95]"
            >
              <span>إرسال رسالة التفعيل</span>
            </button>
            
            <button
              onClick={() => auth.signOut()}
              className="mt-6 text-sm font-bold text-gray-400 hover:text-red-500 transition-colors"
            >
              تسجيل الخروج
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {profile.role === 'admin' && view === 'dashboard' ? (
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


