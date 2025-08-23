'use client';

import VideoUpload from '@/components/VideoUpload';
import FrameEditor from '@/components/FrameEditor';
import ExportControls from '@/components/ExportControls';
import LivePreview from '@/components/LivePreview';
import AdvancedControls from '@/components/AdvancedControls';
import { useVideoStore } from '@/store/videoStore';

export default function Home() {
  const { video, frames, currentFrame, isProcessing } = useVideoStore();
  
  // Debug logging
  console.log('App state:', { 
    hasVideo: !!video, 
    framesCount: frames.length, 
    currentFrame,
    firstFrameAdjustments: frames[0]?.adjustments ? Object.keys(frames[0].adjustments).length : 0
  });

  if (!video || isProcessing) {
    return (
      <div className="upload-area">
        <div className="text-center mb-8">
          <h1 className="upload-title">persecond</h1>
          <p className="upload-subtitle">
            Professional frame-by-frame video editing with Apple-quality precision tools.<br />
            Upload your video and transform each frame with advanced color science.
          </p>
        </div>
        <VideoUpload />
      </div>
    );
  }

  return (
    <div className="app-container animate-fade-in">
      {/* Main Content Area */}
      <div className="main-area">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="flex items-center gap-4">
            <h1 className="toolbar-title">Frame Editor</h1>
            {video && (
              <div className="toolbar-meta">
                <span>{video.name}</span>
                <span>•</span>
                <span className="uppercase font-medium">{video.format}</span>
              </div>
            )}
          </div>
          
          {currentFrame !== null && (
            <div className="toolbar-meta font-medium">
              Frame {currentFrame + 1} of {frames.length}
            </div>
          )}
        </div>
        
        {/* Content Area */}
        <div className="content-area">
          {frames.length > 0 && currentFrame !== null && (
            <FrameEditor />
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <h2 className="sidebar-title">Adjustments</h2>
        </div>
        
        {/* Sidebar Content */}
        <div className="sidebar-content">
          {/* Controls */}
          <div className="controls-section">
            {frames.length > 0 && (
              <AdvancedControls 
                adjustments={frames[currentFrame ?? 0]?.adjustments || {}}
                onAdjustmentChange={(key, value) => {
                  const { updateFrameAdjustments, setCurrentFrame } = useVideoStore.getState();
                  const frameIndex = currentFrame ?? 0;
                  if (currentFrame === null) {
                    setCurrentFrame(0); // Ensure currentFrame is set
                  }
                  updateFrameAdjustments(frameIndex, { [key]: value });
                }}
              />
            )}
          </div>
        </div>

        {/* Export Section */}
        <div className="export-section">
          <ExportControls />
        </div>
      </div>
    </div>
  );
}
