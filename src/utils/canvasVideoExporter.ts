// Canvas-based video export as fallback when FFmpeg fails
import { VideoFrame, VideoInfo } from '@/store/videoStore';
import { applyAdjustmentsGPU } from './webglProcessor';

export async function exportVideoWithCanvas(
  frames: VideoFrame[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('🎨 Using Canvas-based video export (FFmpeg fallback)');
  
  try {
    onProgress?.(0);
    
    // Create canvas for video frames
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    canvas.width = videoInfo.width;
    canvas.height = videoInfo.height;
    
    // Create MediaRecorder for video capture
    const stream = canvas.captureStream(videoInfo.fps || 30);
    const chunks: BlobPart[] = [];
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp9',
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        console.log(`✅ Canvas video export completed: ${blob.size} bytes`);
        resolve(blob);
      };
      
      mediaRecorder.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
        reject(new Error('Canvas video recording failed'));
      };
      
      // Start recording
      mediaRecorder.start();
      
      // Render frames sequentially
      let currentFrameIndex = 0;
      const frameDuration = 1000 / (videoInfo.fps || 30); // ms per frame
      
      const renderNextFrame = async () => {
        if (currentFrameIndex >= frames.length) {
          // Finished all frames
          mediaRecorder.stop();
          onProgress?.(100);
          return;
        }
        
        const frame = frames[currentFrameIndex];
        
        try {
          // Process frame with adjustments
          const processedImageData = await applyAdjustmentsGPU(
            frame.imageData,
            frame.adjustments
          );
          
          // Draw frame to canvas
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Update progress
            const progress = (currentFrameIndex / frames.length) * 90; // 0-90%
            onProgress?.(progress);
            
            currentFrameIndex++;
            setTimeout(renderNextFrame, frameDuration);
          };
          
          img.onerror = () => {
            console.error(`❌ Failed to load frame ${currentFrameIndex}`);
            currentFrameIndex++;
            setTimeout(renderNextFrame, frameDuration);
          };
          
          img.src = processedImageData;
          
        } catch (frameError) {
          console.error(`❌ Error processing frame ${currentFrameIndex}:`, frameError);
          // Skip problematic frame
          currentFrameIndex++;
          setTimeout(renderNextFrame, frameDuration);
        }
      };
      
      // Start rendering frames
      renderNextFrame();
      
      // Safety timeout (max 5 minutes)
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          reject(new Error('Canvas video export timeout'));
        }
      }, 5 * 60 * 1000);
    });
    
  } catch (error) {
    console.error('❌ Canvas video export failed:', error);
    throw new Error(`Canvas video export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}