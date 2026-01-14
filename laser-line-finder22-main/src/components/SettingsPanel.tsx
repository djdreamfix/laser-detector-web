import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { DetectionSettings, ColorMode } from '@/hooks/useLaserDetection';
import { Settings, Crosshair, Palette, Waves, Zap, FlipHorizontal } from 'lucide-react';

interface SettingsPanelProps {
  settings: DetectionSettings;
  onSettingsChange: (settings: Partial<DetectionSettings>) => void;
  isCalibrated: boolean;
  onCalibrate: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  isCalibrated,
  onCalibrate,
}) => {
  const colorModes: { value: ColorMode; label: string; color: string }[] = [
    { value: 'auto', label: 'Авто', color: 'bg-accent' },
    { value: 'green', label: 'Зелений', color: 'bg-primary' },
    { value: 'red', label: 'Червоний', color: 'bg-secondary' },
  ];

  return (
    <div className="settings-panel fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Налаштування</h3>
      </div>

      {/* Sensitivity */}
      <div className="space-y-2">
        <div className="setting-row">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" />
            <span className="setting-label">Чутливість</span>
          </div>
          <span className="font-mono text-sm text-foreground">{settings.sensitivity}%</span>
        </div>
        <Slider
          value={[settings.sensitivity]}
          onValueChange={([value]) => onSettingsChange({ sensitivity: value })}
          min={10}
          max={100}
          step={5}
          className="w-full"
        />
      </div>

      {/* Color Mode */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <span className="setting-label">Колір лазера</span>
        </div>
        <div className="flex gap-2">
          {colorModes.map(mode => (
            <button
              key={mode.value}
              onClick={() => onSettingsChange({ colorMode: mode.value })}
              className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all ${
                settings.colorMode === mode.value
                  ? `${mode.color} text-background`
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Smoothing */}
      <div className="space-y-2">
        <div className="setting-row">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-primary" />
            <span className="setting-label">Згладжування</span>
          </div>
          <span className="font-mono text-sm text-foreground">{settings.smoothing}</span>
        </div>
        <Slider
          value={[settings.smoothing]}
          onValueChange={([value]) => onSettingsChange({ smoothing: value })}
          min={0}
          max={10}
          step={1}
          className="w-full"
        />
      </div>

      {/* Flicker Filter */}
      <div className="setting-row">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="setting-label">Фільтр мерехтіння</span>
        </div>
        <Switch
          checked={settings.flickerFilter}
          onCheckedChange={(checked) => onSettingsChange({ flickerFilter: checked })}
        />
      </div>

      {/* Mirror */}
      <div className="setting-row">
        <div className="flex items-center gap-2">
          <FlipHorizontal className="w-4 h-4 text-primary" />
          <span className="setting-label">Дзеркало</span>
        </div>
        <Switch
          checked={settings.mirror}
          onCheckedChange={(checked) => onSettingsChange({ mirror: checked })}
        />
      </div>

      {/* Calibration */}
      <div className="pt-2 border-t border-border">
        <button
          onClick={onCalibrate}
          className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-all ${
            isCalibrated
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'bg-warning/20 text-warning border border-warning/30'
          }`}
        >
          {isCalibrated ? '✓ Відкалібровано' : 'Калібрувати (без лазера)'}
        </button>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Наведіть камеру на поверхню без лазера для калібрування
        </p>
      </div>
    </div>
  );
};
