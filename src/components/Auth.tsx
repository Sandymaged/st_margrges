import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { STAGES, BADGE_OPTIONS, PHONE_REGEX, ScoutProfile, BadgeSettings, Stage } from '../types';
import { 
  LogIn, 
  UserPlus, 
  User as UserIcon, 
  Hash, 
  MapPin, 
  Award, 
  Mail, 
  Lock,
  AlertCircle
} from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Badge Settings
  const [badgeSettings, setBadgeSettings] = useState<BadgeSettings>({
    'أشبال وزهرات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] },
    'كشاف ومرشدات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] },
    'متقدم ورائدات': { badge1: [...BADGE_OPTIONS], badge2: [...BADGE_OPTIONS], badge3: [...BADGE_OPTIONS] }
  });

  // Form fields
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>(STAGES[0]);
  const [badge1, setBadge1] = useState('');
  const [badge2, setBadge2] = useState('');
  const [badge3, setBadge3] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'badges'), (docSnap) => {
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
    return () => unsubscribe();
  }, []);

  // Update badge selections when stage changes or settings load
  useEffect(() => {
    const stageBadges = badgeSettings[stage] || { badge1: [], badge2: [], badge3: [] };
    setBadge1(stageBadges.badge1?.[0] || '');
    setBadge2(stageBadges.badge2?.[0] || '');
    setBadge3(stageBadges.badge3?.[0] || '');
  }, [stage, badgeSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!PHONE_REGEX.test(phone)) {
        throw new Error('رقم الهاتف يجب أن يكون 11 رقماً ويبدأ بـ 010 أو 011 أو 012 أو 015');
      }

      const fakeEmail = `${phone}@scouts.local`;

      if (isLogin) {
        await signInWithEmailAndPassword(auth, fakeEmail, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        const user = userCredential.user;

        // Create profile immediately
        const profile: ScoutProfile = {
          uid: user.uid,
          name,
          email: fakeEmail,
          stage,
          number: phone,
          badges: {
            badge1: { name: badge1, progress: 0, notes: '' },
            badge2: { name: badge2, progress: 0, notes: '' },
            badge3: { name: badge3, progress: 0, notes: '' },
          },
          role: 'scout',
          createdAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'users', user.uid), profile);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('هذا الرقم مسجل بالفعل');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('رقم الهاتف أو كلمة المرور غير صحيحة');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('عذراً، تسجيل الدخول غير مفعل. يرجى تفعيله من لوحة تحكم Firebase (Authentication -> Sign-in method -> Email/Password).');
      } else {
        setError(err.message || 'حدث خطأ ما، يرجى المحاولة مرة أخرى');
      }
    } finally {
      setLoading(false);
    }
  };

  const currentStageBadges = badgeSettings[stage] || { badge1: [], badge2: [], badge3: [] };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-12">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-2xl w-full border border-gray-100">
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="Scouts Logo" 
            className="h-20 w-20 mx-auto mb-4 object-contain"
          />
          <h2 className="text-3xl font-black text-gray-800">
            {isLogin ? 'تسجيل الدخول' : 'إنشاء حساب كشاف'}
          </h2>
          <p className="text-gray-500 mt-2">
            {isLogin ? 'أهلاً بك مجدداً في مجموعة مارجرجس الكشفية' : 'سجل بياناتك للانضمام إلينا'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-r-4 border-red-500 text-red-700 flex items-center gap-3 rounded-xl">
            <AlertCircle size={20} />
            <span className="text-sm font-bold">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Common Fields */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <Hash size={16} className="text-[#4285F4]" /> رقم الهاتف (11 رقم)
              </label>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all"
                placeholder="01xxxxxxxxx"
                maxLength={11}
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <Lock size={16} className="text-[#4285F4]" /> كلمة المرور
              </label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all"
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {!isLogin && (
              <>
                {/* Signup Only Fields */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    <UserIcon size={16} className="text-[#4285F4]" /> الاسم بالكامل
                  </label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all"
                    placeholder="أدخل اسمك"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    <MapPin size={16} className="text-[#4285F4]" /> المرحلة
                  </label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value as Stage)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all bg-white"
                  >
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">شارة 1</label>
                    <select
                      value={badge1}
                      onChange={(e) => setBadge1(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none bg-white text-sm"
                      required
                    >
                      {currentStageBadges.badge1?.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">شارة 2</label>
                    <select
                      value={badge2}
                      onChange={(e) => setBadge2(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none bg-white text-sm"
                      required
                    >
                      {currentStageBadges.badge2?.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">شارة 3</label>
                    <select
                      value={badge3}
                      onChange={(e) => setBadge3(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none bg-white text-sm"
                      required
                    >
                      {currentStageBadges.badge3?.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="space-y-4">
            <button
              disabled={loading || (!isLogin && (!currentStageBadges.badge1?.length || !currentStageBadges.badge2?.length || !currentStageBadges.badge3?.length))}
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-[#4285F4] hover:bg-[#357ABD] text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/50 border-t-white" />
              ) : (
                <>
                  {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
                  <span>{isLogin ? 'دخول' : 'إنشاء الحساب'}</span>
                </>
              )}
            </button>

            {isLogin && (
              <button
                type="button"
                onClick={() => {
                  const adminNumber = '01552698433';
                  const message = `أهلاً، أنا عضو في الكشافة ونسيت كلمة المرور الخاصة بي. رقم هاتفي هو: ${phone}`;
                  window.open(`https://wa.me/2${adminNumber}?text=${encodeURIComponent(message)}`, '_blank');
                }}
                className="w-full py-2 text-gray-500 font-bold hover:text-[#4285F4] transition-all text-sm"
              >
                نسيت كلمة المرور؟ تواصل مع المسؤول
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-[#4285F4] font-bold hover:underline"
          >
            {isLogin ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب بالفعل؟ سجل دخولك'}
          </button>
        </div>
      </div>
    </div>
  );
}
