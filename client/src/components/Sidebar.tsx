
import React from 'react';
import { API_BASE_URL } from '../config';
import type { Page, Chapter, Project } from '../types';
import { ArrowRightLeft, Clapperboard, Copy, ExternalLink, Film } from 'lucide-react';
import { readCachedData } from '../utils/queryCache';

interface SidebarProps {
    chapters: Chapter[];
    currentChapterId: string | null;
    onSelectChapter: (id: string) => void;
    onAddChapter: () => void;
    onDeleteChapter: (id: string) => void;
    onRenameChapter: (id: string, newTitle: string) => void;
    pages: Page[];
    currentPageId: string | null;
    onSelectPage: (id: string) => void;
    onAddPage: () => void;
    onRenamePage: (id: string, newTitle: string) => void;
    isCollapsed: boolean;
    onToggle: () => void;
    onRefresh?: () => void;
    width: number;
    onWidthChange: (width: number) => void;
    connectedUsers?: number;
    projects?: Project[];
    currentView: 'canvas' | 'batch' | 'videos';
    hasVideos: boolean;
    onSelectVideos: () => void;
    onOpenBatchManagement: () => void;
}

const modalOverlayStyle: React.CSSProperties = {
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
};

const primaryButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    background: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
};

const primaryDangerButtonStyle: React.CSSProperties = {
    ...primaryButtonStyle,
    background: '#e74c3c'
};

const secondaryButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    background: '#7f8c8d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
};

const listActionStyle: React.CSSProperties = {
    padding: '10px',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left',
    background: 'transparent',
    marginBottom: '2px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
};

const Sidebar: React.FC<SidebarProps> = ({
    chapters,
    currentChapterId,
    onSelectChapter,
    onAddChapter,
    onDeleteChapter,
    onRenameChapter,
    pages,
    currentPageId,
    onSelectPage,
    onAddPage,
    onRenamePage,
    isCollapsed,
    onToggle,
    onRefresh,
    width,
    onWidthChange,
    connectedUsers = 1,
    projects = [],
    currentView,
    hasVideos,
    onSelectVideos,
    onOpenBatchManagement
}) => {
    const [isResizing, setIsResizing] = React.useState(false);
    const [editingChapterId, setEditingChapterId] = React.useState<string | null>(null);
    const [editChapterTitle, setEditChapterTitle] = React.useState('');
    const [editingPageId, setEditingPageId] = React.useState<string | null>(null);
    const [editTitle, setEditTitle] = React.useState('');
    const [draggedPageId, setDraggedPageId] = React.useState<string | null>(null);
    const [pageToDelete, setPageToDelete] = React.useState<string | null>(null);
    const [pageToDuplicate, setPageToDuplicate] = React.useState<string | null>(null);
    const [chapterToDelete, setChapterToDelete] = React.useState<string | null>(null);
    const [movingPageId, setMovingPageId] = React.useState<string | null>(null);
    const [pageItemCounts, setPageItemCounts] = React.useState<Record<string, number>>({});

    const startResizing = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 150 && newWidth <= 600) {
            onWidthChange(newWidth);
        }
    }, [isResizing, onWidthChange]);

    React.useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    React.useEffect(() => {
        let cancelled = false;

        const loadCounts = async () => {
            const initialCounts: Record<string, number> = {};

            pages.forEach((page) => {
                const cachedElements = readCachedData<unknown[]>(`elements:${page.id}`);
                if (Array.isArray(cachedElements)) {
                    initialCounts[page.id] = cachedElements.length;
                }
            });

            if (!cancelled && Object.keys(initialCounts).length > 0) {
                setPageItemCounts((prev) => ({ ...prev, ...initialCounts }));
            }

            await Promise.all(pages.map(async (page) => {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/elements/${page.id}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (!Array.isArray(data) || cancelled) return;
                    setPageItemCounts((prev) => {
                        if (prev[page.id] === data.length) return prev;
                        return { ...prev, [page.id]: data.length };
                    });
                } catch {
                    // Count fetch is best effort.
                }
            }));
        };

        loadCounts().catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [pages]);

    const handleMovePageToChapter = async (pageId: string, chapterId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await fetch(`${API_BASE_URL}/api/pages/${pageId}/move-chapter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterId })
        });
        setMovingPageId(null);
        onRefresh?.();
    };

    const confirmDuplicatePage = async () => {
        if (!pageToDuplicate) return;
        await fetch(`${API_BASE_URL}/api/pages/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: pageToDuplicate })
        });
        setPageToDuplicate(null);
        onRefresh?.();
    };

    const handleMovePage = async (pageId: string, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.stopPropagation();
        const index = pages.findIndex((page) => page.id === pageId);
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === pages.length - 1) return;

        const reorderedPages = [...pages];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [reorderedPages[index], reorderedPages[swapIndex]] = [reorderedPages[swapIndex], reorderedPages[index]];

        await fetch(`${API_BASE_URL}/api/pages/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: reorderedPages.map((page) => page.id) })
        });

        onRefresh?.();
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

        const originalIndex = pages.findIndex((page) => page.id === draggedPageId);
        const targetIndex = pages.findIndex((page) => page.id === targetId);
        if (originalIndex === -1 || targetIndex === -1) return;

        const reorderedPages = [...pages];
        const [draggedItem] = reorderedPages.splice(originalIndex, 1);
        reorderedPages.splice(targetIndex, 0, draggedItem);

        await fetch(`${API_BASE_URL}/api/pages/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: reorderedPages.map((page) => page.id) })
        });

        setDraggedPageId(null);
        onRefresh?.();
    };

    const confirmDeletePage = async () => {
        if (!pageToDelete) return;
        await fetch(`${API_BASE_URL}/api/pages/${pageToDelete}`, { method: 'DELETE' });
        setPageToDelete(null);
        onRefresh?.();
    };

    const confirmDeleteChapter = () => {
        if (!chapterToDelete) return;
        onDeleteChapter(chapterToDelete);
        setChapterToDelete(null);
    };

    const isVideosActive = currentView === 'videos';
    const showPagesPanel = currentView !== 'videos';

    return (
        <div style={{
            width: isCollapsed ? '60px' : `${width}px`,
            height: '100vh',
            background: 'var(--sidebar-bg)',
            backdropFilter: 'blur(20px)',
            color: 'var(--text-color)',
            padding: isCollapsed ? '20px 10px' : '20px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            transition: isResizing ? 'none' : 'width var(--transition-speed) ease',
            position: 'relative',
            overflow: 'hidden',
            borderRight: '1px solid var(--border-color)',
            zIndex: 1000
        }}>
            {!isCollapsed && (
                <div
                    onMouseDown={startResizing}
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '4px',
                        cursor: 'col-resize',
                        zIndex: 1001,
                        background: isResizing ? 'var(--accent-color)' : 'transparent',
                        transition: 'background 0.2s'
                    }}
                />
            )}
            {!isCollapsed && (
                <button
                    onClick={onToggle}
                    style={{
                        position: 'absolute',
                        top: '15px',
                        right: '15px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        fontSize: '20px',
                        zIndex: 10,
                        opacity: 0.6,
                        transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
                >
                    {'<<'}
                </button>
            )}

            <div
                onClick={isCollapsed ? onToggle : undefined}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '10px',
                    padding: isCollapsed ? '0' : '0 5px',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    minHeight: '24px',
                    cursor: isCollapsed ? 'pointer' : 'default',
                    transition: 'transform 0.2s'
                }}
            >
                <Clapperboard size={24} color="var(--accent-color)" />
                {!isCollapsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h1 style={{
                            margin: 0,
                            fontSize: '18px',
                            fontWeight: 700,
                            letterSpacing: '-0.02em',
                            color: 'white'
                        }}>Black Board</h1>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '30px' }}>
                {!isCollapsed && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{
                            margin: '0',
                            fontSize: '14px',
                            fontWeight: 600,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            opacity: 0.6
                        }}>Chapters</h2>
                        <button onClick={onAddChapter} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 'bold' }}>+</button>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {hasVideos && (
                        <div
                            onClick={onSelectVideos}
                            title="Videos"
                            style={{
                                padding: '8px 10px',
                                background: isVideosActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                borderLeft: isVideosActive ? '3px solid var(--accent-color)' : '3px solid transparent',
                                cursor: 'pointer',
                                fontSize: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderRadius: '0 4px 4px 0'
                            }}
                        >
                            {isCollapsed ? (
                                <Film size={16} color={isVideosActive ? 'var(--accent-color)' : '#555'} />
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                        <Film size={14} color="var(--accent-color)" />
                                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>Videos</span>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenBatchManagement();
                                        }}
                                        title="Open Batch Management"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#9cb3c9',
                                            cursor: 'pointer',
                                            display: 'grid',
                                            placeItems: 'center',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(52, 152, 219, 0.18)';
                                            e.currentTarget.style.color = '#fff';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent';
                                            e.currentTarget.style.color = '#9cb3c9';
                                        }}
                                    >
                                        <ExternalLink size={14} />
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {chapters.map((chapter) => (
                        <div
                            key={chapter.id}
                            onClick={() => !editingChapterId && onSelectChapter(chapter.id)}
                            onDoubleClick={() => {
                                if (!isCollapsed) {
                                    setEditingChapterId(chapter.id);
                                    setEditChapterTitle(chapter.title);
                                }
                            }}
                            style={{
                                padding: '8px 10px',
                                background: currentView === 'canvas' && currentChapterId === chapter.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                borderLeft: currentView === 'canvas' && currentChapterId === chapter.id ? '3px solid var(--accent-color)' : '3px solid transparent',
                                cursor: 'pointer',
                                fontSize: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderRadius: '0 4px 4px 0'
                            }}
                        >
                            {isCollapsed ? (
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: currentView === 'canvas' && currentChapterId === chapter.id ? 'var(--accent-color)' : '#555', margin: '0 auto' }} />
                            ) : editingChapterId === chapter.id ? (
                                <input
                                    autoFocus
                                    value={editChapterTitle}
                                    onChange={(e) => setEditChapterTitle(e.target.value)}
                                    onBlur={() => {
                                        if (editChapterTitle.trim() && editChapterTitle !== chapter.title) {
                                            onRenameChapter(chapter.id, editChapterTitle);
                                        }
                                        setEditingChapterId(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (editChapterTitle.trim() && editChapterTitle !== chapter.title) {
                                                onRenameChapter(chapter.id, editChapterTitle);
                                            }
                                            setEditingChapterId(null);
                                        } else if (e.key === 'Escape') {
                                            setEditingChapterId(null);
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'white',
                                        outline: 'none',
                                        fontSize: 'inherit',
                                        padding: '0'
                                    }}
                                />
                            ) : (
                                <>
                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{chapter.title}</span>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setChapterToDelete(chapter.id);
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', opacity: 0.6 }}
                                        title="Delete Chapter"
                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
                                    >
                                        x
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '5px 0' }} />

            {showPagesPanel && (
                <>
                    {!isCollapsed ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h2 style={{
                                margin: '0',
                                fontSize: '14px',
                                fontWeight: 600,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                opacity: 0.6
                            }}>Pages</h2>
                            <button onClick={onAddPage} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px' }}>+</button>
                        </div>
                    ) : (
                        <button
                            onClick={onAddPage}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-color)',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '18px',
                                marginBottom: '10px',
                                width: '100%',
                                textAlign: 'center'
                            }}
                            title="Add Page"
                        >
                            +
                        </button>
                    )}
                </>
            )}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {showPagesPanel ? pages.map((page, index) => (
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
                        {isCollapsed ? index + 1 : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '5px' }}>
                                    <button
                                        onClick={(e) => handleMovePage(page.id, 'up', e)}
                                        style={{ fontSize: '8px', cursor: 'pointer', background: 'none', border: 'none', color: '#aaa' }}
                                    >^</button>
                                    <button
                                        onClick={(e) => handleMovePage(page.id, 'down', e)}
                                        style={{ fontSize: '8px', cursor: 'pointer', background: 'none', border: 'none', color: '#aaa' }}
                                    >v</button>
                                </div>
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
                                        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{page.title}</span>
                                            <span style={{ fontSize: '11px', color: '#8fa3b8', flexShrink: 0 }}>
                                                ({pageItemCounts[page.id] ?? 0})
                                            </span>
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMovingPageId(page.id);
                                    }}
                                    title="Move to Chapter"
                                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#aaa', fontSize: '14px', padding: '0 4px' }}
                                >
                                    <ArrowRightLeft size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setPageToDuplicate(page.id);
                                    }}
                                    title="Duplicate"
                                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#aaa', display: 'grid', placeItems: 'center' }}
                                >
                                    <Copy size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setPageToDelete(page.id);
                                    }}
                                    title="Delete"
                                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#e74c3c', fontSize: '14px', marginLeft: '2px' }}
                                >
                                    x
                                </button>
                            </div>
                        )}
                    </div>
                )) : null}
            </div>

            {pageToDelete && (
                <div style={modalOverlayStyle}>
                    <h3 style={{ color: 'white', marginBottom: '20px' }}>Are you sure?</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={confirmDeletePage} style={primaryDangerButtonStyle}>Yes</button>
                        <button onClick={() => setPageToDelete(null)} style={secondaryButtonStyle}>No</button>
                    </div>
                </div>
            )}

            {pageToDuplicate && (
                <div style={modalOverlayStyle}>
                    <h3 style={{ color: 'white', marginBottom: '20px' }}>Duplicate Page?</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={confirmDuplicatePage} style={primaryButtonStyle}>Yes</button>
                        <button onClick={() => setPageToDuplicate(null)} style={secondaryButtonStyle}>No</button>
                    </div>
                </div>
            )}

            {movingPageId && (
                <div style={modalOverlayStyle}>
                    <h3 style={{ color: 'white', marginBottom: '10px' }}>Move Page?</h3>
                    <p style={{ color: '#aaa', fontSize: '0.9em', marginBottom: '10px' }}>Move to Chapter (Current Project):</p>
                    <div style={{
                        width: '100%',
                        maxHeight: '150px',
                        overflowY: 'auto',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        padding: '5px'
                    }}>
                        {chapters.map((chapter) => (
                            <div
                                key={chapter.id}
                                onClick={(e) => handleMovePageToChapter(movingPageId, chapter.id, e)}
                                style={listActionStyle}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                {chapter.title}
                                {pages.find((page) => page.id === movingPageId)?.chapter_id === chapter.id && (
                                    <span style={{ fontSize: '10px', color: 'var(--accent-color)' }}>(current)</span>
                                )}
                            </div>
                        ))}
                    </div>
                    {projects.length > 1 && (
                        <>
                            <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '10px' }} />
                            <p style={{ color: '#aaa', fontSize: '0.9em', marginBottom: '10px' }}>OR Move to Another Project:</p>
                            <div style={{
                                width: '100%',
                                maxHeight: '150px',
                                overflowY: 'auto',
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: '6px',
                                marginBottom: '20px',
                                padding: '5px'
                            }}>
                                {projects.map((project) => (
                                    <div
                                        key={project.id}
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (confirm(`Move page to project "${project.name}"?\nNote: Images and videos might not be visible if source project is deleted.`)) {
                                                await fetch(`${API_BASE_URL}/api/pages/${movingPageId}/move-project`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ targetProjectId: project.id })
                                                });
                                                setMovingPageId(null);
                                                onRefresh?.();
                                            }
                                        }}
                                        style={listActionStyle}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {project.name}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    <button onClick={() => setMovingPageId(null)} style={{ ...secondaryButtonStyle, width: '100%' }}>Cancel</button>
                </div>
            )}

            {chapterToDelete && (
                <div style={modalOverlayStyle}>
                    <h3 style={{ color: 'white', marginBottom: '20px', fontSize: '1.2em' }}>Delete Chapter?</h3>
                    <p style={{ color: '#aaa', fontSize: '0.9em', marginBottom: '20px' }}>This will delete all pages in this chapter.</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={confirmDeleteChapter} style={primaryDangerButtonStyle}>Yes</button>
                        <button onClick={() => setChapterToDelete(null)} style={secondaryButtonStyle}>No</button>
                    </div>
                </div>
            )}

            <div style={{
                marginTop: 'auto',
                padding: '10px 0',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                alignItems: 'center',
                minHeight: '40px'
            }}>
                {!isCollapsed ? (
                    <div style={{
                        fontSize: '12px',
                        color: 'var(--text-color)',
                        opacity: 0.7,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2ecc71' }} />
                        viewers: {connectedUsers}
                    </div>
                ) : (
                    <div style={{ fontSize: '12px', color: '#2ecc71', fontWeight: 'bold' }}>{connectedUsers}</div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
