import React, { useEffect, useRef, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [error, setError] = useState<string>('');
  const lastScanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const handleScan = (data: any) => {
    if (data && data.length > 0 && !isPaused) {
      const text = data[0].rawValue;
      if (text) {
        setIsPaused(true);
        onScanSuccess(text);
        
        // Prevent double scanning for 1.5 seconds
        if (lastScanTimeoutRef.current) {
          clearTimeout(lastScanTimeoutRef.current);
        }
        lastScanTimeoutRef.current = setTimeout(() => {
          setIsPaused(false);
        }, 1500);
      }
    }
  };

  const handleError = (err: unknown) => {
    console.error(err);
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
        setError('تعذر الوصول للكاميرا. يرجى إعطاء الصلاحيات اللازمة للمتصفح.');
      } else {
        setError('حدث خطأ أثناء تشغيل الكاميرا.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (lastScanTimeoutRef.current) {
        clearTimeout(lastScanTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col w-full">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <button onClick={onClose} className="p-2 bg-white rounded-full text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <h3 className="font-bold text-gray-800">مسح كود الحضور (QR)</h3>
      </div>
      <div className="p-4">
        <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl">
          <Scanner
            onScan={handleScan}
            onError={handleError}
            paused={isPaused}
            components={{
              audio: false,
              onOff: true,
              torch: true,
              zoom: true,
              finder: true
            }}
          />
        </div>
        <div className="mt-4 text-center text-xs text-gray-500 font-bold bg-yellow-50 p-3 rounded-xl border border-yellow-100">
          <p>إذا ظهر لك خطأ في الوصول للكاميرا:</p>
          <ul className="list-disc list-inside mt-1 text-[10px] text-right space-y-1">
            <li>تأكد من إعطاء صلاحية الكاميرا للمتصفح من إعدادات الجهاز.</li>
            <li>تأكد من إغلاق أي تطبيق آخر يستخدم الكاميرا.</li>
            <li>في حالة استخدام ماسنجر، افتح الرابط في متصفح خارجي (Chrome/Safari).</li>
          </ul>
        </div>
        {error && <p className="text-red-500 text-center mt-4 font-bold bg-red-50 p-2 rounded-lg text-sm">{error}</p>}
      </div>
    </div>
  );
}
