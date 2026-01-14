import React, { useRef, useEffect, useCallback, useState } from 'react';
import { DetectionResult } from '@/hooks/useLaserDetection';

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
  mirror: boolean;
  detection: DetectionResult;
  onFrame: (imageData: ImageData) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  videoRef,
  isActive,
  mirror,
  detection,
  onFrame,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Match canvas to video dimensions
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw video frame
    if (mirror) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Get image data for processing
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      onFrame(imageData);
    } catch (e) {
      console.error('Failed to get image data:', e);
    }

    // Calculate FPS
    frameCountRef.current++;
    const now = performance.now();
    if (now - lastTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    animationRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, mirror, onFrame]);

  useEffect(() => {
    if (isActive) {
      animationRef.current = requestAnimationFrame(processFrame);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, processFrame]);

  // Calculate marker position relative to display size
  const getMarkerStyle = () => {
    const canvas = canvasRef.current;
    if (!canvas || !detection.detected) return { display: 'none' };

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    return {
      left: `${detection.x * scaleX}px`,
      top: `${detection.y * scaleY}px`,
      display: 'block',
    };
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Hidden video element */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
      />
      
      {/* Visible canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
      />

      {/* Crosshair marker */}
      {detection.detected && (
        <div
          className={`crosshair-marker ${detection.detectedColor === 'red' ? 'red' : ''}`}
          style={getMarkerStyle()}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-3 h-3 rounded-full ${
              detection.detectedColor === 'red' ? 'bg-secondary' : 'bg-primary'
            } animate-pulse`} />
          </div>
        </div>
      )}

      {/* Center guide lines (subtle) */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-foreground/10" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-foreground/10" />
      </div>

      {/* FPS Counter */}
      <div className="absolute top-2 right-2 fps-counter">
        {fps} FPS
      </div>

      {/* Intensity bar */}
      {detection.detected && (
        <div className="absolute bottom-2 left-2 right-2 h-2 bg-muted/50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${
              detection.detectedColor === 'red' ? 'bg-secondary' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(100, detection.intensity / 2.55)}%` }}
          />
        </div>
      )}
    </div>
  );
};
