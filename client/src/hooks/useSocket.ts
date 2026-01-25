import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import { SOCKET_URL } from '../config';

const SOCKET_URL_VAL = SOCKET_URL;


export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const s = io(SOCKET_URL_VAL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        s.on('connect', () => {
            console.log('✅ Socket connected:', s.id);
        });

        s.on('disconnect', (reason) => {
            console.log('❌ Socket disconnected:', reason);
        });

        s.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });

        s.on('reconnect', (attemptNumber) => {
            console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
        });

        setTimeout(() => setSocket(s), 0);

        return () => {
            s.disconnect();
        };
    }, []);

    return socket;
};
