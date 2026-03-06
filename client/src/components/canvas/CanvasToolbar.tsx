import React from 'react';
import type { CSSProperties } from 'react';
import type { Element, Chapter, Page } from '../../types';

interface CanvasToolbarProps {
    pageId: string | null;
    selectedIds: string[];
    elements: Element[];
    chapters: Chapter[];
    allPages: Page[];
    isMoveMenuOpen: boolean;
    onToggleMoveMenu: (isOpen: boolean) => void;
    onAddZone: () => void;
    onAddText: () => void;
    onAddArrow: () => void;
    onAddMedia: () => void;
    onUpdateStyle: (id: string, style: Partial<Element>) => void;
    onReorder: (direction: 'front' | 'back') => void;
    onDelete: (ids: string[]) => void;
    onDownload: () => void;
    onCreateGrid: (rows: number, columns: number) => void;
    onMoveSelectionToPage: (targetPageId: string) => void;
    onResetViewport: () => void;
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
    onReorder,
    onDelete,
    onDownload,
    onCreateGrid,
    onMoveSelectionToPage,
    onResetViewport,
    ratingFilter,
    onRatingFilterChange
}) => {
    const [isGridPickerOpen, setIsGridPickerOpen] = React.useState(false);
    const [gridPreview, setGridPreview] = React.useState({ rows: 2, columns: 2 });
    const toolbarButtonStyle: CSSProperties = {
        padding: '6px 10px',
        background: 'rgba(0, 0, 0, 0.4)',
        color: '#ddd',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'none'
    };

    const activeSubButtonStyle: CSSProperties = {
        ...toolbarButtonStyle,
        background: 'rgba(52, 152, 219, 0.4)',
        borderColor: '#3498db',
        color: 'white'
    };

    const disabledButtonStyle: CSSProperties = {
        ...toolbarButtonStyle,
        opacity: 0.4,
        cursor: 'not-allowed',
        background: 'rgba(0, 0, 0, 0.2)'
    };

    const separatorStyle: CSSProperties = {
        width: '1px',
        height: '20px',
        backgroundColor: 'rgba(255,255,255,0.2)',
        margin: '0 5px'
    };

    const noPageMessage = 'Create a page first (click + in sidebar)';
    const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
    const selectedElement = selectedId ? elements.find((el) => el.id === selectedId) : null;
    const selectionCount = selectedIds.length;

    React.useEffect(() => {
        if (selectionCount < 2) {
            setIsGridPickerOpen(false);
            return;
        }

        setGridPreview((prev) => {
            const suggestedColumns = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(selectionCount))));
            const suggestedRows = Math.min(10, Math.max(2, Math.ceil(selectionCount / suggestedColumns)));
            if (prev.rows * prev.columns >= selectionCount) return prev;
            return { rows: suggestedRows, columns: suggestedColumns };
        });
    }, [selectionCount]);

    return (
        <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
                onClick={pageId ? onAddZone : undefined}
                style={pageId ? toolbarButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? 'Add Zone' : noPageMessage}
            >
                Add Zone
            </button>
            <button
                onClick={pageId ? onAddText : undefined}
                style={pageId ? toolbarButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? 'Add Text' : noPageMessage}
            >
                Add Text
            </button>
            <button
                onClick={pageId ? onAddArrow : undefined}
                style={pageId ? toolbarButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? 'Add Arrow' : noPageMessage}
            >
                Add Arrow
            </button>
            <button
                onClick={pageId ? onAddMedia : undefined}
                style={pageId ? toolbarButtonStyle : disabledButtonStyle}
                disabled={!pageId}
                title={pageId ? 'Add Media' : noPageMessage}
            >
                Add Media
            </button>

            {pageId && (
                <button
                    onClick={onResetViewport}
                    style={{ ...toolbarButtonStyle, marginLeft: '8px' }}
                    title="Reset zoom and recenter the viewport"
                >
                    Reset View
                </button>
            )}

            <div style={separatorStyle} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: '12px', color: '#aaa', marginRight: '4px' }}>Filter:</span>
                {[0, 1, 2, 3, 4, 5].map((stars) => (
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
                        title={stars === 0 ? 'Clear Filter' : `Show ${stars}+ Stars`}
                    >
                        {stars === 0 ? 'ALL' : '★'}
                    </button>
                ))}
            </div>

            <div style={separatorStyle} />

            {selectedElement && selectedElement.type === 'text' && (
                <>
                    <button
                        onClick={() => onUpdateStyle(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'bold' ? 'normal' : 'bold' })}
                        style={{ ...toolbarButtonStyle, fontWeight: 'bold', background: selectedElement.fontStyle === 'bold' ? activeSubButtonStyle.background : toolbarButtonStyle.background }}
                    >
                        B
                    </button>
                    <button
                        onClick={() => onUpdateStyle(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })}
                        style={{ ...toolbarButtonStyle, fontStyle: 'italic', background: selectedElement.fontStyle === 'italic' ? activeSubButtonStyle.background : toolbarButtonStyle.background }}
                    >
                        I
                    </button>
                    <input
                        type="color"
                        title="Text Color"
                        value={selectedElement.fill || '#ffffff'}
                        onChange={(e) => onUpdateStyle(selectedElement.id, { fill: e.target.value })}
                        style={{ ...toolbarButtonStyle, width: '32px', padding: 0 }}
                    />
                    <select
                        value={selectedElement.fontSize || 16}
                        onChange={(e) => onUpdateStyle(selectedElement.id, { fontSize: parseInt(e.target.value, 10) })}
                        style={toolbarButtonStyle}
                    >
                        {[12, 14, 16, 20, 24, 32, 48, 64].map((size) => (
                            <option key={size} value={size}>
                                {size}px
                            </option>
                        ))}
                    </select>
                </>
            )}

            {selectedElement && selectedElement.type === 'arrow' && (
                <>
                    <span style={{ color: 'white', fontSize: '12px', marginLeft: '5px' }}>Width:</span>
                    <select
                        value={selectedElement.strokeWidth || 5}
                        onChange={(e) => onUpdateStyle(selectedElement.id, { strokeWidth: parseInt(e.target.value, 10) })}
                        style={toolbarButtonStyle}
                    >
                        {[1, 2, 3, 5, 8, 10, 15, 20].map((size) => (
                            <option key={size} value={size}>
                                {size}px
                            </option>
                        ))}
                    </select>
                </>
            )}

            {selectedIds.length > 0 && selectedId && (
                <>
                    <button onClick={() => onReorder('front')} style={toolbarButtonStyle}>
                        To Front
                    </button>
                    <button onClick={() => onReorder('back')} style={toolbarButtonStyle}>
                        To Back
                    </button>
                </>
            )}

            {selectedIds.some((id) => {
                const el = elements.find((item) => item.id === id);
                return el?.type === 'image' || el?.type === 'video' || el?.type === 'video-card';
            }) && (
                <button onClick={onDownload} style={toolbarButtonStyle} title="Download selected media as ZIP">
                    Download ↓
                </button>
            )}

            {selectedIds.length > 0 && (
                <button
                    onClick={() => onDelete(selectedIds)}
                    style={{ ...toolbarButtonStyle, background: '#e74c3c' }}
                    title="Delete selected elements"
                >
                    Delete
                </button>
            )}

            {selectedIds.length >= 2 && (
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setIsGridPickerOpen((open) => !open)}
                        style={toolbarButtonStyle}
                        title="Choose the grid size for the selected elements"
                    >
                        {`Create Grid ${gridPreview.columns}x${gridPreview.rows}`}
                    </button>
                    {isGridPickerOpen && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '8px',
                                background: '#1f2937',
                                border: '1px solid rgba(255,255,255,0.14)',
                                borderRadius: '10px',
                                padding: '12px',
                                zIndex: 250,
                                boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                                width: '220px'
                            }}
                        >
                            <div style={{ color: '#e5eef7', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                                {`${gridPreview.columns}x${gridPreview.rows}`}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px' }}>
                                {Array.from({ length: 100 }, (_, index) => {
                                    const column = (index % 10) + 1;
                                    const row = Math.floor(index / 10) + 1;
                                    const isActive = row <= gridPreview.rows && column <= gridPreview.columns;

                                    return (
                                        <button
                                            key={`${row}-${column}`}
                                            onMouseEnter={() => setGridPreview({ rows: row, columns: column })}
                                            onFocus={() => setGridPreview({ rows: row, columns: column })}
                                            onClick={() => {
                                                setGridPreview({ rows: row, columns: column });
                                                onCreateGrid(row, column);
                                                setIsGridPickerOpen(false);
                                            }}
                                            style={{
                                                width: '14px',
                                                height: '14px',
                                                borderRadius: '3px',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                background: isActive ? 'rgba(59, 130, 246, 0.9)' : 'rgba(255,255,255,0.08)',
                                                cursor: 'pointer',
                                                padding: 0
                                            }}
                                            title={`${column}x${row}`}
                                        />
                                    );
                                })}
                            </div>
                            <div style={{ color: '#93a4b8', fontSize: '11px', marginTop: '10px' }}>
                                Move right for columns, down for rows. Max 10x10.
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedIds.length > 0 && (
                <div style={{ position: 'relative', marginLeft: '5px' }}>
                    <button
                        onClick={() => onToggleMoveMenu(!isMoveMenuOpen)}
                        style={toolbarButtonStyle}
                        title="Move selected elements to another page"
                    >
                        Move to Page ▾
                    </button>
                    {isMoveMenuOpen && (
                        <div
                            style={{
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
                            }}
                        >
                            <select
                                onChange={(e) => {
                                    if (e.target.value) {
                                        onMoveSelectionToPage(e.target.value);
                                    }
                                }}
                                style={{ width: '100%', padding: '6px', background: '#34495e', color: 'white', border: '1px solid #455a64', borderRadius: '3px' }}
                                defaultValue=""
                            >
                                <option value="" disabled>
                                    Select Destination...
                                </option>
                                {chapters.map((chapter) => (
                                    <optgroup key={chapter.id} label={chapter.title}>
                                        {allPages
                                            .filter((page) => page.chapter_id === chapter.id && page.id !== pageId)
                                            .map((page) => (
                                                <option key={page.id} value={page.id}>
                                                    {page.title}
                                                </option>
                                            ))}
                                    </optgroup>
                                ))}
                                {allPages.some((page) => (!page.chapter_id || !chapters.find((chapter) => chapter.id === page.chapter_id)) && page.id !== pageId) && (
                                    <optgroup label="Uncategorized">
                                        {allPages
                                            .filter((page) => (!page.chapter_id || !chapters.find((chapter) => chapter.id === page.chapter_id)) && page.id !== pageId)
                                            .map((page) => (
                                                <option key={page.id} value={page.id}>
                                                    {page.title}
                                                </option>
                                            ))}
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
