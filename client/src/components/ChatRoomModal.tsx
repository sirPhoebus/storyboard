import { useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { MessageCircle, Send, X } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ChatMessage, ConnectedChatUser } from '../types';
import { fetchCachedJson, setCachedData, readCachedData } from '../utils/queryCache';

interface ChatRoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    username: string;
    socket: Socket | null;
}

export default function ChatRoomModal({ isOpen, onClose, username, socket }: ChatRoomModalProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(() => readCachedData<ChatMessage[]>('chat:messages') || []);
    const [connectedUsers, setConnectedUsers] = useState<ConnectedChatUser[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(false);

    const mergeMessages = (incoming: ChatMessage[]) => {
        setMessages((prev) => {
            const map = new Map<string, ChatMessage>();
            for (const m of prev) map.set(m.id, m);
            for (const m of incoming) map.set(m.id, m);
            const next = Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            setCachedData('chat:messages', next, 5_000);
            return next;
        });
    };

    const loadMessages = async (forceRefresh = false) => {
        const data = await fetchCachedJson<ChatMessage[]>(
            'chat:messages',
            `${API_BASE_URL}/api/chat/messages`,
            undefined,
            { ttlMs: 5_000, forceRefresh }
        );
        mergeMessages(data);
    };

    useEffect(() => {
        if (!isOpen) return;
        const cachedMessages = readCachedData<ChatMessage[]>('chat:messages');
        if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
            mergeMessages(cachedMessages);
            setLoading(false);
        } else {
            setLoading(true);
        }
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
                const next = [...prev, message];
                setCachedData('chat:messages', next, 5_000);
                return next;
            });
        };
        const onPresence = (users: ConnectedChatUser[]) => {
            setConnectedUsers(Array.isArray(users) ? users : []);
        };

        socket.on('chat:message', onMessage);
        socket.on('chat:presence', onPresence);

        if (username.trim()) {
            socket.emit('chat:presence:set-name', username.trim());
        }
        socket.emit('chat:presence:request');

        return () => {
            socket.off('chat:message', onMessage);
            socket.off('chat:presence', onPresence);
        };
    }, [socket, username]);

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
            setMessages((prev) => {
                if (prev.some((m) => m.id === saved.id)) return prev;
                const next = [...prev, saved];
                setCachedData('chat:messages', next, 5_000);
                return next;
            });
        } catch (err) {
            console.error(err);
            loadMessages(true).catch(() => { });
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
                    maxWidth: '1080px',
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

                <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

                    <aside style={{
                        width: '250px',
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '16px 14px',
                        overflowY: 'auto',
                        flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <strong style={{ color: '#f2f4f5', fontSize: '13px' }}>Connected</strong>
                            <span style={{ color: '#9aa4af', fontSize: '12px' }}>{connectedUsers.length}</span>
                        </div>

                        {connectedUsers.length === 0 ? (
                            <div style={{ color: '#9aa4af', fontSize: '12px' }}>No users connected.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {connectedUsers.map((user) => {
                                    const isCurrentUser = user.name === username;
                                    return (
                                        <div
                                            key={user.email}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 10px',
                                                borderRadius: '10px',
                                                background: isCurrentUser ? 'rgba(52,152,219,0.14)' : 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.06)'
                                            }}
                                        >
                                            {user.picture ? (
                                                <img
                                                    src={user.picture}
                                                    alt={user.name}
                                                    style={{ width: '28px', height: '28px', borderRadius: '999px', objectFit: 'cover', flexShrink: 0 }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '999px',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    background: 'rgba(52,152,219,0.22)',
                                                    color: '#d7ecff',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    flexShrink: 0
                                                }}>
                                                    {user.name.slice(0, 1).toUpperCase()}
                                                </div>
                                            )}
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ color: '#f2f4f5', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {user.name}
                                                    {isCurrentUser ? ' (You)' : ''}
                                                </div>
                                                <div style={{ color: '#9aa4af', fontSize: '11px' }}>
                                                    {user.connectionCount > 1 ? `${user.connectionCount} tabs` : 'Online'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </aside>
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
