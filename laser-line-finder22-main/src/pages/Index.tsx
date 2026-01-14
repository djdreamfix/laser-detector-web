import React, { useState, useCallback, useEffect } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { useLaserDetection, DetectionResult } from '@/hooks/useLaserDetection';
import { CameraView } from '@/components/CameraView';
import { SettingsPanel } from '@/components/SettingsPanel';
import { StatusBar } from '@/components/StatusBar';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { Settings, X, RotateCcw } from 'lucide-react';

const Index: React.FC = () => {
  const { videoRef, isActive, error, startCamera, stopCamera, switchCamera } = useCamera();
  const { settings, updateSettings, detectLaser, calibrate, calibration, resetCalibration } = useLaserDetection();
  
  const [detection, setDetection] = useState<DetectionResult>({
    detected: false,
    x: 0,
    y: 0,
    intensity: 0,
    detectedColor: null,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const handleFrame = useCallback((imageData: ImageData) => {
    if (isCalibrating) return;
    const result = detectLaser(imageData);
    setDetection(result);
  }, [detectLaser, isCalibrating]);

  const handleCalibrate = useCallback(() => {
    setIsCalibrating(true);
    
    // Get current frame for calibration
    const video = videoRef.current;
    if (video && video.readyState === 4) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        calibrate(imageData);
      }
    }
    
    setTimeout(() => setIsCalibrating(false), 500);
  }, [videoRef, calibrate]);

  const handleStop = useCallback(() => {
    stopCamera();
    resetCalibration();
    setShowSettings(false);
  }, [stopCamera, resetCalibration]);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.error('SW registration failed:', err));
    }
  }, []);

  // Prevent screen sleep while camera is active
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isActive) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.log('Wake Lock error:', err);
        }
      }
    };

    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, [isActive]);

  if (!isActive) {
    return <WelcomeScreen onStartCamera={startCamera} error={error} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background safe-area-top safe-area-bottom overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-card/50 backdrop-blur-sm z-10">
        <button
          onClick={handleStop}
          className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h1 className="font-semibold text-foreground">Laser Detector</h1>
        
        <div className="flex gap-2">
          <button
            onClick={switchCamera}
            className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings ? 'bg-primary text-background' : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar detection={detection} isCalibrated={calibration.calibrated} />

      {/* Camera View */}
      <div className="flex-1 relative overflow-hidden">
        <CameraView
          videoRef={videoRef}
          isActive={isActive}
          mirror={settings.mirror}
          detection={detection}
          onFrame={handleFrame}
        />

        {/* Calibrating overlay */}
        {isCalibrating && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-foreground font-medium">Калібрування...</p>
            </div>
          </div>
        )}

        {/* Settings Panel Overlay */}
        {showSettings && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
            <SettingsPanel
              settings={settings}
              onSettingsChange={updateSettings}
              isCalibrated={calibration.calibrated}
              onCalibrate={handleCalibrate}
            />
          </div>
        )}
      </div>

      {/* Quick Actions (when settings closed) */}
      {!showSettings && (
        <div className="p-4 bg-card/50 backdrop-blur-sm">
          <div className="flex gap-3">
            <button
              onClick={() => updateSettings({ 
                sensitivity: Math.max(10, settings.sensitivity - 10) 
              })}
              className="flex-1 laser-button-ghost text-sm"
            >
              − Чутливість
            </button>
            <button
              onClick={() => updateSettings({ 
                sensitivity: Math.min(100, settings.sensitivity + 10) 
              })}
              className="flex-1 laser-button-ghost text-sm"
            >
              + Чутливість
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
