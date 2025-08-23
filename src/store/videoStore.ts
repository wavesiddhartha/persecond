import { create } from 'zustand';

export interface VideoFrame {
  id: string;
  imageData: string; // base64 encoded image
  timestamp: number;
  adjustments: {
    // Light adjustments
    exposure: number;
    brightness: number;
    highlights: number;
    shadows: number;
    contrast: number;
    brilliance: number;
    blackPoint: number;
    whitePoint: number;
    
    // Color adjustments
    saturation: number;
    vibrance: number;
    temperature: number;
    tint: number;
    hue: number;
    colorBalance: number;
    
    // Tone curve
    lights: number;
    darks: number;
    shadowTone: number;
    
    // Detail
    clarity: number;
    dehaze: number;
    sharpening: number;
    noiseReduction: number;
    luminanceNoise: number;
    colorNoise: number;
    
    // Effects
    vignette: number;
    vignetteFeather: number;
    grainAmount: number;
    grainSize: number;
    chromaAberration: number;
    distortion: number;
    
    // Color grading
    shadowsHue: number;
    shadowsSat: number;
    midtonesHue: number;
    midtonesSat: number;
    highlightsHue: number;
    highlightsSat: number;
    
    // Creative effects
    fadeAmount: number;
    splitToning: number;
    orton: number;
    bleachBypass: number;
    crossProcess: number;
    vintage: number;
  };
}

export interface VideoInfo {
  file: File;
  name: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  format: string;
}

interface VideoStore {
  // State
  video: VideoInfo | null;
  frames: VideoFrame[];
  currentFrame: number | null;
  isProcessing: boolean;
  progress: number;
  
  // Actions
  setVideo: (video: VideoInfo) => void;
  setFrames: (frames: VideoFrame[]) => void;
  setCurrentFrame: (frameIndex: number) => void;
  updateFrameAdjustments: (frameIndex: number, adjustments: Partial<VideoFrame['adjustments']>) => void;
  applyCurrentFrameToAll: () => void;
  setProcessing: (isProcessing: boolean) => void;
  setProgress: (progress: number) => void;
  reset: () => void;
}

const defaultAdjustments = {
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
};

export const useVideoStore = create<VideoStore>((set, get) => ({
  // Initial state
  video: null,
  frames: [],
  currentFrame: null,
  isProcessing: false,
  progress: 0,
  
  // Actions
  setVideo: (video) => set({ video }),
  
  setFrames: (frames) => set({ 
    frames: frames.map(frame => ({
      ...frame,
      adjustments: { ...defaultAdjustments, ...frame.adjustments }
    })),
    currentFrame: frames.length > 0 ? 0 : null
  }),
  
  setCurrentFrame: (frameIndex) => set({ currentFrame: frameIndex }),
  
  updateFrameAdjustments: (frameIndex, adjustments) => {
    const { frames } = get();
    const updatedFrames = frames.map((frame, index) => 
      index === frameIndex 
        ? { ...frame, adjustments: { ...frame.adjustments, ...adjustments } }
        : frame
    );
    set({ frames: updatedFrames });
  },

  applyCurrentFrameToAll: () => {
    const { frames, currentFrame } = get();
    if (currentFrame === null || frames.length === 0) return;
    
    const currentFrameAdjustments = frames[currentFrame].adjustments;
    const updatedFrames = frames.map(frame => ({
      ...frame,
      adjustments: { ...currentFrameAdjustments }
    }));
    set({ frames: updatedFrames });
  },
  
  setProcessing: (isProcessing) => set({ isProcessing }),
  setProgress: (progress) => set({ progress }),
  
  reset: () => set({
    video: null,
    frames: [],
    currentFrame: null,
    isProcessing: false,
    progress: 0,
  }),
}));