import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config';

const SOCKET_URL_VAL = SOCKET_URL;

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const token = localStorage.getItem('auth_token');

    useEffect(() => {
        const s = io(SOCKET_URL_VAL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            auth: token ? { token } : undefined
        });

        s.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });

        setTimeout(() => setSocket(s), 0);

        return () => {
            s.disconnect();
        };
    }, [token]);

    return socket;
};
