import React, { useState, useEffect } from 'react';
import { ScoutProfile, BadgeRequirements } from '../types';
import BadgeProgressCard from './BadgeProgressCard';
import { User as UserIcon, MapPin, Hash, LayoutGrid, Calendar } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface ScoutProfileViewProps {
  profile: ScoutProfile;
}

export default function ScoutProfileView({ profile }: ScoutProfileViewProps) {
  const [badgeRequirements, setBadgeRequirements] = useState<BadgeRequirements>({});

  useEffect(() => {
    const unsubReqs = onSnapshot(doc(db, 'settings', 'badgeRequirements'), (doc) => {
      if (doc.exists()) {
        setBadgeRequirements(doc.data() as BadgeRequirements);
      }
    });

    return () => unsubReqs();
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
          <BadgeProgressCard label="شارة 1" badge={profile.badges.badge1} requirements={badgeRequirements[profile.badges.badge1.name] || []} />
          <BadgeProgressCard label="شارة 2" badge={profile.badges.badge2} requirements={badgeRequirements[profile.badges.badge2.name] || []} />
          <BadgeProgressCard label="شارة 3" badge={profile.badges.badge3} requirements={badgeRequirements[profile.badges.badge3.name] || []} />
        </div>
      </div>
    </div>
  );
}
