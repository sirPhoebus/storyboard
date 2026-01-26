import React from 'react';
import type { CSSProperties } from 'react';
import type { Element, Chapter, Page } from '../../types';

interface CanvasToolbarProps {
    pageId: string | null;
    selectedIds: string[];
    elements: Element[]; // Needed to check selected element type/props
    chapters: Chapter[];
    allPages: Page[];
    isMoveMenuOpen: boolean;
    onToggleMoveMenu: (isOpen: boolean) => void;
    // Actions
    onAddZone: () => void;
    onAddText: () => void;
    onAddArrow: () => void;
    onAddMedia: () => void;
    onUpdateStyle: (id: string, style: Partial<Element>) => void;
    onLocalVideoControl: (id: string, control: Partial<Element>) => void;
    onReorder: (direction: 'front' | 'back') => void;
    onDelete: (ids: string[]) => void;
    onDownload: () => void;
    onCreateGrid: () => void;
    onSyncVideos?: () => void;
    onMoveSelectionToPage: (targetPageId: string) => void;
    onResetSize: (ids: string[]) => void;
    onSaveView: () => void;
    ratingFilter: number;
    onRatingFilterChange: (rating: number) => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
    pageId,
    selectedIds,
    elements,
    chapters,
    allPages,
    isMoveMenuOpen,
    onToggleMoveMenu,
    onAddZone,
    onAddText,
    onAddArrow,
    onAddMedia,
    onUpdateStyle,
    onLocalVideoControl,
    onReorder,
    onDelete,
    onDownload,
    onCreateGrid,
    onSyncVideos,
    onMoveSelectionToPage,

    onResetSize,
    onSaveView,
    ratingFilter,
    onRatingFilterChange
}) => {
    const mainButtonStyle: CSSProperties = {
        padding: '8px 12px',
        background: '#34495e',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
    };

    const subButtonStyle: CSSProperties = {
        ...mainButtonStyle,
        padding: '6px 10px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        fontSize: '13px',
        color: '#ddd',
        boxShadow: 'none'
    };

    const activeSubButtonStyle: CSSProperties = {
        ...subButtonStyle,
        background: 'rgba(52, 152, 219, 0.4)',
        borderColor: '#3498db',
        color: 'white'
    };

    const disabledButtonStyle: CSSProperties = {
        ...mainButtonStyle,
        opacity: 0.4,
        cursor: 'not-allowed',
        background: '#2c3e50'
    };

    const separatorStyle: CSSProperties = {
        width: '1px',
        height: '20px', // Added height for visibility
        backgroundColor: 'rgba(255,255,255,0.2)',
        margin: '0 5px'
    };

    const noPageMessage = "Create a page first (click + in sidebar)";

    // Find primary selected element for style editing
    const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
    const selectedElement = selectedId ? elements.find(el => el.id === selectedId) : null;

    return (
        <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
                onClick={pageId ? onAddZone : undefined}
                style={pageId ? mainButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? "Add Zone" : noPageMessage}
            >Add Zone</button>
            <button
                onClick={pageId ? onAddText : undefined}
                style={pageId ? mainButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? "Add Text" : noPageMessage}
            >Add Text</button>
            <button
                onClick={pageId ? onAddArrow : undefined}
                style={pageId ? mainButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? "Add Arrow" : noPageMessage}
            >Add Arrow</button>
            <button
                onClick={pageId ? onAddMedia : undefined}
                style={pageId ? mainButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? "Add Media" : noPageMessage}
            >Add Media</button>

            {allPages.find(p => p.id === pageId)?.type === 'videos' && onSyncVideos && (
                <button
                    onClick={onSyncVideos}
                    style={{ ...mainButtonStyle, background: '#2ecc71' }}
                    title="Scan folder for new videos and add to canvas"
                >
                    Sync Videos 🔄
                </button>
            )}

            {pageId && (
                <button
                    onClick={onSaveView}
                    style={{ ...subButtonStyle, fontSize: '16px', padding: '6px 8px', marginLeft: '8px' }}
                    title="Save current view as default for this page (Saved to Server)"
                >
                    ☁️
                </button>
            )}

            <div style={separatorStyle} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: '12px', color: '#aaa', marginRight: '4px' }}>Filter:</span>
                {[0, 1, 2, 3, 4, 5].map(stars => (
                    <button
                        key={stars}
                        onClick={() => onRatingFilterChange(stars)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: stars === 0 ? (ratingFilter === 0 ? 'white' : '#666') : (stars <= ratingFilter ? '#FFD700' : '#444'),
                            cursor: 'pointer',
                            fontSize: stars === 0 ? '11px' : '18px',
                            padding: '0 2px',
                            fontWeight: ratingFilter === stars ? 'bold' : 'normal',
                            transition: 'all 0.2s',
                            opacity: (ratingFilter === 0 && stars === 0) || (ratingFilter > 0 && stars <= ratingFilter && stars > 0) ? 1 : 0.5
                        }}
                        title={stars === 0 ? "Clear Filter" : `Show ${stars}+ Stars`}
                    >
                        {stars === 0 ? 'ALL' : '★'}
                    </button>
                ))}
            </div>

            <div style={separatorStyle} />

            {(selectedIds.some(id => {
                const el = elements.find(e => e.id === id);
                return el?.type === 'image' || el?.type === 'video';
            })) && (
                    <>
                        <button
                            onClick={() => onResetSize(selectedIds.filter(id => {
                                const el = elements.find(e => e.id === id);
                                return el?.type === 'image' || el?.type === 'video';
                            }))}
                            style={subButtonStyle}
                            title="Reset to original size"
                        >
                            ⟲ Size
                        </button>
                    </>
                )}

            {selectedElement && selectedElement.type === 'video' && (
                <>
                    <button
                        onClick={() => onLocalVideoControl(selectedElement.id, { isMuted: !selectedElement.isMuted })}
                        style={selectedElement.isMuted ? activeSubButtonStyle : subButtonStyle}
                    >
                        {selectedElement.isMuted ? 'Unmute' : 'Mute'}
                    </button>
                </>
            )}

            {selectedElement && selectedElement.type === 'text' && (
                <>
                    <button
                        onClick={() => onUpdateStyle(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'bold' ? 'normal' : 'bold' })}
                        style={{ ...subButtonStyle, fontWeight: 'bold', background: selectedElement.fontStyle === 'bold' ? activeSubButtonStyle.background : subButtonStyle.background }}
                    >B</button>
                    <button
                        onClick={() => onUpdateStyle(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })}
                        style={{ ...subButtonStyle, fontStyle: 'italic', background: selectedElement.fontStyle === 'italic' ? activeSubButtonStyle.background : subButtonStyle.background }}
                    >I</button>
                    <input
                        type="color"
                        title="Text Color"
                        value={selectedElement.fill || '#ffffff'}
                        onChange={(e) => onUpdateStyle(selectedElement.id, { fill: e.target.value })}
                        style={{ ...subButtonStyle, width: '32px', padding: 0 }}
                    />
                    <select
                        value={selectedElement.fontSize || 16}
                        onChange={(e) => onUpdateStyle(selectedElement.id, { fontSize: parseInt(e.target.value) })}
                        style={subButtonStyle}
                    >
                        {[12, 14, 16, 20, 24, 32, 48, 64].map(s => <option key={s} value={s}>{s}px</option>)}
                    </select>
                </>
            )}

            {selectedElement && selectedElement.type === 'arrow' && (
                <>
                    <span style={{ color: 'white', fontSize: '12px', marginLeft: '5px' }}>Width:</span>
                    <select
                        value={selectedElement.strokeWidth || 5}
                        onChange={(e) => onUpdateStyle(selectedElement.id, { strokeWidth: parseInt(e.target.value) })}
                        style={subButtonStyle}
                    >
                        {[1, 2, 3, 5, 8, 10, 15, 20].map(s => <option key={s} value={s}>{s}px</option>)}
                    </select>
                </>
            )}

            {selectedIds.length > 0 && (
                <>
                    {/* Only show reorder for single selection or assume it works for group? Original code implies reorder works on "selectedId" which matches single selection */}
                    {selectedId && (
                        <>
                            <button onClick={() => onReorder('front')} style={subButtonStyle}>To Front</button>
                            <button onClick={() => onReorder('back')} style={subButtonStyle}>To Back</button>
                        </>
                    )}
                </>
            )}

            {selectedIds.some(id => {
                const el = elements.find(e => e.id === id);
                return el?.type === 'image' || el?.type === 'video';
            }) && (
                    <button onClick={onDownload} style={mainButtonStyle} title="Download selected media as ZIP">
                        Download ↓
                    </button>
                )}

            {selectedIds.length > 0 && (
                <button
                    onClick={() => onDelete(selectedIds)}
                    style={{ ...mainButtonStyle, background: '#e74c3c' }}
                    title="Delete selected elements"
                >
                    Delete 🗑️
                </button>
            )}

            {selectedIds.length >= 2 && (
                <button onClick={onCreateGrid} style={mainButtonStyle} title="Arrange selection in a 5-column grid">
                    Create Grid ⊞
                </button>
            )}

            {selectedIds.length > 0 && (
                <div style={{ position: 'relative', marginLeft: '5px' }}>
                    <button
                        onClick={() => onToggleMoveMenu(!isMoveMenuOpen)}
                        style={mainButtonStyle}
                        title="Move selected elements to another page"
                    >
                        Move to Page ▾
                    </button>
                    {isMoveMenuOpen && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '5px',
                            background: '#2c3e50',
                            border: '1px solid #34495e',
                            borderRadius: '4px',
                            padding: '5px',
                            zIndex: 200,
                            minWidth: '200px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                        }}>
                            <select
                                onChange={(e) => {
                                    if (e.target.value) {
                                        onMoveSelectionToPage(e.target.value);
                                    }
                                }}
                                style={{ width: '100%', padding: '6px', background: '#34495e', color: 'white', border: '1px solid #455a64', borderRadius: '3px' }}
                                defaultValue=""
                            >
                                <option value="" disabled>Select Destination...</option>
                                {chapters.map(chapter => (
                                    <optgroup key={chapter.id} label={chapter.title}>
                                        {allPages.filter(p => p.chapter_id === chapter.id && p.id !== pageId).map(page => (
                                            <option key={page.id} value={page.id}>{page.title}</option>
                                        ))}
                                    </optgroup>
                                ))}
                                {/* Handle Uncategorized or Orphaned Pages */}
                                {allPages.some(p => (!p.chapter_id || !chapters.find(c => c.id === p.chapter_id)) && p.id !== pageId) && (
                                    <optgroup label="Uncategorized">
                                        {allPages
                                            .filter(p => (!p.chapter_id || !chapters.find(c => c.id === p.chapter_id)) && p.id !== pageId)
                                            .map(page => (
                                                <option key={page.id} value={page.id}>{page.title}</option>
                                            ))
                                        }
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
