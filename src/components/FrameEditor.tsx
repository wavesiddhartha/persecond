'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useVideoStore } from '@/store/videoStore';
import { applyAdjustmentsGPU } from '@/utils/webglProcessor';
import FrameNavigator from './FrameNavigator';

const FrameEditor = () => {
  const { frames, currentFrame, video } = useVideoStore();
  const [previewImage, setPreviewImage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentFrameData = currentFrame !== null ? frames[currentFrame] : null;
  
  // Calculate optimal layout based on video aspect ratio
  const getOptimalLayout = () => {
    if (!video) return { previewHeight: '60%', frameGridHeight: '40%' };
    
    const aspectRatio = video.width / video.height;
    
    // Portrait videos (height > width): Give more space to preview
    if (aspectRatio < 0.75) {
      return { previewHeight: '70%', frameGridHeight: '30%' };
    }
    // Ultra-wide videos (width >> height): Give more space to frame grid
    else if (aspectRatio > 2.5) {
      return { previewHeight: '50%', frameGridHeight: '50%' };
    }
    // Standard landscape/square: Balanced layout
    else {
      return { previewHeight: '60%', frameGridHeight: '40%' };
    }
  };

  const layout = getOptimalLayout();

  // Update preview when frame or adjustments change using GPU acceleration
  const updatePreview = useCallback(async () => {
    if (!currentFrameData) return;

    setIsProcessing(true);
    try {
      const processedImage = await applyAdjustmentsGPU(
        currentFrameData.imageData,
        currentFrameData.adjustments
      );
      setPreviewImage(processedImage);
    } catch (error) {
      console.error('Failed to apply adjustments:', error);
      setPreviewImage(currentFrameData.imageData);
    } finally {
      setIsProcessing(false);
    }
  }, [currentFrameData]);

  // Debounced preview update for real-time adjustments
  useEffect(() => {
    if (!currentFrameData) return;

    const timeoutId = setTimeout(() => {
      updatePreview();
    }, 50); // Very fast for real-time feedback

    return () => clearTimeout(timeoutId);
  }, [currentFrameData, updatePreview]);


  if (!currentFrameData) {
    return (
      <div className="canvas-container">
        <div style={{ 
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: '14px'
        }}>
          No frame selected
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Main frame display - dynamically sized based on video aspect ratio */}
      <div className="canvas-container animate-fade-in" style={{ height: layout.previewHeight, flexShrink: 0, minHeight: '300px' }}>
        {/* Hidden canvas for processing */}
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
        
        {/* Main frame display */}
        {previewImage ? (
          <img
            src={previewImage}
            alt={`Frame ${currentFrame! + 1}`}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain',
              display: 'block'
            }}
          />
        ) : (
          <div style={{ 
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: '14px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--text-muted)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6"/>
                <path d="M1 12h6m6 0h6"/>
              </svg>
            </div>
            <p>Loading frame...</p>
          </div>
        )}
        
        {/* Processing indicator */}
        {isProcessing && (
          <div style={{ 
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'white',
              fontSize: '14px'
            }}>
              <div style={{ 
                width: '20px',
                height: '20px',
                border: '2px solid white',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              Processing...
            </div>
          </div>
        )}

        {/* Frame info overlay */}
        {!isProcessing && (
          <div style={{ 
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            Frame {currentFrame! + 1} • {currentFrameData.timestamp.toFixed(2)}s
          </div>
        )}
      </div>

      {/* Enhanced Frame Grid - dynamically sized scrollable area */}
      <div style={{ height: layout.frameGridHeight, overflow: 'hidden', minHeight: '180px' }}>
        <FrameNavigator />
      </div>
    </div>
  );
};

export default FrameEditor;