import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoFrame, VideoInfo } from '@/store/videoStore';
import { applyAdjustmentsGPU } from './webglProcessor';

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
  try {
    onProgress?.(0);
    
    // Initialize FFmpeg
    const ffmpegInstance = await initializeFFmpeg();
    onProgress?.(5);
    
    // Get codec settings for the original format
    const codecSettings = getCodecSettings(videoInfo.format);
    onProgress?.(10);
    
    // Process all frames with their adjustments
    const processedFrames: string[] = [];
    const totalFrames = frames.length;
    
    for (let i = 0; i < totalFrames; i++) {
      const frame = frames[i];
      
      // Apply adjustments to each frame individually using WebGL
      const processedImageData = await applyAdjustmentsGPU(
        frame.imageData,
        frame.adjustments
      );
      processedFrames.push(processedImageData);
      
      const frameProgress = 10 + ((i + 1) / totalFrames) * 50; // 10-60%
      onProgress?.(frameProgress);
    }
    
    onProgress?.(65);
    
    // Write processed frames to FFmpeg filesystem
    for (let i = 0; i < processedFrames.length; i++) {
      const imageBlob = base64ToBlob(processedFrames[i]);
      const fileName = `frame_${String(i + 1).padStart(6, '0')}.jpg`;
      
      await ffmpegInstance.writeFile(fileName, await fetchFile(imageBlob));
      
      const writeProgress = 65 + ((i + 1) / processedFrames.length) * 15; // 65-80%
      onProgress?.(writeProgress);
    }
    
    onProgress?.(80);
    
    // Use original video's framerate to preserve playback speed
    // Calculate actual framerate from frame timestamps for more accuracy
    const actualFrameRate = frames.length > 1 ? 
      (frames.length - 1) / (frames[frames.length - 1].timestamp - frames[0].timestamp) : 
      (videoInfo.fps || 30);
    
    const frameRate = Math.max(1, Math.min(60, actualFrameRate));
    
    // Write original video to FFmpeg filesystem for audio extraction
    const originalVideoName = 'original_video.mp4';
    await ffmpegInstance.writeFile(originalVideoName, await fetchFile(videoInfo.file));
    
    onProgress?.(82);
    
    // Construct FFmpeg command with audio preservation
    const outputFileName = `output.${codecSettings.extension}`;
    const ffmpegArgs = [
      '-framerate', frameRate.toFixed(2),
      '-i', 'frame_%06d.jpg',
      '-i', originalVideoName, // Original video for audio
      '-c:v', codecSettings.codec,
      '-c:a', 'aac', // Audio codec
      '-pix_fmt', codecSettings.pixelFormat,
      '-crf', '18', // High quality (lower = better quality)
      '-preset', 'medium', // Balanced speed/quality
      '-movflags', '+faststart', // Web optimization
      '-map', '0:v:0', // Video from frames
      '-map', '1:a:0?', // Audio from original video (? makes it optional)
      '-shortest', // Match shortest stream duration
      '-y', // Overwrite output
      outputFileName
    ];
    
    // Add format-specific options
    if (codecSettings.container === 'mov') {
      ffmpegArgs.splice(-2, 0, '-f', 'mov');
    } else if (codecSettings.container === 'avi') {
      ffmpegArgs.splice(-2, 0, '-f', 'avi');
    } else if (codecSettings.container === 'matroska') {
      ffmpegArgs.splice(-2, 0, '-f', 'matroska');
    }
    
    onProgress?.(87);
    
    // Execute FFmpeg encoding
    await ffmpegInstance.exec(ffmpegArgs);
    onProgress?.(95);
    
    // Read the output file
    const outputData = await ffmpegInstance.readFile(outputFileName);
    onProgress?.(98);
    
    // Clean up temporary files
    const filesToClean = [outputFileName, originalVideoName];
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
function generateCleanFilename(originalFileName: string, format: string): string {
  // Remove extension from original name
  const baseName = originalFileName.replace(/\.[^/.]+$/, '');
  
  // Sanitize the base name
  const cleanBaseName = sanitizeFilename(baseName);
  
  // Fallback to generic name if sanitization removes everything
  const finalBaseName = cleanBaseName || 'edited_video';
  
  // Add timestamp to make filename unique
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
  
  // Generate final clean filename
  return `${finalBaseName}_${timestamp}.${format.toLowerCase()}`;
}

// Download the exported video with correct filename
export function downloadVideo(blob: Blob, originalFileName: string, format: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  // Generate clean, safe filename
  const fileName = generateCleanFilename(originalFileName, format);
  
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