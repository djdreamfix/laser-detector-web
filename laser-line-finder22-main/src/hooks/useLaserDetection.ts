import { useCallback, useRef, useState } from 'react';

export type ColorMode = 'red' | 'green' | 'auto';

export interface DetectionSettings {
  sensitivity: number;
  colorMode: ColorMode;
  smoothing: number;
  flickerFilter: boolean;
  mirror: boolean;
}

export interface DetectionResult {
  detected: boolean;
  x: number;
  y: number;
  intensity: number;
  detectedColor: 'red' | 'green' | null;
}

interface CalibrationData {
  avgBrightness: number;
  noiseLevel: number;
  calibrated: boolean;
}

const defaultSettings: DetectionSettings = {
  sensitivity: 70,
  colorMode: 'auto',
  smoothing: 3,
  flickerFilter: true,
  mirror: false,
};

export function useLaserDetection() {
  const [settings, setSettings] = useState<DetectionSettings>(defaultSettings);
  const [calibration, setCalibration] = useState<CalibrationData>({
    avgBrightness: 50,
    noiseLevel: 10,
    calibrated: false,
  });
  
  const historyRef = useRef<DetectionResult[]>([]);
  const lastResultRef = useRef<DetectionResult>({
    detected: false,
    x: 0,
    y: 0,
    intensity: 0,
    detectedColor: null,
  });

  const updateSettings = useCallback((newSettings: Partial<DetectionSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const calibrate = useCallback((imageData: ImageData) => {
    const data = imageData.data;
    let totalBrightness = 0;
    let maxBrightness = 0;
    let minBrightness = 255;
    const pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
      maxBrightness = Math.max(maxBrightness, brightness);
      minBrightness = Math.min(minBrightness, brightness);
    }

    const avgBrightness = totalBrightness / pixelCount;
    const noiseLevel = (maxBrightness - minBrightness) / 2;

    setCalibration({
      avgBrightness,
      noiseLevel,
      calibrated: true,
    });

    return { avgBrightness, noiseLevel };
  }, []);

  const detectLaser = useCallback((imageData: ImageData): DetectionResult => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Calculate adaptive threshold based on calibration and sensitivity
    const baseThreshold = calibration.calibrated 
      ? calibration.avgBrightness + calibration.noiseLevel * 2 
      : 100;
    const threshold = baseThreshold + (100 - settings.sensitivity) * 1.5;

    let maxIntensity = 0;
    let maxX = 0;
    let maxY = 0;
    let detectedColor: 'red' | 'green' | null = null;
    let redScore = 0;
    let greenScore = 0;

    // Process every 2nd pixel for performance on mobile
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calculate brightness
        const brightness = (r + g + b) / 3;
        
        if (brightness < threshold) continue;

        // Check for laser colors based on mode
        let isLaserCandidate = false;
        let intensity = 0;
        let colorType: 'red' | 'green' | null = null;

        if (settings.colorMode === 'red' || settings.colorMode === 'auto') {
          // Red laser detection: high red, low green and blue
          if (r > 150 && r > g * 1.5 && r > b * 1.5) {
            isLaserCandidate = true;
            intensity = r;
            colorType = 'red';
            redScore += r;
          }
        }

        if (settings.colorMode === 'green' || settings.colorMode === 'auto') {
          // Green laser detection: high green, moderate red (green lasers appear yellow-green on camera)
          if (g > 150 && g > b * 1.3 && (g > r * 0.8 || (r > 100 && g > 180))) {
            const greenIntensity = g + (r > 100 ? r * 0.3 : 0);
            if (greenIntensity > intensity) {
              isLaserCandidate = true;
              intensity = greenIntensity;
              colorType = 'green';
              greenScore += g;
            }
          }
        }

        // Also detect very bright spots (saturated laser)
        if (brightness > 240 && r > 200 && g > 200) {
          isLaserCandidate = true;
          intensity = brightness;
          if (settings.colorMode === 'auto') {
            colorType = greenScore > redScore ? 'green' : 'red';
          } else {
            colorType = settings.colorMode;
          }
        }

        if (isLaserCandidate && intensity > maxIntensity) {
          maxIntensity = intensity;
          maxX = x;
          maxY = y;
          detectedColor = colorType;
        }
      }
    }

    const detected = maxIntensity > threshold;
    
    // Apply smoothing
    let result: DetectionResult = {
      detected,
      x: detected ? (settings.mirror ? width - maxX : maxX) : lastResultRef.current.x,
      y: detected ? maxY : lastResultRef.current.y,
      intensity: maxIntensity,
      detectedColor: detected ? detectedColor : null,
    };

    // Smoothing with history
    if (settings.smoothing > 0 && detected) {
      historyRef.current.push(result);
      if (historyRef.current.length > settings.smoothing) {
        historyRef.current.shift();
      }

      const avgX = historyRef.current.reduce((sum, r) => sum + r.x, 0) / historyRef.current.length;
      const avgY = historyRef.current.reduce((sum, r) => sum + r.y, 0) / historyRef.current.length;

      result = {
        ...result,
        x: Math.round(avgX),
        y: Math.round(avgY),
      };
    }

    // Flicker filter - require consistent detection
    if (settings.flickerFilter) {
      const recentDetections = historyRef.current.filter(r => r.detected).length;
      if (recentDetections < Math.min(2, settings.smoothing)) {
        result.detected = false;
      }
    }

    lastResultRef.current = result;
    return result;
  }, [settings, calibration]);

  const resetCalibration = useCallback(() => {
    setCalibration({
      avgBrightness: 50,
      noiseLevel: 10,
      calibrated: false,
    });
    historyRef.current = [];
  }, []);

  return {
    settings,
    updateSettings,
    detectLaser,
    calibrate,
    calibration,
    resetCalibration,
  };
}
