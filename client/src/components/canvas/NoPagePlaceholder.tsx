import React from 'react';

export const NoPagePlaceholder: React.FC = () => {
    return (
        <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#7f8c8d',
            zIndex: 10
        }}>
            <div style={{
                fontSize: '48px',
                marginBottom: '20px',
                opacity: 0.3
            }}>📄</div>
            <h2 style={{
                fontSize: '24px',
                fontWeight: 600,
                marginBottom: '10px',
                color: '#95a5a6'
            }}>No Page Selected</h2>
            <p style={{
                fontSize: '16px',
                color: '#7f8c8d'
            }}>
                Create a page first by clicking the <strong style={{ color: '#3498db' }}>+</strong> button in the sidebar
            </p>
        </div>
    );
};
