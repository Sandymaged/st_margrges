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
    // Try to ensure camera is requested safely
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        videoConstraints: {
          facingMode: "environment"
        }
      },
      /* verbose= */ false
    );
    scannerRef.current = scanner;

    let lastScannedText = '';
    let lastScanTime = 0;

    scanner.render(
      (decodedText) => {
        const now = Date.now();
        // Prevent registering the exact same scan if it happened less than 1 second ago
        if (decodedText === lastScannedText && now - lastScanTime < 1000) {
          return;
        }

        lastScannedText = decodedText;
        lastScanTime = now;

        // Pause scanner after success to prevent immediate multiple fires
        scanner.pause(true);
        onScanSuccessRef.current(decodedText);
        
        // Resume after 1 second
        setTimeout(() => {
          if (scannerRef.current) {
            scannerRef.current.resume();
          }
        }, 1000);
      },
      (errorMessage) => {
        // Ignore normal scanning errors (e.g. no QR code found)
      }
    );

    return () => {
      scanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
    };
  }, []); // Empty dependency array to run only once

  return (
    <div className="flex flex-col w-full">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <button onClick={onClose} className="p-2 bg-white rounded-full text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <h3 className="font-bold text-gray-800">مسح كود الحضور (QR)</h3>
      </div>
      <div className="p-4">
        <div id="qr-reader" className="w-full"></div>
        <div className="mt-4 text-center text-xs text-gray-500 font-bold bg-yellow-50 p-3 rounded-xl border border-yellow-100">
          <p>إذا ظهر لك خطأ (NotAllowedError: Permission denied):</p>
          <ul className="list-disc list-inside mt-1 text-[10px] text-right space-y-1">
            <li>تأكد من إعطاء صلاحية الكاميرا للمتصفح من إعدادات الجهاز.</li>
            <li>إذا كنت تستخدم متصفح داخل تطبيق (مثل ماسنجر أو تيليجرام)، يرجى فتح الرابط في متصفح خارجي (مثل Chrome أو Safari).</li>
            <li>تأكد أنه لا يوجد تطبيق آخر يستخدم الكاميرا حالياً.</li>
          </ul>
        </div>
        {error && <p className="text-red-500 text-center mt-4 font-bold">{error}</p>}
      </div>
    </div>
  );
}
