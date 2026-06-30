import React, { useState } from 'react';
import { Award, Info, CheckCircle2, XCircle, Circle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { BadgeProgress } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface BadgeProgressCardProps {
  badge: BadgeProgress;
  label: string;
  requirements?: string[];
  requirementMaxScores?: Record<string, number>;
  requirementCategories?: Record<string, string>;
  hasCancellationRequest?: boolean;
  onCancelRequest?: () => void;
  showResults?: boolean;
  isPastWave?: boolean;
  isPassed?: boolean;
}

export default function BadgeProgressCard({ 
  badge, 
  label, 
  requirements = [], 
  requirementMaxScores = {}, 
  requirementCategories = {},
  hasCancellationRequest,
  onCancelRequest,
  showResults = true,
  isPastWave = false,
  isPassed = false
}: BadgeProgressCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasReqs = requirements.length > 0;
  const completedReqs = showResults ? (badge.completedRequirements || []).filter(r => requirements.includes(r)) : [];
  
  // We rely on isPassed from the parent to determine full completion.
  const isFullyCompleted = showResults && hasReqs && isPassed;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative">
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
        
        {isFullyCompleted ? (
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-600 border border-green-100">
            <CheckCircle2 size={14} />
            تم اجتياز الشارة
          </div>
        ) : isPastWave && showResults && !isFullyCompleted ? (
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-100">
            <XCircle size={14} />
            لم يتم اجتياز الشارة
          </div>
        ) : onCancelRequest && !isFullyCompleted && !isPastWave && (
          <button
            onClick={onCancelRequest}
            disabled={hasCancellationRequest}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              hasCancellationRequest 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
            }`}
          >
            <Trash2 size={14} />
            {hasCancellationRequest ? 'تم طلب الإلغاء' : 'إلغاء الشارة'}
          </button>
        )}
      </div>

      {hasReqs && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-2 mb-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-colors text-sm font-bold"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={16} />
              إخفاء البنود
            </>
          ) : (
            <>
              <ChevronDown size={16} />
              إظهار البنود
            </>
          )}
        </button>
      )}

      {/* Requirements Checklist */}
      <AnimatePresence>
        {hasReqs && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-4">
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
                          {!showResults ? (
                            <span className="text-xs font-bold mt-2 text-purple-600">
                              قيد التقييم
                            </span>
                          ) : (
                            <span className={`text-xs font-bold mt-2 ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                              {isCompleted ? 'تم التسليم' : 'لم يتم التسليم'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
