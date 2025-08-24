// Simple, reliable video export using ZIP of processed frames
import { VideoFrame, VideoInfo } from '@/store/videoStore';
import { applyAdjustmentsGPU } from './webglProcessor';

export async function exportVideoSimple(
  frames: VideoFrame[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('🎬 Using Simple Video Export (most reliable)');
  
  try {
    onProgress?.(0);
    
    // Process all frames first
    console.log('🎨 Processing frames with adjustments...');
    const processedFrames: string[] = [];
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      
      try {
        // Apply adjustments to each frame
        const processedImageData = await applyAdjustmentsGPU(
          frame.imageData,
          frame.adjustments
        );
        processedFrames.push(processedImageData);
      } catch (frameError) {
        console.warn(`⚠️ Frame ${i} processing failed, using original:`, frameError);
        processedFrames.push(frame.imageData);
      }
      
      const progress = (i / frames.length) * 50; // 0-50%
      onProgress?.(progress);
    }
    
    onProgress?.(60);
    
    onProgress?.(80);
    
    // Create a simple MP4-like file structure (actually WebM for better browser support)
    const videoBlob = await createWebMFromFrames(processedFrames, videoInfo, onProgress);
    
    onProgress?.(100);
    console.log(`✅ Simple video export completed: ${videoBlob.size} bytes`);
    
    return videoBlob;
    
  } catch (error) {
    console.error('❌ Simple video export failed:', error);
    throw new Error(`Simple video export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Create WebM video using Canvas and MediaRecorder (most reliable method)
async function createWebMFromFrames(
  frames: string[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Cannot create canvas context'));
      return;
    }
    
    canvas.width = videoInfo.width;
    canvas.height = videoInfo.height;
    
    // Setup MediaRecorder
    const stream = canvas.captureStream(15); // 15 FPS for better compatibility
    
    // Try different codecs for maximum compatibility
    const codecs = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8', 
      'video/webm',
      'video/mp4',
    ];
    
    let selectedCodec = '';
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) {
        selectedCodec = codec;
        break;
      }
    }
    
    if (!selectedCodec) {
      reject(new Error('No supported video codec found'));
      return;
    }
    
    console.log(`📹 Using codec: ${selectedCodec}`);
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedCodec,
      videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
    });
    
    const chunks: Blob[] = [];
    let currentFrameIndex = 0;
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const videoBlob = new Blob(chunks, { type: selectedCodec });
      resolve(videoBlob);
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      reject(new Error('MediaRecorder failed'));
    };
    
    // Start recording
    mediaRecorder.start(100); // Collect data every 100ms
    
    // Function to draw next frame
    const drawFrame = () => {
      if (currentFrameIndex >= frames.length) {
        // Finished
        setTimeout(() => {
          mediaRecorder.stop();
        }, 500); // Small delay to ensure last frame is captured
        return;
      }
      
      const frameData = frames[currentFrameIndex];
      const img = new Image();
      
      img.onload = () => {
        // Clear canvas and draw frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        currentFrameIndex++;
        const progress = 80 + (currentFrameIndex / frames.length) * 20; // 80-100%
        onProgress?.(progress);
        
        // Schedule next frame (66ms = ~15 FPS)
        setTimeout(drawFrame, 66);
      };
      
      img.onerror = () => {
        console.warn(`⚠️ Failed to load frame ${currentFrameIndex}, skipping`);
        currentFrameIndex++;
        setTimeout(drawFrame, 66);
      };
      
      img.src = frameData;
    };
    
    // Start drawing frames
    setTimeout(drawFrame, 100); // Small delay to ensure recording started
    
    // Safety timeout (max 2 minutes)
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        console.warn('⚠️ Export timeout, stopping recording');
        mediaRecorder.stop();
      }
    }, 2 * 60 * 1000);
  });
}

