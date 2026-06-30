import React, { useState, useEffect, useRef } from 'react';
import { ScoutProfile, BadgeSettings, GeneralSettings, BadgeCancellationRequest } from '../types';
import BadgeProgressCard from './BadgeProgressCard';
import { User as UserIcon, MapPin, Hash, LayoutGrid, Calendar, CheckCircle2, XCircle, DollarSign, Download, MessageCircle } from 'lucide-react';
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
  const [cancellationRequests, setCancellationRequests] = useState<Record<string, boolean>>({});
  
  const qrRef = useRef<HTMLCanvasElement>(null);

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
    });

    const unsubGeneral = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GeneralSettings;
        setGeneralSettings({
          logoUrl: '/syncc.png',
          scoutGroupName: data.scoutGroupName || 'مجموعة مارجرجس الكشفية',
          badgePrice: data.badgePrice || 30,
          attendanceDates: data.attendanceDates || []
        });
      }
    });
    
    const q = query(collection(db, 'cancellationRequests'), where('userId', '==', profile.uid));
    const unsubRequests = onSnapshot(q, (snapshot) => {
      const requestsMap: Record<string, boolean> = {};
      snapshot.forEach(doc => {
        const data = doc.data() as BadgeCancellationRequest;
        requestsMap[data.badgeKey] = true;
      });
      setCancellationRequests(requestsMap);
    });

    return () => {
      unsubSettings();
      unsubGeneral();
      unsubRequests();
    };
  }, [profile.uid]);

  const handleCancelBadgeRequest = async (badgeKey: 'badge1' | 'badge2' | 'badge3', badgeName: string) => {
    try {
      await addDoc(collection(db, 'cancellationRequests'), {
        userId: profile.uid,
        userName: profile.name,
        stage: profile.stage,
        badgeKey,
        badgeName,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error requesting badge cancellation:', error);
      alert('حدث خطأ أثناء إرسال الطلب');
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

  return (
    <div className="space-y-8">
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
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-gray-500 font-bold">كود الحضور</span>
              <button 
                onClick={handleDownloadQR}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#4285F4] text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors w-full"
              >
                <Download size={14} />
                تحميل الكود
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
              hasCancellationRequest={!!cancellationRequests['badge1']}
              onCancelRequest={() => handleCancelBadgeRequest('badge1', profile.badges.badge1.name)}
              showResults={generalSettings.showResults}
            />
          )}
          {profile.badges.badge2?.name && (
            <BadgeProgressCard 
              label="شارة 2" 
              badge={profile.badges.badge2} 
              requirements={getScoutBadgeRequirements(profile.badges.badge2.name, profile.stage)} 
              requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.badges.badge2.name] || {}}
              requirementCategories={badgeSettings.requirementCategories?.[profile.badges.badge2.name] || {}}
              hasCancellationRequest={!!cancellationRequests['badge2']}
              onCancelRequest={() => handleCancelBadgeRequest('badge2', profile.badges.badge2.name)}
              showResults={generalSettings.showResults}
            />
          )}
          {profile.badges.badge3?.name && (
            <BadgeProgressCard 
              label="شارة 3" 
              badge={profile.badges.badge3} 
              requirements={getScoutBadgeRequirements(profile.badges.badge3.name, profile.stage)} 
              requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.badges.badge3.name] || {}}
              requirementCategories={badgeSettings.requirementCategories?.[profile.badges.badge3.name] || {}}
              hasCancellationRequest={!!cancellationRequests['badge3']}
              onCancelRequest={() => handleCancelBadgeRequest('badge3', profile.badges.badge3.name)}
              showResults={generalSettings.showResults}
            />
          )}
          {[profile.badges.badge1, profile.badges.badge2, profile.badges.badge3].filter(b => b && b.name).length < 3 && (
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
                    Object.values(category.stageBadges).forEach(badges => {
                      if (badges) badges.forEach(b => allBadges.add(b));
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
          )}
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
    </div>
  );
}
