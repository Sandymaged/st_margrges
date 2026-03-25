/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ScoutProfile } from './types';
import Layout from './components/Layout';
import Auth from './components/Auth';
import ScoutProfileView from './components/ScoutProfile';
import AdminDashboard from './components/AdminDashboard';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ScoutProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'profile' | 'dashboard'>('profile');

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
        
        // Auto-upgrade admin based on phone number
        if (data.number === '01552698433' && data.role !== 'admin') {
          updateDoc(doc(db, 'users', user.uid), { role: 'admin' }).catch(console.error);
        }

        // Auto-switch to dashboard for admins on first load if they want, 
        // but let's keep it on profile by default or let them toggle.
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
            src="/logo.png" 
            alt="Scouts Logo" 
            className="h-24 w-24 animate-pulse object-contain"
          />
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#4285F4] border-t-transparent" />
        </motion.div>
      </div>
    );
  }

  return (
    <Layout user={user} profile={profile} view={view} setView={setView}>
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


