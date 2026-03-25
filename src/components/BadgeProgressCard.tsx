import React from 'react';
import { Award, Info } from 'lucide-react';
import { BadgeProgress } from '../types';
import { motion } from 'motion/react';

interface BadgeProgressCardProps {
  badge: BadgeProgress;
  label: string;
}

export default function BadgeProgressCard({ badge, label }: BadgeProgressCardProps) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#4285F4]/10 p-2 rounded-lg">
            <Award className="text-[#4285F4]" size={20} />
          </div>
          <div>
            <span className="text-xs text-gray-500 font-medium">{label}</span>
            <h3 className="text-lg font-bold text-gray-800">{badge.name}</h3>
          </div>
        </div>
        <div className="text-[#4285F4] font-bold text-lg">
          {badge.progress}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden mb-4">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${badge.progress}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full bg-gradient-to-l from-[#4285F4] to-[#34A853] rounded-full"
        />
      </div>

      {/* Notes */}
      {badge.notes && (
        <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100 flex gap-2">
          <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-600 italic">
            <span className="font-semibold block mb-1 not-italic text-gray-700">ملاحظات المسؤول:</span>
            {badge.notes}
          </div>
        </div>
      )}
      
      {!badge.notes && (
        <div className="mt-4 p-3 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 text-center">
          <span className="text-xs text-gray-400">لا توجد ملاحظات حتى الآن</span>
        </div>
      )}
    </div>
  );
}
