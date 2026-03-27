import React, { useState, useEffect } from 'react';

interface ScoreInputProps {
  maxScore: number;
  currentScore: number | undefined;
  canEdit: boolean;
  onSave: (newScore: number | undefined) => void;
  className?: string;
}

export default function ScoreInput({ maxScore, currentScore, canEdit, onSave, className }: ScoreInputProps) {
  const [value, setValue] = useState(currentScore?.toString() || '');

  useEffect(() => {
    setValue(currentScore?.toString() || '');
  }, [currentScore]);

  const handleBlur = () => {
    if (!canEdit) return;
    const numVal = value === '' ? undefined : Number(value);
    if (numVal !== undefined && (numVal < 0 || numVal > maxScore)) {
      setValue(currentScore?.toString() || '');
      return;
    }
    if (numVal === currentScore) return;
    onSave(numVal);
  };

  return (
    <input
      type="number"
      min="0"
      max={maxScore}
      value={value}
      disabled={!canEdit}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      className={className || "w-20 px-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4285F4] outline-none text-center font-bold text-gray-700 disabled:opacity-50 disabled:bg-gray-50"}
    />
  );
}
