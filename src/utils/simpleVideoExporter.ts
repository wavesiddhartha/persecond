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
    
    // Create WebM video from frames
    console.log(`🎬 Creating video from ${processedFrames.length} processed frames...`);
    const videoBlob = await createWebMFromFrames(processedFrames, videoInfo, onProgress);
    
    if (!videoBlob || videoBlob.size === 0) {
      throw new Error('Generated video has zero size - export failed');
    }
    
    onProgress?.(100);
    console.log(`✅ Simple video export completed: ${videoBlob.size} bytes (${(videoBlob.size / 1024 / 1024).toFixed(2)}MB)`);
    
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
      
      // Set canvas dimensions with validation
      const width = Math.max(1, Math.min(4096, videoInfo.width));
      const height = Math.max(1, Math.min(4096, videoInfo.height));
      
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
            
            setTimeout(drawFrame, Math.max(33, 1000 / targetFPS));
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
              
              setTimeout(drawFrame, Math.max(33, 1000 / targetFPS));
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
            
            // Schedule next frame with proper timing
            const frameDelay = Math.max(33, 1000 / targetFPS); // At least 30fps max
            setTimeout(drawFrame, frameDelay);
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
            
            setTimeout(drawFrame, Math.max(33, 1000 / targetFPS));
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