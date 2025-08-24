// Simple, reliable video export using processed frames
import { VideoFrame, VideoInfo } from '@/store/videoStore';
import { applyAdjustmentsGPU } from './webglProcessor';

export async function exportVideoSimple(
  frames: VideoFrame[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('🎬 Using Simple Video Export (most reliable)');
  
  try {
    // Validate inputs
    if (!frames || frames.length === 0) {
      throw new Error('No frames provided for export');
    }
    
    if (!videoInfo) {
      throw new Error('No video information provided');
    }
    
    if (frames.length > 1000) {
      console.warn(`⚠️ Large number of frames (${frames.length}), export may be slow`);
    }
    
    onProgress?.(0);
    
    // Check browser compatibility first
    if (!window.MediaRecorder) {
      throw new Error('Your browser does not support video export. Please use Chrome, Firefox, or Safari.');
    }
    
    // Process all frames first
    console.log(`🎨 Processing ${frames.length} frames with adjustments...`);
    const processedFrames: string[] = [];
    let failedFrames = 0;
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      
      try {
        // Validate frame data
        if (!frame || !frame.imageData) {
          console.warn(`⚠️ Frame ${i} has no image data, skipping`);
          failedFrames++;
          continue;
        }
        
        if (!frame.imageData.startsWith('data:image/')) {
          console.warn(`⚠️ Frame ${i} has invalid image data format, using original`);
          processedFrames.push(frame.imageData);
          continue;
        }
        
        // Apply adjustments to each frame with timeout
        const processStart = Date.now();
        const processedImageData = await Promise.race([
          applyAdjustmentsGPU(frame.imageData, frame.adjustments),
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Frame processing timeout')), 10000)
          )
        ]);
        
        const processTime = Date.now() - processStart;
        if (processTime > 2000) {
          console.warn(`⚠️ Frame ${i} took ${processTime}ms to process (slow)`);
        }
        
        processedFrames.push(processedImageData);
        
        if (i === 0) {
          console.log(`✅ First frame processed successfully in ${processTime}ms`);
        }
        
      } catch (frameError) {
        console.warn(`⚠️ Frame ${i} processing failed, using original:`, frameError);
        failedFrames++;
        
        // Use original frame data as fallback
        if (frame.imageData && frame.imageData.startsWith('data:image/')) {
          processedFrames.push(frame.imageData);
        }
      }
      
      const progress = (i / frames.length) * 60; // 0-60%
      onProgress?.(progress);
    }
    
    if (processedFrames.length === 0) {
      throw new Error('No valid frames could be processed for export');
    }
    
    if (failedFrames > 0) {
      console.warn(`⚠️ ${failedFrames} frames failed to process, but continuing with ${processedFrames.length} valid frames`);
    }
    
    onProgress?.(70);
    
    // Try advanced export with audio first, then fallback to simple
    console.log(`🎬 Creating high-quality video from ${processedFrames.length} processed frames...`);
    
    try {
      // First attempt: High-quality export with audio preservation
      const videoBlob = await createHighQualityVideoWithAudio(processedFrames, videoInfo, onProgress);
      
      if (videoBlob && videoBlob.size > 0) {
        onProgress?.(100);
        console.log(`✅ High-quality export with audio completed: ${videoBlob.size} bytes (${(videoBlob.size / 1024 / 1024).toFixed(2)}MB)`);
        return videoBlob;
      }
    } catch (audioExportError) {
      console.warn('⚠️ High-quality export failed, trying basic export:', audioExportError);
    }
    
    // Fallback: Basic WebM export
    console.log(`🔄 Falling back to basic video export...`);
    const videoBlob = await createWebMFromFrames(processedFrames, videoInfo, onProgress);
    
    if (!videoBlob || videoBlob.size === 0) {
      throw new Error('Generated video has zero size - export failed');
    }
    
    onProgress?.(100);
    console.log(`✅ Basic video export completed: ${videoBlob.size} bytes (${(videoBlob.size / 1024 / 1024).toFixed(2)}MB)`);
    
    return videoBlob;
    
  } catch (error) {
    console.error('❌ Simple video export failed:', error);
    
    // Provide more helpful error messages
    let userFriendlyMessage = 'Video export failed';
    
    if (error instanceof Error) {
      if (error.message.includes('MediaRecorder')) {
        userFriendlyMessage = 'Your browser does not support video recording. Please try Chrome, Firefox, or Safari.';
      } else if (error.message.includes('canvas')) {
        userFriendlyMessage = 'Canvas rendering failed. Please try refreshing the page or using a different browser.';
      } else if (error.message.includes('timeout')) {
        userFriendlyMessage = 'Export timed out. Try reducing the number of frames or using a faster device.';
      } else if (error.message.includes('zero size')) {
        userFriendlyMessage = 'Export produced an empty file. Check your browser console for details.';
      } else {
        userFriendlyMessage = error.message;
      }
    }
    
    throw new Error(userFriendlyMessage);
  }
}

// Create WebM video using Canvas and MediaRecorder (most reliable method)
async function createWebMFromFrames(
  frames: string[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      // Check if MediaRecorder is available
      if (!window.MediaRecorder) {
        reject(new Error('MediaRecorder API not supported in this browser'));
        return;
      }

      // Create canvas with proper error handling
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { 
        alpha: false, 
        willReadFrequently: false 
      });
      
      if (!ctx) {
        reject(new Error('Cannot create canvas context - WebGL may be disabled'));
        return;
      }
      
      // MAINTAIN ORIGINAL RESOLUTION - No artificial limits for quality
      const width = videoInfo.width;
      const height = videoInfo.height;
      
      canvas.width = width;
      canvas.height = height;
      
      // Validate frames
      if (!frames || frames.length === 0) {
        reject(new Error('No frames provided for export'));
        return;
      }
      
      console.log(`📹 Setting up canvas: ${width}x${height}, ${frames.length} frames`);
      
      // Setup MediaRecorder with enhanced compatibility
      const targetFPS = Math.min(30, Math.max(10, videoInfo.fps || 15));
      let stream: MediaStream;
      
      try {
        stream = canvas.captureStream(targetFPS);
        if (!stream || stream.getTracks().length === 0) {
          reject(new Error('Failed to capture canvas stream'));
          return;
        }
      } catch (streamError) {
        reject(new Error(`Canvas stream creation failed: ${streamError instanceof Error ? streamError.message : 'Unknown error'}`));
        return;
      }
      
      // Try different codecs with better fallbacks
      const codecs = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm;codecs=h264',
        'video/webm',
        'video/mp4;codecs=h264',
        'video/mp4'
      ];
      
      let selectedCodec = '';
      let bitrate = 2500000; // Default 2.5 Mbps
      
      for (const codec of codecs) {
        try {
          if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(codec)) {
            selectedCodec = codec;
            break;
          }
        } catch (codecError) {
          console.warn(`Codec check failed for ${codec}:`, codecError);
        }
      }
      
      // Fallback for very old browsers
      if (!selectedCodec) {
        try {
          // Try basic WebM without codec specification
          if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm')) {
            selectedCodec = 'video/webm';
            bitrate = 1000000; // Lower bitrate for compatibility
          } else {
            reject(new Error('No supported video codec found - browser may be too old'));
            return;
          }
        } catch {
          reject(new Error('No supported video codec found - browser may be too old'));
          return;
        }
      }
      
      console.log(`📹 Using codec: ${selectedCodec} at ${targetFPS}fps, ${bitrate}bps`);
      
      // Create MediaRecorder with proper error handling
      let mediaRecorder: MediaRecorder;
      try {
        const options: MediaRecorderOptions = {
          mimeType: selectedCodec
        };
        
        // Only add bitrate if supported (some browsers don't support it)
        try {
          if (bitrate > 0) {
            options.videoBitsPerSecond = bitrate;
          }
        } catch {
          console.warn('Bitrate setting not supported, using default');
        }
        
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (recorderError) {
        reject(new Error(`MediaRecorder creation failed: ${recorderError instanceof Error ? recorderError.message : 'Unknown error'}`));
        return;
      }
      
      const chunks: Blob[] = [];
      let currentFrameIndex = 0;
      let hasReceivedData = false;
      const recordingTimeout: NodeJS.Timeout = setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          console.warn('⚠️ Recording timeout, stopping...');
          try {
            mediaRecorder.stop();
          } catch {
            reject(new Error('Recording timeout and failed to stop'));
          }
        }
      }, Math.max(30000, frames.length * 200)); // At least 30s, or 200ms per frame
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
          hasReceivedData = true;
          console.log(`📊 Received chunk: ${event.data.size} bytes (total chunks: ${chunks.length})`);
        }
      };
      
      mediaRecorder.onstop = () => {
        clearTimeout(recordingTimeout);
        
        if (chunks.length === 0 || !hasReceivedData) {
          reject(new Error('No video data was recorded - check browser compatibility'));
          return;
        }
        
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
        if (totalSize === 0) {
          reject(new Error('Recorded video has zero size'));
          return;
        }
        
        console.log(`✅ Recording complete: ${chunks.length} chunks, ${totalSize} bytes total`);
        
        const videoBlob = new Blob(chunks, { type: selectedCodec.split(';')[0] });
        if (videoBlob.size === 0) {
          reject(new Error('Final video blob has zero size'));
          return;
        }
        
        resolve(videoBlob);
      };
      
      mediaRecorder.onerror = (event) => {
        clearTimeout(recordingTimeout);
        console.error('MediaRecorder error:', event);
        const errorMessage = event instanceof ErrorEvent && event.error?.message 
          ? event.error.message 
          : 'Recording failed';
        reject(new Error(`MediaRecorder error: ${errorMessage}`));
      };
      
      // Start recording with error handling
      try {
        mediaRecorder.start(200); // Collect data every 200ms for better compatibility
        console.log('🎬 Recording started');
      } catch (startError) {
        reject(new Error(`Failed to start recording: ${startError instanceof Error ? startError.message : 'Unknown error'}`));
        return;
      }
      
      
      // Function to draw next frame with improved error handling
      const drawFrame = async () => {
        try {
          if (currentFrameIndex >= frames.length) {
            // Finished all frames - give a moment for last frame to be captured
            console.log(`🎬 All ${frames.length} frames processed, finishing recording...`);
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                try {
                  mediaRecorder.stop();
                } catch {
                  console.error('Error stopping recorder');
                  reject(new Error('Failed to stop recording'));
                }
              }
            }, 1000); // Longer delay to ensure last frame is captured
            return;
          }
          
          const frameData = frames[currentFrameIndex];
          
          // Validate frame data
          if (!frameData || !frameData.startsWith('data:image/')) {
            console.warn(`⚠️ Invalid frame data at index ${currentFrameIndex}, using blank frame`);
            // Draw a blank frame instead of skipping
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            currentFrameIndex++;
            const progress = 80 + (currentFrameIndex / frames.length) * 20; // 80-100%
            onProgress?.(progress);
            
            requestAnimationFrame(() => {
              setTimeout(drawFrame, Math.max(16, 1000 / targetFPS));
            });
            return;
          }
          
          const img = new Image();
          let frameDrawn = false;
          
          // Set up timeout for frame loading
          const frameTimeout = setTimeout(() => {
            if (!frameDrawn) {
              console.warn(`⚠️ Frame ${currentFrameIndex} load timeout, using blank frame`);
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              currentFrameIndex++;
              const progress = 80 + (currentFrameIndex / frames.length) * 20;
              onProgress?.(progress);
              
              requestAnimationFrame(() => {
              setTimeout(drawFrame, Math.max(16, 1000 / targetFPS));
            });
            }
          }, 5000); // 5 second timeout per frame
          
          img.onload = () => {
            if (frameDrawn) return; // Prevent double processing
            frameDrawn = true;
            clearTimeout(frameTimeout);
            
            try {
              // Clear canvas and draw frame
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // Ensure image fits canvas properly
              const imgAspect = img.width / img.height;
              const canvasAspect = canvas.width / canvas.height;
              
              let drawWidth = canvas.width;
              let drawHeight = canvas.height;
              let drawX = 0;
              let drawY = 0;
              
              // Scale image to fit canvas while maintaining aspect ratio
              if (imgAspect > canvasAspect) {
                drawHeight = canvas.width / imgAspect;
                drawY = (canvas.height - drawHeight) / 2;
              } else {
                drawWidth = canvas.height * imgAspect;
                drawX = (canvas.width - drawWidth) / 2;
              }
              
              ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
              
              if (currentFrameIndex === 0) {
                console.log(`✅ First frame drawn successfully (${img.width}x${img.height} -> ${Math.round(drawWidth)}x${Math.round(drawHeight)})`);
              }
              
            } catch (drawError) {
              console.error(`❌ Error drawing frame ${currentFrameIndex}:`, drawError);
              // Draw black frame as fallback
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            currentFrameIndex++;
            const progress = 80 + (currentFrameIndex / frames.length) * 20;
            onProgress?.(progress);
            
            // Use requestAnimationFrame for smoother performance
            requestAnimationFrame(() => {
              setTimeout(drawFrame, Math.max(16, 1000 / targetFPS));
            });
          };
          
          img.onerror = () => {
            if (frameDrawn) return;
            frameDrawn = true;
            clearTimeout(frameTimeout);
            
            console.warn(`⚠️ Failed to load frame ${currentFrameIndex}, using blank frame`);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            currentFrameIndex++;
            const progress = 80 + (currentFrameIndex / frames.length) * 20;
            onProgress?.(progress);
            
            requestAnimationFrame(() => {
              setTimeout(drawFrame, Math.max(16, 1000 / targetFPS));
            });
          };
          
          img.src = frameData;
          
        } catch (frameError) {
          console.error(`❌ Unexpected error processing frame ${currentFrameIndex}:`, frameError);
          
          // Continue with next frame to prevent stalling
          currentFrameIndex++;
          const progress = 80 + (currentFrameIndex / frames.length) * 20;
          onProgress?.(progress);
          
          setTimeout(drawFrame, Math.max(33, 1000 / targetFPS));
        }
      };
      
      // Start drawing frames after a small delay
      setTimeout(() => {
        console.log(`🎬 Starting to draw ${frames.length} frames at ${targetFPS}fps`);
        drawFrame();
      }, 500); // Give MediaRecorder time to start properly
      
    } catch (setupError) {
      reject(new Error(`Setup failed: ${setupError instanceof Error ? setupError.message : 'Unknown error'}`));
    }
  });
}

// High-quality video export with audio preservation and original resolution
async function createHighQualityVideoWithAudio(
  frames: string[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      console.log(`🎵 Starting high-quality export with audio preservation...`);
      
      // Create two canvases - one for video frames, one for compositing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { 
        alpha: false, 
        willReadFrequently: false
      }) as CanvasRenderingContext2D | null;
      
      if (!ctx) {
        reject(new Error('Cannot create high-performance canvas context'));
        return;
      }
      
      // MAINTAIN ORIGINAL RESOLUTION - No downscaling for 4K/8K
      const width = videoInfo.width;  // Keep original width
      const height = videoInfo.height; // Keep original height
      
      canvas.width = width;
      canvas.height = height;
      
      console.log(`🎯 Maintaining original resolution: ${width}x${height}`);
      
      // Create video element to extract audio from original video
      const videoElement = document.createElement('video');
      videoElement.crossOrigin = 'anonymous';
      videoElement.muted = false; // Ensure audio is not muted
      
      let audioContext: AudioContext | null = null;
      let sourceNode: MediaElementAudioSourceNode | null = null;
      let destinationStream: MediaStream | null = null;
      
      // Setup audio processing
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
        audioContext = new AudioContextClass();
        sourceNode = audioContext.createMediaElementSource(videoElement);
        const destination = audioContext.createMediaStreamDestination();
        sourceNode.connect(destination);
        sourceNode.connect(audioContext.destination); // Also play through speakers
        destinationStream = destination.stream;
        
        console.log('🎵 Audio context and routing established');
      } catch (audioSetupError) {
        console.warn('⚠️ Audio setup failed, proceeding video-only:', audioSetupError);
      }
      
      // Setup canvas stream with higher quality
      const targetFPS = Math.min(60, Math.max(24, videoInfo.fps || 30)); // Support up to 60fps
      const canvasStream = canvas.captureStream(targetFPS);
      
      // Combine video and audio streams
      let combinedStream: MediaStream;
      if (destinationStream && destinationStream.getAudioTracks().length > 0) {
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...destinationStream.getAudioTracks()
        ]);
        console.log('✅ Combined video + audio stream created');
      } else {
        combinedStream = canvasStream;
        console.log('⚠️ Video-only stream (no audio available)');
      }
      
      // Enhanced codec selection for higher quality
      const highQualityCodecs = [
        'video/webm;codecs=vp9,opus',     // VP9 with Opus audio
        'video/webm;codecs=vp8,opus',     // VP8 with Opus audio
        'video/webm;codecs=h264,opus',    // H264 with Opus audio
        'video/mp4;codecs=h264,aac',      // H264 with AAC audio
        'video/webm;codecs=vp9',          // VP9 video only
        'video/webm;codecs=vp8',          // VP8 video only
        'video/webm'                      // Basic WebM
      ];
      
      let selectedCodec = '';
      for (const codec of highQualityCodecs) {
        try {
          if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(codec)) {
            selectedCodec = codec;
            console.log(`🎥 Selected high-quality codec: ${codec}`);
            break;
          }
        } catch (codecError) {
          console.warn(`Codec check failed for ${codec}:`, codecError);
        }
      }
      
      if (!selectedCodec) {
        selectedCodec = 'video/webm';
        console.warn('⚠️ Using fallback codec: video/webm');
      }
      
      // Calculate high-quality bitrate based on resolution
      const pixelCount = width * height;
      let videoBitrate = 8000000; // Default 8 Mbps
      let audioBitrate = 256000;  // 256 kbps audio
      
      if (pixelCount >= 3840 * 2160) {      // 4K+
        videoBitrate = 45000000;  // 45 Mbps for 4K
        audioBitrate = 320000;    // 320 kbps audio
      } else if (pixelCount >= 2560 * 1440) { // 1440p
        videoBitrate = 16000000;  // 16 Mbps for 1440p
        audioBitrate = 256000;
      } else if (pixelCount >= 1920 * 1080) { // 1080p
        videoBitrate = 8000000;   // 8 Mbps for 1080p
        audioBitrate = 192000;
      }
      
      console.log(`🎯 Quality settings: ${videoBitrate / 1000000}Mbps video, ${audioBitrate / 1000}kbps audio`);
      
      // Create MediaRecorder with high-quality settings
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: selectedCodec,
        videoBitsPerSecond: videoBitrate,
        audioBitsPerSecond: audioBitrate
      });
      
      const chunks: Blob[] = [];
      let currentFrameIndex = 0;
      let hasReceivedData = false;
      
      // Load original video for audio timing
      const loadVideo = new Promise<void>((videoResolve) => {
        videoElement.onloadedmetadata = () => {
          console.log(`📹 Original video loaded: ${videoElement.duration}s duration`);
          videoResolve();
        };
        
        videoElement.onerror = () => {
          console.warn('⚠️ Could not load original video for audio');
          videoResolve(); // Continue without audio
        };
        
        // Convert File to blob URL for video element
        if (videoInfo.file) {
          const videoURL = URL.createObjectURL(videoInfo.file);
          videoElement.src = videoURL;
        } else {
          console.warn('⚠️ No original video file available');
          videoResolve();
        }
        
        // Timeout for video loading
        setTimeout(() => {
          console.warn('⚠️ Video loading timeout, continuing without audio');
          videoResolve();
        }, 5000);
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
          hasReceivedData = true;
          console.log(`📊 High-quality chunk: ${event.data.size} bytes (total: ${chunks.length})`);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Cleanup
        if (audioContext) {
          audioContext.close();
        }
        if (videoElement.src) {
          URL.revokeObjectURL(videoElement.src);
        }
        
        if (chunks.length === 0 || !hasReceivedData) {
          reject(new Error('No high-quality video data was recorded'));
          return;
        }
        
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
        console.log(`✅ High-quality recording complete: ${chunks.length} chunks, ${totalSize} bytes total`);
        
        const videoBlob = new Blob(chunks, { type: selectedCodec.split(';')[0] });
        resolve(videoBlob);
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('High-quality MediaRecorder error:', event);
        const errorMessage = event instanceof ErrorEvent && event.error?.message 
          ? event.error.message 
          : 'High-quality recording failed';
        reject(new Error(`High-quality export error: ${errorMessage}`));
      };
      
      // Wait for video to load, then start recording
      loadVideo.then(() => {
        try {
          mediaRecorder.start(100); // Higher frequency data collection for quality
          console.log('🎬 High-quality recording started with audio');
          
          // Start playing original video for audio synchronization
          if (videoElement.src && audioContext) {
            videoElement.currentTime = 0;
            videoElement.play().catch(err => console.warn('Video play failed:', err));
          }
          
          // Start frame rendering with optimized timing
          renderHighQualityFrames();
          
        } catch (startError) {
          reject(new Error(`Failed to start high-quality recording: ${startError instanceof Error ? startError.message : 'Unknown error'}`));
        }
      });
      
      // Optimized frame rendering function
      const renderHighQualityFrames = () => {
        const frameDuration = 1000 / targetFPS;
        let lastFrameTime = 0;
        
        const drawFrame = (currentTime: number) => {
          if (currentFrameIndex >= frames.length) {
            // Finished all frames
            console.log(`🎬 All ${frames.length} high-quality frames processed`);
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }, 500);
            return;
          }
          
          // Throttle frame rate to prevent lag
          if (currentTime - lastFrameTime >= frameDuration) {
            const frameData = frames[currentFrameIndex];
            
            if (frameData && frameData.startsWith('data:image/')) {
              const img = new Image();
              img.onload = () => {
                try {
                  // Clear and draw frame maintaining aspect ratio
                  ctx.fillStyle = '#000000';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  
                  // Draw image at full resolution
                  ctx.drawImage(img, 0, 0, width, height);
                  
                  if (currentFrameIndex === 0) {
                    console.log(`✅ First high-quality frame rendered at ${width}x${height}`);
                  }
                  
                } catch (drawError) {
                  console.error(`❌ Error drawing high-quality frame ${currentFrameIndex}:`, drawError);
                }
              };
              img.src = frameData;
            }
            
            currentFrameIndex++;
            const progress = 80 + (currentFrameIndex / frames.length) * 20;
            onProgress?.(progress);
            
            lastFrameTime = currentTime;
          }
          
          // Continue rendering
          if (currentFrameIndex < frames.length) {
            requestAnimationFrame(drawFrame);
          }
        };
        
        requestAnimationFrame(drawFrame);
      };
      
      // Safety timeout for high-quality export
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          console.warn('⚠️ High-quality export timeout, stopping...');
          mediaRecorder.stop();
        }
      }, Math.max(60000, frames.length * 500)); // More time for high-quality processing
      
    } catch (setupError) {
      reject(new Error(`High-quality setup failed: ${setupError instanceof Error ? setupError.message : 'Unknown error'}`));
    }
  });
}