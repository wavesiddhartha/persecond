'use client';

import { VideoFrame } from '@/store/videoStore';

interface FrameControlsProps {
  adjustments: VideoFrame['adjustments'];
  onAdjustmentChange: (key: keyof VideoFrame['adjustments'], value: number) => void;
}

const FrameControls = ({ adjustments, onAdjustmentChange }: FrameControlsProps) => {
  const controls: Array<{
    key: keyof VideoFrame['adjustments'];
    label: string;
    min: number;
    max: number;
    step: number;
    icon: string;
  }> = [
    {
      key: 'exposure',
      label: 'Exposure',
      min: -100,
      max: 100,
      step: 1,
      icon: '☀️',
    },
    {
      key: 'temperature',
      label: 'Temperature',
      min: -100,
      max: 100,
      step: 1,
      icon: '🌡️',
    },
    {
      key: 'shadows',
      label: 'Shadows',
      min: -100,
      max: 100,
      step: 1,
      icon: '🌑',
    },
    {
      key: 'highlights',
      label: 'Highlights',
      min: -100,
      max: 100,
      step: 1,
      icon: '✨',
    },
    {
      key: 'contrast',
      label: 'Contrast',
      min: -100,
      max: 100,
      step: 1,
      icon: '⚫',
    },
    {
      key: 'saturation',
      label: 'Saturation',
      min: -100,
      max: 100,
      step: 1,
      icon: 'S',
    },
  ];

  const resetAdjustments = () => {
    controls.forEach(control => {
      onAdjustmentChange(control.key, 0);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-[--font-sketch]">Adjustments</h3>
        <button
          onClick={resetAdjustments}
          className="text-sm px-3 py-1 rounded-lg border border-dashed border-[--pencil-gray] hover:bg-[--highlight-pink] transition-colors"
        >
          Reset All
        </button>
      </div>

      <div className="grid gap-4">
        {controls.map((control) => (
          <div key={control.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium">
                <span>{control.icon}</span>
                {control.label}
              </label>
              <span className="text-sm text-[--text-secondary] min-w-[3ch] text-right">
                {adjustments[control.key as keyof VideoFrame['adjustments']]}
              </span>
            </div>
            
            <div className="relative">
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={adjustments[control.key as keyof VideoFrame['adjustments']]}
                onChange={(e) => onAdjustmentChange(control.key as keyof VideoFrame['adjustments'], Number(e.target.value))}
                className="w-full h-2 bg-[--bg-notebook] rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(90deg, 
                    var(--highlight-yellow) 0%, 
                    var(--highlight-blue) 50%, 
                    var(--highlight-pink) 100%)`
                }}
              />
              {/* Center marker */}
              <div 
                className="absolute top-1/2 transform -translate-y-1/2 w-0.5 h-4 bg-[--pencil-gray] pointer-events-none"
                style={{ left: '50%' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="sticky-note mt-6">
        <p className="text-xs">
          💡 <strong>Apple Photos Style:</strong> Drag sliders to adjust. 
          Positive values brighten/warm, negative values darken/cool.
        </p>
      </div>
    </div>
  );
};

export default FrameControls;