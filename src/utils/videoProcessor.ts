import { VideoFrame } from '@/store/videoStore';

// Detect video's native framerate by analyzing frame timing
async function detectVideoFramerate(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(30); // Fallback
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const sampleFrames: number[] = [];
    let frameCount = 0;
    const maxSamples = 10; // Sample first 10 frames for timing analysis
    
    const captureFrame = () => {
      if (frameCount >= maxSamples || video.currentTime >= Math.min(1, video.duration)) {
        // Calculate FPS from samples
        if (sampleFrames.length > 1) {
          const totalTime = sampleFrames[sampleFrames.length - 1] - sampleFrames[0];
          const avgFrameInterval = totalTime / (sampleFrames.length - 1);
          const detectedFPS = 1 / avgFrameInterval;
          console.log('Detected video FPS:', detectedFPS, 'from', sampleFrames.length, 'samples');
          resolve(Math.round(detectedFPS));
        } else {
          resolve(30); // Fallback
        }
        return;
      }
      
      sampleFrames.push(video.currentTime);
      frameCount++;
      
      // Advance to next frame (small increment to catch frame changes)
      video.currentTime += 0.033; // ~30fps increment as starting point
    };
    
    video.onseeked = captureFrame;
    video.currentTime = 0.1; // Start slightly after beginning
  });
}

export async function extractFrames(
  file: File, 
  onProgress?: (progress: number) => void
): Promise<{ frames: VideoFrame[], detectedFPS: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to create canvas context'));
      return;
    }

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // First, detect the video's actual framerate
      onProgress?.(5);
      const detectedFPS = await detectVideoFramerate(video);
      onProgress?.(10);
      
      console.log('Video analysis:', {
        duration: video.duration,
        detectedFPS: detectedFPS,
        width: video.videoWidth,
        height: video.videoHeight
      });
      
      const frames: VideoFrame[] = [];
      // Extract frames at detected framerate (limit to reasonable amount for performance)
      const maxFrames = Math.min(300, Math.floor(video.duration * detectedFPS));
      const frameInterval = 1 / detectedFPS; // Time between each frame
      const totalFrames = maxFrames;
      let currentFrameIndex = 0;

      const extractFrame = () => {
        if (currentFrameIndex >= totalFrames) {
          resolve({ frames, detectedFPS });
          return;
        }

        const timestamp = currentFrameIndex * frameInterval;
        video.currentTime = timestamp;
      };

      video.onseeked = () => {
        // Draw current frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        frames.push({
          id: `frame-${currentFrameIndex}`,
          imageData,
          timestamp: video.currentTime,
          adjustments: {
            // Light adjustments
            exposure: 0,
            brightness: 0,
            highlights: 0,
            shadows: 0,
            contrast: 0,
            brilliance: 0,
            blackPoint: 0,
            whitePoint: 0,
            
            // Color adjustments
            saturation: 0,
            vibrance: 0,
            temperature: 0,
            tint: 0,
            hue: 0,
            colorBalance: 0,
            
            // Tone curve
            lights: 0,
            darks: 0,
            shadowTone: 0,
            
            // Detail
            clarity: 0,
            dehaze: 0,
            sharpening: 0,
            noiseReduction: 0,
            luminanceNoise: 0,
            colorNoise: 0,
            
            // Effects
            vignette: 0,
            vignetteFeather: 50,
            grainAmount: 0,
            grainSize: 2,
            chromaAberration: 0,
            distortion: 0,
            
            // Color grading
            shadowsHue: 0,
            shadowsSat: 0,
            midtonesHue: 0,
            midtonesSat: 0,
            highlightsHue: 0,
            highlightsSat: 0,
            
            // Creative effects
            fadeAmount: 0,
            splitToning: 0,
            orton: 0,
            bleachBypass: 0,
            crossProcess: 0,
            vintage: 0,
          },
        });

        const progress = 10 + ((currentFrameIndex + 1) / totalFrames) * 90; // 10-100%
        onProgress?.(progress);

        currentFrameIndex++;
        
        // Extract next frame after a short delay to prevent browser freezing
        setTimeout(extractFrame, 10);
      };

      video.onerror = () => reject(new Error('Failed to load video'));
      extractFrame();
    };

    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
  });
}

// Apply comprehensive image adjustments
export function applyAdjustments(
  imageData: string,
  adjustments: VideoFrame['adjustments']
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      if (!ctx) return;
      
      canvas.width = img.width;
      canvas.height = img.height;

      // Step 1: Apply CSS filters for basic adjustments
      const filters = [];
      
      // Exposure (affects overall brightness)
      if (adjustments.exposure !== 0) {
        const exposureValue = Math.pow(2, adjustments.exposure);
        filters.push(`brightness(${exposureValue * 100}%)`);
      }
      
      // Brightness (linear brightness adjustment)
      if (adjustments.brightness !== 0) {
        filters.push(`brightness(${100 + adjustments.brightness}%)`);
      }
      
      // Contrast
      if (adjustments.contrast !== 0) {
        filters.push(`contrast(${100 + adjustments.contrast}%)`);
      }
      
      // Saturation
      if (adjustments.saturation !== 0) {
        filters.push(`saturate(${100 + adjustments.saturation}%)`);
      }
      
      // Vibrance (enhanced saturation for less saturated colors)
      if (adjustments.vibrance !== 0) {
        filters.push(`saturate(${100 + adjustments.vibrance * 0.7}%)`);
      }
      
      // Temperature (color temperature)
      if (adjustments.temperature !== 0) {
        const temp = adjustments.temperature;
        if (temp > 0) {
          // Warmer (more orange/red)
          filters.push(`sepia(${temp * 0.2}%) saturate(${100 + temp * 0.5}%)`);
        } else {
          // Cooler (more blue)
          filters.push(`hue-rotate(${temp * 1.5}deg) saturate(${100 + Math.abs(temp) * 0.3}%)`);
        }
      }
      
      // Tint (magenta/green adjustment)
      if (adjustments.tint !== 0) {
        const tintAngle = adjustments.tint > 0 ? 300 : 120; // Magenta or Green
        filters.push(`hue-rotate(${(adjustments.tint / 100) * tintAngle}deg)`);
      }
      
      // Clarity (enhanced contrast in midtones)
      if (adjustments.clarity !== 0) {
        filters.push(`contrast(${100 + adjustments.clarity * 0.5}%)`);
      }
      
      // Dehaze (contrast and clarity boost)
      if (adjustments.dehaze !== 0) {
        filters.push(`contrast(${100 + adjustments.dehaze * 0.8}%) saturate(${100 + adjustments.dehaze * 0.3}%)`);
      }
      
      // Hue rotation
      if (adjustments.hue !== 0) {
        filters.push(`hue-rotate(${adjustments.hue}deg)`);
      }
      
      // Sharpening (using contrast for sharpness effect)
      if (adjustments.sharpening > 0) {
        filters.push(`contrast(${100 + adjustments.sharpening * 0.3}%)`);
      }
      
      // Blur effects for noise reduction
      if (adjustments.noiseReduction > 0) {
        filters.push(`blur(${adjustments.noiseReduction * 0.02}px)`);
      }
      
      if (adjustments.luminanceNoise > 0) {
        filters.push(`blur(${adjustments.luminanceNoise * 0.01}px)`);
      }

      // Apply all CSS filters
      ctx.filter = filters.join(' ');
      ctx.drawImage(img, 0, 0);
      
      // Step 2: Advanced pixel-level adjustments
      const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageDataObj.data;
      
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        
        // Calculate luminance for shadows/highlights detection
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // Shadows adjustment (affects darker areas)
        if (luminance < 85 && adjustments.shadows !== 0) {
          const shadowFactor = 1 + (adjustments.shadows / 100) * (1 - luminance / 85);
          r = Math.min(255, Math.max(0, r * shadowFactor));
          g = Math.min(255, Math.max(0, g * shadowFactor));
          b = Math.min(255, Math.max(0, b * shadowFactor));
        }
        
        // Highlights adjustment (affects brighter areas)
        if (luminance > 170 && adjustments.highlights !== 0) {
          const highlightFactor = 1 + (adjustments.highlights / 100) * ((luminance - 170) / 85);
          r = Math.min(255, Math.max(0, r * highlightFactor));
          g = Math.min(255, Math.max(0, g * highlightFactor));
          b = Math.min(255, Math.max(0, b * highlightFactor));
        }
        
        // Brilliance (selective brightness boost for midtones)
        if (adjustments.brilliance !== 0) {
          const midtoneFactor = Math.sin((luminance / 255) * Math.PI);
          const brillianceFactor = 1 + (adjustments.brilliance / 100) * midtoneFactor * 0.3;
          r = Math.min(255, Math.max(0, r * brillianceFactor));
          g = Math.min(255, Math.max(0, g * brillianceFactor));
          b = Math.min(255, Math.max(0, b * brillianceFactor));
        }
        
        // Black and white point adjustments
        if (adjustments.blackPoint !== 0) {
          const blackPointFactor = adjustments.blackPoint / 100;
          r = Math.max(0, r - (blackPointFactor * 255));
          g = Math.max(0, g - (blackPointFactor * 255));
          b = Math.max(0, b - (blackPointFactor * 255));
        }
        
        if (adjustments.whitePoint !== 0) {
          const whitePointFactor = 1 + (adjustments.whitePoint / 100);
          r = Math.min(255, r * whitePointFactor);
          g = Math.min(255, g * whitePointFactor);
          b = Math.min(255, b * whitePointFactor);
        }
        
        // Tone curve adjustments
        if (adjustments.lights !== 0 || adjustments.darks !== 0) {
          if (luminance > 128 && adjustments.lights !== 0) {
            const lightsFactor = 1 + (adjustments.lights / 100) * 0.5;
            r = Math.min(255, Math.max(0, r * lightsFactor));
            g = Math.min(255, Math.max(0, g * lightsFactor));
            b = Math.min(255, Math.max(0, b * lightsFactor));
          }
          
          if (luminance < 128 && adjustments.darks !== 0) {
            const darksFactor = 1 + (adjustments.darks / 100) * 0.5;
            r = Math.min(255, Math.max(0, r * darksFactor));
            g = Math.min(255, Math.max(0, g * darksFactor));
            b = Math.min(255, Math.max(0, b * darksFactor));
          }
        }
        
        // Creative effects
        if (adjustments.fadeAmount > 0) {
          // Film fade effect (lift blacks)
          const fadeFactor = adjustments.fadeAmount / 100;
          r = r + (255 - r) * fadeFactor * 0.3;
          g = g + (255 - g) * fadeFactor * 0.3;
          b = b + (255 - b) * fadeFactor * 0.3;
        }
        
        if (adjustments.bleachBypass > 0) {
          // Bleach bypass effect (desaturated with retained luminance)
          const grayValue = 0.299 * r + 0.587 * g + 0.114 * b;
          const bypassFactor = adjustments.bleachBypass / 100;
          r = r + (grayValue - r) * bypassFactor;
          g = g + (grayValue - g) * bypassFactor;
          b = b + (grayValue - b) * bypassFactor;
        }
        
        if (adjustments.vintage > 0) {
          // Vintage film look
          const vintageFactor = adjustments.vintage / 100;
          r = r * (1 - vintageFactor * 0.1) + vintageFactor * 20;
          g = g * (1 - vintageFactor * 0.05) + vintageFactor * 15;
          b = b * (1 - vintageFactor * 0.2) + vintageFactor * 5;
        }
        
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
      
      // Apply vignette effect
      if (adjustments.vignette !== 0) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
        const feather = Math.max(10, adjustments.vignetteFeather) / 100;
        
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            const normalizedDistance = distance / maxDistance;
            const vignetteFactor = 1 - (adjustments.vignette / 100) * Math.pow(normalizedDistance, 2 - feather);
            
            const index = (y * canvas.width + x) * 4;
            data[index] *= Math.max(0.1, vignetteFactor);     // R
            data[index + 1] *= Math.max(0.1, vignetteFactor); // G
            data[index + 2] *= Math.max(0.1, vignetteFactor); // B
          }
        }
      }
      
      // Add film grain
      if (adjustments.grainAmount > 0) {
        const grainIntensity = adjustments.grainAmount / 100;
        const grainSize = Math.max(1, adjustments.grainSize);
        
        for (let i = 0; i < data.length; i += 4) {
          if (Math.random() < grainIntensity / grainSize) {
            const grain = (Math.random() - 0.5) * grainIntensity * 60;
            data[i] = Math.min(255, Math.max(0, data[i] + grain));     // R
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain)); // G
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain)); // B
          }
        }
      }
      
      // Orton effect (dreamy glow)
      if (adjustments.orton > 0) {
        const ortonFactor = adjustments.orton / 100;
        for (let i = 0; i < data.length; i += 4) {
          const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const glowFactor = 1 + (ortonFactor * luminance / 255) * 0.3;
          data[i] = Math.min(255, data[i] * glowFactor);
          data[i + 1] = Math.min(255, data[i + 1] * glowFactor);
          data[i + 2] = Math.min(255, data[i + 2] * glowFactor);
        }
      }
      
      ctx.putImageData(imageDataObj, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };

    img.src = imageData;
  });
}