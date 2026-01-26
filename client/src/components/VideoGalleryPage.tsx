import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { Download, Film, RefreshCw } from 'lucide-react';

interface VideoFile {
    url: string;
    name: string;
    id: string;
}

const VideoGalleryPage: React.FC = () => {
    const [videos, setVideos] = useState<VideoFile[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchVideos = () => {
        setLoading(true);
        fetch(`${API_BASE_URL}/api/videos/list`)
            .then(res => res.json())
            .then(data => {
                setVideos(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch videos:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchVideos();
    }, []);

    return (
        <div style={{
            flex: 1,
            height: '100vh',
            background: '#1a1a1a',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                padding: '24px 40px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #3498db, #2ecc71)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 20px rgba(52, 152, 219, 0.3)'
                    }}>
                        <Film size={24} color="white" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'white' }}>Generated Videos</h1>
                        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#888' }}>Explore your Kling AI cinematic results</p>
                    </div>
                </div>

                <button
                    onClick={fetchVideos}
                    disabled={loading}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '10px 20px',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        transition: 'all 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                    <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    Refresh Gallery
                </button>
            </div>

            {/* Gallery Grid */}
            <div style={{
                flex: 1,
                padding: '40px',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '32px',
                alignContent: 'start'
            }}>
                {videos.length === 0 && !loading ? (
                    <div style={{
                        gridColumn: '1 / -1',
                        height: '300px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#444',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '24px',
                        border: '2px dashed rgba(255,255,255,0.05)'
                    }}>
                        <Film size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                        <p style={{ fontSize: '18px', fontWeight: 500 }}>No videos generated yet</p>
                        <p style={{ fontSize: '14px' }}>Start a batch generation to see results here</p>
                    </div>
                ) : (
                    videos.map(video => (
                        <div key={video.id} className="video-card" style={{
                            background: '#242424',
                            borderRadius: '20px',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.05)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            position: 'relative'
                        }}>
                            <div style={{
                                width: '100%',
                                aspectRatio: '16/9',
                                background: '#000',
                                position: 'relative'
                            }}>
                                <video
                                    src={`${API_BASE_URL}${video.url}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    controls
                                    playsInline
                                />
                            </div>
                            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ overflow: 'hidden' }}>
                                    <div style={{
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color: 'white',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {video.name}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>MP4 Video</div>
                                </div>
                                <a
                                    href={`${API_BASE_URL}${video.url}`}
                                    download
                                    className="download-btn"
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#888',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Download size={20} />
                                </a>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                .video-card:hover {
                    transform: translateY(-8px);
                    border-color: rgba(52, 152, 219, 0.3);
                    box-shadow: 0 12px 30px rgba(0,0,0,0.4);
                }
                .download-btn:hover {
                    background: #3498db !important;
                    color: white !important;
                }
                ::-webkit-scrollbar {
                    width: 8px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1);
                    border-radius: 10px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.2);
                }
            `}</style>
        </div>
    );
};

export default VideoGalleryPage;
