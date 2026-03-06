import React from 'react';
import {
    BookOpen,
    Clapperboard,
    FolderTree,
    HelpCircle,
    Keyboard,
    MessageSquare,
    MousePointer2,
    PlaySquare,
    Sparkles,
    X
} from 'lucide-react';

interface HelpManualProps {
    isOpen: boolean;
    onClose: () => void;
}

type ManualSection = {
    icon: React.ReactNode;
    title: string;
    items: string[];
};

const sections: ManualSection[] = [
    {
        icon: <BookOpen size={18} color="#7dd3fc" />,
        title: 'Vue generale',
        items: [
            'L application est organisee par projets, chapitres et pages.',
            'Chaque projet possede aussi une page Videos et un espace Batch Management.',
            'Le bandeau du haut permet de creer, renommer, supprimer et changer de projet.',
            'Le compteur en haut affiche le nombre de connexions actives et le bouton Chat ouvre le salon temps reel.'
        ]
    },
    {
        icon: <FolderTree size={18} color="#7dd3fc" />,
        title: 'Barre laterale',
        items: [
            'Cliquez sur un chapitre pour basculer sur son storyboard.',
            'Double-cliquez sur un chapitre pour le renommer directement.',
            'Le bouton + de la zone chapitres cree un nouveau chapitre.',
            'Chaque chapitre peut etre supprime depuis son bouton x, sauf si cela viole une regle systeme.',
            'La section Pages permet d ajouter une page, de la renommer par double-clic, de la dupliquer, de la supprimer et de la deplacer vers un autre chapitre ou un autre projet.',
            'Les pages peuvent aussi etre reordonnees par glisser-deposer ou avec les petits boutons haut/bas.',
            'L entree Videos ouvre la galerie video du projet.',
            'L icone a droite de Videos ouvre directement Batch Management.',
            'La barre laterale peut etre repliee et sa largeur peut etre ajustee.'
        ]
    },
    {
        icon: <Clapperboard size={18} color="#7dd3fc" />,
        title: 'Canvas et elements',
        items: [
            'La barre d outils du canvas permet d ajouter Zone, Texte, Fleche et Media.',
            'Le bouton Reset View recentre le canvas, remet le zoom a 1 et peut aussi restaurer les dimensions natives des medias qui stockent leur taille d origine.',
            'Le bouton Save enregistre la vue courante de la page cote serveur.',
            'Le filtre par etoiles affiche seulement les medias notes au niveau choisi.',
            'Selectionnez un element pour afficher les actions contextuelles: ordre avant/arriere, suppression, telechargement ZIP, creation de grille et deplacement vers une autre page.',
            'Les textes exposent aussi gras, italique, couleur et taille de police.',
            'Les fleches exposent le reglage d epaisseur et les points d extremite quand elles sont selectionnees.',
            'Les images, videos et cartes video conservent maintenant leurs dimensions natives: il n y a plus de fonction de redimensionnement manuel pour les medias.',
            'Si un media ne peut plus etre charge, le canvas affiche un bloc Broken media visible a la place d un element fantome.',
            'Le canvas sauvegarde et recharge aussi la position et le zoom de la page.'
        ]
    },
    {
        icon: <MousePointer2 size={18} color="#7dd3fc" />,
        title: 'Souris et gestes',
        items: [
            'Clic sur un element: selection simple.',
            'Ctrl + clic sur un element: ajoute ou retire cet element de la selection.',
            'Ctrl + glisser sur le fond du canvas: cree un rectangle de selection multiple.',
            'Clic sur le fond du canvas: deselectionne les elements.',
            'Glisser un element: deplace l element. Les groupes lies se deplacent ensemble quand applicable.',
            'Glisser le fond du canvas: deplace la vue tant qu aucun element n est en cours d edition ou de selection.',
            'Molette: zoom avant ou arriere autour du pointeur.',
            'Double-clic sur un texte: ouvre l edition inline.',
            'Double-clic sur une image: ouvre la visionneuse image centree en plein ecran dans le canvas.',
            'Clic droit sur une image ou une video: ouvre le menu d envoi vers Batch Management.',
            'Le bouton Create Grid ouvre un selecteur visuel jusqu a 10x10. Deplacez la souris vers la droite pour augmenter les colonnes et vers le bas pour augmenter les lignes, puis cliquez pour appliquer la grille.',
            'Sur un media survole, les etoiles en haut a droite permettent de noter rapidement l element.'
        ]
    },
    {
        icon: <Keyboard size={18} color="#7dd3fc" />,
        title: 'Raccourcis clavier',
        items: [
            'Suppr / Backspace: supprime la selection courante du canvas.',
            'Ctrl + C: copie un element non media selectionne.',
            'Ctrl + V: colle la copie sur la page courante avec un leger decalage.',
            'Ctrl + Z: annule le dernier changement du canvas.',
            'Ctrl + Shift + Z ou Ctrl + Y: retablit la derniere action annulee.',
            'Entree dans le chat: envoie le message.',
            'Entree dans un champ de renommage chapitre, page ou projet: valide.',
            'Echap dans les champs de renommage: annule.',
            'Echap dans les lecteurs/modales image ou video: ferme la vue ouverte.',
            'Fleche gauche / Fleche droite dans la visionneuse image: image precedente ou suivante.'
        ]
    },
    {
        icon: <PlaySquare size={18} color="#7dd3fc" />,
        title: 'Medias, videos et galerie',
        items: [
            'Importer un media depuis le canvas accepte images et videos.',
            'Une video peut etre posee comme video simple ou comme carte video selon le flux de creation.',
            'Les cartes video affichent une miniature, un titre et un bouton lecture qui ouvre le lecteur.',
            'La page Videos charge seulement les miniatures pour rester fluide; les videos ne sont chargees qu a l ouverture.',
            'Depuis Videos vous pouvez selectionner plusieurs cartes, lire la selection, tout lire, supprimer la selection, envoyer la selection vers une page ou vider la selection.',
            'Chaque carte video permet Delete et Send individuellement, sans afficher le nom de fichier sous la miniature.',
            'Dans le lecteur video, les actions Send et Delete sont aussi disponibles directement dans l entete de la fenetre.',
            'Les videos importees depuis uploads/<projectId>/_videos peuvent etre detectees depuis Batch Management avec Scan Project Videos.',
            'Les videos generees ou importees apparaissent ensuite dans la galerie du projet si leurs fichiers existent bien.'
        ]
    },
    {
        icon: <Sparkles size={18} color="#7dd3fc" />,
        title: 'Batch Management',
        items: [
            'Le batch sert a fabriquer des videos a partir d images du canvas ou de fichiers importes.',
            'Depuis le menu clic droit du canvas, vous pouvez envoyer une image comme first frame, last frame ou reference multi prompt.',
            'Chaque tache batch permet de regler prompt positif, prompt negatif, modele Kling, mode, duree, audio et multi prompt shots.',
            'Les images de reference multi prompt peuvent etre ajoutees ou retirees directement dans la tache.',
            'Generate All lance toutes les taches eligibles.',
            'Delete All supprime toutes les taches batch visibles apres confirmation.',
            'Scan Project Videos scanne uploads/<projectId>/_videos, importe les videos trouvees et genere des miniatures quand ffmpeg est disponible.',
            'Le panneau Camera Moves a droite injecte un prompt predefini dans la tache ou le champ actuellement cible.',
            'Une tache terminee peut etre telechargee, et une tache en echec avec task ID peut tenter une recuperation.'
        ]
    },
    {
        icon: <MessageSquare size={18} color="#7dd3fc" />,
        title: 'Chat et collaboration',
        items: [
            'Le chat est synchronise en temps reel entre les utilisateurs connectes.',
            'La colonne de droite du chat affiche la liste des utilisateurs connectes, dedoublonnee par utilisateur avec compteur d onglets si necessaire.',
            'Les messages recents sont recharges automatiquement tant que la fenetre est ouverte.',
            'Les modifications du storyboard, des pages, des elements, du batch et des videos sont diffusees en direct via socket.'
        ]
    }
];

const listStyle: React.CSSProperties = {
    margin: 0,
    paddingLeft: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    color: '#a8b3c2',
    fontSize: '14px',
    lineHeight: 1.55
};

const HelpManual: React.FC<HelpManualProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(4, 10, 20, 0.76)',
                backdropFilter: 'blur(10px)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 'min(1120px, 96vw)',
                    maxHeight: '88vh',
                    background: 'linear-gradient(180deg, #111827 0%, #0b1220 100%)',
                    borderRadius: '24px',
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    style={{
                        padding: '22px 24px',
                        borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                        <div
                            style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '14px',
                                display: 'grid',
                                placeItems: 'center',
                                background: 'rgba(125, 211, 252, 0.12)',
                                border: '1px solid rgba(125, 211, 252, 0.2)'
                            }}
                        >
                            <HelpCircle size={22} color="#7dd3fc" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '22px', fontWeight: 800 }}>
                                Guide utilisateur
                            </h2>
                            <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '13px' }}>
                                Manuel synchronise avec les fonctions actuellement visibles dans l interface.
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '999px',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            background: 'rgba(255,255,255,0.04)',
                            color: '#cbd5e1',
                            cursor: 'pointer',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0
                        }}
                        title="Fermer"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div
                    style={{
                        padding: '24px',
                        overflowY: 'auto',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '18px'
                    }}
                >
                    {sections.map((section) => (
                        <section
                            key={section.title}
                            style={{
                                background: 'rgba(15, 23, 42, 0.62)',
                                border: '1px solid rgba(148, 163, 184, 0.12)',
                                borderRadius: '18px',
                                padding: '18px 18px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                    style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '12px',
                                        display: 'grid',
                                        placeItems: 'center',
                                        background: 'rgba(125, 211, 252, 0.08)'
                                    }}
                                >
                                    {section.icon}
                                </div>
                                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px', fontWeight: 700 }}>
                                    {section.title}
                                </h3>
                            </div>

                            <ul style={listStyle}>
                                {section.items.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>

                <div
                    style={{
                        padding: '16px 24px',
                        borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                        color: '#64748b',
                        fontSize: '12px',
                        textAlign: 'center'
                    }}
                >
                    Pensez a reouvrir ce guide apres une mise a jour majeure: il est maintenu dans le code de l interface.
                </div>
            </div>
        </div>
    );
};

export default HelpManual;
