# persecond

Professional frame-by-frame video editing with Apple-quality precision tools.

## Features

- **Frame-by-Frame Editing**: Edit each frame individually with comprehensive adjustment controls
- **Apple-Quality Tools**: Professional exposure, color grading, and creative effects
- **GPU-Accelerated Preview**: Real-time WebGL processing for instant feedback
- **Dynamic Layout**: Automatically adjusts based on video aspect ratio
- **Audio Preservation**: Maintains original audio during export
- **Multiple Formats**: Supports MP4, MOV, AVI, MKV, WebM, and more
- **Privacy First**: All processing happens locally in your browser

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Use

1. Upload your video file
2. Navigate through frames using the percentage-based slider or frame grid
3. Apply adjustments to individual frames
4. Use "Apply to All Frames" to copy adjustments across all frames
5. Export your edited video with preserved audio

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **WebGL** - GPU-accelerated image processing
- **FFmpeg.wasm** - Video export with audio preservation
- **Zustand** - State management
- **Canvas API** - Frame extraction and manipulation
