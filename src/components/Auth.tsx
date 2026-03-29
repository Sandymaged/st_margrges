import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { STAGES, PHONE_REGEX, ScoutProfile, BadgeSettings, Stage, DEFAULT_CATEGORIES, GeneralSettings } from '../types';
import { 
  LogIn, 
  UserPlus, 
  User as UserIcon, 
  Hash, 
  MapPin, 
  Lock,
  AlertCircle,
  MessageSquare,
  LogOut
} from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    logoUrl: '/logo.png',
    scoutGroupName: 'مجموعة مارجرجس الكشفية'
  });

  // Badge Settings
  const [badgeSettings, setBadgeSettings] = useState<BadgeSettings>({
    categories: DEFAULT_CATEGORIES,
    requirements: {}
  });

  // Form fields
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>(STAGES[0]);
  const [badge1, setBadge1] = useState('');
  const [badge2, setBadge2] = useState('');
  const [badge3, setBadge3] = useState('');
  
  const [selectedCategory2, setSelectedCategory2] = useState('');
  const [selectedCategory3, setSelectedCategory3] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'badges'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBadgeSettings({
          categories: data.categories || DEFAULT_CATEGORIES,
          requirements: data.requirements || {}
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setGeneralSettings(docSnap.data() as GeneralSettings);
      }
    });
    return () => unsubscribe();
  }, []);

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

  // Update badge selections when settings or stage/category change
  useEffect(() => {
    const badges1 = getAvailableBadges('scout', stage);
    if (!badges1.includes(badge1)) {
      setBadge1("");
    }
    
    if (selectedCategory2) {
      const badges2 = getAvailableBadges(selectedCategory2, stage);
      if (!badges2.includes(badge2)) {
        setBadge2("");
      }
    } else {
      setBadge2("");
    }
    
    if (selectedCategory3) {
      const badges3 = getAvailableBadges(selectedCategory3, stage);
      if (!badges3.includes(badge3)) {
        setBadge3("");
      }
    } else {
      setBadge3("");
    }
  }, [badgeSettings, stage, selectedCategory2, selectedCategory3]);

  useEffect(() => {
    if (auth.currentUser) {
      setIsCompletingProfile(true);
      setIsLogin(false);
      // Pre-fill phone if possible from email
      const emailPhone = auth.currentUser.email?.split('@')[0];
      if (emailPhone && PHONE_REGEX.test(emailPhone)) {
        setPhone(emailPhone);
      }
    }
  }, []);

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
        // Sign Up or Complete Profile Flow
        if ((badge1 && badge2 && badge1 === badge2) || 
            (badge1 && badge3 && badge1 === badge3) || 
            (badge2 && badge3 && badge2 === badge3)) {
          throw new Error('لا يمكن اختيار نفس الشارة أكثر من مرة');
        }

        let user;
        if (isCompletingProfile && auth.currentUser) {
          user = auth.currentUser;
        } else {
          // Create User in Auth
          const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
          user = userCredential.user;
        }

        // Create profile
        const profile: ScoutProfile = {
          uid: user.uid,
          name,
          email: fakeEmail,
          stage,
          number: phone,
          badges: {
            badge1: { name: badge1, progress: 0, notes: '', completedRequirements: [] },
            badge2: { name: badge2, progress: 0, notes: '', completedRequirements: [] },
            badge3: { name: badge3, progress: 0, notes: '', completedRequirements: [] },
          },
          role: 'scout',
          isVerified: true, // Set to true by default
          createdAt: serverTimestamp(),
          joinDate: serverTimestamp(),
        };

        try {
          await setDoc(doc(db, 'users', user.uid), profile);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('هذا الرقم مسجل بالفعل');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('رقم الهاتف أو كلمة المرور غير صحيحة');
      } else {
        setError(err.message || 'حدث خطأ ما، يرجى المحاولة مرة أخرى');
      }
    } finally {
      setLoading(false);
    }
  };

  const scoutBadges = badgeSettings.categories.find(c => c.id === 'scout')?.badges || [];
  const allBadges = badgeSettings.categories.flatMap(c => c.badges);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-12">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-2xl w-full border border-gray-100">
        <div className="text-center mb-8">
          <div className="h-20 w-20 mx-auto mb-4 bg-white rounded-full p-2 shadow-inner flex items-center justify-center overflow-hidden border border-gray-100">
            <img 
              src={generalSettings.logoUrl} 
              alt="Scouts Logo" 
              className="h-full w-full object-contain"
            />
          </div>
          <h2 className="text-3xl font-black text-gray-800">
            {isCompletingProfile ? 'إكمال بيانات الملف الشخصي' : isLogin ? 'تسجيل الدخول' : 'إنشاء حساب كشاف'}
          </h2>
          <p className="text-gray-500 mt-2">
            {isCompletingProfile ? 'يرجى إكمال بياناتك للمتابعة' : isLogin ? `أهلاً بك مجدداً في ${generalSettings.scoutGroupName}` : 'سجل بياناتك للانضمام إلينا'}
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
            {isLogin ? (
              <>
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
              </>
            ) : (
              <>
                {/* Signup Fields */}
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
                    <Hash size={16} className="text-[#4285F4]" /> رقم الهاتف (11 رقم)
                  </label>
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none transition-all disabled:bg-gray-50"
                    placeholder="01xxxxxxxxx"
                    maxLength={11}
                    disabled={isCompletingProfile}
                  />
                </div>

                {!isCompletingProfile && (
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
                )}

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

                <div className="md:col-span-2 space-y-6 pt-4 border-t">
                  <h4 className="text-sm font-black text-gray-700">اختر شاراتك:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Badge 1 */}
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">شارة 1 (كشفية)</label>
                        <select
                          value={badge1}
                          onChange={(e) => setBadge1(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white font-bold text-gray-700 text-sm shadow-sm"
                          required
                        >
                          <option value="">-- اختر شارة --</option>
                          {getAvailableBadges('scout', stage).map(b => <option key={b} value={b} disabled={b === badge2 || b === badge3}>{b}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Badge 2 */}
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">تصنيف شارة 2</label>
                        <select
                          value={selectedCategory2}
                          onChange={(e) => setSelectedCategory2(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none bg-gray-50 text-xs font-bold"
                        >
                          <option value="">-- اختر تصنيف --</option>
                          {(badgeSettings.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">شارة 2</label>
                        <select
                          value={badge2}
                          onChange={(e) => setBadge2(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white font-bold text-gray-700 text-sm shadow-sm disabled:bg-gray-50"
                          required
                          disabled={!selectedCategory2}
                        >
                          <option value="">-- اختر شارة --</option>
                          {selectedCategory2 && getAvailableBadges(selectedCategory2, stage).map(b => <option key={b} value={b} disabled={b === badge1 || b === badge3}>{b}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Badge 3 */}
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">تصنيف شارة 3</label>
                        <select
                          value={selectedCategory3}
                          onChange={(e) => setSelectedCategory3(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none bg-gray-50 text-xs font-bold"
                        >
                          <option value="">-- اختر تصنيف --</option>
                          {(badgeSettings.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">شارة 3</label>
                        <select
                          value={badge3}
                          onChange={(e) => setBadge3(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white font-bold text-gray-700 text-sm shadow-sm disabled:bg-gray-50"
                          required
                          disabled={!selectedCategory3}
                        >
                          <option value="">-- اختر شارة --</option>
                          {selectedCategory3 && getAvailableBadges(selectedCategory3, stage).map(b => <option key={b} value={b} disabled={b === badge1 || b === badge2}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="space-y-4">
            <button
              disabled={loading || (!isLogin && (!badge1 || !badge2 || !badge3))}
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-[#4285F4] hover:bg-[#357ABD] text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/50 border-t-white" />
              ) : (
                <>
                  {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
                  <span>{isCompletingProfile ? 'حفظ البيانات' : isLogin ? 'دخول' : 'إنشاء الحساب'}</span>
                </>
              )}
            </button>

            {isLogin && (
              <button
                type="button"
                onClick={() => {
                  const adminNumber = '01555165366';
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

        {!isCompletingProfile && (
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
        )}
      </div>
    </div>
  );
}
