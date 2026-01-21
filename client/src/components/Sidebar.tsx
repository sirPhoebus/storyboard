import React from 'react';

interface Page {
    id: string;
    title: string;
    thumbnail?: string;
}

interface SidebarProps {
    pages: Page[];
    currentPageId: string | null;
    onSelectPage: (id: string) => void;
    onAddPage: () => void;
    onRenamePage: (id: string, newTitle: string) => void;
    isCollapsed: boolean;
    onToggle: () => void;
    onRefresh?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ pages, currentPageId, onSelectPage, onAddPage, onRenamePage, isCollapsed, onToggle, onRefresh }) => {
    const [editingPageId, setEditingPageId] = React.useState<string | null>(null);
    const [editTitle, setEditTitle] = React.useState('');
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<any[]>([]);
    const [draggedPageId, setDraggedPageId] = React.useState<string | null>(null);
    const [pageToDelete, setPageToDelete] = React.useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        const res = await fetch(`http://localhost:5000/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data);
    };

    const handleDuplicatePage = async (pageId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await fetch('http://localhost:5000/api/pages/duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId })
        });
        // We need a way to refresh pages list. Assuming parent passes updated pages or we trigger refresh?
        // Parent component currently fetches pages. We should probably accept an `onRefresh` prop or similar?
        // OR simpler: `onAddPage` triggers refresh in parent. We can repurpose `onAddPage` or generic `onUpdate`.
        // Let's assume onAddPage refreshes everything for now? No, that just adds default.
        // We probably need `onPagesUpdate` prop.
        // For prototype, simply reloading page works but is bad UX.
        // Better: Pass a refresh callback.
        // **Compromise**: I will add `onRefresh` prop to SidebarProps.
    };

    const handleMovePage = async (pageId: string, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.stopPropagation();
        const index = pages.findIndex(p => p.id === pageId);
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === pages.length - 1) return;

        const newPages = [...pages];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [newPages[index], newPages[swapIndex]] = [newPages[swapIndex], newPages[index]];

        await fetch('http://localhost:5000/api/pages/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: newPages.map(p => p.id) })
        });
        onRefresh && onRefresh();
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedPageId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedPageId || draggedPageId === targetId) return;

        const originalIndex = pages.findIndex(p => p.id === draggedPageId);
        const targetIndex = pages.findIndex(p => p.id === targetId);

        if (originalIndex === -1 || targetIndex === -1) return;

        const newPages = [...pages];
        const [draggedItem] = newPages.splice(originalIndex, 1);
        newPages.splice(targetIndex, 0, draggedItem);

        // Optimistic UI update could happen here if we had state control, but relying on refresh is safer for now
        // actually we don't control 'pages' state here, so optimistic update needs `onRefresh` to be fast or parent to update.

        await fetch('http://localhost:5000/api/pages/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: newPages.map(p => p.id) })
        });

        setDraggedPageId(null);
        onRefresh && onRefresh();
    };

    const confirmDeletePage = async () => {
        if (!pageToDelete) return;
        await fetch(`http://localhost:5000/api/pages/${pageToDelete}`, {
            method: 'DELETE'
        });
        setPageToDelete(null);
        onRefresh && onRefresh();
    };


    return (
        <div style={{
            width: isCollapsed ? '60px' : '260px',
            height: '100vh',
            background: 'var(--sidebar-bg)',
            backdropFilter: 'blur(20px)',
            color: 'var(--text-color)',
            padding: isCollapsed ? '20px 10px' : '20px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            transition: 'width var(--transition-speed) ease',
            position: 'relative',
            overflow: 'hidden',
            borderRight: '1px solid var(--border-color)',
            zIndex: 1000
        }}>
            <button
                onClick={onToggle}
                style={{
                    position: 'absolute',
                    top: '15px',
                    right: isCollapsed ? '18px' : '15px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    fontSize: '20px',
                    zIndex: 10,
                    opacity: 0.6,
                    transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
            >
                {isCollapsed ? '≫' : '≪'}
            </button>

            {!isCollapsed && <h2 style={{
                margin: '0 0 10px 0',
                fontSize: '18px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                opacity: 0.8
            }}>Pages</h2>}

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', marginTop: isCollapsed ? '40px' : '0' }}>
                {pages.map((page, index) => (
                    <div
                        key={page.id}
                        onClick={() => !editingPageId && onSelectPage(page.id)}
                        onDoubleClick={() => {
                            if (!isCollapsed) {
                                setEditingPageId(page.id);
                                setEditTitle(page.title);
                            }
                        }}
                        title={page.title}
                        style={{
                            padding: '12px 15px',
                            background: currentPageId === page.id ? 'rgba(52, 152, 219, 0.2)' : 'transparent',
                            border: `1px solid ${currentPageId === page.id ? 'var(--accent-color)' : 'transparent'}`,
                            cursor: 'pointer',
                            borderRadius: '6px',
                            transition: 'all 0.2s ease',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            minHeight: '44px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: isCollapsed ? 'center' : 'flex-start',
                            fontSize: '14px',
                            fontWeight: currentPageId === page.id ? 500 : 400,
                            color: currentPageId === page.id ? 'white' : 'var(--text-color)',
                            position: 'relative',
                            opacity: draggedPageId === page.id ? 0.5 : 1
                        }}
                        draggable={!editingPageId}
                        onDragStart={(e) => handleDragStart(e, page.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, page.id)}
                        onMouseEnter={(e) => {
                            if (currentPageId !== page.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        }}
                        onMouseLeave={(e) => {
                            if (currentPageId !== page.id) e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        {isCollapsed ? (
                            page.thumbnail ? (
                                <img src={page.thumbnail} style={{ width: '30px', height: '22px', borderRadius: '2px', objectFit: 'cover' }} />
                            ) : index + 1
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '5px' }}>
                                    <button
                                        onClick={(e) => { handleMovePage(page.id, 'up', e); onRefresh && onRefresh(); }}
                                        style={{ fontSize: '8px', cursor: 'pointer', background: 'none', border: 'none', color: '#aaa' }}
                                    >▲</button>
                                    <button
                                        onClick={(e) => { handleMovePage(page.id, 'down', e); onRefresh && onRefresh(); }}
                                        style={{ fontSize: '8px', cursor: 'pointer', background: 'none', border: 'none', color: '#aaa' }}
                                    >▼</button>
                                </div>
                                {page.thumbnail && (
                                    <img src={page.thumbnail} style={{ width: '40px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                                )}
                                <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {editingPageId === page.id ? (
                                        <input
                                            autoFocus
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onBlur={() => {
                                                if (editTitle.trim() && editTitle !== page.title) {
                                                    onRenamePage(page.id, editTitle);
                                                }
                                                setEditingPageId(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    if (editTitle.trim() && editTitle !== page.title) {
                                                        onRenamePage(page.id, editTitle);
                                                    }
                                                    setEditingPageId(null);
                                                } else if (e.key === 'Escape') {
                                                    setEditingPageId(null);
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'white',
                                                outline: 'none',
                                                fontSize: 'inherit',
                                                padding: '0'
                                            }}
                                        />
                                    ) : (
                                        page.title
                                    )}
                                </div>
                                <button
                                    onClick={(e) => { handleDuplicatePage(page.id, e); onRefresh && onRefresh(); }}
                                    title="Duplicate"
                                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#aaa', fontSize: '12px' }}
                                >
                                    ❐
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setPageToDelete(page.id); }}
                                    title="Delete"
                                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#e74c3c', fontSize: '14px', marginLeft: '2px' }}
                                >
                                    ×
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {pageToDelete && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'rgba(0,0,0,0.8)',
                    zIndex: 2000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    boxSizing: 'border-box',
                    textAlign: 'center'
                }}>
                    <h3 style={{ color: 'white', marginBottom: '20px' }}>Are you sure?</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={confirmDeletePage}
                            style={{
                                padding: '8px 16px',
                                background: '#e74c3c',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Yes
                        </button>
                        <button
                            onClick={() => setPageToDelete(null)}
                            style={{
                                padding: '8px 16px',
                                background: '#7f8c8d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            No
                        </button>
                    </div>
                </div>
            )}

            {!isCollapsed && (
                <button
                    onClick={onAddPage}
                    style={{
                        padding: '12px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        marginTop: 'auto',
                        fontSize: '14px',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                    Add Page
                </button>
            )}
            {isCollapsed && (
                <button
                    onClick={onAddPage}
                    title="Add Page"
                    style={{
                        width: '40px',
                        height: '40px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        borderRadius: '50%',
                        fontSize: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 'auto',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'white')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-color)')}
                >
                    +
                </button>
            )}
        </div>
    );
};

export default Sidebar;
