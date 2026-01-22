import React from 'react';
import { X, HelpCircle, BookOpen, MousePointer2, Keyboard, Share2 } from 'lucide-react';

interface HelpManualProps {
    isOpen: boolean;
    onClose: () => void;
}

const HelpManual: React.FC<HelpManualProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const sections = [
        {
            icon: <BookOpen className="text-blue-400" size={20} />,
            title: "Organisation du Projet",
            content: "L'application est organisée en **Chapitres** et **Pages**. Utilisez la barre latérale pour naviguer, renommer ou réorganiser votre projet."
        },
        {
            icon: <MousePointer2 className="text-blue-400" size={20} />,
            title: "Éléments & Canevas",
            content: "Ajoutez des zones (Rectangles), du Texte, des Flèches ou des Médias (Images/Vidéos). Vous pouvez les déplacer, les redimensionner et les transformer directement sur le canevas."
        },
        {
            icon: <Keyboard className="text-blue-400" size={20} />,
            title: "Raccourcis Clavier",
            content: (
                <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'disc' }}>
                    <li><strong>Suppr / Effacer</strong> : Supprimer l'élément sélectionné</li>
                    <li><strong>Ctrl + C / V</strong> : Copier / Coller (objets uniquement, pas les images)</li>
                    <li><strong>Ctrl + Z / Y</strong> : Annuler / Rétablir</li>
                    <li><strong>Ctrl + Clic</strong> : Sélection multiple</li>
                    <li><strong>Flèches</strong> : Déplacer l'élément (Précision : 1px)</li>
                </ul>
            )
        },
        {
            icon: <Share2 className="text-blue-400" size={20} />,
            title: "Collaboration & Export",
            content: "Toutes les modifications sont synchronisées en temps réel avec les autres utilisateurs. Utilisez le bouton d'exportation pour sauvegarder l'état actuel de votre projet au format JSON."
        }
    ];

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
        }} onClick={onClose}>
            <div style={{
                width: '90%',
                maxWidth: '600px',
                maxHeight: '85vh',
                backgroundColor: '#1a1a1a',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>

                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <HelpCircle size={24} color="#3498db" />
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'white' }}>Guide de l&apos;Utilisateur</h2>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#999',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = '#999'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    padding: '24px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px'
                }}>
                    {sections.map((section, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '16px' }}>
                            <div style={{
                                flexShrink: 0,
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {section.icon}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f0f0f0' }}>{section.title}</h3>
                                <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#aaa', margin: 0 }}>
                                    {section.content}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px 24px',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: '#666',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                    storyboard v1.0 • Bonne création !
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.98); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default HelpManual;
