'use client';

import { useCallback, useState } from 'react';
import { useVideoStore } from '@/store/videoStore';
import { extractFrames } from '@/utils/videoProcessor';

const VideoUpload = () => {
  const { setVideo, setFrames, setProcessing, setProgress, isProcessing, progress } = useVideoStore();
  
  // Add processing stage state
  const [processingStage, setProcessingStage] = useState('');

  const handleFileSelect = useCallback(async (file: File) => {
    // Check file extension and MIME type for better compatibility
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp', '.wmv'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!file.type.startsWith('video/') && !hasValidExtension) {
      alert('Please select a valid video file. Supported formats: MP4, MOV, AVI, MKV, WebM, M4V, 3GP, WMV');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProcessingStage('Loading video...');

    try {
      // Create video element to get metadata with better compatibility
      const videoUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      
      // Set video properties for better compatibility
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      video.muted = true; // Required for autoplay in many browsers
      
      await new Promise((resolve, reject) => {
        let resolved = false;
        
        const cleanup = () => {
          video.onloadedmetadata = null;
          video.onerror = null;
          video.oncanplay = null;
        };
        
        const handleResolve = () => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(undefined);
          }
        };
        
        const handleReject = (error: any) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(error);
          }
        };
        
        video.onloadedmetadata = handleResolve;
        video.oncanplay = handleResolve; // Fallback for some formats
        video.onerror = (e) => {
          console.error('Video loading error:', e);
          handleReject(new Error(`Failed to load video: ${file.name}. This format may not be supported by your browser.`));
        };
        
        // Timeout after 30 seconds
        setTimeout(() => {
          handleReject(new Error('Video loading timeout. Please try a different file or format.'));
        }, 30000);
        
        video.src = videoUrl;
        video.load();
      });

      const videoInfo = {
        file,
        name: file.name,
        duration: video.duration,
        fps: 30, // Default, will be calculated more accurately later
        width: video.videoWidth,
        height: video.videoHeight,
        format: file.name.split('.').pop() || 'mp4',
      };

      setVideo(videoInfo);
      setProcessingStage('Analyzing video format and framerate...');

      // Extract frames with native framerate detection
      const { frames, detectedFPS } = await extractFrames(file, (progress) => {
        setProgress(progress);
        
        // Update processing stage based on progress
        if (progress < 10) {
          setProcessingStage('Analyzing video properties...');
        } else if (progress < 30) {
          setProcessingStage('Extracting frames from video...');
        } else if (progress < 60) {
          setProcessingStage(`Converting frames: ${Math.round(progress)}% complete...`);
        } else if (progress < 85) {
          setProcessingStage('Processing extracted frames...');
        } else if (progress < 95) {
          setProcessingStage('Preparing frame data...');
        } else {
          setProcessingStage('Loading frames into editor...');
        }
      });

      // Debug logging
      console.log('Video Processing Complete:', {
        originalFile: file.name,
        duration: video.duration,
        detectedFPS: detectedFPS,
        framesExtracted: frames.length,
        firstFrameTime: frames[0]?.timestamp,
        lastFrameTime: frames[frames.length - 1]?.timestamp,
        frameInterval: frames.length > 1 ? (frames[frames.length - 1].timestamp - frames[0].timestamp) / (frames.length - 1) : 0
      });

      // Update video info with detected FPS
      const updatedVideoInfo = {
        ...videoInfo,
        fps: detectedFPS
      };
      
      setVideo(updatedVideoInfo);
      
      // Keep processing state while frames are being set and rendered
      setProcessingStage('Finalizing frame display...');
      setProgress(98);
      
      // Add a small delay to ensure frames are properly set before hiding processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setFrames(frames);
      URL.revokeObjectURL(videoUrl);
      
      // Final delay to ensure UI has updated with frames
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('Error processing video:', error);
      
      // Provide specific error messages
      let errorMessage = 'Failed to process video. ';
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage += 'The video took too long to load. Please try a smaller file or different format.';
        } else if (error.message.includes('not supported')) {
          errorMessage += 'This video format is not supported by your browser. Please try converting to MP4 or WebM format.';
        } else if (error.message.includes('Failed to load video')) {
          errorMessage += 'Your browser cannot play this video format. Supported formats: MP4 (H.264), WebM, MOV (QuickTime).';
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Please try again with a different video file.';
      }
      
      alert(errorMessage);
    } finally {
      setProcessing(false);
      setProcessingStage('');
    }
  }, [setVideo, setFrames, setProcessing, setProgress]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (isProcessing) {
    return (
      <div className="upload-area">
        <div className="max-w-md mx-auto text-center">
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '32px'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              border: '4px solid var(--border)',
              borderTop: '4px solid var(--primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)'
            }}></div>
          </div>
          <h2 className="upload-title">Processing Video</h2>
          <p className="upload-subtitle" style={{ marginBottom: '24px' }}>
            {processingStage || 'Converting video into individual frames...'}
          </p>
          <div style={{ 
            fontSize: '14px', 
            color: 'var(--text-secondary)', 
            marginBottom: '20px',
            fontWeight: '500'
          }}>
            This may take a moment for longer videos
          </div>
          
          {/* Progress Bar */}
          <div className="progress-container">
            <div className="progress-header">
              <span className="progress-label">Progress</span>
              <span className="progress-percentage">{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div style={{ 
            marginTop: '32px', 
            padding: '20px', 
            background: 'var(--surface-elevated)', 
            border: '1px solid var(--border)', 
            borderRadius: 'var(--radius-xl)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: '1.5'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                borderRadius: '50%', 
                background: 'var(--success)',
                boxShadow: '0 0 6px rgba(5, 150, 105, 0.4)'
              }}/>
              <strong>Processing your video locally in the browser</strong>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              • No data leaves your device - complete privacy<br/>
              • Frame extraction may take a moment for longer videos<br/>
              • Keep this tab open until processing completes
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="upload-zone"
      >
        <h2 className="upload-title">Upload Your Video</h2>
        <p className="upload-subtitle">
          Drag and drop your video file here, or click to browse<br />
          Supports MP4, MOV, AVI, MKV and more formats
        </p>
        
        <input
          type="file"
          accept="video/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
          className="hidden"
          id="video-upload"
        />
        <label 
          htmlFor="video-upload" 
          className="btn btn-primary cursor-pointer"
        >
          Choose Video File
        </label>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: '24px', 
        marginTop: '32px',
        maxWidth: '600px',
        margin: '32px auto 0'
      }}>
        <div style={{ 
          padding: '20px', 
          background: 'var(--surface-elevated)', 
          border: '1px solid var(--border)', 
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <div style={{ fontSize: '20px', color: 'var(--text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <circle cx="12" cy="16" r="1"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <h4 style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              color: 'var(--text-primary)', 
              marginBottom: '4px' 
            }}>
              Privacy First
            </h4>
            <p style={{ 
              fontSize: '12px', 
              color: 'var(--text-secondary)', 
              lineHeight: '1.4' 
            }}>
              Your video never leaves your device. All processing happens locally in your browser.
            </p>
          </div>
        </div>
        
        <div style={{ 
          padding: '20px', 
          background: 'var(--surface-elevated)', 
          border: '1px solid var(--border)', 
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <div style={{ fontSize: '20px', color: 'var(--text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div>
            <h4 style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              color: 'var(--text-primary)', 
              marginBottom: '4px' 
            }}>
              Professional Tools
            </h4>
            <p style={{ 
              fontSize: '12px', 
              color: 'var(--text-secondary)', 
              lineHeight: '1.4' 
            }}>
              Advanced editing controls including exposure, color grading, and more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoUpload;