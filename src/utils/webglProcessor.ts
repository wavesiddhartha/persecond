// GPU-accelerated image processing using WebGL shaders (Apple's approach)
import { VideoFrame } from '@/store/videoStore';

export class WebGLImageProcessor {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private frameBuffer: WebGLFramebuffer | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
    if (!gl) {
      throw new Error('WebGL not supported');
    }
    this.gl = gl as WebGLRenderingContext;
    this.initializeShaders();
  }

  private initializeShaders() {
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y);
      }
    `;

    // Advanced fragment shader with Apple-like color science
    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D u_image;
      uniform float u_exposure;
      uniform float u_brightness;
      uniform float u_contrast;
      uniform float u_highlights;
      uniform float u_shadows;
      uniform float u_vibrance;
      uniform float u_saturation;
      uniform float u_temperature;
      uniform float u_tint;
      uniform float u_clarity;
      uniform float u_brilliance;
      uniform float u_blackPoint;
      uniform float u_whitePoint;
      uniform float u_grainAmount;
      uniform float u_grainSize;
      uniform float u_vignette;
      uniform float u_vignetteFeather;
      uniform float u_fadeAmount;
      uniform float u_hue;
      uniform float u_colorBalance;
      uniform float u_lights;
      uniform float u_darks;
      uniform float u_shadowTone;
      uniform float u_dehaze;
      uniform float u_sharpening;
      uniform float u_noiseReduction;
      uniform float u_luminanceNoise;
      uniform float u_colorNoise;
      uniform float u_chromaAberration;
      uniform float u_distortion;
      uniform float u_shadowsHue;
      uniform float u_shadowsSat;
      uniform float u_midtonesHue;
      uniform float u_midtonesSat;
      uniform float u_highlightsHue;
      uniform float u_highlightsSat;
      uniform float u_splitToning;
      uniform float u_orton;
      uniform float u_bleachBypass;
      uniform float u_crossProcess;
      uniform float u_vintage;
      varying vec2 v_texCoord;
      
      // Apple-style color space conversions
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }
      
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      
      // Apple-style tone mapping
      float appleToneMap(float x, float shoulder, float toe) {
        float a = 2.51 * shoulder;
        float b = 0.03 * toe;
        float c = 2.43 * shoulder;
        float d = 0.59 * toe;
        float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      
      // Professional highlights/shadows adjustment
      vec3 adjustHighlightsShadows(vec3 color, float highlights, float shadows) {
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        
        // Shadow adjustment with smooth falloff
        float shadowAmount = 1.0 - smoothstep(0.0, 0.5, luminance);
        shadowAmount = pow(shadowAmount, 2.0);
        color += color * shadows * shadowAmount * 0.3;
        
        // Highlight adjustment with smooth falloff
        float highlightAmount = smoothstep(0.5, 1.0, luminance);
        highlightAmount = pow(highlightAmount, 2.0);
        color += color * highlights * highlightAmount * 0.3;
        
        return color;
      }
      
      // Apple-style vibrance (intelligent saturation)
      vec3 adjustVibrance(vec3 color, float vibrance) {
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        float saturation = length(color - vec3(luminance));
        float vibranceStrength = (1.0 - saturation) * vibrance;
        
        vec3 hsv = rgb2hsv(color);
        hsv.y += vibranceStrength * 0.5;
        return hsv2rgb(hsv);
      }
      
      // Temperature/Tint adjustment
      vec3 adjustTemperature(vec3 color, float temp, float tint) {
        // Simplified temperature adjustment
        color.r += temp * 0.1;
        color.b -= temp * 0.1;
        color.g += tint * 0.05;
        return color;
      }
      
      // Clarity (local contrast enhancement)
      vec3 adjustClarity(vec3 color, float clarity) {
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        float contrast = (luminance - 0.5) * clarity * 0.5;
        return color + contrast;
      }
      
      // Film grain effect
      float grain(vec2 uv, float amount, float size) {
        float noise = fract(sin(dot(uv * size, vec2(12.9898, 78.233))) * 43758.5453);
        return mix(1.0, noise, amount * 0.01);
      }
      
      // Vignette effect
      float vignette(vec2 uv, float amount, float feather) {
        vec2 pos = uv - 0.5;
        float dist = length(pos);
        feather = max(feather * 0.01, 0.01);
        return 1.0 - smoothstep(0.5 - feather, 0.5, dist) * amount * 0.01;
      }
      
      // Fade effect (film emulation)
      vec3 applyFade(vec3 color, float fadeAmount) {
        float fade = fadeAmount * 0.01;
        return mix(color, vec3(0.5), fade * 0.3);
      }
      
      // Hue rotation
      vec3 applyHueShift(vec3 color, float hue) {
        vec3 hsv = rgb2hsv(color);
        hsv.x = fract(hsv.x + hue / 360.0);
        return hsv2rgb(hsv);
      }
      
      // Color balance adjustment
      vec3 applyColorBalance(vec3 color, float balance) {
        color.r += balance * 0.1;
        color.b -= balance * 0.1;
        return color;
      }
      
      // Lights/Darks tone curve
      vec3 applyToneCurve(vec3 color, float lights, float darks) {
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        if (luminance > 0.5) {
          color *= 1.0 + lights * 0.5 * (luminance - 0.5) / 0.5;
        } else {
          color *= 1.0 + darks * 0.5 * (0.5 - luminance) / 0.5;
        }
        return color;
      }
      
      // Dehaze effect
      vec3 applyDehaze(vec3 color, float dehaze) {
        float contrast = 1.0 + dehaze * 0.8;
        float saturation = 1.0 + dehaze * 0.3;
        color = (color - 0.5) * contrast + 0.5;
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        return mix(vec3(luminance), color, saturation);
      }
      
      // Color grading for shadows/midtones/highlights
      vec3 applyColorGrading(vec3 color, float shadowsHue, float shadowsSat, float midtonesHue, float midtonesSat, float highlightsHue, float highlightsSat) {
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        
        // Shadow grading (luminance < 0.33)
        if (luminance < 0.33) {
          vec3 hsv = rgb2hsv(color);
          hsv.x = fract(hsv.x + shadowsHue / 360.0);
          hsv.y *= 1.0 + shadowsSat * 0.01;
          color = mix(color, hsv2rgb(hsv), 1.0 - luminance / 0.33);
        }
        // Midtone grading (0.33 <= luminance < 0.67)
        else if (luminance < 0.67) {
          vec3 hsv = rgb2hsv(color);
          hsv.x = fract(hsv.x + midtonesHue / 360.0);
          hsv.y *= 1.0 + midtonesSat * 0.01;
          float midtoneWeight = 1.0 - abs(luminance - 0.5) / 0.17;
          color = mix(color, hsv2rgb(hsv), midtoneWeight);
        }
        // Highlight grading (luminance >= 0.67)
        else {
          vec3 hsv = rgb2hsv(color);
          hsv.x = fract(hsv.x + highlightsHue / 360.0);
          hsv.y *= 1.0 + highlightsSat * 0.01;
          color = mix(color, hsv2rgb(hsv), (luminance - 0.67) / 0.33);
        }
        
        return color;
      }
      
      // Creative effects
      vec3 applyCreativeEffects(vec3 color, float orton, float bleachBypass, float crossProcess, float vintage, float splitToning) {
        // Orton effect (dreamy glow)
        if (orton > 0.0) {
          float luminance = dot(color, vec3(0.299, 0.587, 0.114));
          float glowFactor = 1.0 + (orton * 0.01 * luminance) * 0.3;
          color *= glowFactor;
        }
        
        // Bleach bypass effect
        if (bleachBypass > 0.0) {
          float grayValue = dot(color, vec3(0.299, 0.587, 0.114));
          float bypassFactor = bleachBypass * 0.01;
          color = mix(color, vec3(grayValue), bypassFactor);
        }
        
        // Cross process effect
        if (crossProcess > 0.0) {
          float factor = crossProcess * 0.01;
          color.r = color.r + (1.0 - color.r) * factor * 0.2;
          color.g = color.g * (1.0 - factor * 0.1);
          color.b = color.b + factor * 0.15;
        }
        
        // Vintage effect
        if (vintage > 0.0) {
          float vintageFactor = vintage * 0.01;
          color.r = color.r * (1.0 - vintageFactor * 0.1) + vintageFactor * 0.08;
          color.g = color.g * (1.0 - vintageFactor * 0.05) + vintageFactor * 0.06;
          color.b = color.b * (1.0 - vintageFactor * 0.2) + vintageFactor * 0.02;
        }
        
        // Split toning effect
        if (splitToning > 0.0) {
          float luminance = dot(color, vec3(0.299, 0.587, 0.114));
          float splitFactor = splitToning * 0.01;
          if (luminance < 0.5) {
            color.b += splitFactor * 0.1; // Add blue to shadows
          } else {
            color.r += splitFactor * 0.1; // Add red to highlights
          }
        }
        
        return color;
      }
      
      void main() {
        vec3 color = texture2D(u_image, v_texCoord).rgb;
        
        // Apply exposure (multiplicative)
        color *= exp2(u_exposure);
        
        // Apply highlights/shadows
        color = adjustHighlightsShadows(color, u_highlights, u_shadows);
        
        // Apply brightness
        color += u_brightness * 0.1;
        
        // Apply contrast
        color = (color - 0.5) * (1.0 + u_contrast * 0.5) + 0.5;
        
        // Apply black and white points
        color = (color - u_blackPoint * 0.1) / (1.0 - u_blackPoint * 0.1 - u_whitePoint * 0.1);
        
        // Apply vibrance (intelligent saturation)
        color = adjustVibrance(color, u_vibrance);
        
        // Apply saturation
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luminance), color, 1.0 + u_saturation * 0.5);
        
        // Apply temperature/tint
        color = adjustTemperature(color, u_temperature, u_tint);
        
        // Apply hue shift
        color = applyHueShift(color, u_hue);
        
        // Apply color balance
        color = applyColorBalance(color, u_colorBalance);
        
        // Apply tone curve (lights/darks)
        color = applyToneCurve(color, u_lights, u_darks);
        
        // Apply dehaze
        color = applyDehaze(color, u_dehaze);
        
        // Apply clarity
        color = adjustClarity(color, u_clarity);
        
        // Apply brilliance (smart highlight enhancement)
        float brillianceAmount = smoothstep(0.3, 1.0, dot(color, vec3(0.299, 0.587, 0.114)));
        color += color * u_brilliance * brillianceAmount * 0.2;
        
        // Apply color grading
        color = applyColorGrading(color, u_shadowsHue, u_shadowsSat, u_midtonesHue, u_midtonesSat, u_highlightsHue, u_highlightsSat);
        
        // Apply tone mapping for natural look
        color.r = appleToneMap(color.r, 1.0, 1.0);
        color.g = appleToneMap(color.g, 1.0, 1.0);
        color.b = appleToneMap(color.b, 1.0, 1.0);
        
        // Apply creative effects
        color = applyCreativeEffects(color, u_orton, u_bleachBypass, u_crossProcess, u_vintage, u_splitToning);
        
        // Apply fade effect
        color = applyFade(color, u_fadeAmount);
        
        // Apply vignette
        float vignetteMultiplier = vignette(v_texCoord, u_vignette, u_vignetteFeather);
        color *= vignetteMultiplier;
        
        // Apply grain
        float grainMultiplier = grain(v_texCoord, u_grainAmount, u_grainSize);
        color *= grainMultiplier;
        
        // Ensure valid color range
        color = clamp(color, 0.0, 1.0);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
      throw new Error('Failed to create shaders');
    }

    this.program = this.createProgram(vertexShader, fragmentShader);
    this.setupGeometry();
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    const program = this.gl.createProgram();
    if (!program) return null;
    
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program link error:', this.gl.getProgramInfoLog(program));
      this.gl.deleteProgram(program);
      return null;
    }
    
    return program;
  }

  private setupGeometry() {
    if (!this.program) return;

    // Create geometry for full-screen quad
    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1, 1,   1, -1,   1, 1,
    ]);

    const texCoords = new Float32Array([
      0, 0,  1, 0,  0, 1,
      0, 1,  1, 0,  1, 1,
    ]);

    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

    const texCoordBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);

    const texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
    this.gl.enableVertexAttribArray(texCoordLocation);
    this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
  }

  processFrame(imageData: string, adjustments: VideoFrame['adjustments']): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.program) {
        reject(new Error('WebGL program not initialized'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          this.canvas.width = img.width;
          this.canvas.height = img.height;
          this.gl.viewport(0, 0, img.width, img.height);

          // Create and bind texture
          this.texture = this.gl.createTexture();
          this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
          this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);

          // Use program and set uniforms
          this.gl.useProgram(this.program);

          // Set uniform values from adjustments
          this.setUniform('u_exposure', adjustments.exposure / 100);
          this.setUniform('u_brightness', adjustments.brightness / 100);
          this.setUniform('u_contrast', adjustments.contrast / 100);
          this.setUniform('u_highlights', adjustments.highlights / 100);
          this.setUniform('u_shadows', adjustments.shadows / 100);
          this.setUniform('u_vibrance', adjustments.vibrance / 100);
          this.setUniform('u_saturation', adjustments.saturation / 100);
          this.setUniform('u_temperature', adjustments.temperature / 100);
          this.setUniform('u_tint', adjustments.tint / 100);
          this.setUniform('u_clarity', adjustments.clarity / 100);
          this.setUniform('u_brilliance', adjustments.brilliance / 100);
          this.setUniform('u_blackPoint', adjustments.blackPoint / 100);
          this.setUniform('u_whitePoint', adjustments.whitePoint / 100);
          this.setUniform('u_grainAmount', adjustments.grainAmount);
          this.setUniform('u_grainSize', adjustments.grainSize);
          this.setUniform('u_vignette', adjustments.vignette);
          this.setUniform('u_vignetteFeather', adjustments.vignetteFeather);
          this.setUniform('u_fadeAmount', adjustments.fadeAmount);
          this.setUniform('u_hue', adjustments.hue);
          this.setUniform('u_colorBalance', adjustments.colorBalance / 100);
          this.setUniform('u_lights', adjustments.lights / 100);
          this.setUniform('u_darks', adjustments.darks / 100);
          this.setUniform('u_shadowTone', adjustments.shadowTone / 100);
          this.setUniform('u_dehaze', adjustments.dehaze / 100);
          this.setUniform('u_sharpening', adjustments.sharpening / 100);
          this.setUniform('u_noiseReduction', adjustments.noiseReduction / 100);
          this.setUniform('u_luminanceNoise', adjustments.luminanceNoise / 100);
          this.setUniform('u_colorNoise', adjustments.colorNoise / 100);
          this.setUniform('u_chromaAberration', adjustments.chromaAberration / 100);
          this.setUniform('u_distortion', adjustments.distortion / 100);
          this.setUniform('u_shadowsHue', adjustments.shadowsHue);
          this.setUniform('u_shadowsSat', adjustments.shadowsSat);
          this.setUniform('u_midtonesHue', adjustments.midtonesHue);
          this.setUniform('u_midtonesSat', adjustments.midtonesSat);
          this.setUniform('u_highlightsHue', adjustments.highlightsHue);
          this.setUniform('u_highlightsSat', adjustments.highlightsSat);
          this.setUniform('u_splitToning', adjustments.splitToning);
          this.setUniform('u_orton', adjustments.orton);
          this.setUniform('u_bleachBypass', adjustments.bleachBypass);
          this.setUniform('u_crossProcess', adjustments.crossProcess);
          this.setUniform('u_vintage', adjustments.vintage);

          // Draw
          this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

          // Get result as base64
          const result = this.canvas.toDataURL('image/jpeg', 0.95);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageData;
    });
  }

  private setUniform(name: string, value: number) {
    if (!this.program) return;
    const location = this.gl.getUniformLocation(this.program, name);
    if (location) {
      this.gl.uniform1f(location, value);
    }
  }

  dispose() {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
    }
    if (this.program) {
      this.gl.deleteProgram(this.program);
    }
  }
}

// Singleton instance for performance
let processorInstance: WebGLImageProcessor | null = null;

export async function applyAdjustmentsGPU(
  imageData: string,
  adjustments: VideoFrame['adjustments']
): Promise<string> {
  try {
    if (!processorInstance) {
      processorInstance = new WebGLImageProcessor();
    }
    return await processorInstance.processFrame(imageData, adjustments);
  } catch (error) {
    console.warn('WebGL processing failed, falling back to CPU processing:', error);
    // Fallback to existing CPU processing
    const { applyAdjustments } = await import('./videoProcessor');
    return applyAdjustments(imageData, adjustments);
  }
}