import React from 'react';
import { Camera, Shield, Smartphone, Settings2 } from 'lucide-react';

interface WelcomeScreenProps {
  onStartCamera: () => void;
  error: string | null;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStartCamera, error }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center safe-area-top safe-area-bottom">
      {/* Logo/Icon */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-lg shadow-primary/30">
          <Camera className="w-12 h-12 text-background" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-secondary flex items-center justify-center shadow-lg shadow-secondary/30">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold text-foreground mb-2">
        Laser Level Detector
      </h1>
      <p className="text-muted-foreground mb-8 max-w-xs">
        Виявляйте лазерну лінію рівня за допомогою камери вашого iPhone
      </p>

      {/* Features */}
      <div className="grid grid-cols-2 gap-4 mb-8 w-full max-w-xs">
        <div className="glass-panel p-4 text-left">
          <Shield className="w-5 h-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Приватність — дані не покидають пристрій</p>
        </div>
        <div className="glass-panel p-4 text-left">
          <Smartphone className="w-5 h-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Працює офлайн після встановлення</p>
        </div>
        <div className="glass-panel p-4 text-left">
          <Camera className="w-5 h-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Виявлення в реальному часі</p>
        </div>
        <div className="glass-panel p-4 text-left">
          <Settings2 className="w-5 h-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Налаштування чутливості</p>
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={onStartCamera}
        className="laser-button-primary w-full max-w-xs"
      >
        <Camera className="w-5 h-5 inline-block mr-2" />
        Увімкнути камеру
      </button>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-4 bg-destructive/20 border border-destructive/30 rounded-lg text-destructive text-sm max-w-xs">
          {error}
        </div>
      )}

      {/* PWA Install hint */}
      <p className="mt-8 text-xs text-muted-foreground max-w-xs">
        Порада: додайте на головний екран через меню «Поділитися» → «На Початковий екран»
      </p>
    </div>
  );
};
