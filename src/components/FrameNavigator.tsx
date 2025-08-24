'use client';

import { useEffect, useRef, useState } from 'react';
import { useVideoStore, VideoFrame } from '@/store/videoStore';

const FrameNavigator = () => {
  const { frames, currentFrame, setCurrentFrame, video } = useVideoStore();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [previewFrame, setPreviewFrame] = useState<number | null>(null);
  const [percentageInput, setPercentageInput] = useState('');

  // Calculate optimal frame size based on video aspect ratio
  const getFrameGridSettings = () => {
    if (!video) return { minWidth: '150px', aspectRatio: '16/9' };
    
    const videoAspectRatio = video.width / video.height;
    
    // Portrait videos: Smaller frames, more columns
    if (videoAspectRatio < 0.75) {
      return { minWidth: '120px', aspectRatio: `${video.width}/${video.height}` };
    }
    // Ultra-wide videos: Larger frames, fewer columns
    else if (videoAspectRatio > 2.5) {
      return { minWidth: '200px', aspectRatio: `${video.width}/${video.height}` };
    }
    // Standard landscape/square
    else {
      return { minWidth: '150px', aspectRatio: `${video.width}/${video.height}` };
    }
  };

  const frameSettings = getFrameGridSettings();

  // Enhanced keyboard navigation with acceleration
  useEffect(() => {
    let keyPressTimeout: NodeJS.Timeout;
    let keyPressCount = 0;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentFrame === null || frames.length === 0) return;
      
      // Clear previous timeout and increment counter for key acceleration
      clearTimeout(keyPressTimeout);
      keyPressCount++;
      
      // Calculate step size based on key press frequency
      const stepSize = keyPressCount > 5 ? Math.min(10, Math.floor(keyPressCount / 3)) : 1;
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (currentFrame > 0) {
            const newFrame = Math.max(0, currentFrame - stepSize);
            setCurrentFrame(newFrame);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentFrame < frames.length - 1) {
            const newFrame = Math.min(frames.length - 1, currentFrame + stepSize);
            setCurrentFrame(newFrame);
          }
          break;
        case 'Home':
          e.preventDefault();
          setCurrentFrame(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentFrame(frames.length - 1);
          break;
        case ' ': // Spacebar for play/pause simulation
          e.preventDefault();
          // Toggle between first and current frame
          setCurrentFrame(currentFrame === 0 ? Math.floor(frames.length / 2) : 0);
          break;
      }
      
      // Reset counter after pause
      keyPressTimeout = setTimeout(() => {
        keyPressCount = 0;
      }, 500);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(keyPressTimeout);
    };
  }, [currentFrame, frames.length, setCurrentFrame]);

  // Auto-scroll to current frame (only within timeline)
  useEffect(() => {
    if (timelineRef.current && currentFrame !== null) {
      const timeline = timelineRef.current;
      const frameElements = timeline.querySelectorAll('button');
      const currentFrameElement = frameElements[currentFrame];
      
      if (currentFrameElement) {
        // Only scroll within the timeline container, not the whole page
        const timelineRect = timeline.getBoundingClientRect();
        const frameRect = currentFrameElement.getBoundingClientRect();
        const scrollLeft = timeline.scrollLeft;
        
        if (frameRect.left < timelineRect.left) {
          timeline.scrollLeft = scrollLeft - (timelineRect.left - frameRect.left) - 40;
        } else if (frameRect.right > timelineRect.right) {
          timeline.scrollLeft = scrollLeft + (frameRect.right - timelineRect.right) + 40;
        }
      }
    }
  }, [currentFrame]);

  if (frames.length === 0) {
    return null;
  }

  const goToPrevious = () => {
    if (currentFrame !== null && currentFrame > 0) {
      setCurrentFrame(currentFrame - 1);
    }
  };

  const goToNext = () => {
    if (currentFrame !== null && currentFrame < frames.length - 1) {
      setCurrentFrame(currentFrame + 1);
    }
  };

  const goToFrame = (frameIndex: number) => {
    setCurrentFrame(frameIndex);
  };

  // Convert frame to percentage
  const frameToPercentage = (frameIndex: number) => {
    if (frames.length <= 1) return 0;
    return Math.round((frameIndex / (frames.length - 1)) * 100);
  };

  // Convert percentage to frame
  const percentageToFrame = (percentage: number) => {
    if (frames.length <= 1) return 0;
    return Math.round((percentage / 100) * (frames.length - 1));
  };

  const goToPercentage = (percentage: number) => {
    const frameIndex = percentageToFrame(percentage);
    setCurrentFrame(frameIndex);
  };

  // Check if a frame has been edited (has non-default adjustments)
  const isFrameEdited = (frame: VideoFrame) => {
    const defaultValues = {
      exposure: 0, brightness: 0, highlights: 0, shadows: 0, contrast: 0,
      brilliance: 0, blackPoint: 0, whitePoint: 0, saturation: 0, vibrance: 0,
      temperature: 0, tint: 0, hue: 0, colorBalance: 0, lights: 0, darks: 0,
      shadowTone: 0, clarity: 0, dehaze: 0, sharpening: 0, noiseReduction: 0,
      luminanceNoise: 0, colorNoise: 0, vignette: 0, grainAmount: 0, grainSize: 2,
      chromaAberration: 0, distortion: 0, shadowsHue: 0, shadowsSat: 0,
      midtonesHue: 0, midtonesSat: 0, highlightsHue: 0, highlightsSat: 0,
      fadeAmount: 0, splitToning: 0, orton: 0, bleachBypass: 0, crossProcess: 0,
      vintage: 0, vignetteFeather: 50
    };
    
    return Object.entries(frame.adjustments).some(([key, value]) => {
      const defaultValue = defaultValues[key as keyof typeof defaultValues] || 0;
      return value !== defaultValue;
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header with navigation and info */}
      <div style={{ flexShrink: 0 }}>
        {/* Quick navigation controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevious}
              disabled={currentFrame === null || currentFrame === 0}
              className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous frame (←)"
            >
              ← Prev
            </button>
            <button
              onClick={goToNext}
              disabled={currentFrame === null || currentFrame === frames.length - 1}
              className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next frame (→)"
            >
              Next →
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">
              {frameToPercentage(currentFrame ?? 0)}%
            </div>
            <div className="text-xs text-gray-500">
              Frame {(currentFrame ?? 0) + 1} of {frames.length}
            </div>
          </div>
          
          {/* Quick jump */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="100"
              value={percentageInput}
              onChange={(e) => setPercentageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const percentage = Math.max(0, Math.min(100, parseInt(percentageInput) || 0));
                  goToPercentage(percentage);
                  setPercentageInput('');
                }
              }}
              placeholder="0-100"
              className="w-14 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-600">%</span>
            <button
              onClick={() => {
                const percentage = Math.max(0, Math.min(100, parseInt(percentageInput) || 0));
                goToPercentage(percentage);
                setPercentageInput('');
              }}
              disabled={!percentageInput}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
            >
              Go
            </button>
          </div>
        </div>

        {/* Compact percentage slider */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-xs text-gray-500">0%</span>
          <div className="flex-1 relative">
            <input
              type="range"
              min={0}
              max={100}
              value={isSliding ? frameToPercentage(previewFrame ?? 0) : frameToPercentage(currentFrame ?? 0)}
              onInput={(e) => {
                const percentage = parseInt((e.target as HTMLInputElement).value);
                const newFrame = percentageToFrame(percentage);
                setIsSliding(true);
                setPreviewFrame(newFrame);
                setCurrentFrame(newFrame);
              }}
              onChange={(e) => {
                const percentage = parseInt((e.target as HTMLInputElement).value);
                const newFrame = percentageToFrame(percentage);
                goToFrame(newFrame);
                setIsSliding(false);
                setPreviewFrame(null);
              }}
              onMouseDown={() => setIsSliding(true)}
              onMouseUp={() => {
                setIsSliding(false);
                setPreviewFrame(null);
              }}
              onTouchStart={() => setIsSliding(true)}
              onTouchEnd={() => {
                setIsSliding(false);
                setPreviewFrame(null);
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${isSliding ? frameToPercentage(previewFrame ?? 0) : frameToPercentage(currentFrame ?? 0)}%, #e5e7eb ${isSliding ? frameToPercentage(previewFrame ?? 0) : frameToPercentage(currentFrame ?? 0)}%, #e5e7eb 100%)`
              }}
            />
          </div>
          <span className="text-xs text-gray-500">100%</span>
        </div>

        {/* Frame info */}
        <div className="text-xs text-gray-500 text-center">
          ← → Arrow keys • Home/End • Click frames below to select
        </div>
      </div>

      {/* Large Frame Grid - dynamically sized based on video aspect ratio */}
      <div 
        ref={timelineRef}
        style={{ 
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${frameSettings.minWidth}, 1fr))`,
          gap: '12px',
          overflow: 'auto',
          padding: '8px',
          background: '#f8f9fa',
          borderRadius: '8px'
        }}
      >
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            onClick={() => goToFrame(index)}
            className={`relative rounded-lg border-3 overflow-hidden transition-all hover:scale-102 focus:outline-none focus:ring-3 focus:ring-blue-500 ${
              index === (currentFrame ?? 0)
                ? 'border-black ring-3 ring-black/20 shadow-xl'
                : 'border-gray-300 hover:border-gray-500 hover:shadow-lg'
            }`}
            style={{
              aspectRatio: frameSettings.aspectRatio,
              background: 'white',
              minHeight: '80px'
            }}
            title={`Frame ${index + 1} - ${frame.timestamp.toFixed(2)}s - ${frameToPercentage(index)}%`}
          >
            <img
              src={frame.imageData}
              alt={`Frame ${index + 1}`}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                display: 'block'
              }}
            />
            
            {/* Frame info overlay */}
            <div 
              style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: '600'
              }}
            >
              #{index + 1}
            </div>

            {/* Percentage indicator */}
            <div 
              style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                fontSize: '10px',
                padding: '2px 5px',
                borderRadius: '3px',
                fontWeight: '500'
              }}
            >
              {frameToPercentage(index)}%
            </div>

            {/* Timestamp */}
            <div 
              style={{
                position: 'absolute',
                top: '4px',
                left: '4px',
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                fontSize: '10px',
                padding: '2px 5px',
                borderRadius: '3px',
                fontWeight: '500'
              }}
            >
              {frame.timestamp.toFixed(1)}s
            </div>
            
            {/* Edited indicator */}
            {isFrameEdited(frame) && (
              <div 
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: '#10b981',
                  color: 'white',
                  fontSize: '9px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
              >
                EDITED
              </div>
            )}

            {/* Current frame indicator */}
            {index === (currentFrame ?? 0) && (
              <div 
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '3px solid #3b82f6',
                  borderRadius: '8px',
                  pointerEvents: 'none'
                }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FrameNavigator;