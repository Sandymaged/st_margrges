import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        // Pause scanner after success to prevent multiple scans
        scanner.pause(true);
        onScanSuccess(decodedText);
        // Resume after 2 seconds
        setTimeout(() => {
          if (scannerRef.current) {
            scannerRef.current.resume();
          }
        }, 2000);
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
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-800">مسح كود الحضور (QR)</h3>
          <button onClick={onClose} className="p-2 bg-white rounded-full text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="p-4">
          <div id="qr-reader" className="w-full"></div>
          {error && <p className="text-red-500 text-center mt-4 font-bold">{error}</p>}
        </div>
      </div>
    </div>
  );
}
