# PerSecond - Professional Video Editor

A top-tier video editing application with frame-by-frame editing capabilities, real-time adjustments, and professional export quality.

## ✨ Features

- **Frame-by-Frame Editing**: Edit individual frames with precision
- **Real-time Preview**: GPU-accelerated WebGL processing for instant feedback
- **Professional Adjustments**: 25+ professional photo editing controls
- **High-Quality Export**: Maintains original 4K/8K quality with audio preservation
- **Format Preservation**: Exports in exact original format (MP4→MP4, MOV→MOV, etc.)
- **Cross-Platform**: Works on desktop and mobile browsers
- **Multiple Export Methods**: FFmpeg + Canvas fallbacks for maximum compatibility

## 🚀 Quick Start

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Production Build

```bash
npm run build
npm start
```

## 🌐 Deploy to Vercel

### Method 1: GitHub Integration (Recommended)

1. **Connect GitHub Repository**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project" or "Add New..."
   - Select "GitHub" and find your repository: `wavesiddhartha/persecond`

2. **Configure Project**:
   - Framework Preset: **Next.js**
   - Root Directory: `./` (leave as default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install` (default)

3. **Deploy**:
   - Click "Deploy"
   - Your app will be live at: `https://your-project-name.vercel.app`

### Method 2: Vercel CLI

```bash
# Login to Vercel (choose GitHub)
npx vercel login

# Deploy to production
npx vercel --prod
```

## 🎯 Export Capabilities

- **Quality**: Lossless PNG frame processing with visually lossless encoding (CRF 18)
- **Audio**: Original audio preserved using FFmpeg
- **Formats**: MP4, MOV, AVI, WebM, MKV, M4V, 3GP, FLV, WMV
- **Resolution**: Maintains original resolution up to 8K
- **Performance**: Optimized for smooth UI during processing

## 🔧 Technical Details

### Architecture
- **Frontend**: Next.js 15.5.0 with TypeScript
- **State Management**: Zustand
- **Image Processing**: WebGL shaders
- **Video Export**: FFmpeg.js + Canvas API
- **Styling**: CSS modules with CSS variables
