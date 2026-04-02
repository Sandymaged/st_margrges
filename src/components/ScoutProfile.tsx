import React, { useState, useEffect } from 'react';
import { ScoutProfile, BadgeSettings, GeneralSettings } from '../types';
import BadgeProgressCard from './BadgeProgressCard';
import { User as UserIcon, MapPin, Hash, LayoutGrid, Calendar, CheckCircle2, XCircle, DollarSign } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

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

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'badges'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBadgeSettings({
          categories: data.categories || [],
          requirements: data.requirements || {},
          requirementMaxScores: data.requirementMaxScores || {},
          requirementCategories: data.requirementCategories || {}
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

    return () => {
      unsubSettings();
      unsubGeneral();
    };
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'غير متوفر';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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

  return (
    <div className="space-y-8">
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
            />
          )}
          {profile.badges.badge2?.name && (
            <BadgeProgressCard 
              label="شارة 2" 
              badge={profile.badges.badge2} 
              requirements={getScoutBadgeRequirements(profile.badges.badge2.name, profile.stage)} 
              requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.badges.badge2.name] || {}}
              requirementCategories={badgeSettings.requirementCategories?.[profile.badges.badge2.name] || {}}
            />
          )}
          {profile.badges.badge3?.name && (
            <BadgeProgressCard 
              label="شارة 3" 
              badge={profile.badges.badge3} 
              requirements={getScoutBadgeRequirements(profile.badges.badge3.name, profile.stage)} 
              requirementMaxScores={badgeSettings.requirementMaxScores?.[profile.badges.badge3.name] || {}}
              requirementCategories={badgeSettings.requirementCategories?.[profile.badges.badge3.name] || {}}
            />
          )}
        </div>
      </div>

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
    </div>
  );
}
