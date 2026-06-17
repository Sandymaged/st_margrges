import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string>('');
  const onScanSuccessRef = useRef(onScanSuccess);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        // Do NOT force facingMode, as it causes Permission denied on some devices if they can't fulfill it strictly
      },
      /* verbose= */ false
    );
    scannerRef.current = scanner;

    let lastScannedText = '';
    let lastScanTime = 0;

    scanner.render(
      (decodedText) => {
        const now = Date.now();
        if (decodedText === lastScannedText && now - lastScanTime < 2000) {
          return;
        }

        lastScannedText = decodedText;
        lastScanTime = now;

        scanner.pause(true);
        onScanSuccessRef.current(decodedText);
        
        setTimeout(() => {
          if (scannerRef.current) {
            scannerRef.current.resume();
          }
        }, 2000);
      },
      (errorMessage) => {
        // We ignore generic errors during scanning
      }
    );

    return () => {
      scanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
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
      <div className="p-4 flex flex-col items-center">
        <div id="qr-reader" className="w-full max-w-sm mx-auto overflow-hidden rounded-xl border border-gray-200"></div>
        
        {error && <p className="text-red-500 text-center mt-4 font-bold bg-red-50 p-2 rounded-lg text-sm">{error}</p>}
        <div className="mt-4 w-full text-center text-xs text-gray-500 font-bold bg-yellow-50 p-3 rounded-xl border border-yellow-100">
          <p>إذا ظهر لك خطأ في الوصول للكاميرا:</p>
          <ul className="list-disc list-inside mt-1 text-[10px] text-right space-y-1">
            <li>تأكد من إعطاء صلاحية الكاميرا للمتصفح من إعدادات الجهاز.</li>
            <li>تأكد من إغلاق أي تطبيق آخر يستخدم الكاميرا أو الكشاف.</li>
            <li>في حالة استخدام ماسنجر أو فيسبوك، افتح الرابط في متصفح خارجي (Chrome/Safari).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
