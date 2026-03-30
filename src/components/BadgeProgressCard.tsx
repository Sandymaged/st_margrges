import React from 'react';
import { Award, Info, CheckCircle2, Circle } from 'lucide-react';
import { BadgeProgress } from '../types';
import { motion } from 'motion/react';

interface BadgeProgressCardProps {
  badge: BadgeProgress;
  label: string;
  requirements?: string[];
  requirementMaxScores?: Record<string, number>;
  requirementCategories?: Record<string, string>;
}

export default function BadgeProgressCard({ badge, label, requirements = [], requirementMaxScores = {}, requirementCategories = {} }: BadgeProgressCardProps) {
  const hasReqs = requirements.length > 0;
  const completedReqs = (badge.completedRequirements || []).filter(r => requirements.includes(r));

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
      </div>

      {/* Requirements Checklist */}
      {hasReqs && (
        <div className="mt-4 space-y-4">
          <h4 className="text-sm font-bold text-gray-700 mb-2">متطلبات الشارة:</h4>
          {Object.entries(
            requirements.reduce((acc, req) => {
              const category = requirementCategories[req] || 'عام';
              if (!acc[category]) acc[category] = [];
              acc[category].push(req);
              return acc;
            }, {} as Record<string, string[]>)
          ).map(([category, reqs]) => (
            <div key={category} className="space-y-2">
              <h5 className="text-sm font-bold text-[#4285F4] border-b border-gray-100 pb-1 mb-2">
                {category} :-
              </h5>
              {reqs.map((req, idx) => {
                const isCompleted = completedReqs.includes(req);
                
                return (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    {isCompleted ? (
                      <CheckCircle2 size={20} className="text-[#34A853] shrink-0 mt-0.5" />
                    ) : (
                      <Circle size={20} className="text-gray-300 shrink-0 mt-0.5" />
                    )}
                    <div className="flex flex-col flex-1">
                      <span className={`text-sm font-bold ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {req}
                      </span>
                      <span className={`text-xs font-bold mt-2 ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                        {isCompleted ? 'تم التسليم' : 'لم يتم التسليم'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

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
      
      {!badge.notes && !hasReqs && (
        <div className="mt-4 p-3 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 text-center">
          <span className="text-xs text-gray-400">لا توجد ملاحظات أو متطلبات حتى الآن</span>
        </div>
      )}
    </div>
  );
}
