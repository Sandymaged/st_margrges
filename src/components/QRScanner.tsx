import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { Upload, Camera } from 'lucide-react';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const onScanSuccessRef = useRef(onScanSuccess);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setIsProcessingFile(true);
      setError('');
      try {
        const html5QrCode = new Html5Qrcode("hidden-file-qr-reader");
        const decodedText = await html5QrCode.scanFile(file, false);
        html5QrCode.clear();
        onScanSuccessRef.current(decodedText);
      } catch (err) {
        setError('لم يتم العثور على كود QR صحيح في الصورة. يرجى التأكد من وضوح الصورة وتجربة صورة أخرى.');
      } finally {
        setIsProcessingFile(false);
      }
    }
  };

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
        {/* Hidden element required for scanFile to work */}
        <div id="hidden-file-qr-reader" style={{ display: 'none' }}></div>
        
        <div className="w-full mb-6 relative">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            id="native-camera-upload"
            onChange={handleFileUpload}
            disabled={isProcessingFile}
          />
          <label
            htmlFor="native-camera-upload"
            className={`w-full flex items-center justify-center gap-3 bg-[#4285F4] hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-2xl cursor-pointer shadow-lg transition-all ${isProcessingFile ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isProcessingFile ? (
              <span className="animate-pulse">جاري فحص الصورة...</span>
            ) : (
              <>
                <Camera size={24} />
                <span>التقاط صورة للكود (يعمل على جميع الهواتف)</span>
              </>
            )}
          </label>
        </div>

        <div className="w-full flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-gray-200"></div>
          <span className="text-sm font-bold text-gray-400">أو عن طريق الماسح المباشر</span>
          <div className="flex-1 h-px bg-gray-200"></div>
        </div>

        <div id="qr-reader" className="w-full max-w-sm mx-auto overflow-hidden rounded-xl border border-gray-200"></div>
        
        {error && <p className="text-red-500 text-center mt-4 font-bold bg-red-50 w-full p-3 rounded-xl border border-red-100 text-sm">{error}</p>}
        
        <div className="mt-4 w-full text-center text-xs text-gray-500 font-bold bg-yellow-50 p-3 rounded-xl border border-yellow-100">
          <p>إذا واجهت مشكلة في الماسح المباشر، يرجى استخدام الزر الأزرق بالأعلى لالتقاط الصورة مباشرة من كاميرا هاتفك.</p>
        </div>
      </div>
    </div>
  );
}
