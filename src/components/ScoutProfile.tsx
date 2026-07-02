import React, { useState, useEffect, useRef } from 'react';
import { ScoutProfile, BadgeSettings, GeneralSettings } from '../types';
import BadgeProgressCard from './BadgeProgressCard';
import { User as UserIcon, MapPin, Hash, LayoutGrid, Calendar, CheckCircle2, XCircle, DollarSign, Download, MessageCircle, Award, Trash2, Smartphone, X, Share2, MoreVertical, PlusSquare, Info } from 'lucide-react';
import { doc, onSnapshot, updateDoc, collection, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';

interface ScoutProfileViewProps {
  profile: ScoutProfile;
}

export default function ScoutProfileView({ profile }: ScoutProfileViewProps) {
  const [badgeSettings, setBadgeSettings] = useState<BadgeSettings>({
    categories: [],
    requirements: {}
  });
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    logoUrl: '/syncc.png',
    scoutGroupName: 'مجموعة مارجرجس الكشفية',
    badgePrice: 30,
    attendanceDates: []
  });
  const [cancelBadgeConfirm, setCancelBadgeConfirm] = useState<{key: 'badge1' | 'badge2' | 'badge3', name: string} | null>(null);
  const [isCancelChecked, setIsCancelChecked] = useState(false);
  
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [guidePlatform, setGuidePlatform] = useState<'android' | 'ios'>('android');
  
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const isDismissed = localStorage.getItem('dismissedInstallBanner');
    
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    
    // Always show in development or if it's mobile + not standalone + not dismissed
    if (isMobile && !isStandalone && !isDismissed) {
      setShowInstallBanner(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        setDeferredPrompt(null);
        setShowInstallBanner(false);
      } catch (err) {
        console.error("Install prompt error:", err);
        setShowInstallGuide(true);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  const handleDismissInstallBanner = () => {
    localStorage.setItem('dismissedInstallBanner', 'true');
    setShowInstallBanner(false);
  };

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'badges'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBadgeSettings({
          categories: data.categories || [],
          requirements: data.requirements || {},
          requirementMaxScores: data.requirementMaxScores || {},
          requirementCategories: data.requirementCategories || {},
          groupLinks: data.groupLinks || {}
        });
      }
    }, (error) => {
      console.warn("Failed to fetch badges settings:", error);
    });

    const unsubGeneral = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GeneralSettings;
        setGeneralSettings({
          ...data,
          logoUrl: '/syncc.png',
          scoutGroupName: data.scoutGroupName || 'مجموعة مارجرجس الكشفية',
          badgePrice: data.badgePrice || 30,
          attendanceDates: data.attendanceDates || []
        });
      }
    }, (error) => {
      console.warn("Failed to fetch general settings:", error);
    });
    
    return () => {
      unsubSettings();
      unsubGeneral();
    };
  }, [profile.uid]);

  const handleCancelBadgeRequest = (badgeKey: 'badge1' | 'badge2' | 'badge3', badgeName: string) => {
    setCancelBadgeConfirm({ key: badgeKey, name: badgeName });
    setIsCancelChecked(false);
  };

  const executeCancelBadge = async () => {
    if (!cancelBadgeConfirm) return;
    
    // Alert the user one more time as a final check
    if (!window.confirm('هذا الأمر غير قابل للرجوع. هل أنت متأكد من إلغاء الشارة؟')) {
      return;
    }

    try {
      const userRef = doc(db, 'users', profile.uid);
      const updatedBadges = { ...profile.badges };
      
      // Remove the badge data
      updatedBadges[cancelBadgeConfirm.key] = {
        name: '',
        completedRequirements: [],
        requirementScores: {}
      };

      await updateDoc(userRef, { badges: updatedBadges });
      setCancelBadgeConfirm(null);
      alert('تم إلغاء الشارة بنجاح');
    } catch (error) {
      console.error('Error canceling badge:', error);
      alert('حدث خطأ أثناء إلغاء الشارة');
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'غير متوفر';
    let date: Date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp._seconds) {
      date = new Date(timestamp._seconds * 1000);
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return 'غير متوفر';

    return date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getScoutBadgeRequirements = (badgeName: string, stage: string) => {
    const badgeReqs = (badgeSettings.requirements || {})[badgeName] || {};
    if (Array.isArray(badgeReqs)) {
      return badgeReqs;
    }
    return [
      ...(badgeReqs.all || []),
      ...(badgeReqs[stage as any] || [])
    ];
  };

  const handleDownloadQR = () => {
    if (!qrRef.current) return;
    
    const qrCanvas = qrRef.current;
    
    // Create an offscreen canvas to compose the final image
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#f0f4f8');
    gradient.addColorStop(1, '#d9e2ec');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative circle
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 200, 250, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(66, 133, 244, 0.05)';
    ctx.fill();

    // Text: Scout Name
    ctx.fillStyle = '#102a43';
    ctx.font = 'bold 42px Tajawal, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(profile.name, canvas.width / 2, 120);

    // Text: Stage and Number
    ctx.fillStyle = '#486581';
    ctx.font = 'bold 24px Tajawal, system-ui, sans-serif';
    ctx.fillText(`المرحلة: ${profile.stage} | الرقم: ${profile.number}`, canvas.width / 2, 170);

    // Draw QR Code Background (White Rounded Square)
    const qrSize = 340;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = 280;
    
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent'; // Reset shadow

    // Draw the actual QR code from the hidden canvas
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // Footer Text
    ctx.fillStyle = '#829ab1';
    ctx.font = 'bold 18px Tajawal, system-ui, sans-serif';
    ctx.fillText(generalSettings.scoutGroupName, canvas.width / 2, canvas.height - 50);

    // Trigger download
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `كود_حضور_${profile.name.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDismissWelcome = async () => {
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        showWelcomeGroups: false
      });
    } catch (error) {
      console.error('Error dismissing welcome modal:', error);
    }
  };

  const normalizeString = (str: string) => {
    return str.replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا').replace(/ة/g, 'ه').replace(/ي/g, 'ى');
  };

  const getGroupLink = (badgeName: string, stage: string) => {
    if (badgeSettings.groupLinks?.[badgeName]?.[stage]) {
      return badgeSettings.groupLinks[badgeName][stage];
    }
    const normalizedBadge = normalizeString(badgeName.trim());
    const matchedKey = Object.keys(badgeSettings.groupLinks || {}).find(k => normalizeString(k.trim()) === normalizedBadge);
    if (matchedKey && badgeSettings.groupLinks?.[matchedKey]?.[stage]) {
      return badgeSettings.groupLinks[matchedKey][stage];
    }
    return null;
  };

  const checkBadgePassStatus = (badgeName: string, stage: string, completedReqs: string[], requirementScores: Record<string, number> = {}) => {
    const reqs = getScoutBadgeRequirements(badgeName, stage);
    if (reqs.length === 0) return false;

    // 1. All items must be submitted
    const allSubmitted = reqs.every(req => completedReqs.includes(req));
    if (!allSubmitted) return false;

    // Group requirements by category
    const reqsByCategory: Record<string, string[]> = {};
    reqs.forEach(req => {
      const cat = badgeSettings.requirementCategories?.[badgeName]?.[req] || 'عام';
      if (!reqsByCategory[cat]) reqsByCategory[cat] = [];
      reqsByCategory[cat].push(req);
    });

    // 2 & 3. Check each category
    for (const cat in reqsByCategory) {
      const catReqs = reqsByCategory[cat];
      let catTotalScore = 0;
      let catMaxScore = 0;

      catReqs.forEach(req => {
        const maxScore = badgeSettings.requirementMaxScores?.[badgeName]?.[req] || 0;
        if (maxScore > 0) {
          catMaxScore += maxScore;
          const score = requirementScores[req] || 0;
          if (score >= maxScore * 0.5) {
            catTotalScore += score;
          }
        } else {
          catMaxScore += 1;
          catTotalScore += completedReqs.includes(req) ? 1 : 0;
        }
      });

      if (catTotalScore < catMaxScore * 0.5) return false;
    }

    return true;
  };

  return (
    <div className="space-y-8">
      {/* App Install Alert Banner */}
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 text-white p-6 rounded-3xl shadow-lg border border-white/10 relative flex flex-col md:flex-row items-center justify-between gap-6" dir="rtl">
              <button 
                onClick={handleDismissInstallBanner}
                className="absolute top-4 left-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-all"
                title="إغلاق"
              >
                <X size={16} />
              </button>
              
              <div className="flex items-center gap-4 text-right">
                <div className="p-4 bg-white/10 rounded-2xl text-white shadow-inner flex-shrink-0">
                  <Smartphone size={32} className="animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xl font-black mb-1">تنزيل التطبيق على هاتفك 📱</h4>
                  <p className="text-sm text-blue-50 font-bold max-w-xl">
                    تقدر تنزل موقع مجموعة مارجرجس الكشفية وتستخدمه كأبلكيشن سريع ومباشر على موبايلك عشان تتابع شاراتك وحضورك بسهولة ومن غير ما تفتح المتصفح كل مرة!
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
                <button
                  onClick={handleInstallApp}
                  className="px-6 py-3 bg-white text-indigo-600 font-black rounded-xl hover:bg-indigo-50 active:scale-[0.98] transition-all flex items-center gap-2 text-sm shadow-sm"
                >
                  <Download size={16} />
                  <span>تنزيل التطبيق الآن</span>
                </button>
                <button
                  onClick={() => {
                    setShowInstallGuide(true);
                  }}
                  className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex items-center gap-2 text-sm border border-white/20"
                >
                  <Info size={16} />
                  <span>طريقة التثبيت يدوياً</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install Guide Modal */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 border border-gray-100 text-right">
            <button
              onClick={() => setShowInstallGuide(false)}
              className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-50 text-[#4285F4] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Smartphone size={32} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">كيفية تثبيت التطبيق</h3>
              <p className="text-gray-500 font-bold text-sm">خطوات بسيطة لإضافة الموقع كشاشة رئيسية على هاتفك</p>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-gray-100 mb-6 bg-gray-50 p-1.5 rounded-2xl">
              <button
                onClick={() => setGuidePlatform('android')}
                className={`flex-1 py-3 text-center font-black rounded-xl text-sm transition-all ${
                  guidePlatform === 'android' 
                    ? 'bg-white text-[#4285F4] shadow-sm' 
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                موبايل أندرويد (Chrome)
              </button>
              <button
                onClick={() => setGuidePlatform('ios')}
                className={`flex-1 py-3 text-center font-black rounded-xl text-sm transition-all ${
                  guidePlatform === 'ios' 
                    ? 'bg-white text-[#4285F4] shadow-sm' 
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                آيفون وآيباد (Safari)
              </button>
            </div>

            {/* Android Instructions */}
            {guidePlatform === 'android' ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                    ١
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-base mb-1">افتح المتصفح</h4>
                    <p className="text-sm text-gray-500 font-medium">تأكد أنك تفتح الموقع باستخدام متصفح <span className="font-bold text-gray-700">جوجل كروم (Chrome)</span>.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                    ٢
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-base mb-1">اضغط على القائمة</h4>
                    <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5 flex-wrap">
                      اضغط على زر النقاط الثلاثة المجاورة لعنوان الموقع <span className="bg-white px-2 py-1 rounded border border-gray-200 text-gray-700 flex items-center justify-center"><MoreVertical size={14} /></span> في أعلى أو أسفل الشاشة.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                    ٣
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-base mb-1">تثبيت التطبيق</h4>
                    <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5 flex-wrap">
                      اختر <span className="font-bold text-gray-800">"تثبيت التطبيق" (Install App)</span> أو <span className="font-bold text-gray-800">"إضافة إلى الشاشة الرئيسية"</span> من القائمة.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              // iOS Instructions
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                    ١
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-base mb-1">افتح متصفح Safari</h4>
                    <p className="text-sm text-gray-500 font-medium">افتح الموقع باستخدام متصفح <span className="font-bold text-gray-700">سافاري الرسمي (Safari)</span> على جهاز الآيفون الخاص بك.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                    ٢
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-base mb-1">اضغط على زر المشاركة</h4>
                    <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5 flex-wrap">
                      اضغط على زر <span className="font-bold text-gray-800">المشاركة (Share)</span> الموجود في شريط الأدوات بالأسفل <span className="bg-white p-1 rounded border border-gray-200 text-gray-700"><Share2 size={14} className="inline" /></span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                    ٣
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-base mb-1">إضافة للشاشة الرئيسية</h4>
                    <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5 flex-wrap">
                      مرر للأسفل واختر <span className="font-bold text-gray-800">"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</span> <span className="bg-white p-1 rounded border border-gray-200 text-gray-700"><PlusSquare size={14} className="inline" /></span> ثم اضغط "إضافة".
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full mt-6 bg-[#4285F4] hover:bg-blue-600 text-white font-black py-4 rounded-2xl transition-all shadow-md shadow-blue-100"
            >
              تم، شكراً لك!
            </button>
          </div>
        </div>
      )}

      {/* Welcome Groups Modal */}
      <AnimatePresence>
        {profile.showWelcomeGroups && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100"
            >
              <div className="bg-gradient-to-l from-[#4285F4] to-[#34A853] p-8 text-white relative">
                <h3 className="text-2xl font-black text-center">أهلاً بك في {generalSettings.scoutGroupName}!</h3>
                <p className="text-center text-blue-50 mt-2 font-medium">تم إنشاء حسابك بنجاح. يرجى الانضمام لمجموعات الشارات الخاصة بك:</p>
              </div>
              <div className="p-8 space-y-6 text-right" dir="rtl">
                <div className="space-y-4">
                  {[profile.badges.badge1, profile.badges.badge2, profile.badges.badge3].map((b, i) => {
                    if (!b || !b.name) return null;
                    const link = getGroupLink(b.name, profile.stage);
                    if (!link) return null;
                    
                    return (
                      <div key={i} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="font-bold text-gray-800">
                          شارة {b.name}
                        </div>
                        <a 
                          href={link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-6 py-2.5 bg-[#4285F4] text-white rounded-xl hover:bg-blue-600 transition-colors font-bold text-sm text-center w-full sm:w-auto shadow-sm whitespace-nowrap"
                        >
                          انضمام للجروب
                        </a>
                      </div>
                    );
                  })}
                  
                  {/* If no links are available for any of their badges */}
                  {![profile.badges.badge1, profile.badges.badge2, profile.badges.badge3].some((b) => b && b.name && getGroupLink(b.name, profile.stage)) && (
                    <div className="text-center text-gray-500 font-bold p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      لا توجد مجموعات متاحة لشاراتك حالياً.
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleDismissWelcome}
                  className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black py-4 rounded-2xl transition-all"
                >
                  حسناً، لقد انضممت
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Header Card */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="h-32 w-32 bg-gradient-to-br from-[#4285F4] to-[#34A853] rounded-3xl flex items-center justify-center text-white shadow-lg">
            <UserIcon size={64} />
          </div>
          
          <div className="flex-1 text-center md:text-right space-y-4">
            <h2 className="text-3xl font-black text-gray-800">{profile.name}</h2>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-4">
              <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                <MapPin size={18} className="text-[#4285F4]" />
                <span className="text-gray-600 font-medium">المرحلة:</span>
                <span className="text-gray-800 font-bold">{profile.stage}</span>
              </div>
              
              <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                <Hash size={18} className="text-[#4285F4]" />
                <span className="text-gray-600 font-medium">الرقم:</span>
                <span className="text-gray-800 font-bold">{profile.number}</span>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                <Calendar size={18} className="text-[#4285F4]" />
                <span className="text-gray-600 font-medium">تاريخ الانضمام:</span>
                <span className="text-gray-800 font-bold">{formatDate(profile.joinDate || profile.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex flex-col items-center gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <QRCodeSVG value={profile.uid} size={150} level="H" includeMargin={false} />
            <div className="flex flex-col items-center gap-2 w-full">
              <span className="text-xs text-gray-500 font-bold">كود الحضور</span>
              <button 
                onClick={handleDownloadQR}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#4285F4] text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors w-full"
              >
                <Download size={14} />
                تحميل الكود
              </button>
              <button 
                onClick={() => setShowInstallGuide(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors w-full"
              >
                <Smartphone size={14} />
                تثبيت كـتطبيق
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile QR Code */}
        <div className="mt-6 md:hidden flex flex-col items-center gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
          <QRCodeSVG value={profile.uid} size={200} level="H" includeMargin={false} />
          <div className="flex flex-col items-center gap-3 w-full">
            <span className="text-sm text-gray-500 font-bold">كود الحضور الخاص بك</span>
            <button 
              onClick={handleDownloadQR}
              className="flex items-center justify-center gap-2 px-4 py-3 w-full max-w-[200px] bg-[#4285F4] text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-sm"
            >
              <Download size={18} />
              تحميل صورة الكود
            </button>
            <button 
              onClick={() => setShowInstallGuide(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 w-full max-w-[200px] bg-indigo-50 text-indigo-600 text-sm font-bold rounded-xl hover:bg-indigo-100 transition-colors shadow-sm"
            >
              <Smartphone size={18} />
              تثبيت كـتطبيق
            </button>
          </div>
        </div>

        {/* Hidden Canvas for Download */}
        <div className="hidden">
          <QRCodeCanvas 
            value={profile.uid} 
            size={340} 
            level="H" 
            includeMargin={false}
            ref={qrRef}
          />
        </div>
      </div>

      {/* Badges Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <LayoutGrid className="text-[#4285F4]" size={24} />
          <h3 className="text-2xl font-bold text-gray-800">تقدم الشارات</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {profile.badges.badge1?.name && (
            <BadgeProgressCard 
              label="شارة 1" 
              badge={profile.badges.badge1} 
              requirements={getScoutBadgeRequirements(profile.badges.badge1.name, profile.stage)} 
              requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.badges.badge1.name] || {}}
              requirementCategories={badgeSettings.requirementCategories?.[profile.badges.badge1.name] || {}}
              onCancelBadge={() => handleCancelBadgeRequest('badge1', profile.badges.badge1.name)}
              showResults={generalSettings.showResults}
              isPassed={checkBadgePassStatus(profile.badges.badge1.name, profile.stage, profile.badges.badge1.completedRequirements || [], profile.badges.badge1.requirementScores || {})}
            />
          )}
          {profile.badges.badge2?.name && (
            <BadgeProgressCard 
              label="شارة 2" 
              badge={profile.badges.badge2} 
              requirements={getScoutBadgeRequirements(profile.badges.badge2.name, profile.stage)} 
              requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.badges.badge2.name] || {}}
              requirementCategories={badgeSettings.requirementCategories?.[profile.badges.badge2.name] || {}}
              onCancelBadge={() => handleCancelBadgeRequest('badge2', profile.badges.badge2.name)}
              showResults={generalSettings.showResults}
              isPassed={checkBadgePassStatus(profile.badges.badge2.name, profile.stage, profile.badges.badge2.completedRequirements || [], profile.badges.badge2.requirementScores || {})}
            />
          )}
          {profile.badges.badge3?.name && (
            <BadgeProgressCard 
              label="شارة 3" 
              badge={profile.badges.badge3} 
              requirements={getScoutBadgeRequirements(profile.badges.badge3.name, profile.stage)} 
              requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.badges.badge3.name] || {}}
              requirementCategories={badgeSettings.requirementCategories?.[profile.badges.badge3.name] || {}}
              onCancelBadge={() => handleCancelBadgeRequest('badge3', profile.badges.badge3.name)}
              showResults={generalSettings.showResults}
              isPassed={checkBadgePassStatus(profile.badges.badge3.name, profile.stage, profile.badges.badge3.completedRequirements || [], profile.badges.badge3.requirementScores || {})}
            />
          )}
          {(() => {
            const registeredBadges = [profile.badges.badge1, profile.badges.badge2, profile.badges.badge3].filter(b => b && b.name);
            const completedBadgesCount = registeredBadges.filter(b => {
              const reqs = getScoutBadgeRequirements(b.name, profile.stage);
              return reqs.length > 0 && b.completedRequirements?.length === reqs.length;
            }).length;
            
            const canAddBadge = registeredBadges.length < 2 || (registeredBadges.length === 2 && completedBadgesCount >= 1);
            
            if (registeredBadges.length >= 3) return null;
            
            if (!canAddBadge) {
              return (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl p-6 bg-gray-50 text-center gap-2">
                  <span className="text-gray-500 font-bold">لا يمكنك إضافة شارة ثالثة</span>
                  <span className="text-sm text-gray-400">يجب عليك إكمال بنود إحدى الشارات الحالية أولاً (أن يتم تسليم جميع البنود)</span>
                </div>
              );
            }
            
            return (
            <div className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl p-6">
              <select
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#4285F4] outline-none text-gray-700"
                onChange={async (e) => {
                  if (!e.target.value) return;
                  const newBadge = { name: e.target.value, progress: 0, notes: '' };
                  const updatedBadges = { ...profile.badges };
                  if (!updatedBadges.badge1.name) updatedBadges.badge1 = newBadge;
                  else if (!updatedBadges.badge2.name) updatedBadges.badge2 = newBadge;
                  else updatedBadges.badge3 = newBadge;
                  
                  await updateDoc(doc(db, 'users', profile.uid), { badges: updatedBadges });
                }}
                defaultValue=""
              >
                <option value="" disabled>تقديم على شارة أخرى</option>
                {badgeSettings.categories.map(category => {
                  const allBadges = new Set([...(category.badges || [])]);
                  if (category.stageBadges) {
                    Object.values(category.stageBadges).forEach((badges: any) => {
                      if (badges) badges.forEach((b: string) => allBadges.add(b));
                    });
                  }
                  
                  return (
                  <optgroup key={category.id || category.name} label={category.name}>
                    {Array.from(allBadges).map(badge => {
                      const isSelected = [profile.badges.badge1.name, profile.badges.badge2.name, profile.badges.badge3.name].includes(badge);
                      const hasPassed = profile.passedBadges?.includes(badge);
                      const isDisabled = isSelected || hasPassed;
                      
                      return (
                        <option 
                          key={badge} 
                          value={badge} 
                          disabled={isDisabled}
                          className={isDisabled ? 'text-gray-400 font-medium' : 'text-gray-900'}
                        >
                          {badge} {hasPassed ? '(مجتازة)' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                )})}
              </select>
            </div>
            );
          })()}
        </div>
      </div>

      {/* Past Waves Section */}
      {profile.pastWaves?.wave1 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <Award className="text-[#34A853]" size={24} />
            <h3 className="text-2xl font-bold text-gray-800">أرشيف الشارات (الدفعة الأولى)</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {profile.pastWaves.wave1.badges.badge1?.name && (
              <BadgeProgressCard 
                label="شارة 1 (سابقة)" 
                badge={profile.pastWaves.wave1.badges.badge1} 
                requirements={getScoutBadgeRequirements(profile.pastWaves.wave1.badges.badge1.name, profile.stage)} 
                requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.pastWaves.wave1.badges.badge1.name] || {}}
                requirementCategories={badgeSettings.requirementCategories?.[profile.pastWaves.wave1.badges.badge1.name] || {}}
                showResults={true}
                isPastWave={true}
                isPassed={checkBadgePassStatus(profile.pastWaves.wave1.badges.badge1.name, profile.stage, profile.pastWaves.wave1.badges.badge1.completedRequirements || [], profile.pastWaves.wave1.badges.badge1.requirementScores || {})}
              />
            )}
            {profile.pastWaves.wave1.badges.badge2?.name && (
              <BadgeProgressCard 
                label="شارة 2 (سابقة)" 
                badge={profile.pastWaves.wave1.badges.badge2} 
                requirements={getScoutBadgeRequirements(profile.pastWaves.wave1.badges.badge2.name, profile.stage)} 
                requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.pastWaves.wave1.badges.badge2.name] || {}}
                requirementCategories={badgeSettings.requirementCategories?.[profile.pastWaves.wave1.badges.badge2.name] || {}}
                showResults={true}
                isPastWave={true}
                isPassed={checkBadgePassStatus(profile.pastWaves.wave1.badges.badge2.name, profile.stage, profile.pastWaves.wave1.badges.badge2.completedRequirements || [], profile.pastWaves.wave1.badges.badge2.requirementScores || {})}
              />
            )}
            {profile.pastWaves.wave1.badges.badge3?.name && (
              <BadgeProgressCard 
                label="شارة 3 (سابقة)" 
                badge={profile.pastWaves.wave1.badges.badge3} 
                requirements={getScoutBadgeRequirements(profile.pastWaves.wave1.badges.badge3.name, profile.stage)} 
                requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.pastWaves.wave1.badges.badge3.name] || {}}
                requirementCategories={badgeSettings.requirementCategories?.[profile.pastWaves.wave1.badges.badge3.name] || {}}
                showResults={true}
                isPastWave={true}
                isPassed={checkBadgePassStatus(profile.pastWaves.wave1.badges.badge3.name, profile.stage, profile.pastWaves.wave1.badges.badge3.completedRequirements || [], profile.pastWaves.wave1.badges.badge3.requirementScores || {})}
              />
            )}
          </div>
        </div>
      )}

      {/* Attendance and Payment Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <Calendar className="text-[#4285F4]" size={24} />
          <h3 className="text-2xl font-bold text-gray-800">الغياب والاشتراك</h3>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-700">
                <th className="p-4 border-b border-gray-100 font-bold">كام شارة</th>
                <th className="p-4 border-b border-gray-100 font-bold">الاشتراك (المدفوع / المطلوب)</th>
                {(generalSettings.attendanceDates || []).map(date => {
                  const d = new Date(date);
                  const day = d.getDate();
                  const month = d.getMonth() + 1;
                  const monthName = d.toLocaleDateString('en-GB', { month: 'short' });
                  
                  return (
                    <th key={date} className="p-4 border-b border-gray-100 font-bold text-center">
                      <div className="flex flex-col items-center justify-center leading-tight">
                        <div className="flex items-center gap-1">
                          <span>{day}</span>
                          <span>-</span>
                          <span>{monthName}</span>
                        </div>
                        <span className="text-xs text-gray-500 mt-1">({month}/{day})</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="p-4 border-b border-gray-100 font-bold text-[#4285F4]">
                  {[profile.badges.badge1?.name, profile.badges.badge2?.name, profile.badges.badge3?.name].filter(Boolean).length}
                </td>
                <td className="p-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">{profile.amountPaid || 0}</span>
                    <span className="text-gray-400">/</span>
                    <span className="font-bold text-gray-500">
                      {[profile.badges.badge1?.name, profile.badges.badge2?.name, profile.badges.badge3?.name].filter(Boolean).length * (generalSettings.badgePrice || 30)}
                    </span>
                    <span className="text-sm text-gray-400">جنيه</span>
                  </div>
                </td>
                {(generalSettings.attendanceDates || []).map(date => (
                  <td key={date} className="p-4 border-b border-gray-100 text-center">
                    {profile.attendance?.[date] ? (
                      <CheckCircle2 className="text-green-500 mx-auto" size={24} />
                    ) : (
                      <XCircle className="text-red-500 mx-auto" size={24} />
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Links Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <MessageCircle className="text-[#4285F4]" size={24} />
          <h3 className="text-2xl font-bold text-gray-800">روابط المجموعات</h3>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[profile.badges.badge1, profile.badges.badge2, profile.badges.badge3].map((b, i) => {
              if (!b || !b.name) return null;
              const link = getGroupLink(b.name, profile.stage);
              
              return (
                <div key={i} className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col gap-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 text-[#4285F4] flex items-center justify-center font-black text-lg">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 text-lg">شارة {b.name}</h4>
                      <p className="text-sm text-gray-500">{profile.stage}</p>
                    </div>
                  </div>
                  
                  {link ? (
                    <a 
                      href={link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="mt-auto px-6 py-3.5 bg-[#4285F4] text-white rounded-xl hover:bg-blue-600 transition-colors font-bold text-sm text-center flex items-center justify-center gap-2 shadow-sm"
                    >
                      <MessageCircle size={20} />
                      انضمام لمجموعة الواتساب
                    </a>
                  ) : (
                    <div className="mt-auto px-6 py-3.5 bg-gray-100 text-gray-400 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2 border border-gray-200 border-dashed">
                      لا يوجد رابط متاح حالياً
                    </div>
                  )}
                </div>
              );
            })}
            
            {![profile.badges.badge1, profile.badges.badge2, profile.badges.badge3].some((b) => b && b.name) && (
              <div className="col-span-full text-center text-gray-500 font-bold p-8 bg-gray-50 rounded-2xl border border-gray-100">
                لم تقم باختيار أي شارات بعد.
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Cancel Badge Confirm Modal */}
      {cancelBadgeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
            <button
              onClick={() => setCancelBadgeConfirm(null)}
              className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <XCircle size={24} />
            </button>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h2 className="text-2xl font-black text-gray-800 mb-2">إلغاء شارة {cancelBadgeConfirm.name}</h2>
              <p className="text-red-600 font-bold bg-red-50 p-4 rounded-xl">
                خلي بالك لو لغيت الشارة البنود ألي سلمتها والدرجات ألي اتحسبتلك فيها هتضيع ومش هينفع ترجع نهائي
              </p>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={isCancelChecked}
                  onChange={(e) => setIsCancelChecked(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-600 cursor-pointer"
                />
                <span className="font-bold text-gray-700 select-none">أنا أؤكد رغبتي في إلغاء الشارة</span>
              </label>

              <button
                onClick={executeCancelBadge}
                disabled={!isCancelChecked}
                className={`w-full py-4 text-white rounded-xl font-bold transition-colors shadow-sm ${
                  isCancelChecked ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                تأكيد إلغاء الشارة
              </button>
              <button
                onClick={() => setCancelBadgeConfirm(null)}
                className="w-full py-4 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
