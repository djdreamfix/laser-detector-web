import { useCallback, useRef, useState, useEffect } from 'react';

interface CameraState {
  isActive: boolean;
  error: string | null;
  facingMode: 'user' | 'environment';
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({
    isActive: false,
    error: null,
    facingMode: 'environment',
  });

  const startCamera = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: state.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setState(prev => ({ ...prev, isActive: true }));
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Не вдалося отримати доступ до камери';
      setState(prev => ({ ...prev, error, isActive: false }));
      console.error('Camera error:', err);
    }
  }, [state.facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState(prev => ({ ...prev, isActive: false }));
  }, []);

  const switchCamera = useCallback(() => {
    const newFacingMode = state.facingMode === 'user' ? 'environment' : 'user';
    setState(prev => ({ ...prev, facingMode: newFacingMode }));
    
    if (state.isActive) {
      stopCamera();
      setTimeout(() => startCamera(), 100);
    }
  }, [state.facingMode, state.isActive, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    videoRef,
    ...state,
    startCamera,
    stopCamera,
    switchCamera,
  };
}
