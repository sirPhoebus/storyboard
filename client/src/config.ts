export const API_BASE_URL = import.meta.env.PROD
    ? window.location.origin
    : 'http://localhost:5000';

export const SOCKET_URL = import.meta.env.PROD
    ? window.location.origin
    : 'http://localhost:5000';
