import React from 'react';
import { DetectionResult } from '@/hooks/useLaserDetection';
import { Crosshair, CircleOff } from 'lucide-react';

interface StatusBarProps {
  detection: DetectionResult;
  isCalibrated: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ detection, isCalibrated }) => {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 glass-panel">
      {/* Detection Status */}
      <div className={detection.detected ? 'status-active detection-pulse' : 'status-inactive'}>
        {detection.detected ? (
          <>
            <Crosshair className="w-4 h-4" />
            <span>Промінь знайдено</span>
          </>
        ) : (
          <>
            <CircleOff className="w-4 h-4" />
            <span>Не знайдено</span>
          </>
        )}
      </div>

      {/* Detected Color */}
      {detection.detected && detection.detectedColor && (
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          detection.detectedColor === 'red' 
            ? 'bg-secondary/20 text-secondary' 
            : 'bg-primary/20 text-primary'
        }`}>
          {detection.detectedColor === 'red' ? 'Червоний' : 'Зелений'}
        </div>
      )}

      {/* Calibration indicator */}
      {!isCalibrated && (
        <div className="text-xs text-warning">
          Не відкалібровано
        </div>
      )}
    </div>
  );
};
