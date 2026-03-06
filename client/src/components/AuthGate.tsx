import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';
import type { AuthUser } from '../types';

interface AuthGateProps {
    onAuthenticated: (token: string, user: AuthUser) => void;
}

export default function AuthGate({ onAuthenticated }: AuthGateProps) {
    const buttonRef = useRef<HTMLDivElement | null>(null);
    const [error, setError] = useState('');
    const [clientId, setClientId] = useState<string | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/auth/config`)
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to load auth config');
                return res.json() as Promise<{ googleEnabled: boolean; googleClientId: string | null }>;
            })
            .then((cfg) => {
                setClientId(cfg.googleEnabled ? cfg.googleClientId : null);
                if (!cfg.googleEnabled) {
                    setError('Google authentication is not configured on the server.');
                }
            })
            .catch((err) => setError((err as Error).message))
            .finally(() => setLoadingConfig(false));
    }, []);

    useEffect(() => {
        if (!clientId) {
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (!window.google || !buttonRef.current) return;
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: async (response) => {
                    try {
                        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ credential: response.credential })
                        });
                        if (!res.ok) throw new Error('Authentication failed');
                        const data = await res.json() as { token: string; user: AuthUser };
                        onAuthenticated(data.token, data.user);
                    } catch (err) {
                        setError((err as Error).message);
                    }
                }
            });
            window.google.accounts.id.renderButton(buttonRef.current, {
                theme: 'filled_black',
                size: 'large',
                text: 'signin_with',
                shape: 'pill',
                width: '260'
            });
        };
        script.onerror = () => setError('Could not load Google sign-in');
        document.body.appendChild(script);
        return () => {
            if (script.parentElement) script.parentElement.removeChild(script);
        };
    }, [clientId, onAuthenticated]);

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at top, #1c2833, #0d0d0d 70%)',
            color: 'white'
        }}>
            <div style={{
                minWidth: '320px',
                maxWidth: '420px',
                padding: '28px',
                borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.35)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                alignItems: 'center'
            }}>
                <h2 style={{ margin: 0 }}>Sign in</h2>
                <p style={{ margin: 0, color: '#b7bec7', textAlign: 'center', fontSize: '14px' }}>
                    Continue with your Gmail account to access the shared storyboard room.
                </p>
                {!loadingConfig && clientId && <div ref={buttonRef} />}
                {loadingConfig && <p style={{ margin: 0, color: '#9aa4af', fontSize: '13px' }}>Loading authentication...</p>}
                {error && (
                    <p style={{ margin: 0, color: '#ff7675', fontSize: '13px' }}>{error}</p>
                )}
            </div>
        </div>
    );
}
