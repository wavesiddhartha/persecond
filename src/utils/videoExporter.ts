import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoFrame, VideoInfo } from '@/store/videoStore';
import { applyAdjustmentsGPU } from './webglProcessor';
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

// Get optimal codec settings for different formats - preserves original format exactly
function getCodecSettings(format: string) {
  const formatLower = format.toLowerCase();
  
  switch (formatLower) {
    case 'mov':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'mov',
        extension: 'mov',
        mimeType: 'video/quicktime',
        ffmpegFormat: 'mov'
      };
    case 'mp4':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'mp4',
        extension: 'mp4',
        mimeType: 'video/mp4',
        ffmpegFormat: 'mp4'
      };
    case 'avi':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'avi',
        extension: 'avi',
        mimeType: 'video/x-msvideo',
        ffmpegFormat: 'avi'
      };
    case 'mkv':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'matroska',
        extension: 'mkv',
        mimeType: 'video/x-matroska',
        ffmpegFormat: 'matroska'
      };
    case 'webm':
      return {
        codec: 'libvpx-vp9',
        audioCodec: 'libopus',
        pixelFormat: 'yuv420p',
        container: 'webm',
        extension: 'webm',
        mimeType: 'video/webm',
        ffmpegFormat: 'webm'
      };
    case 'm4v':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'mp4',
        extension: 'm4v',
        mimeType: 'video/mp4',
        ffmpegFormat: 'mp4'
      };
    case '3gp':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: '3gp',
        extension: '3gp',
        mimeType: 'video/3gpp',
        ffmpegFormat: '3gp'
      };
    case 'flv':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'flv',
        extension: 'flv',
        mimeType: 'video/x-flv',
        ffmpegFormat: 'flv'
      };
    case 'wmv':
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'asf',
        extension: 'wmv',
        mimeType: 'video/x-ms-wmv',
        ffmpegFormat: 'asf'
      };
    default:
      // Fallback to MP4 for unknown formats
      console.warn(`Unknown format "${format}", defaulting to MP4`);
      return {
        codec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        container: 'mp4',
        extension: 'mp4',
        mimeType: 'video/mp4',
        ffmpegFormat: 'mp4'
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

  // Validate inputs before attempting export
  if (!frames || frames.length === 0) {
    throw new Error('No frames provided for export');
  }

  if (!videoInfo || !videoInfo.file) {
    throw new Error('No video information or file provided');
  }

  // Check for invalid frames
  const invalidFrames = frames.filter(frame => !frame.imageData || !frame.imageData.startsWith('data:image/'));
  if (invalidFrames.length > 0) {
    throw new Error(`${invalidFrames.length} frames have invalid image data`);
  }

  // Try FFmpeg export first for best quality and audio preservation
  console.log('🚀 Attempting FFmpeg export for maximum quality and audio...');
  try {
    const result = await exportVideoWithFFmpeg(frames, videoInfo, onProgress);
    
    // Validate FFmpeg result
    if (!result || result.size === 0) {
      throw new Error('FFmpeg export produced empty result');
    }
    
    return result;
  } catch (ffmpegError) {
    console.warn('⚠️ FFmpeg export failed, trying simple method:', ffmpegError);
    
    // Fallback to simple export
    try {
      onProgress?.(0); // Reset progress for fallback
      const fallbackResult = await exportVideoSimple(frames, videoInfo, onProgress);
      
      // Validate fallback result
      if (!fallbackResult || fallbackResult.size === 0) {
        throw new Error('Simple export also produced empty result');
      }
      
      return fallbackResult;
    } catch (simpleError) {
      console.error('❌ Both export methods failed');
      console.error('FFmpeg error:', ffmpegError);
      console.error('Simple export error:', simpleError);
      
      // Provide detailed error information
      const errorMessage = `All export methods failed. FFmpeg: ${ffmpegError instanceof Error ? ffmpegError.message : 'Unknown error'}. Simple export: ${simpleError instanceof Error ? simpleError.message : 'Unknown error'}`;
      throw new Error(errorMessage);
    }
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
export function generateCleanFilename(originalFileName: string, format: string, mimeType?: string): string {
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

// Enhanced download function with multiple attempts and better error handling
export async function attemptDownload(blob: Blob, originalFileName: string, format: string): Promise<boolean> {
  try {
    // Validate blob
    if (!blob || blob.size === 0) {
      console.error('❌ Invalid blob for download:', blob);
      return false;
    }
    
    console.log(`📥 Attempting download: ${blob.size} bytes, type: ${blob.type}`);
    
    // Generate clean, safe filename
    const fileName = generateCleanFilename(originalFileName, format, blob.type);
    console.log(`📄 Generated filename: ${fileName}`);

    // Mobile and browser specific optimizations
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    // Method 1: Standard download with enhanced reliability
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    
    // Add to DOM for better browser compatibility
    document.body.appendChild(link);
    
    // Mobile and browser-specific download strategies
    if (isIOS) {
      // iOS-specific approach - open in new tab for better compatibility
      setTimeout(() => {
        const newWindow = window.open(url, '_blank');
        if (!newWindow) {
          // Fallback to standard download if popup blocked
          link.click();
        }
        
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
        }, 100);
      }, 100);
    } else {
      // Standard and Android approach with multiple attempts
      setTimeout(() => {
        // Method 1: Standard click
        link.click();
        
        // Method 2: Dispatch click event (for better browser compatibility)
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(clickEvent);
        
        // Method 3: Alternative click for older browsers
        if (typeof link.click === 'function') {
          setTimeout(() => link.click(), 50);
        }
        
        // Clean up after a short delay
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
        }, 100);
      }, 100);
    }
    
    // Clean up the blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
    
    console.log('✅ Download link created and clicked successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Download attempt failed:', error);
    return false;
  }
}

// Backward compatibility - simple download function
export function downloadVideo(blob: Blob, originalFileName: string, format: string) {
  attemptDownload(blob, originalFileName, format).catch(error => {
    console.error('❌ downloadVideo failed:', error);
  });
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

// Enhanced FFmpeg export with perfect quality and audio preservation
async function exportVideoWithFFmpeg(
  frames: VideoFrame[],
  videoInfo: VideoInfo,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('🎬 Starting enhanced FFmpeg export with audio preservation...');
  
  try {
    // Validate inputs
    if (!frames || frames.length === 0) {
      throw new Error('No frames provided for export');
    }
    
    if (!videoInfo || !videoInfo.file) {
      throw new Error('No video information or file provided');
    }
    
    onProgress?.(0);
    
    // Initialize FFmpeg
    console.log('🔧 Initializing FFmpeg...');
    const ffmpegInstance = await initializeFFmpeg();
    onProgress?.(5);
    
    // Get codec settings for the original format to maintain quality
    const codecSettings = getCodecSettings(videoInfo.format);
    onProgress?.(10);
    
    // Process all frames with their adjustments
    console.log('🎨 Processing frames with adjustments...');
    const processedFrames: string[] = [];
    const totalFrames = frames.length;
    
    for (let i = 0; i < totalFrames; i++) {
      const frame = frames[i];
      
      try {
        // Apply adjustments to each frame using WebGL
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
      
      const frameProgress = 10 + ((i + 1) / totalFrames) * 40; // 10-50%
      onProgress?.(frameProgress);
      
      // Yield control every 10 frames to prevent UI blocking
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    console.log(`✅ Processed ${processedFrames.length} frames successfully`);
    onProgress?.(55);
    
    // Write processed frames to FFmpeg filesystem with original quality
    console.log('📝 Writing high-quality frames to FFmpeg filesystem...');
    for (let i = 0; i < processedFrames.length; i++) {
      try {
        const imageBlob = base64ToBlob(processedFrames[i]);
        const fileName = `frame_${String(i + 1).padStart(6, '0')}.png`; // Use PNG for lossless quality
        
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
      
      const writeProgress = 55 + ((i + 1) / processedFrames.length) * 15; // 55-70%
      onProgress?.(writeProgress);
      
      // Yield control every 5 frames during write to prevent UI blocking
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    console.log(`✅ Written ${processedFrames.length} frames to FFmpeg filesystem`);
    onProgress?.(75);
    
    // Calculate framerate from frame timestamps for accuracy
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
    
    console.log(`🎬 Using framerate: ${frameRate.toFixed(2)} fps`);
    
    // Write original video for audio extraction - preserve original format
    const originalExtension = videoInfo.format.toLowerCase();
    const originalVideoName = `original_video.${originalExtension}`;
    await ffmpegInstance.writeFile(originalVideoName, await fetchFile(videoInfo.file));
    console.log(`✅ Original video loaded for audio extraction (${originalExtension.toUpperCase()} format)`);
    
    onProgress?.(80);
    
    // Generate output filename with EXACT original format
    const outputFileName = `output.${codecSettings.extension}`;
    console.log(`🎯 Preserving original format: ${videoInfo.format.toUpperCase()} → ${codecSettings.extension.toUpperCase()}`);
    
    // Enhanced FFmpeg command with format-specific settings
    const ffmpegArgs = [
      '-framerate', frameRate.toFixed(3),
      '-i', 'frame_%06d.png',               // Use PNG input for lossless quality
      '-i', originalVideoName,               // Original video for audio
      '-c:v', codecSettings.codec,          // Format-specific video codec
      '-c:a', codecSettings.audioCodec,     // Format-specific audio codec
      '-preset', 'slow',                    // Best quality preset
      '-crf', '18',                         // Near-lossless quality
      '-pix_fmt', codecSettings.pixelFormat, // Format-specific pixel format
      '-b:a', '320k',                       // High-quality audio bitrate
      '-ar', '48000',                       // High audio sample rate
      '-ac', '2',                           // Stereo audio
      '-map', '0:v:0',                      // Video from processed frames
      '-map', '1:a:0?',                     // Audio from original video (optional)
      '-shortest',                          // Match shortest stream duration
      '-f', codecSettings.ffmpegFormat,    // Force specific output format
      '-y',                                 // Overwrite output
      outputFileName
    ];
    
    // Add format-specific optimizations
    if (codecSettings.extension === 'mov' || codecSettings.extension === 'mp4') {
      ffmpegArgs.splice(-2, 0, '-movflags', '+faststart'); // Web optimization for MOV/MP4
    }
    
    // Special handling for WebM format
    if (codecSettings.extension === 'webm') {
      // Replace libx264 settings with VP9 for WebM
      const presetIndex = ffmpegArgs.indexOf('-preset');
      const crfIndex = ffmpegArgs.indexOf('-crf');
      
      if (presetIndex !== -1) {
        ffmpegArgs.splice(presetIndex, 2); // Remove preset for VP9
      }
      if (crfIndex !== -1) {
        ffmpegArgs[crfIndex + 1] = '30'; // VP9 CRF range is different
      }
    }
    
    console.log('🎬 Starting FFmpeg encoding with enhanced quality settings...');
    console.log('FFmpeg args:', ffmpegArgs.join(' '));
    
    // Add logging callback to monitor FFmpeg output
    ffmpegInstance.on('log', ({ message }) => {
      console.log('FFmpeg:', message);
    });
    
    onProgress?.(85);
    
    try {
      await ffmpegInstance.exec(ffmpegArgs);
      console.log('✅ Enhanced FFmpeg encoding completed successfully');
    } catch (ffmpegError) {
      console.error('❌ Enhanced FFmpeg encoding failed:', ffmpegError);
      
      // Try fallback with different settings but preserve format
      console.log('🔄 Trying fallback FFmpeg encoding with original format...');
      const fallbackOutputFileName = 'fallback_' + outputFileName;
      const fallbackArgs = [
        '-framerate', frameRate.toFixed(2),
        '-i', 'frame_%06d.png',
        '-i', originalVideoName,
        '-c:v', codecSettings.codec,        // Keep original codec
        '-preset', 'medium',                // Faster preset
        '-crf', '23',                       // Good quality
        '-pix_fmt', codecSettings.pixelFormat,
        '-c:a', codecSettings.audioCodec,  // Keep original audio codec
        '-b:a', '192k',
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-shortest',
        '-f', codecSettings.ffmpegFormat,  // Keep original format
        '-y',
        fallbackOutputFileName
      ];
      
      // Add format-specific optimizations for fallback too
      if (codecSettings.extension === 'mov' || codecSettings.extension === 'mp4') {
        fallbackArgs.splice(-2, 0, '-movflags', '+faststart');
      }
      
      try {
        await ffmpegInstance.exec(fallbackArgs);
        console.log('✅ Fallback encoding succeeded');
        const fallbackData = await ffmpegInstance.readFile(fallbackOutputFileName);
        if (fallbackData && fallbackData.length > 0) {
          console.log(`✅ Fallback video created: ${fallbackData.length} bytes`);
          onProgress?.(100);
          return new Blob([fallbackData as BlobPart], { type: codecSettings.mimeType });
        }
      } catch (fallbackError) {
        console.error('❌ Fallback encoding also failed:', fallbackError);
        throw new Error(`FFmpeg encoding failed: ${ffmpegError instanceof Error ? ffmpegError.message : 'Unknown error'}`);
      }
    }
    
    onProgress?.(95);
    
    // Read the output file
    console.log('📖 Reading enhanced output file...');
    const outputData = await ffmpegInstance.readFile(outputFileName);
    
    if (!outputData || outputData.length === 0) {
      throw new Error('Output video file is empty - enhanced encoding may have failed');
    }
    
    console.log(`✅ Enhanced output video file read successfully: ${outputData.length} bytes`);
    onProgress?.(98);
    
    // Clean up temporary files
    const filesToClean = [outputFileName, originalVideoName];
    for (let i = 1; i <= processedFrames.length; i++) {
      filesToClean.push(`frame_${String(i).padStart(6, '0')}.png`);
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
    const finalBlob = new Blob([outputData as BlobPart], { type: codecSettings.mimeType });
    console.log(`✅ Enhanced FFmpeg export completed: ${finalBlob.size} bytes (${(finalBlob.size / 1024 / 1024).toFixed(2)}MB)`);
    
    return finalBlob;
    
  } catch (error) {
    console.error('❌ Enhanced FFmpeg video export failed:', error);
    throw new Error(`Enhanced FFmpeg export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}