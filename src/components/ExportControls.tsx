'use client';

import { useState } from 'react';
import { useVideoStore } from '@/store/videoStore';
import { exportVideo, downloadVideo, getEstimatedExportTime } from '@/utils/videoExporter';

// Generate preview of clean filename (same logic as in videoExporter)
function generateCleanFilenamePreview(originalFileName: string): string {
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
  
  return `${finalBaseName}_${timestamp}.webm`;
}

const ExportControls = () => {
  const { video, frames } = useVideoStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);

  const handleExportVideo = async () => {
    if (!video || frames.length === 0) {
      setExportError('No video to export. Please upload a video first.');
      return;
    }

    // Pre-export checks and warnings
    setExportWarning(null);
    if (frames.length > 500) {
      setExportWarning(`Large video with ${frames.length} frames. Export may take several minutes.`);
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStage('Initializing export...');
    setExportError(null);

    console.log('🚀 Starting export process...', {
      frameCount: frames.length,
      videoDimensions: `${video.width}x${video.height}`,
      videoFormat: video.format
    });

    try {
      // Export video with progress tracking
      const videoBlob = await exportVideo(
        frames,
        video,
        (progress) => {
          setExportProgress(progress);
          
          // Update stage based on progress with FFmpeg-specific info
          if (progress < 5) {
            setExportStage('Starting export...');
          } else if (progress < 10) {
            setExportStage('Loading FFmpeg for high-quality export...');
          } else if (progress < 55) {
            setExportStage('Processing frames with adjustments...');
          } else if (progress < 75) {
            setExportStage('Writing high-quality frames...');
          } else if (progress < 85) {
            setExportStage(`Extracting audio from ${video.format.toUpperCase()} file...`);
          } else if (progress < 95) {
            setExportStage(`Encoding ${video.format.toUpperCase()} with original quality...`);
          } else {
            setExportStage(`Finalizing ${video.format.toUpperCase()} export...`);
          }
        }
      );

      setExportStage('Download ready!');
      
      // Download the video
      downloadVideo(videoBlob, video.name, video.format);
      
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStage('');
      }, 2000);

    } catch (error) {
      console.error('❌ Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setExportError(errorMessage);
      setExportStage('Export failed');
      
      // Auto-hide error after 10 seconds
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStage('');
        setExportError(null);
      }, 10000);
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
  const previewFilename = generateCleanFilenamePreview(video.name);

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

      {/* Pre-export Warning */}
      {exportWarning && !isExporting && (
        <div style={{ 
          marginBottom: '16px',
          padding: '12px',
          background: 'rgba(251, 191, 36, 0.1)',
          border: '1px solid #f59e0b',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: '#f59e0b',
          lineHeight: '1.4'
        }}>
          <strong>⚠️ Notice:</strong><br />
          {exportWarning}
        </div>
      )}

      {/* Export Error (when not exporting) */}
      {exportError && !isExporting && (
        <div style={{ 
          marginBottom: '16px',
          padding: '12px',
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid var(--error)',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: 'var(--error)',
          lineHeight: '1.4'
        }}>
          <strong>❌ Error:</strong><br />
          {exportError}
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Check browser console (F12) for detailed logs
          </div>
        </div>
      )}

      {/* Export Status */}
      {isExporting ? (
        <div className="progress-container">
          <div className="progress-header">
            <span className={`progress-label ${exportError ? 'error' : ''}`}>
              {exportError ? '❌ Export Failed' : exportStage}
            </span>
            <span className="progress-percentage">
              {Math.round(exportProgress)}%
            </span>
          </div>
          
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ 
                width: `${exportProgress}%`,
                backgroundColor: exportError ? 'var(--error)' : undefined
              }}
            />
          </div>
          
          {exportError ? (
            <div style={{ 
              marginTop: '12px',
              padding: '12px',
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid var(--error)',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              color: 'var(--error)',
              lineHeight: '1.4'
            }}>
              <strong>Error Details:</strong><br />
              {exportError}
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Check browser console (F12) for detailed logs
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Keep this tab open during export
            </div>
          )}
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