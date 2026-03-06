import { useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { MessageCircle, Send, X } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ChatMessage } from '../types';

interface ChatRoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    username: string;
    socket: Socket | null;
}

export default function ChatRoomModal({ isOpen, onClose, username, socket }: ChatRoomModalProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(false);

    const mergeMessages = (incoming: ChatMessage[]) => {
        setMessages((prev) => {
            const map = new Map<string, ChatMessage>();
            for (const m of prev) map.set(m.id, m);
            for (const m of incoming) map.set(m.id, m);
            return Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
    };

    const loadMessages = async () => {
        const res = await fetch(`${API_BASE_URL}/api/chat/messages`);
        if (!res.ok) throw new Error('Failed to load chat');
        const data = await res.json() as ChatMessage[];
        mergeMessages(data);
    };

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        loadMessages()
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
        const timer = window.setInterval(() => {
            loadMessages().catch(() => { });
        }, 1500);
        return () => window.clearInterval(timer);
    }, [isOpen]);

    useEffect(() => {
        if (!socket) return;
        const onMessage = (message: ChatMessage) => {
            setMessages((prev) => {
                if (prev.some((m) => m.id === message.id)) return prev;
                return [...prev, message];
            });
        };
        socket.on('chat:message', onMessage);
        return () => {
            socket.off('chat:message', onMessage);
        };
    }, [socket]);

    const grouped = useMemo(() => messages.slice(-200), [messages]);

    const sendMessage = async () => {
        const message = draft.trim();
        if (!message) return;
        setDraft('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/chat/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message, username, userEmail: `${username}@guest.local` })
            });
            if (!res.ok) throw new Error('Failed to send');
            const saved = await res.json() as ChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
        } catch (err) {
            console.error(err);
            loadMessages().catch(() => { });
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(6px)',
                zIndex: 1200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '92%',
                    maxWidth: '680px',
                    height: '80vh',
                    background: '#111',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
                        <MessageCircle size={18} />
                        <strong>Chatroom</strong>
                    </div>
                    <button className="icon-btn" onClick={onClose} title="Close">
                        <X size={16} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {loading && <span style={{ color: '#9aa4af', fontSize: '13px' }}>Loading messages...</span>}
                    {!loading && grouped.length === 0 && (
                        <span style={{ color: '#9aa4af', fontSize: '13px' }}>No messages yet.</span>
                    )}
                    {grouped.map((m) => {
                        const mine = m.username === username;
                        return (
                            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                <div style={{ fontSize: '11px', color: '#9aa4af', marginBottom: '4px' }}>{m.username}</div>
                                <div style={{
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    background: mine ? 'rgba(52,152,219,0.28)' : 'rgba(255,255,255,0.08)',
                                    color: '#f2f4f5',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}>
                                    {m.message}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '10px' }}>
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="Type a message..."
                        style={{
                            flex: 1,
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: '#0a0a0a',
                            color: 'white',
                            padding: '10px 12px',
                            outline: 'none'
                        }}
                    />
                    <button className="icon-btn" onClick={sendMessage} title="Send" style={{ padding: '10px' }}>
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
