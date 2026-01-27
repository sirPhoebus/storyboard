import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import type { BatchTask } from '../types';
import { Socket } from 'socket.io-client';
import { Play, Trash2, Volume2, VolumeX, Clock, ChevronLeft, Hourglass, Download, ChevronRight } from 'lucide-react';

interface PromptMove {
    id: string;
    title: string;
    description: string;
    prompt: string;
}

interface PromptCategory {
    id: string;
    title: string;
    moves: PromptMove[];
}

interface BatchPageProps {
    socket: Socket | null;
}

const BatchPage: React.FC<BatchPageProps> = ({ socket }) => {
    const [tasks, setTasks] = useState<BatchTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [prompts, setPrompts] = useState<PromptCategory[]>([]);
    const [promptsPanelOpen, setPromptsPanelOpen] = useState(true);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/batch/tasks`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setTasks(data);
                } else {
                    console.error('API Error: Expected array for batch tasks, got:', data);
                }
                setLoading(false);
            })
            .catch(err => console.error('Failed to fetch batch tasks:', err));

        fetch(`${API_BASE_URL}/api/prompts`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setPrompts(data);
                } else {
                    console.error('API Error: Expected array for prompts, got:', data);
                    setPrompts([]);
                }
            })
            .catch(err => {
                console.error('Failed to fetch prompts:', err);
                setPrompts([]);
            });
    }, []);

    useEffect(() => {
        if (socket) {
            socket.on('batch:add', (task: BatchTask) => {
                setTasks(prev => [task, ...prev]);
            });
            socket.on('batch:update', (task: BatchTask) => {
                setTasks(prev => prev.map(t => t.id === task.id ? task : t));
            });
            socket.on('batch:delete', (data: { id: string }) => {
                setTasks(prev => prev.filter(t => t.id !== data.id));
            });
            return () => {
                socket.off('batch:add');
                socket.off('batch:update');
                socket.off('batch:delete');
            };
        }
    }, [socket]);

    const handleUpdateTask = (id: string, updates: Partial<BatchTask>) => {
        fetch(`${API_BASE_URL}/api/batch/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    };

    const handleDeleteTask = (id: string) => {
        fetch(`${API_BASE_URL}/api/batch/tasks/${id}`, { method: 'DELETE' });
    };

    const handleGenerateAll = () => {
        fetch(`${API_BASE_URL}/api/batch/generate`, { method: 'POST' })
            .catch(err => console.error('Failed to start generation:', err));
    };

    const handleSelectPrompt = (prompt: string) => {
        if (selectedTaskId) {
            handleUpdateTask(selectedTaskId, { prompt });
        }
    };

    if (loading) return <div style={{ color: 'white', padding: '40px' }}>Loading tasks...</div>;

    return (
        <div style={{ display: 'flex', flex: 1, height: '100vh', background: '#0f0f0f' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '40px', color: '#e0e0e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>Batch Management</h1>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={handleGenerateAll}
                            style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(52, 152, 219, 0.3)' }}
                        >
                            <Play size={20} fill="currentColor" />
                            Generate All
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {tasks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <p style={{ color: '#666', fontSize: '16px' }}>No batch tasks yet. Right-click images on the canvas to add frames.</p>
                        </div>
                    ) : tasks.map(task => (
                        <div key={task.id} style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '20px',
                            padding: '24px',
                            display: 'grid',
                            gridTemplateColumns: 'min-content 1fr min-content',
                            gap: '24px',
                            alignItems: 'center',
                            transition: 'transform 0.2s, background 0.2s'
                        }}>
                            {/* Frame Pair or Video Result */}
                            <div style={{ display: 'flex', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '16px' }}>
                                {task.generated_video_url && task.status === 'completed' ? (
                                    <div style={{ width: '252px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#000', border: '2px solid #3498db', position: 'relative' }}>
                                        <video
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            controls
                                            playsInline
                                        >
                                            <source src={`${API_BASE_URL}${task.generated_video_url}`} type="video/mp4" />
                                            Your browser does not support the video tag.
                                        </video>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ width: '120px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#222', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                                            {task.first_frame_url ? (
                                                <img src={`${task.first_frame_url.startsWith('http') ? '' : API_BASE_URL}${task.first_frame_url}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="First frame" />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#444' }}>FIRST FRAME</div>
                                            )}
                                        </div>
                                        <div style={{ width: '120px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#222', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                                            {task.last_frame_url ? (
                                                <img src={`${task.last_frame_url.startsWith('http') ? '' : API_BASE_URL}${task.last_frame_url}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Last frame" />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#444' }}>LAST FRAME</div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Controls */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <textarea
                                    value={task.prompt || ''}
                                    onChange={(e) => handleUpdateTask(task.id, { prompt: e.target.value })}
                                    onFocus={() => setSelectedTaskId(task.id)}
                                    placeholder="Enter generation prompt..."
                                    style={{
                                        width: '100%',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: `1px solid ${selectedTaskId === task.id ? '#3498db' : 'rgba(255,255,255,0.1)'}`,
                                        borderRadius: '12px',
                                        padding: '12px',
                                        color: 'white',
                                        fontFamily: 'inherit',
                                        fontSize: '14px',
                                        resize: 'none',
                                        height: '60px'
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        {[5, 10].map(d => (
                                            <button
                                                key={d}
                                                onClick={() => handleUpdateTask(task.id, { duration: d })}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: task.duration === d ? '#3498db' : 'transparent',
                                                    color: task.duration === d ? 'white' : '#888',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <Clock size={12} />
                                                {d}s
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => handleUpdateTask(task.id, { audio_enabled: !task.audio_enabled })}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            background: task.audio_enabled ? 'rgba(52, 152, 219, 0.1)' : 'rgba(255,255,255,0.02)',
                                            border: '1px solid',
                                            borderColor: task.audio_enabled ? '#3498db' : 'rgba(255,255,255,0.1)',
                                            borderRadius: '10px',
                                            padding: '8px 12px',
                                            color: task.audio_enabled ? '#3498db' : '#888',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {task.audio_enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                                        Audio {task.audio_enabled ? 'ON' : 'OFF'}
                                    </button>
                                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        {['16:9', '9:16', '1:1', '21:9'].map(ar => (
                                            <button
                                                key={ar}
                                                onClick={() => handleUpdateTask(task.id, { aspect_ratio: ar as BatchTask['aspect_ratio'] })}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: task.aspect_ratio === ar ? '#3498db' : 'transparent',
                                                    color: task.aspect_ratio === ar ? 'white' : '#888',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {ar}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{
                                        marginLeft: 'auto',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        background: task.status === 'completed' ? 'rgba(46, 204, 113, 0.1)' : task.status === 'generating' ? 'rgba(241, 194, 15, 0.1)' : task.status === 'failed' ? 'rgba(231, 76, 60, 0.1)' : 'rgba(255,255,255,0.05)',
                                        color: task.status === 'completed' ? '#2ecc71' : task.status === 'generating' ? '#f1c40f' : task.status === 'failed' ? '#e74c3c' : '#666'
                                    }}>
                                        {task.status}
                                    </div>
                                    {task.status === 'generating' && (
                                        <div className="hourglass-spin" style={{ color: '#f1c40f', display: 'flex', alignItems: 'center' }}>
                                            <Hourglass size={16} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {task.generated_video_url && task.status === 'completed' && (
                                    <a
                                        href={`${API_BASE_URL}${task.generated_video_url}`}
                                        download
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '10px', borderRadius: '12px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        onMouseOver={(e) => (e.currentTarget.style.color = '#3498db')}
                                        onMouseOut={(e) => (e.currentTarget.style.color = '#666')}
                                        title="Download video"
                                    >
                                        <Download size={24} />
                                    </a>
                                )}
                                <button
                                    onClick={() => handleDeleteTask(task.id)}
                                    style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '10px', borderRadius: '12px', transition: 'all 0.2s' }}
                                    onMouseOver={(e) => (e.currentTarget.style.color = '#e74c3c')}
                                    onMouseOut={(e) => (e.currentTarget.style.color = '#666')}
                                    title="Delete task"
                                >
                                    <Trash2 size={24} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .hourglass-spin {
                    animation: spin 2s linear infinite;
                }
            `}</style>
            </div>

            {/* Prompt Library Panel */}
            <div style={{
                width: promptsPanelOpen ? '350px' : '0',
                background: 'rgba(20,20,20,0.95)',
                borderLeft: promptsPanelOpen ? '1px solid rgba(255,255,255,0.1)' : 'none',
                overflowY: 'auto',
                overflowX: 'hidden',
                transition: 'width 0.3s',
                position: 'relative'
            }}>
                {promptsPanelOpen && (
                    <div style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'white' }}>Camera Moves</h3>
                            <button
                                onClick={() => setPromptsPanelOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
                                title="Close panel"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                        {prompts.map(category => (
                            <div key={category.id} style={{ marginBottom: '24px' }}>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#3498db', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {category.title}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {category.moves.map(move => (
                                        <button
                                            key={move.id}
                                            onClick={() => handleSelectPrompt(move.prompt)}
                                            disabled={!selectedTaskId}
                                            style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: '8px',
                                                padding: '10px 12px',
                                                textAlign: 'left',
                                                cursor: selectedTaskId ? 'pointer' : 'not-allowed',
                                                transition: 'all 0.2s',
                                                opacity: selectedTaskId ? 1 : 0.5
                                            }}
                                            onMouseOver={(e) => selectedTaskId && (e.currentTarget.style.background = 'rgba(52, 152, 219, 0.1)')}
                                            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                        >
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '4px' }}>
                                                {move.title}
                                            </div>
                                            <div style={{ fontSize: '10px', color: '#888', lineHeight: '1.4' }}>
                                                {move.description}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Toggle button when panel is closed */}
            {!promptsPanelOpen && (
                <button
                    onClick={() => setPromptsPanelOpen(true)}
                    style={{
                        position: 'fixed',
                        right: '20px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'rgba(52, 152, 219, 0.1)',
                        border: '1px solid #3498db',
                        borderRadius: '12px 0 0 12px',
                        padding: '12px 8px',
                        color: '#3498db',
                        cursor: 'pointer',
                        zIndex: 100
                    }}
                    title="Open prompts library"
                >
                    <ChevronLeft size={20} />
                </button>
            )}
        </div>
    );
};

export default BatchPage;
