import React from 'react';
import type { Socket } from 'socket.io-client';
import { Play, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Chapter, GalleryVideo, Page } from '../types';

interface VideosPageProps {
    socket: Socket | null;
    currentProjectId: string | null;
    chapters: Chapter[];
    pages: Page[];
}

const toAbsoluteUrl = (url: string) => (url.startsWith('http') ? url : `${API_BASE_URL}${url}`);

const VideosPage: React.FC<VideosPageProps> = ({ socket, currentProjectId, chapters, pages }) => {
    const [videos, setVideos] = React.useState<GalleryVideo[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [playbackQueue, setPlaybackQueue] = React.useState<GalleryVideo[]>([]);
    const [playbackIndex, setPlaybackIndex] = React.useState(0);
    const [sendVideo, setSendVideo] = React.useState<GalleryVideo | null>(null);
    const [selectedVideoIds, setSelectedVideoIds] = React.useState<string[]>([]);
    const [sendError, setSendError] = React.useState<string | null>(null);
    const [sending, setSending] = React.useState(false);
    const [deletingVideoId, setDeletingVideoId] = React.useState<string | null>(null);
    const fetchControllerRef = React.useRef<AbortController | null>(null);

    const fetchTasks = React.useCallback(() => {
        fetchControllerRef.current?.abort();
        if (!currentProjectId) {
            setVideos([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        fetchControllerRef.current = controller;
        setLoading(true);
        fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(currentProjectId)}/videos`, { signal: controller.signal })
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`Failed to fetch videos: ${res.status}`);
                }
                return res.json();
            })
            .then((data) => {
                if (controller.signal.aborted) return;
                if (!Array.isArray(data)) {
                    setVideos([]);
                    return;
                }
                setVideos(data);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                console.error('Failed to fetch videos:', err);
                setVideos([]);
            })
            .finally(() => {
                if (fetchControllerRef.current === controller) {
                    fetchControllerRef.current = null;
                }
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });
    }, [currentProjectId]);

    React.useEffect(() => {
        fetchTasks();
        return () => {
            fetchControllerRef.current?.abort();
            fetchControllerRef.current = null;
        };
    }, [fetchTasks]);

    React.useEffect(() => {
        if (!socket) return;

        const syncBatchVideo = (task: { project_id?: string; status?: string; generated_video_url?: string }) => {
            if (task.project_id !== currentProjectId) return;
            if (task.status !== 'completed' || !task.generated_video_url) {
                fetchTasks();
                return;
            }
            fetchTasks();
        };
        const syncDeletedBatchVideo = (_payload: { id: string }) => {
            fetchTasks();
        };
        const syncImportedVideos = (payload: { projectId: string; videos?: GalleryVideo[] }) => {
            if (payload.projectId !== currentProjectId) return;
            if (Array.isArray(payload.videos)) {
                setVideos(payload.videos);
                setLoading(false);
                return;
            }
            fetchTasks();
        };

        socket.on('batch:add', syncBatchVideo);
        socket.on('batch:update', syncBatchVideo);
        socket.on('batch:delete', syncDeletedBatchVideo);
        socket.on('videos:update', syncImportedVideos);

        return () => {
            socket.off('batch:add', syncBatchVideo);
            socket.off('batch:update', syncBatchVideo);
            socket.off('batch:delete', syncDeletedBatchVideo);
            socket.off('videos:update', syncImportedVideos);
        };
    }, [socket, fetchTasks, currentProjectId]);

    React.useEffect(() => {
        if (playbackQueue.length === 0) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setPlaybackQueue([]);
                setPlaybackIndex(0);
                return;
            }
            if (e.key === 'ArrowRight') {
                setPlaybackIndex((prev) => Math.min(prev + 1, playbackQueue.length - 1));
            }
            if (e.key === 'ArrowLeft') {
                setPlaybackIndex((prev) => Math.max(prev - 1, 0));
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [playbackQueue]);

    const normalPages = React.useMemo(() => pages.filter((page) => page.type !== 'videos'), [pages]);
    const selectedVideos = React.useMemo(
        () => videos.filter((video) => selectedVideoIds.includes(video.id)),
        [videos, selectedVideoIds]
    );
    const currentPlaybackVideo = playbackQueue[playbackIndex] || null;

    const closePlaybackModal = React.useCallback(() => {
        setPlaybackQueue([]);
        setPlaybackIndex(0);
    }, []);

    const openPlaybackQueue = React.useCallback((queue: GalleryVideo[], startIndex = 0) => {
        if (queue.length === 0) return;
        setSendVideo(null);
        setSendError(null);
        setPlaybackQueue(queue);
        setPlaybackIndex(startIndex);
    }, []);

    const handleSendToPage = React.useCallback(async (video: GalleryVideo, pageId: string) => {
        if (!currentProjectId || sending) return;
        setSending(true);
        setSendError(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(currentProjectId)}/videos/send-to-page`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: video.source,
                    sourceId: video.source_id,
                    pageId
                })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to send video to page');
            }
            setSendVideo(null);
            closePlaybackModal();
            fetchTasks();
        } catch (err: any) {
            setSendError(err.message || 'Failed to send video to page');
        } finally {
            setSending(false);
        }
    }, [closePlaybackModal, currentProjectId, fetchTasks, sending]);

    const handleCardClick = React.useCallback((event: React.MouseEvent, video: GalleryVideo) => {
        const isToggleSelection = event.ctrlKey || event.metaKey || selectedVideoIds.length > 0;

        if (isToggleSelection) {
            closePlaybackModal();
            setSendVideo(null);
            setSendError(null);
            setSelectedVideoIds((prev) => (
                prev.includes(video.id)
                    ? prev.filter((id) => id !== video.id)
                    : [...prev, video.id]
            ));
            return;
        }

        openPlaybackQueue([video]);
    }, [closePlaybackModal, openPlaybackQueue, selectedVideoIds.length]);

    const handleSendSelectedToPage = React.useCallback(async (pageId: string) => {
        if (!currentProjectId || sending || selectedVideos.length === 0) return;
        setSending(true);
        setSendError(null);
        try {
            for (const video of selectedVideos) {
                const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(currentProjectId)}/videos/send-to-page`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: video.source,
                        sourceId: video.source_id,
                        pageId
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || `Failed to send "${video.title}" to page`);
                }
            }
            setSelectedVideoIds([]);
            setSendVideo(null);
            closePlaybackModal();
            fetchTasks();
        } catch (err: any) {
            setSendError(err.message || 'Failed to send selected videos to page');
        } finally {
            setSending(false);
        }
    }, [closePlaybackModal, currentProjectId, fetchTasks, selectedVideos, sending]);

    const deleteVideoByItem = React.useCallback(async (video: GalleryVideo) => {
        if (!currentProjectId) return;
        const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(currentProjectId)}/videos`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: video.source,
                sourceId: video.source_id
            })
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to delete video');
        }
    }, [currentProjectId]);

    const handleDeleteVideo = React.useCallback(async (event: React.MouseEvent, video: GalleryVideo) => {
        event.stopPropagation();
        if (!currentProjectId || deletingVideoId) return;
        setDeletingVideoId(video.id);
        setSendError(null);
        try {
            await deleteVideoByItem(video);
            setSelectedVideoIds((prev) => prev.filter((id) => id !== video.id));
            setSendVideo((prev) => prev?.id === video.id ? null : prev);
            setPlaybackQueue((prev) => prev.filter((item) => item.id !== video.id));
            setPlaybackIndex(0);
            fetchTasks();
        } catch (err: any) {
            setSendError(err.message || 'Failed to delete video');
        } finally {
            setDeletingVideoId(null);
        }
    }, [currentProjectId, deleteVideoByItem, deletingVideoId, fetchTasks]);

    const handleDeleteSelected = React.useCallback(async () => {
        if (!currentProjectId || deletingVideoId || selectedVideos.length === 0) return;
        setDeletingVideoId('__multi__');
        setSendError(null);
        try {
            for (const video of selectedVideos) {
                await deleteVideoByItem(video);
            }
            setSelectedVideoIds([]);
            setSendVideo(null);
            closePlaybackModal();
            fetchTasks();
        } catch (err: any) {
            setSendError(err.message || 'Failed to delete selected videos');
        } finally {
            setDeletingVideoId(null);
        }
    }, [closePlaybackModal, currentProjectId, deleteVideoByItem, deletingVideoId, fetchTasks, selectedVideos]);

    return (
        <div style={{
            flex: 1,
            minHeight: '100vh',
            overflowY: 'auto',
            background: 'linear-gradient(180deg, #121721 0%, #0c1017 100%)',
            color: '#f7fafc'
        }}>
            <div style={{ padding: '36px 40px 48px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dd3fc', marginBottom: '8px' }}>Gallery</div>
                        <h1 style={{ margin: 0, fontSize: '32px', lineHeight: 1, fontWeight: 800 }}>Videos</h1>
                        <p style={{ margin: '10px 0 0', color: '#94a3b8', maxWidth: '620px' }}>
                            This page loads only thumbnails. Videos are loaded only when you open a card.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {selectedVideoIds.length > 0 && (
                            <>
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: '999px',
                                    background: 'rgba(125, 211, 252, 0.12)',
                                    border: '1px solid rgba(125, 211, 252, 0.24)',
                                    color: '#e0f2fe',
                                    fontSize: '13px'
                                }}>
                                    {selectedVideoIds.length} selected
                                </div>
                                <button
                                    onClick={() => openPlaybackQueue(selectedVideos)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        border: '1px solid rgba(125, 211, 252, 0.35)',
                                        background: 'rgba(14, 165, 233, 0.18)',
                                        color: '#e0f2fe',
                                        borderRadius: '999px',
                                        padding: '10px 16px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Play size={16} />
                                    Play Selected
                                </button>
                                <button
                                    onClick={handleDeleteSelected}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        border: '1px solid rgba(248, 113, 113, 0.28)',
                                        background: 'rgba(127, 29, 29, 0.18)',
                                        color: '#fee2e2',
                                        borderRadius: '999px',
                                        padding: '10px 16px',
                                        cursor: deletingVideoId ? 'wait' : 'pointer'
                                    }}
                                >
                                    <Trash2 size={16} />
                                    Delete Selected
                                </button>
                                <button
                                    onClick={() => {
                                        setSendError(null);
                                        setSendVideo(selectedVideos[0] || null);
                                    }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        border: '1px solid rgba(125, 211, 252, 0.35)',
                                        background: 'rgba(14, 165, 233, 0.14)',
                                        color: '#e0f2fe',
                                        borderRadius: '999px',
                                        padding: '10px 16px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Send size={16} />
                                    Send Selected
                                </button>
                                <button
                                    onClick={() => setSelectedVideoIds([])}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        border: '1px solid rgba(148, 163, 184, 0.24)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: '#cbd5e1',
                                        borderRadius: '999px',
                                        padding: '10px 16px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Clear
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => openPlaybackQueue(videos)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '10px',
                                border: '1px solid rgba(125, 211, 252, 0.35)',
                                background: 'rgba(14, 165, 233, 0.08)',
                                color: '#e0f2fe',
                                borderRadius: '999px',
                                padding: '10px 16px',
                                cursor: 'pointer'
                            }}
                        >
                            <Play size={16} />
                            Play All
                        </button>
                        <button
                            onClick={fetchTasks}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '10px',
                                border: '1px solid rgba(125, 211, 252, 0.35)',
                                background: 'rgba(14, 165, 233, 0.08)',
                                color: '#e0f2fe',
                                borderRadius: '999px',
                                padding: '10px 16px',
                                cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={16} />
                            Refresh
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ color: '#94a3b8', padding: '40px 0' }}>Loading thumbnails...</div>
                ) : videos.length === 0 ? (
                    <div style={{
                        padding: '48px',
                        borderRadius: '24px',
                        border: '1px dashed rgba(148, 163, 184, 0.3)',
                        background: 'rgba(255,255,255,0.02)',
                        color: '#94a3b8'
                    }}>
                        No videos yet. Generate them through batch management or drop files into `uploads/&lt;projectId&gt;/_videos` and scan.
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                        gap: '20px'
                    }}>
                        {videos.map((video) => {
                            const thumbnailUrl = video.thumbnail_url ? toAbsoluteUrl(video.thumbnail_url) : null;
                            return (
                                <button
                                    key={video.id}
                                    onClick={(event) => handleCardClick(event, video)}
                                    style={{
                                        background: selectedVideoIds.includes(video.id) ? 'rgba(14, 165, 233, 0.12)' : 'rgba(255,255,255,0.03)',
                                        border: selectedVideoIds.includes(video.id) ? '1px solid rgba(125, 211, 252, 0.5)' : '1px solid rgba(148, 163, 184, 0.18)',
                                        borderRadius: '22px',
                                        padding: '12px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        color: 'inherit',
                                        boxShadow: '0 20px 40px rgba(0,0,0,0.18)'
                                    }}
                                >
                                    <div style={{
                                        position: 'relative',
                                        aspectRatio: '16 / 9',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        background: '#0f172a',
                                        marginBottom: '12px'
                                    }}>
                                        {thumbnailUrl ? (
                                            <img src={thumbnailUrl} alt="Video thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>
                                                No thumbnail
                                            </div>
                                        )}
                                        <div style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.55) 100%)'
                                        }} />
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>{video.title || 'Untitled video'}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                            {video.source === 'imported' ? 'Imported' : `${video.duration || 0}s generated`}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                onClick={(event) => handleDeleteVideo(event, video)}
                                                disabled={deletingVideoId === video.id}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    background: 'rgba(127, 29, 29, 0.18)',
                                                    border: '1px solid rgba(248, 113, 113, 0.28)',
                                                    color: '#fee2e2',
                                                    borderRadius: '999px',
                                                    padding: '6px 10px',
                                                    cursor: deletingVideoId === video.id ? 'wait' : 'pointer',
                                                    fontSize: '11px'
                                                }}
                                            >
                                                <Trash2 size={12} />
                                                Delete
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSendError(null);
                                                    setSendVideo(video);
                                                }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    background: 'rgba(14, 165, 233, 0.12)',
                                                    border: '1px solid rgba(125, 211, 252, 0.24)',
                                                    color: '#e0f2fe',
                                                    borderRadius: '999px',
                                                    padding: '6px 10px',
                                                    cursor: 'pointer',
                                                    fontSize: '11px'
                                                }}
                                            >
                                                <Send size={12} />
                                                Send
                                            </button>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {currentPlaybackVideo?.video_url && (
                <div
                    onClick={closePlaybackModal}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 3000,
                        background: 'rgba(2, 6, 23, 0.82)',
                        backdropFilter: 'blur(10px)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '24px'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(960px, 100%)',
                            borderRadius: '24px',
                            background: '#020617',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid rgba(148, 163, 184, 0.14)' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '11px', color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Lazy Loaded Playback</div>
                                <div style={{ fontSize: '14px', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {currentPlaybackVideo.title || 'Video'}
                                </div>
                                {playbackQueue.length > 1 && (
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                                        {playbackIndex + 1} / {playbackQueue.length}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {playbackQueue.length > 1 && (
                                    <>
                                        <button
                                            onClick={() => setPlaybackIndex((prev) => Math.max(prev - 1, 0))}
                                            disabled={playbackIndex === 0}
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(148, 163, 184, 0.16)',
                                                color: playbackIndex === 0 ? '#475569' : '#cbd5e1',
                                                cursor: playbackIndex === 0 ? 'not-allowed' : 'pointer',
                                                borderRadius: '999px',
                                                padding: '8px 12px'
                                            }}
                                        >
                                            Prev
                                        </button>
                                        <button
                                            onClick={() => setPlaybackIndex((prev) => Math.min(prev + 1, playbackQueue.length - 1))}
                                            disabled={playbackIndex >= playbackQueue.length - 1}
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(148, 163, 184, 0.16)',
                                                color: playbackIndex >= playbackQueue.length - 1 ? '#475569' : '#cbd5e1',
                                                cursor: playbackIndex >= playbackQueue.length - 1 ? 'not-allowed' : 'pointer',
                                                borderRadius: '999px',
                                                padding: '8px 12px'
                                            }}
                                        >
                                            Next
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={closePlaybackModal}
                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div style={{ background: '#000' }}>
                            <video
                                key={currentPlaybackVideo.id}
                                controls
                                autoPlay
                                playsInline
                                preload="metadata"
                                onEnded={() => {
                                    if (playbackIndex < playbackQueue.length - 1) {
                                        setPlaybackIndex((prev) => prev + 1);
                                    }
                                }}
                                style={{ width: '100%', display: 'block', maxHeight: '80vh' }}
                            >
                                <source src={toAbsoluteUrl(currentPlaybackVideo.video_url)} type="video/mp4" />
                            </video>
                        </div>
                    </div>
                </div>
            )}

            {sendVideo && (
                <div
                    onClick={() => !sending && setSendVideo(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 3100,
                        background: 'rgba(2, 6, 23, 0.82)',
                        backdropFilter: 'blur(10px)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '24px'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(720px, 100%)',
                            maxHeight: '80vh',
                            overflow: 'auto',
                            borderRadius: '24px',
                            background: '#020617',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
                            padding: '20px'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <div>
                                <div style={{ fontSize: '11px', color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Send To Page</div>
                                <div style={{ fontSize: '16px', color: '#e2e8f0' }}>
                                    {selectedVideoIds.length > 0 ? `${selectedVideoIds.length} videos selected` : sendVideo.title}
                                </div>
                            </div>
                            <button
                                onClick={() => setSendVideo(null)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {sendError && (
                            <div style={{ marginBottom: '12px', color: '#fca5a5', fontSize: '13px' }}>{sendError}</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {chapters.map((chapter) => {
                                const chapterPages = normalPages.filter((page) => page.chapter_id === chapter.id);
                                if (chapterPages.length === 0) return null;
                                return (
                                    <div key={chapter.id} style={{ border: '1px solid rgba(148, 163, 184, 0.14)', borderRadius: '18px', padding: '14px' }}>
                                        <div style={{ fontSize: '12px', color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>{chapter.title}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                            {chapterPages.map((page) => (
                                                <button
                                                    key={page.id}
                                                    onClick={() => {
                                                        if (selectedVideoIds.length > 0) {
                                                            handleSendSelectedToPage(page.id).catch(err => console.error('Failed to send selected videos to page:', err));
                                                        } else {
                                                            handleSendToPage(sendVideo, page.id).catch(err => console.error('Failed to send video to page:', err));
                                                        }
                                                    }}
                                                    disabled={sending}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.04)',
                                                        border: '1px solid rgba(148, 163, 184, 0.16)',
                                                        color: '#e2e8f0',
                                                        borderRadius: '999px',
                                                        padding: '10px 14px',
                                                        cursor: sending ? 'wait' : 'pointer'
                                                    }}
                                                >
                                                    {page.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideosPage;
