'use client';

import { useState } from 'react';
import { useVideoStore } from '@/store/videoStore';
import { exportVideo, downloadVideo, getEstimatedExportTime } from '@/utils/videoExporter';

// Generate preview of clean filename (same logic as in videoExporter)
function generateCleanFilenamePreview(originalFileName: string, format: string): string {
  const sanitizeFilename = (filename: string): string => {
    return filename
      .replace(/[#@$%^&*()+=\[\]{}|\\:";'<>?,/]/g, '')
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .substring(0, 100)
      .trim();
  };

  const baseName = originalFileName.replace(/\.[^/.]+$/, '');
  const cleanBaseName = sanitizeFilename(baseName);
  const finalBaseName = cleanBaseName || 'edited_video';
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
  
  return `${finalBaseName}_${timestamp}.${format.toLowerCase()}`;
}

const ExportControls = () => {
  const { video, frames } = useVideoStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');

  const handleExportVideo = async () => {
    if (!video || frames.length === 0) {
      alert('No video to export');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStage('Initializing...');

    try {
      // Export video with progress tracking
      const videoBlob = await exportVideo(
        frames,
        video,
        (progress) => {
          setExportProgress(progress);
          
          // Update stage based on progress
          if (progress < 10) {
            setExportStage('Loading FFmpeg...');
          } else if (progress < 60) {
            setExportStage('Processing frames...');
          } else if (progress < 80) {
            setExportStage('Writing frames...');
          } else if (progress < 95) {
            setExportStage('Encoding video...');
          } else {
            setExportStage('Finalizing...');
          }
        }
      );

      setExportStage('Download ready!');
      
      // Download the video with original format
      downloadVideo(videoBlob, video.name, video.format);
      
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStage('');
      }, 2000);

    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsExporting(false);
      setExportProgress(0);
      setExportStage('');
    }
  };

  if (!video || frames.length === 0) {
    return (
      <div className="text-center p-4">
        <div className="text-[var(--text-tertiary)] text-sm">
          Upload and edit a video to enable export
        </div>
      </div>
    );
  }

  const estimatedTime = getEstimatedExportTime(frames.length, video.width, video.height);
  const previewFilename = generateCleanFilenamePreview(video.name, video.format);

  return (
    <div>
      {/* Filename Preview */}
      <div style={{ 
        marginBottom: '16px',
        padding: '12px',
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          Export filename:
        </div>
        <div style={{ 
          fontSize: '13px', 
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          wordBreak: 'break-all',
          lineHeight: '1.4'
        }}>
          {previewFilename}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          ✨ Automatically cleaned for compatibility
        </div>
      </div>

      {/* Video Info */}
      <div className="export-info">
        <div className="export-stat">
          <div className="export-stat-label">Format</div>
          <div className="export-stat-value">{video.format.toUpperCase()}</div>
        </div>
        <div className="export-stat">
          <div className="export-stat-label">Frames</div>
          <div className="export-stat-value">{frames.length}</div>
        </div>
        <div className="export-stat">
          <div className="export-stat-label">Resolution</div>
          <div className="export-stat-value">{video.width}×{video.height}</div>
        </div>
        <div className="export-stat">
          <div className="export-stat-label">Duration</div>
          <div className="export-stat-value">{estimatedTime}</div>
        </div>
      </div>

      {/* Export Status */}
      {isExporting ? (
        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-label">{exportStage}</span>
            <span className="progress-percentage">
              {Math.round(exportProgress)}%
            </span>
          </div>
          
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
          
          <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            Keep this tab open during export
          </div>
        </div>
      ) : (
        <button
          onClick={handleExportVideo}
          className="btn btn-success w-full"
          disabled={isExporting}
          style={{
            fontSize: '16px',
            fontWeight: '600',
            padding: '16px'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export {video.format.toUpperCase()} Video
        </button>
      )}
    </div>
  );
};

export default ExportControls;