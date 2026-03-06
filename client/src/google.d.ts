interface GoogleCredentialResponse {
    credential: string;
}

interface GoogleAccountsId {
    initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
    }) => void;
    renderButton: (parent: HTMLElement, options: { theme?: string; size?: string; text?: string; shape?: string; width?: string }) => void;
}

interface GoogleWindow {
    accounts: {
        id: GoogleAccountsId;
    };
}

declare global {
    interface Window {
        google?: GoogleWindow;
    }
}

export { };
