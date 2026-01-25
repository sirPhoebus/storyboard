import React from 'react';

export interface UploadState {
    id: string;
    fileName: string;
    progress: number;
    status: 'uploading' | 'processing' | 'completed' | 'error';
    error?: string;
}

interface UploadProgressProps {
    uploads: UploadState[];
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ uploads }) => {
    if (uploads.length === 0) return null;

    return (
        <div style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            width: '300px',
            background: '#2c3e50',
            border: '1px solid #34495e',
            borderRadius: '8px',
            padding: '12px',
            zIndex: 1000,
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }}>
            <div style={{ color: 'white', fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #34495e', paddingBottom: '8px' }}>
                Uploads
            </div>
            {uploads.map(upload => (
                <div key={upload.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#ecf0f1', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={upload.fileName}>
                            {upload.fileName}
                        </span>
                        <span style={{ color: upload.status === 'error' ? '#e74c3c' : '#bdc3c7', fontSize: '11px' }}>
                            {upload.status === 'uploading' ? `${upload.progress}%` : upload.status}
                        </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: '#34495e', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                            width: `${upload.progress}%`,
                            height: '100%',
                            background: upload.status === 'error' ? '#e74c3c' : (upload.status === 'completed' ? '#2ecc71' : '#3498db'),
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
};
