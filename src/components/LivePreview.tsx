'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useVideoStore } from '@/store/videoStore';
import { applyAdjustmentsGPU } from '@/utils/webglProcessor';

const LivePreview = () => {
  const { frames, currentFrame } = useVideoStore();
  const [currentPreviewImage, setCurrentPreviewImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate real-time preview of current frame
  const generatePreview = useCallback(async () => {
    if (!frames.length) return;
    const frameIndex = currentFrame ?? 0; // Use frame 0 if currentFrame is null
    
    setIsProcessing(true);
    
    try {
      const frame = frames[frameIndex];
      const processedImage = await applyAdjustmentsGPU(
        frame.imageData,
        frame.adjustments
      );
      setCurrentPreviewImage(processedImage);
    } catch (error) {
      console.error('Failed to generate preview:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [frames, currentFrame]);

  // Auto-generate preview when current frame or adjustments change
  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  // Update preview when adjustments change for current frame
  useEffect(() => {
    const frameIndex = currentFrame ?? 0;
    if (frames[frameIndex]) {
      const timeoutId = setTimeout(() => {
        generatePreview();
      }, 100); // Debounce for better performance
      
      return () => clearTimeout(timeoutId);
    }
  }, [frames, currentFrame, generatePreview]);

  if (frames.length === 0) {
    return (
      <div className="preview-container">
        <div className="preview-placeholder">
          No video loaded
        </div>
      </div>
    );
  }

  return (
    <div className="preview-container">
      {/* Main preview canvas */}
      <canvas
        ref={canvasRef}
        className="preview-canvas"
        style={{ display: 'none' }}
      />
      
      {/* Preview image */}
      {currentPreviewImage ? (
        <img
          src={currentPreviewImage}
          alt={`Frame ${(currentFrame || 0) + 1} preview`}
          className="preview-canvas"
        />
      ) : (
        <div className="preview-placeholder">
          {isProcessing ? 'Processing...' : 'Loading preview...'}
        </div>
      )}
      
      {/* Processing indicator */}
      {isProcessing && (
        <div 
          className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs flex items-center gap-1"
          style={{ fontSize: '11px' }}
        >
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          Processing
        </div>
      )}
      
      {/* Frame info */}
      {!isProcessing && frames.length > 0 && (
        <div 
          className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs"
          style={{ fontSize: '11px' }}
        >
          Frame {(currentFrame ?? 0) + 1} of {frames.length}
        </div>
      )}
    </div>
  );
};

export default LivePreview;