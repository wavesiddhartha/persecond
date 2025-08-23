'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { VideoFrame, useVideoStore } from '@/store/videoStore';

interface AdvancedControlsProps {
  adjustments: VideoFrame['adjustments'];
  onAdjustmentChange: (key: keyof VideoFrame['adjustments'], value: number) => void;
}

// Apple-style chevron component
const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className="control-chevron"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 9l-7 7-7-7"
    />
  </svg>
);

const AdvancedControls = ({ adjustments, onAdjustmentChange }: AdvancedControlsProps) => {
  const { applyCurrentFrameToAll, frames, currentFrame } = useVideoStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [expandedSections, setExpandedSections] = useState({
    light: true,
    color: false,
    detail: false,
    effects: false,
    creative: false,
  });

  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Store scroll position to prevent jumping
  const scrollPositionRef = useRef(0);
  
  // Save scroll position before frame change
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
    }
  }, []);

  // Restore scroll position after frame change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [adjustments]);

  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);
  
  const applyPreset = useCallback((preset: string) => {
    const presets = {
      vibrant: {
        saturation: 25,
        vibrance: 20,
        contrast: 15,
        clarity: 10,
        brilliance: 15,
        highlights: -10,
      },
      dramatic: {
        contrast: 40,
        shadows: -30,
        highlights: -20,
        clarity: 25,
        blackPoint: 15,
        brilliance: -10,
      },
      cinematic: {
        shadows: 20,
        highlights: -15,
        fadeAmount: 15,
        temperature: -5,
        contrast: 10,
        saturation: -5,
      },
      vintage: {
        vintage: 40,
        fadeAmount: 25,
        grainAmount: 15,
        temperature: -10,
        vignette: 20,
        saturation: -10,
      },
      natural: {
        brilliance: 15,
        vibrance: 10,
        shadows: 10,
        highlights: -5,
        clarity: 5,
        saturation: 5,
      },
      reset: {},
    };

    setActivePreset(preset === 'reset' ? null : preset);
    
    if (preset === 'reset') {
      // Reset all values to 0
      Object.keys(adjustments).forEach(key => {
        if (key === 'vignetteFeather') {
          onAdjustmentChange(key as keyof VideoFrame['adjustments'], 50);
        } else if (key === 'grainSize') {
          onAdjustmentChange(key as keyof VideoFrame['adjustments'], 2);
        } else {
          onAdjustmentChange(key as keyof VideoFrame['adjustments'], 0);
        }
      });
    } else {
      const presetAdjustments = presets[preset as keyof typeof presets];
      if (presetAdjustments) {
        Object.entries(presetAdjustments).forEach(([key, value]) => {
          onAdjustmentChange(key as keyof VideoFrame['adjustments'], value);
        });
      }
    }
  }, [adjustments, onAdjustmentChange]);

  const handleApplyToAllFrames = useCallback(() => {
    if (frames.length > 1 && currentFrame !== null) {
      applyCurrentFrameToAll();
    }
  }, [applyCurrentFrameToAll, frames.length, currentFrame]);

  // Apple-style precision slider with real-time feedback
  const renderSlider = useCallback((
    key: keyof VideoFrame['adjustments'],
    label: string,
    min: number = -100,
    max: number = 100,
    step: number = 1
  ) => {
    const value = adjustments[key] ?? 0; // Fallback to 0 if undefined
    
    return (
      <div className="control-group" key={key}>
        <div className="control-label">
          <span className="control-name">{label}</span>
          <span className="control-value">
            {value > 0 && '+'}
            {value}
          </span>
        </div>
        <div className="slider-container">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const newValue = Number(e.target.value);
              onAdjustmentChange(key, newValue);
            }}
            className="slider"
          />
        </div>
      </div>
    );
  }, [adjustments, onAdjustmentChange]);

  const renderSection = useCallback((
    sectionKey: keyof typeof expandedSections,
    title: string,
    children: React.ReactNode
  ) => (
    <div className="control-section" key={sectionKey}>
      <div 
        className="control-header"
        onClick={() => toggleSection(sectionKey)}
        role="button"
        tabIndex={0}
        aria-expanded={expandedSections[sectionKey]}
      >
        <div className="control-header-content">
          <span className="control-title">{title}</span>
          <ChevronIcon expanded={expandedSections[sectionKey]} />
        </div>
      </div>
      <div className={`control-content ${expandedSections[sectionKey] ? 'expanded' : ''}`}>
        {children}
      </div>
    </div>
  ), [expandedSections, toggleSection]);

  return (
    <div 
      ref={scrollContainerRef} 
      className="animate-slide-in" 
      style={{ height: '100%', overflow: 'auto', scrollBehavior: 'auto' }}
      onScroll={handleScroll}
    >
      {/* Professional Presets */}
      <div className="control-section">
        <div className="control-header">
          <div className="control-header-content">
            <span className="control-title">Presets</span>
          </div>
        </div>
        <div className="control-content expanded">
          <div className="preset-grid">
            {[
              { key: 'vibrant', label: 'Vibrant' },
              { key: 'dramatic', label: 'Dramatic' },
              { key: 'cinematic', label: 'Cinematic' },
              { key: 'vintage', label: 'Vintage' },
              { key: 'natural', label: 'Natural' },
              { key: 'reset', label: 'Reset' },
            ].map((preset) => (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset.key)}
                className={`preset-button ${activePreset === preset.key ? 'active' : ''}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Apply to All Frames */}
      {frames.length > 1 && currentFrame !== null && (
        <div className="control-section">
          <div className="control-header">
            <div className="control-header-content">
              <span className="control-title">Apply Changes</span>
            </div>
          </div>
          <div className="control-content expanded">
            <button
              onClick={handleApplyToAllFrames}
              className="btn btn-primary"
              style={{
                width: '100%',
                marginBottom: '8px'
              }}
            >
              Apply Current Frame to All Frames
            </button>
            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              margin: 0,
              textAlign: 'center'
            }}>
              This will copy all adjustments from frame {(currentFrame || 0) + 1} to all {frames.length} frames
            </p>
          </div>
        </div>
      )}

      {/* Light Adjustments */}
      {renderSection('light', 'Light', (
        <>
          {renderSlider('exposure', 'Exposure')}
          {renderSlider('brilliance', 'Brilliance')}
          {renderSlider('highlights', 'Highlights')}
          {renderSlider('shadows', 'Shadows')}
          {renderSlider('brightness', 'Brightness')}
          {renderSlider('contrast', 'Contrast')}
          {renderSlider('blackPoint', 'Black Point', 0, 100)}
          {renderSlider('whitePoint', 'White Point', 0, 100)}
        </>
      ))}

      {/* Color Adjustments */}
      {renderSection('color', 'Color', (
        <>
          {renderSlider('vibrance', 'Vibrance')}
          {renderSlider('saturation', 'Saturation')}
          {renderSlider('temperature', 'Warmth')}
          {renderSlider('tint', 'Tint')}
          {renderSlider('hue', 'Hue')}
          {renderSlider('colorBalance', 'Color Balance')}
        </>
      ))}

      {/* Detail & Clarity */}
      {renderSection('detail', 'Detail', (
        <>
          {renderSlider('clarity', 'Clarity')}
          {renderSlider('dehaze', 'Dehaze')}
          {renderSlider('sharpening', 'Sharpening', 0, 100)}
          {renderSlider('noiseReduction', 'Noise Reduction', 0, 100)}
          {renderSlider('luminanceNoise', 'Luminance Noise', 0, 100)}
          {renderSlider('colorNoise', 'Color Noise', 0, 100)}
        </>
      ))}

      {/* Effects */}
      {renderSection('effects', 'Effects', (
        <>
          {renderSlider('vignette', 'Vignette')}
          {renderSlider('vignetteFeather', 'Vignette Softness', 0, 100)}
          {renderSlider('grainAmount', 'Grain Amount', 0, 100)}
          {renderSlider('grainSize', 'Grain Size', 1, 10)}
          {renderSlider('fadeAmount', 'Fade', 0, 100)}
        </>
      ))}

      {/* Creative */}
      {renderSection('creative', 'Creative', (
        <>
          {renderSlider('vintage', 'Vintage', 0, 100)}
          {renderSlider('orton', 'Orton Effect', 0, 100)}
          {renderSlider('bleachBypass', 'Bleach Bypass', 0, 100)}
          {renderSlider('crossProcess', 'Cross Process', 0, 100)}
          {renderSlider('splitToning', 'Split Toning')}
          
          <div style={{ height: '16px' }} />
          
          <div className="control-title" style={{ marginBottom: '16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            Color Grading
          </div>
          {renderSlider('shadowsHue', 'Shadows Hue')}
          {renderSlider('shadowsSat', 'Shadows Saturation')}
          {renderSlider('midtonesHue', 'Midtones Hue')}
          {renderSlider('midtonesSat', 'Midtones Saturation')}
          {renderSlider('highlightsHue', 'Highlights Hue')}
          {renderSlider('highlightsSat', 'Highlights Saturation')}
        </>
      ))}
    </div>
  );
};

export default AdvancedControls;