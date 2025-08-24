import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoFrame, VideoInfo } from '@/store/videoStore';
import { applyAdjustmentsGPU } from './webglProcessor';
import { exportVideoWithCanvas } from './canvasVideoExporter';
import { exportVideoSimple } from './simpleVideoExporter';

let ffmpeg: FFmpeg | null = null;

// Initialize FFmpeg with proper codec support
async function initializeFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  return ffmpeg;
}

// Get optimal codec settings for different formats
function getCodecSettings(format: string) {
  const formatLower = format.toLowerCase();
  
  switch (formatLower) {
    case 'mov':
      return {
        codec: 'libx264',
        pixelFormat: 'yuv420p',
        container: 'mov',
        extension: 'mov',
        mimeType: 'video/quicktime'
      };
    case 'mp4':
      return {
        codec: 'libx264',
        pixelFormat: 'yuv420p',
        container: 'mp4',
        extension: 'mp4',
        mimeType: 'video/mp4'
      };
    case 'avi':
      return {
        codec: 'libx264',
        pixelFormat: 'yuv420p',
        container: 'avi',
        extension: 'avi',
        mimeType: 'video/x-msvideo'
      };
    case 'mkv':
      return {
        codec: 'libx264',
        pixelFormat: 'yuv420p',
        container: 'matroska',
        extension: 'mkv',
        mimeType: 'video/x-matroska'
      };
    default:
      return {
        codec: 'libx264',
        pixelFormat: 'yuv420p',
        container: 'mp4',
        extension: 'mp4',
        mimeType: 'video/mp4'
      };
  }
}

// Convert base64 image to blob
function base64ToBlob(base64: string): Blob {
  const byteCharacters = atob(base64.split(',')[1]);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  return new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
}

// Export video with all frame adjustments applied
export async function exportVideo(
  frames: VideoFrame[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('🎬 Starting video export process...', {
    frameCount: frames.length,
    videoInfo: {
      name: videoInfo.name,
      duration: videoInfo.duration,
      fps: videoInfo.fps,
      width: videoInfo.width,
      height: videoInfo.height,
      format: videoInfo.format
    }
  });

  // Try simple/reliable export first
  console.log('🚀 Attempting simple export method (most reliable)...');
  try {
    return await exportVideoSimple(frames, videoInfo, onProgress);
  } catch (simpleError) {
    console.warn('⚠️ Simple export failed, trying FFmpeg method:', simpleError);
  }

  // Fallback to FFmpeg method
  try {
    onProgress?.(0);
    
    // Validate inputs
    if (!frames || frames.length === 0) {
      throw new Error('No frames provided for export');
    }
    
    if (!videoInfo || !videoInfo.file) {
      throw new Error('No video information or file provided');
    }
    
    // Initialize FFmpeg
    console.log('🔧 Initializing FFmpeg...');
    const ffmpegInstance = await initializeFFmpeg();
    onProgress?.(5);
    
    // Get codec settings for the original format
    const codecSettings = getCodecSettings(videoInfo.format);
    onProgress?.(10);
    
    // Process all frames with their adjustments
    console.log('🎨 Processing frames with adjustments...');
    const processedFrames: string[] = [];
    const totalFrames = frames.length;
    
    for (let i = 0; i < totalFrames; i++) {
      const frame = frames[i];
      
      try {
        // Apply adjustments to each frame individually using WebGL
        const processedImageData = await applyAdjustmentsGPU(
          frame.imageData,
          frame.adjustments
        );
        
        // Validate processed frame data
        if (!processedImageData || !processedImageData.startsWith('data:image/')) {
          throw new Error(`Invalid processed frame data for frame ${i}`);
        }
        
        processedFrames.push(processedImageData);
        
        if (i === 0) {
          console.log('✅ First frame processed successfully');
        }
      } catch (frameError) {
        console.error(`❌ Error processing frame ${i}:`, frameError);
        // Use original frame data as fallback
        processedFrames.push(frame.imageData);
      }
      
      const frameProgress = 10 + ((i + 1) / totalFrames) * 50; // 10-60%
      onProgress?.(frameProgress);
    }
    
    console.log(`✅ Processed ${processedFrames.length} frames successfully`);
    
    onProgress?.(65);
    
    // Write processed frames to FFmpeg filesystem
    console.log('📝 Writing frames to FFmpeg filesystem...');
    for (let i = 0; i < processedFrames.length; i++) {
      try {
        const imageBlob = base64ToBlob(processedFrames[i]);
        const fileName = `frame_${String(i + 1).padStart(6, '0')}.jpg`;
        
        if (imageBlob.size === 0) {
          throw new Error(`Frame ${i} resulted in zero-size blob`);
        }
        
        await ffmpegInstance.writeFile(fileName, await fetchFile(imageBlob));
        
        if (i === 0) {
          console.log(`✅ First frame written: ${fileName} (${imageBlob.size} bytes)`);
        }
      } catch (writeError) {
        console.error(`❌ Error writing frame ${i}:`, writeError);
        throw new Error(`Failed to write frame ${i}: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
      }
      
      const writeProgress = 65 + ((i + 1) / processedFrames.length) * 15; // 65-80%
      onProgress?.(writeProgress);
    }
    
    console.log(`✅ Written ${processedFrames.length} frames to FFmpeg filesystem`);
    
    onProgress?.(80);
    
    // Use original video's framerate to preserve playback speed
    // Calculate actual framerate from frame timestamps for more accuracy
    let frameRate = videoInfo.fps || 30;
    
    if (frames.length > 1) {
      const firstTimestamp = frames[0].timestamp;
      const lastTimestamp = frames[frames.length - 1].timestamp;
      const duration = lastTimestamp - firstTimestamp;
      
      if (duration > 0) {
        const calculatedFrameRate = (frames.length - 1) / duration;
        frameRate = calculatedFrameRate;
      }
    }
    
    // Ensure framerate is within reasonable bounds
    frameRate = Math.max(1, Math.min(60, frameRate));
    
    console.log(`🎬 Video framerate: ${frameRate.toFixed(2)} fps`);
    
    // Try simple video-only export first (more reliable)
    const outputFileName = `output.${codecSettings.extension}`;
    
    // Simplified FFmpeg command for better compatibility
    let ffmpegArgs = [
      '-framerate', frameRate.toFixed(2),
      '-i', 'frame_%06d.jpg',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '23', // Good quality balance
      '-preset', 'fast', // Faster encoding
      '-movflags', '+faststart', // Web optimization
      '-y', // Overwrite output
      outputFileName
    ];
    
    // Try with audio if original video exists and has audio
    let includeAudio = false;
    try {
      const originalVideoName = 'original_video.mp4';
      await ffmpegInstance.writeFile(originalVideoName, await fetchFile(videoInfo.file));
      
      // Check if original has audio (this might fail, which is okay)
      includeAudio = true;
      console.log('✅ Original video loaded for audio extraction');
      
      // Update command to include audio
      ffmpegArgs = [
        '-framerate', frameRate.toFixed(2),
        '-i', 'frame_%06d.jpg',
        '-i', originalVideoName,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-crf', '23',
        '-preset', 'fast',
        '-movflags', '+faststart',
        '-map', '0:v:0', // Video from frames
        '-map', '1:a:0?', // Audio from original (optional)
        '-shortest',
        '-y',
        outputFileName
      ];
    } catch (audioError) {
      console.warn('⚠️ Could not load original video for audio, proceeding video-only:', audioError);
      includeAudio = false;
    }
    
    onProgress?.(87);
    
    // Execute FFmpeg encoding
    console.log('🎬 Starting FFmpeg encoding with args:', ffmpegArgs);
    
    // Add logging callback to monitor FFmpeg output
    ffmpegInstance.on('log', ({ message }) => {
      console.log('FFmpeg:', message);
    });
    
    try {
      await ffmpegInstance.exec(ffmpegArgs);
      console.log('✅ FFmpeg encoding completed successfully');
    } catch (ffmpegError) {
      console.error('❌ First FFmpeg encoding attempt failed:', ffmpegError);
      
      // Try fallback: ultra-simple video-only export
      console.log('🔄 Trying fallback: simple video-only export...');
      const fallbackArgs = [
        '-framerate', '30', // Fixed framerate
        '-i', 'frame_%06d.jpg',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-y',
        'fallback_output.mp4'
      ];
      
      try {
        await ffmpegInstance.exec(fallbackArgs);
        console.log('✅ Fallback encoding succeeded');
        // Use fallback output
        const fallbackData = await ffmpegInstance.readFile('fallback_output.mp4');
        if (fallbackData && fallbackData.length > 0) {
          console.log(`✅ Fallback video created: ${fallbackData.length} bytes`);
          onProgress?.(100);
          return new Blob([fallbackData as BlobPart], { type: 'video/mp4' });
        }
      } catch (fallbackError) {
        console.error('❌ Fallback encoding also failed:', fallbackError);
      }
      
      // Final fallback: Canvas-based export
      console.log('🎨 Trying final fallback: Canvas-based video export...');
      try {
        return await exportVideoWithCanvas(frames, videoInfo, onProgress);
      } catch (canvasError) {
        console.error('❌ Canvas fallback also failed:', canvasError);
        throw new Error(`All export methods failed. FFmpeg error: ${ffmpegError instanceof Error ? ffmpegError.message : 'Unknown error'}`);
      }
    }
    
    onProgress?.(95);
    
    // Read the output file
    console.log('📖 Reading output file...');
    const outputData = await ffmpegInstance.readFile(outputFileName);
    
    if (!outputData || outputData.length === 0) {
      throw new Error('Output video file is empty - encoding may have failed');
    }
    
    console.log(`✅ Output video file read successfully: ${outputData.length} bytes`);
    onProgress?.(98);
    
    // Clean up temporary files
    const filesToClean = [outputFileName];
    if (includeAudio) {
      filesToClean.push('original_video.mp4');
    }
    for (let i = 1; i <= processedFrames.length; i++) {
      filesToClean.push(`frame_${String(i).padStart(6, '0')}.jpg`);
    }
    
    await Promise.all(
      filesToClean.map(async (fileName) => {
        try {
          await ffmpegInstance.deleteFile(fileName);
        } catch {
          // Ignore cleanup errors
        }
      })
    );
    
    onProgress?.(100);
    
    // Return the video blob with correct MIME type
    return new Blob([outputData as BlobPart], { type: codecSettings.mimeType });
    
  } catch (error) {
    console.error('Video export failed:', error);
    throw new Error(`Failed to export video: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Sanitize filename to remove problematic characters
function sanitizeFilename(filename: string): string {
  return filename
    // Remove or replace problematic characters
    .replace(/[#@$%^&*()+=\[\]{}|\\:";'<>?,/]/g, '') // Remove special chars
    .replace(/[^\w\s.-]/g, '') // Keep only word chars, spaces, dots, hyphens
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^[._-]+|[._-]+$/g, '') // Remove leading/trailing dots, underscores, hyphens
    .substring(0, 100) // Limit length to prevent issues
    .trim();
}

// Generate clean, professional filename
function generateCleanFilename(originalFileName: string, format: string, mimeType?: string): string {
  // Remove extension from original name
  const baseName = originalFileName.replace(/\.[^/.]+$/, '');
  
  // Sanitize the base name
  const cleanBaseName = sanitizeFilename(baseName);
  
  // Fallback to generic name if sanitization removes everything
  const finalBaseName = cleanBaseName || 'edited_video';
  
  // Add timestamp to make filename unique
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
  
  // Determine file extension based on mime type or format
  let extension = format.toLowerCase();
  if (mimeType) {
    if (mimeType.includes('webm')) extension = 'webm';
    else if (mimeType.includes('mp4')) extension = 'mp4';
    else if (mimeType.includes('mov')) extension = 'mov';
  }
  
  // Generate final clean filename
  return `${finalBaseName}_${timestamp}.${extension}`;
}

// Download the exported video with correct filename
export function downloadVideo(blob: Blob, originalFileName: string, format: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  // Generate clean, safe filename
  const fileName = generateCleanFilename(originalFileName, format, blob.type);
  
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the blob URL after a delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

// Get estimated export time based on frame count and resolution
export function getEstimatedExportTime(frameCount: number, width: number, height: number): string {
  const pixels = width * height;
  const complexity = pixels / (1920 * 1080); // Relative to 1080p
  const baseTimePerFrame = 0.5; // seconds per frame for 1080p
  
  const estimatedSeconds = frameCount * baseTimePerFrame * complexity;
  
  if (estimatedSeconds < 60) {
    return `~${Math.round(estimatedSeconds)} seconds`;
  } else {
    const minutes = Math.round(estimatedSeconds / 60);
    return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}