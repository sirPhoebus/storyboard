import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import type { BatchTask } from '../types';
import { Socket } from 'socket.io-client';
import { Play, Trash2, Volume2, VolumeX, Clock, ChevronLeft, Hourglass } from 'lucide-react';

interface BatchPageProps {
    onBack: () => void;
    socket: Socket | null;
}

const BatchPage: React.FC<BatchPageProps> = ({ onBack, socket }) => {
    const [tasks, setTasks] = useState<BatchTask[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/batch/tasks`)
            .then(res => res.json())
            .then(data => {
                setTasks(data);
                setLoading(false);
            })
            .catch(err => console.error('Failed to fetch batch tasks:', err));
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
            .then(res => res.json())
            .then(data => alert(`Started generation for ${data.count} tasks!`))
            .catch(err => alert('Failed to start generation: ' + err.message));
    };

    if (loading) return <div style={{ color: 'white', padding: '40px' }}>Loading tasks...</div>;

    return (
        <div style={{ flex: 1, height: '100vh', background: '#0f0f0f', overflowY: 'auto', padding: '40px', color: '#e0e0e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={handleGenerateAll}
                        style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(52, 152, 219, 0.3)' }}
                    >
                        <Play size={20} fill="currentColor" />
                        Generate All
                    </button>
                    <button
                        onClick={onBack}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 24px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 600, transition: 'all 0.2s' }}
                    >
                        <ChevronLeft size={20} />
                        Back
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
                                        src={`${API_BASE_URL}${task.generated_video_url}`}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        controls
                                    />
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
                                placeholder="Enter generation prompt..."
                                style={{
                                    width: '100%',
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.1)',
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
    );
};

export default BatchPage;
