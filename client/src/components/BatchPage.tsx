import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import type { BatchTask } from '../types';
import { Play, Trash2, Volume2, VolumeX, ChevronLeft, Hourglass, Download, ChevronRight } from 'lucide-react';

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
        // Optimistic update
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

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
                        <div key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            style={{
                                background: selectedTaskId === task.id ? 'rgba(52, 152, 219, 0.05)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${selectedTaskId === task.id ? 'rgba(52, 152, 219, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                                borderRadius: '20px',
                                padding: '24px',
                                display: 'grid',
                                gridTemplateColumns: 'min-content 1fr min-content',
                                gap: '24px',
                                alignItems: 'start',
                                transition: 'all 0.2s'
                            }}>
                            {/* Frame Pair or Video Result */}
                            <div style={{ display: 'flex', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '16px' }}>
                                {task.generated_video_url && task.status === 'completed' ? (
                                    <div style={{ width: '252px', height: '140px', borderRadius: '8px', overflow: 'hidden', background: '#000', border: '2px solid #3498db', position: 'relative' }}>
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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <div style={{ width: '120px', height: '70px', borderRadius: '8px', overflow: 'hidden', background: '#222', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                                                {task.first_frame_url ? (
                                                    <img src={`${task.first_frame_url.startsWith('http') ? '' : API_BASE_URL}${task.first_frame_url}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="First frame" />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#444' }}>FIRST FRAME</div>
                                                )}
                                            </div>
                                            <div style={{ width: '120px', height: '70px', borderRadius: '8px', overflow: 'hidden', background: '#222', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                                                {task.last_frame_url ? (
                                                    <img src={`${task.last_frame_url.startsWith('http') ? '' : API_BASE_URL}${task.last_frame_url}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Last frame" />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#444' }}>LAST FRAME</div>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{
                                            fontSize: '11px',
                                            color: '#666',
                                            textAlign: 'center',
                                            textTransform: 'uppercase',
                                            fontWeight: 600,
                                            letterSpacing: '0.5px'
                                        }}>
                                            {task.aspect_ratio || '16:9'}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Controls */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>Positive Prompt</label>
                                        <textarea
                                            value={task.prompt || ''}
                                            onChange={(e) => handleUpdateTask(task.id, { prompt: e.target.value })}
                                            placeholder="Describe the motion..."
                                            style={{
                                                width: '100%',
                                                background: 'rgba(0,0,0,0.2)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                                padding: '12px',
                                                color: 'white',
                                                fontFamily: 'inherit',
                                                fontSize: '13px',
                                                resize: 'none',
                                                height: '60px',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>Negative Prompt</label>
                                        <textarea
                                            value={task.negative_prompt || ''}
                                            onChange={(e) => handleUpdateTask(task.id, { negative_prompt: e.target.value })}
                                            placeholder="Things to avoid..."
                                            style={{
                                                width: '100%',
                                                background: 'rgba(0,0,0,0.2)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                                padding: '12px',
                                                color: 'white',
                                                fontFamily: 'inherit',
                                                fontSize: '13px',
                                                resize: 'none',
                                                height: '60px',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '10px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Model</label>
                                        <select
                                            value={task.model_name || 'kling-v2-6'}
                                            onChange={(e) => handleUpdateTask(task.id, { model_name: e.target.value })}
                                            style={{
                                                background: '#1a1a1a',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                color: 'white',
                                                fontSize: '12px',
                                                outline: 'none'
                                            }}
                                        >
                                            <option value="kling-v1">v1.0</option>
                                            <option value="kling-v1-5">v1.5</option>
                                            <option value="kling-v1-6">v1.6</option>
                                            <option value="kling-v2-1">v2.1</option>
                                            <option value="kling-v2-5-turbo">v2.5 Turbo</option>
                                            <option value="kling-v2-6">v2.6 (NEW)</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '10px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Mode</label>
                                        <select
                                            value={task.mode || 'pro'}
                                            onChange={(e) => handleUpdateTask(task.id, { mode: e.target.value as any })}
                                            style={{
                                                background: '#1a1a1a',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                color: 'white',
                                                fontSize: '12px',
                                                outline: 'none'
                                            }}
                                        >
                                            <option value="std">Standard</option>
                                            <option value="pro">Pro</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '10px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Duration</label>
                                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            {[5, 10].map(d => (
                                                <button
                                                    key={d}
                                                    onClick={(e) => { e.stopPropagation(); handleUpdateTask(task.id, { duration: d as any }); }}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        border: 'none',
                                                        background: task.duration === d ? '#3498db' : 'transparent',
                                                        color: task.duration === d ? 'white' : '#888',
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {d}s
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '10px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Audio</label>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateTask(task.id, { audio_enabled: !task.audio_enabled }); }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: task.audio_enabled ? 'rgba(52, 152, 219, 0.1)' : 'rgba(255,255,255,0.02)',
                                                border: '1px solid',
                                                borderColor: task.audio_enabled ? '#3498db' : 'rgba(255,255,255,0.1)',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                color: task.audio_enabled ? '#3498db' : '#888',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                height: '26px'
                                            }}
                                        >
                                            {task.audio_enabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                                            {task.audio_enabled ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    {/* CFG Scale Hidden
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <label style={{ fontSize: '10px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>CFG Scale</label>
                                            <span style={{ fontSize: '10px', color: '#888' }}>{task.cfg_scale || 0.5}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={task.cfg_scale || 0.5}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleUpdateTask(task.id, { cfg_scale: parseFloat(e.target.value) })}
                                            style={{ width: '100%', height: '4px', borderRadius: '2px', accentColor: '#3498db', cursor: 'pointer' }}
                                        />
                                    </div>
                                    */}

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
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Download size={24} />
                                    </a>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
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
