import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const s = io(SOCKET_URL);
        setSocket(s);

        return () => {
            s.disconnect();
        };
    }, []);

    return socket;
};
