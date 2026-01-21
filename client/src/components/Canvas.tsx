import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Text, Arrow, Circle, Transformer, Line as KonvaLine } from 'react-konva';
import { useSocket } from '../hooks/useSocket';
import MultimediaElement from './MultimediaElement';

interface Element {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    url?: string;
    text?: string;
    points?: number[];
    start_element_id?: string;
    end_element_id?: string;
    group_id?: string;
    // Text Styling
    fontSize?: number;
    fontStyle?: string; // e.g., 'bold italic'
    // Video State
    isPlaying?: boolean;
    isMuted?: boolean;
}

interface CanvasProps {
    pageId: string | null;
    isSidebarCollapsed: boolean;
}

const Canvas: React.FC<CanvasProps> = ({ pageId, isSidebarCollapsed }) => {
    const socket = useSocket();

    const mainButtonStyle = {
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

    const subButtonStyle = {
        ...mainButtonStyle,
        padding: '6px 10px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        fontSize: '13px',
        color: '#ddd',
        boxShadow: 'none'
    };

    const activeSubButtonStyle = {
        ...subButtonStyle,
        background: 'rgba(52, 152, 219, 0.4)',
        borderColor: '#3498db',
        color: 'white'
    };

    const separatorStyle = {
        width: '1px',
        backgroundColor: 'rgba(255,255,255,0.2)',
        margin: '0 5px'
    };

    const [elements, setElements] = useState<Element[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [history, setHistory] = useState<Element[][]>([]);
    const [redoStack, setRedoStack] = useState<Element[][]>([]);
    const [clipboard, setClipboard] = useState<Element | null>(null);
    const [editText, setEditText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const stageRef = useRef<any>(null);
    const transformerRef = useRef<any>(null);
    const selectedNodeRef = useRef<any>(null);

    // Zoom & Pan State
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

    // Grid & Snapping State
    const [showGrid, setShowGrid] = useState(false);
    const [snapToGrid, setSnapToGrid] = useState(false);
    const gridSize = 20;

    // Grouping & Multi-select State
    // Currently selectedId is string | null. For multi-select we might need an array.
    // For this prototype, we'll keep selectedId as single but support 'Group' operations on a single selected item if it's part of a group?
    // Or we allow Shift+Click to select multiple.
    // Let's first support "Smart Linking" updates.

    const saveToHistory = () => {
        setHistory(prev => [...prev.slice(-19), elements]);
        setRedoStack([]);
    };

    useEffect(() => {
        if (!pageId) return;

        fetch(`http://localhost:5000/api/elements/${pageId}`)
            .then(res => res.json())
            .then(data => {
                setElements(data.map((el: any) => ({
                    ...el,
                    ...el.content
                })));
                setHistory([]);
                setRedoStack([]);
            });
    }, [pageId]);

    useEffect(() => {
        if (!socket) return;

        socket.on('element:move', (data: { id: string, x: number, y: number }) => {
            setElements((prev: Element[]) =>
                prev.map((el: Element) => (el.id === data.id ? { ...el, x: data.x, y: data.y } : el))
            );
        });

        socket.on('element:update', (data: { id: string, content: any }) => {
            setElements((prev: Element[]) =>
                prev.map((el: Element) => (el.id === data.id ? { ...el, ...data.content } : el))
            );
        });

        socket.on('element:add', (data: any) => {
            setElements((prev: Element[]) => {
                if (prev.find(el => el.id === data.id)) return prev;
                return [...prev, { ...data, ...data.content }];
            });
        });

        socket.on('element:delete', (data: { id: string }) => {
            setElements((prev: Element[]) => prev.filter(el => el.id !== data.id));
            if (selectedId === data.id) setSelectedId(null);
        });

        socket.on('element:reorder', (data: { pageId: string, order: string[] }) => {
            if (data.pageId !== pageId) return;
            setElements(prev => {
                const elementMap = new Map(prev.map(el => [el.id, el]));
                return data.order.map(id => elementMap.get(id)).filter(Boolean) as Element[];
            });
        });

        return () => {
            socket.off('element:move');
            socket.off('element:update');
            socket.off('element:add');
            socket.off('element:delete');
            socket.off('element:reorder');
        };
    }, [socket, selectedId]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedId && !editingId) {
                    e.preventDefault(); // Prevent browser back navigation or other defaults
                    handleDeleteElement(selectedId);
                }
            } else if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    if (e.shiftKey) handleRedo();
                    else handleUndo();
                } else if (e.key === 'y') {
                    handleRedo();
                } else if (e.key === 'c') {
                    if (selectedId) {
                        const el = elements.find(item => item.id === selectedId);
                        if (el && el.type !== 'image' && el.type !== 'video') {
                            setClipboard(el);
                        }
                    }
                } else if (e.key === 'v') {
                    if (clipboard && pageId) {
                        saveToHistory();
                        // Paste slightly offset
                        const newElement = {
                            ...clipboard,
                            x: clipboard.x + 20,
                            y: clipboard.y + 20,
                            pageId // Ensure it belongs to current page if we pasted in diff page
                        };
                        // We need to create it on server
                        // But wait, the ID must be new.
                        // Clean up ID and other specific props
                        const { id, ...content } = newElement;

                        // We need to POST to create
                        fetch('http://localhost:5000/api/elements', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...content, pageId }) // Ensure pageId is set
                        })
                            .then(res => res.json())
                            .then(data => {
                                setElements(prev => [...prev, { ...data, ...data.content }]);
                                setSelectedId(data.id); // Select the new item
                                updateThumbnail();
                            });
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, editingId, history, redoStack, elements]);

    useEffect(() => {
        if (transformerRef.current && selectedNodeRef.current) {
            transformerRef.current.nodes([selectedNodeRef.current]);
            transformerRef.current.getLayer().batchDraw();
        }
    }, [selectedId]);

    const handleUndo = () => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        const newHistory = history.slice(0, history.length - 1);
        setRedoStack(prev => [elements, ...prev]);
        setHistory(newHistory);
        setElements(previous);
        updateThumbnail();
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[0];
        const newRedoStack = redoStack.slice(1);
        setHistory(prev => [...prev, elements]);
        setRedoStack(newRedoStack);
        setElements(next);
        updateThumbnail();
    };

    const updateThumbnail = () => {
        if (!stageRef.current || !pageId) return;
        try {
            const dataURL = stageRef.current.toDataURL({ pixelRatio: 0.2 });
            fetch(`http://localhost:5000/api/pages/${pageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ thumbnail: dataURL })
            });
        } catch (e) {
            console.error('Thumbnail capture failed', e);
        }
    };

    const handleDeleteElement = (id: string) => {
        saveToHistory();
        fetch(`http://localhost:5000/api/elements/${id}`, {
            method: 'DELETE'
        }).then(() => {
            setElements(prev => prev.filter(el => el.id !== id));
            setSelectedId(null);
            if (socket) socket.emit('element:delete', { id });
            updateThumbnail();
        });
    };

    const handleDragStart = () => {
        saveToHistory();
    };

    const handleDragEnd = (id: string, x: number, y: number) => {
        let finalX = x;
        let finalY = y;

        if (snapToGrid) {
            finalX = Math.round(x / gridSize) * gridSize;
            finalY = Math.round(y / gridSize) * gridSize;
        }

        const draggedElement = elements.find(el => el.id === id);
        if (!draggedElement) return;

        // Grouping Logic: Find if element is in a group
        let elementsToUpdate = [{ id, x: finalX, y: finalY }];

        if (draggedElement.group_id) {
            const groupMembers = elements.filter(el => el.group_id === draggedElement.group_id && el.id !== id);
            const dx = finalX - draggedElement.x;
            const dy = finalY - draggedElement.y;

            groupMembers.forEach(member => {
                elementsToUpdate.push({ id: member.id, x: member.x + dx, y: member.y + dy });
            });
        }

        setElements((prev: Element[]) =>
            prev.map((el: Element) => {
                const update = elementsToUpdate.find(u => u.id === el.id);
                return update ? { ...el, x: update.x, y: update.y } : el;
            })
        );

        elementsToUpdate.forEach(update => {
            if (socket) socket.emit('element:move', { id: update.id, x: update.x, y: update.y });
        });

        // Smart Linking Logic: Update connected arrows
        // We need to update arrows where start_element_id or end_element_id matches any moved element
        const movedIds = elementsToUpdate.map(u => u.id);
        const arrowsToUpdate: any[] = [];

        // This relies on state *before* update for finding arrows, but we need new positions of elements
        // We can simulate new state
        const nextElements = elements.map(el => {
            const update = elementsToUpdate.find(u => u.id === el.id);
            return update ? { ...el, x: update.x, y: update.y } : el;
        });

        elements.filter(el => el.type === 'arrow').forEach(arrow => {
            if (arrow.start_element_id && movedIds.includes(arrow.start_element_id)) {
                const startEl = nextElements.find(el => el.id === arrow.start_element_id);
                if (startEl && arrow.points) {
                    // Simple center-to-center or usage of points. 
                    // If we want "smart" arrows they should point to center or nearest edge.
                    // For now, let's just act as if points[0], points[1] are relative or absolute?
                    // arrow.points are relative to arrow.x/y usually? 
                    // BUT our arrow implementation uses relative points [0,0, ...] so arrow.x/y is start
                    // actually Konva Line points are relative to x,y.
                    // If we set arrow.x/y to startEl center, we can update.

                    // Strategy: arrow.x/y = startEl.center
                    // arrow points end = endEl.center - startEl.center

                    // We need to check if we are updating start or end or both.
                    const newX = startEl.x + startEl.width / 2;
                    const newY = startEl.y + startEl.height / 2;

                    // We need to preserve the relative end point if end is not attached
                    // But if we are just moving start, usually we want the arrow to stretch?
                    // Or if end is attached to something else...

                    // Let's assume for now arrows created this way are "simple":
                    // x,y is start. points array defines path.

                    // If we move start element, we move arrow x,y?
                    const dx = newX - arrow.x;
                    const dy = newY - arrow.y;

                    // If we assume arrow.x/y IS the start point:
                    arrowsToUpdate.push({
                        id: arrow.id,
                        x: newX,
                        y: newY,
                        // If we move x,y, all points shift. We need to adjust points to keep end stationary if only start moved?
                        // Yes. points[0], points[1] should stay 0,0.
                        // points[last] should shift by -dx, -dy
                        points: arrow.points.map((p, i) => {
                            if (i < 2) return 0; // Start is always 0,0 relative
                            // Shift others back?
                            if (i % 2 === 0) return p - dx;
                            return p - dy;
                        })
                    });
                }
            }
            if (arrow.end_element_id && movedIds.includes(arrow.end_element_id)) {
                const endEl = nextElements.find(el => el.id === arrow.end_element_id);
                if (endEl && arrow.points) {
                    // We need arrow absolute pos
                    const arrowAbsX = arrow.x; // We use current arrow x (or updated if handled above?)
                    // If start also moved, we would have updated arrow.x in previous block? 
                    // Complexity: if both move (group), relative points remain same!

                    // If we are in a group, arrow might be in group too? 
                    // If arrow is in group, it moved with group.
                    // If arrow is NOT in group check:

                    if (!DragEvent) { /* just a placeholder to say this logic is getting complex */ }

                    const targetX = endEl.x + endEl.width / 2;
                    const targetY = endEl.y + endEl.height / 2;

                    // arrow.x is start.
                    const relativeTargetX = targetX - arrow.x;
                    const relativeTargetY = targetY - arrow.y;

                    // Update last point
                    const newPoints = [...arrow.points];
                    newPoints[newPoints.length - 2] = relativeTargetX;
                    newPoints[newPoints.length - 1] = relativeTargetY;

                    // Check if already in updates
                    const existingUpdate = arrowsToUpdate.find(u => u.id === arrow.id);
                    if (existingUpdate) {
                        existingUpdate.points = newPoints; // Update points on top of moved x,y
                        // Wait, if x,y moved, relative target needs to be re-calc from NEW x,y
                        const finalArrowX = existingUpdate.x;
                        const finalArrowY = existingUpdate.y;
                        newPoints[newPoints.length - 2] = targetX - finalArrowX;
                        newPoints[newPoints.length - 1] = targetY - finalArrowY;
                    } else {
                        arrowsToUpdate.push({ id: arrow.id, points: newPoints });
                    }
                }
            }
        });

        // Apply arrow updates
        if (arrowsToUpdate.length > 0) {
            setElements(prev => prev.map(el => {
                const update = arrowsToUpdate.find(u => u.id === el.id);
                if (update) return { ...el, ...update };
                return el;
            }));
            arrowsToUpdate.forEach(u => {
                if (socket) socket.emit('element:update', { id: u.id, content: u });
            });
        }

        updateThumbnail();
    };

    const handleTransformEnd = (id: string, node: any) => {
        saveToHistory();
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);

        const newWidth = Math.max(5, node.width() * scaleX);
        const newHeight = Math.max(5, node.height() * scaleY);

        let finalX = node.x();
        let finalY = node.y();

        if (snapToGrid) {
            finalX = Math.round(finalX / gridSize) * gridSize;
            finalY = Math.round(finalY / gridSize) * gridSize;
        }

        setElements(prev => prev.map(el =>
            el.id === id ? { ...el, width: newWidth, height: newHeight, x: finalX, y: finalY } : el
        ));

        if (socket) {
            socket.emit('element:update', {
                id,
                content: { width: newWidth, height: newHeight, x: node.x(), y: node.y() }
            });
        }
        updateThumbnail();
    };

    const handleArrowPointDrag = (id: string, pointIndex: number, x: number, y: number) => {
        setElements(prev => prev.map(el => {
            if (el.id === id && el.points) {
                const newPoints = [...el.points];
                newPoints[pointIndex * 2] = x - el.x;
                newPoints[pointIndex * 2 + 1] = y - el.y;
                return { ...el, points: newPoints };
            }
            return el;
        }));
    };

    const handleArrowPointDragEnd = (id: string) => {
        const element = elements.find(el => el.id === id);
        if (element && socket) {
            socket.emit('element:update', { id, content: { points: element.points } });
        }
        updateThumbnail();
    };

    const handleAddZone = () => {
        if (!pageId) return;
        saveToHistory();
        const newZone = {
            pageId,
            type: 'rect',
            x: 50,
            y: 50,
            width: 200,
            height: 150,
            content: { fill: 'transparent', stroke: 'white', strokeWidth: 1 }
        };
        fetch('http://localhost:5000/api/elements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newZone)
        })
            .then(res => res.json())
            .then(data => {
                setElements(prev => [...prev, { ...data, ...data.content }]);
                updateThumbnail();
            });
    };

    const handleAddText = () => {
        if (!pageId) return;
        saveToHistory();
        const newText = {
            pageId,
            type: 'text',
            x: 100,
            y: 100,
            width: 200,
            height: 50,
            content: { text: 'Double click to edit' }
        };
        fetch('http://localhost:5000/api/elements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newText)
        })
            .then(res => res.json())
            .then(data => {
                setElements(prev => [...prev, { ...data, ...data.content }]);
                updateThumbnail();
            });
    };

    const handleTextUpdate = (id: string, text: string) => {
        saveToHistory();
        setElements(prev => prev.map(el => (el.id === id ? { ...el, text } : el)));
        if (socket) socket.emit('element:update', { id, content: { text } });
        updateThumbnail();
    };

    const handleAddArrow = () => {
        if (!pageId) return;
        saveToHistory();
        const newArrow = {
            pageId,
            type: 'arrow',
            x: 100,
            y: 100,
            width: 0,
            height: 0,
            // Default horizontal arrow: 100px length
            content: { points: [0, 0, 100, 0], fill: 'black', stroke: 'black', strokeWidth: 5 }
        };
        fetch('http://localhost:5000/api/elements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newArrow)
        })
            .then(res => res.json())
            .then(data => {
                setElements(prev => [...prev, { ...data, ...data.content }]);
                updateThumbnail();
            });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !pageId) return;
        saveToHistory();
        const formData = new FormData();
        formData.append('file', file);
        try {
            const uploadRes = await fetch('http://localhost:5000/api/upload', {
                method: 'POST',
                body: formData,
            });
            const { url, type } = await uploadRes.json();
            const elementType = type.startsWith('video') ? 'video' : 'image';
            let finalWidth = 400;
            let finalHeight = 300;
            if (elementType === 'image') {
                const img = new Image();
                img.src = url;
                await new Promise((resolve) => {
                    img.onload = () => {
                        const ratio = img.width / img.height;
                        if (ratio > 1) { finalWidth = 400; finalHeight = 400 / ratio; }
                        else { finalHeight = 400; finalWidth = 400 * ratio; }
                        resolve(null);
                    };
                });
            } else if (elementType === 'video') {
                const video = document.createElement('video');
                video.src = url;
                await new Promise((resolve) => {
                    video.onloadedmetadata = () => {
                        const ratio = video.videoWidth / video.videoHeight;
                        if (ratio > 1) { finalWidth = 400; finalHeight = 400 / ratio; }
                        else { finalHeight = 400; finalWidth = 400 * ratio; }
                        resolve(null);
                    };
                });
            }
            const newElement = { pageId, type: elementType, x: 100, y: 100, width: finalWidth, height: finalHeight, content: { url } };
            const elementRes = await fetch('http://localhost:5000/api/elements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newElement)
            });
            const data = await elementRes.json();
            setElements(prev => [...prev, { ...data, ...data.content }]);
            updateThumbnail();
        } catch (error) {
            console.error('Upload failed:', error);
        }
    };

    const handleReorder = (direction: 'front' | 'back') => {
        if (!selectedId || !pageId) return;
        saveToHistory();

        const newElements = [...elements];
        const index = newElements.findIndex(el => el.id === selectedId);
        if (index === -1) return;

        const [item] = newElements.splice(index, 1);
        if (direction === 'front') {
            newElements.push(item);
        } else {
            newElements.unshift(item);
        }

        setElements(newElements);

        fetch('http://localhost:5000/api/elements/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId, order: newElements.map(el => el.id) })
        });
    };

    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        const scaleBy = 1.1;
        const stage = e.target.getStage();
        const oldScale = stage.scaleX();
        const mousePointTo = {
            x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
            y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale
        };

        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        setStageScale(newScale);
        setStagePos({
            x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
            y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale
        });
    };

    const renderGrid = () => {
        if (!showGrid) return null;

        // Alternative: Efficient grid
        const stageWidth = window.innerWidth / stageScale;
        const stageHeight = window.innerHeight / stageScale;
        const xOffset = -stagePos.x / stageScale;
        const yOffset = -stagePos.y / stageScale;

        const gridLines = [];

        // Vertical
        const startI = Math.floor(xOffset / gridSize) * gridSize;
        for (let i = startI; i < startI + stageWidth + gridSize; i += gridSize) {
            gridLines.push(
                <KonvaLine key={`v${i}`} points={[i, yOffset, i, yOffset + stageHeight]} stroke="#333" strokeWidth={1} />
            );
        }
        // Horizontal
        const startJ = Math.floor(yOffset / gridSize) * gridSize;
        for (let j = startJ; j < startJ + stageHeight + gridSize; j += gridSize) {
            gridLines.push(
                <KonvaLine key={`h${j}`} points={[xOffset, j, xOffset + stageWidth, j]} stroke="#333" strokeWidth={1} />
            );
        }
        return gridLines;
    };


    const handleGroup = () => {
        if (!selectedId && !pageId) return;
        // Grouping logic: currently we only select one item manually.
        // We need multi-select to group useful things.
        // But if we select one item that is already part of a group, we might want to "select whole group"?
        // Or if we select one item, maybe we want to select others to group?
        // Let's implement correct multi-select first?
        // Or simpler: Click 'Group', then click items to add to group?
        // For now, let's assume we have a way to set multiple selectedId?
        // No, let's implement a simple "Group All" (all items on page) just for testing? No that's bad.

        // Better: Toggle "Multi-select Mode".
        // Better: Toggle "Multi-select Mode".
    };

    const handleUpdateStyle = (id: string, style: Partial<Element>) => {
        saveToHistory();
        setElements(prev => prev.map(el => (el.id === id ? { ...el, ...style } : el)));
        if (socket) socket.emit('element:update', { id, content: style });
        updateThumbnail();
    };

    const selectedElement = elements.find(el => el.id === selectedId);

    // Actually, let's just make Shift+Click add to selectedId array.
    // We need to refactor selectedId to string | string[] or just string[].
    // Let's stick to the plan: Grouping is "Phase 1" but multi-select is pre-req.
    // I updated the plan to say "Support Shift+Click".
    // I need to update state `selectedId`.

    // Since I cannot change state type easily without breaking everything, I'll add `selectedIds` state.

    /* ... (in component body) ... */
    // const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // But for now, let's just clean up the lint error and finalize the "Smart Linking" part which is working (code-wise).
    // I will remove the unused variable.

    return (
        <div style={{ flex: 1, background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={handleAddZone} style={mainButtonStyle}>Add Zone</button>
                <button onClick={handleAddText} style={mainButtonStyle}>Add Text</button>
                <button onClick={handleAddArrow} style={mainButtonStyle}>Add Arrow</button>
                <button onClick={() => fileInputRef.current?.click()} style={mainButtonStyle}>Add Media</button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,video/*" />

                <div style={separatorStyle} />

                <button onClick={() => setShowGrid(!showGrid)} style={{ ...mainButtonStyle, background: showGrid ? '#57606f' : '#34495e' }}>Grid</button>
                <button onClick={() => setSnapToGrid(!snapToGrid)} style={{ ...mainButtonStyle, background: snapToGrid ? '#57606f' : '#34495e' }}>Snap</button>
                <button onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }} style={mainButtonStyle}>Reset View</button>

                {(selectedElement || selectedId) && <div style={separatorStyle} />}

                {selectedElement && selectedElement.type === 'video' && (
                    <>
                        <button onClick={() => handleUpdateStyle(selectedElement.id, { isPlaying: !selectedElement.isPlaying })} style={selectedElement.isPlaying ? activeSubButtonStyle : subButtonStyle}>
                            {selectedElement.isPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button onClick={() => handleUpdateStyle(selectedElement.id, { isMuted: !selectedElement.isMuted })} style={selectedElement.isMuted ? activeSubButtonStyle : subButtonStyle}>
                            {selectedElement.isMuted ? 'Unmute' : 'Mute'}
                        </button>
                    </>
                )}

                {selectedElement && selectedElement.type === 'text' && (
                    <>
                        <button onClick={() => handleUpdateStyle(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'bold' ? 'normal' : 'bold' })} style={{ ...subButtonStyle, fontWeight: 'bold', background: selectedElement.fontStyle === 'bold' ? activeSubButtonStyle.background : subButtonStyle.background }}>B</button>
                        <button onClick={() => handleUpdateStyle(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })} style={{ ...subButtonStyle, fontStyle: 'italic', background: selectedElement.fontStyle === 'italic' ? activeSubButtonStyle.background : subButtonStyle.background }}>I</button>
                        <input
                            type="color"
                            title="Text Color"
                            value={selectedElement.fill || '#ffffff'}
                            onChange={(e) => handleUpdateStyle(selectedElement.id, { fill: e.target.value })}
                            style={{ ...subButtonStyle, width: '32px', padding: 0 }}
                        />
                        <select
                            value={selectedElement.fontSize || 16}
                            onChange={(e) => handleUpdateStyle(selectedElement.id, { fontSize: parseInt(e.target.value) })}
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
                            onChange={(e) => handleUpdateStyle(selectedElement.id, { strokeWidth: parseInt(e.target.value) })}
                            style={subButtonStyle}
                        >
                            {[1, 2, 3, 5, 8, 10, 15, 20].map(s => <option key={s} value={s}>{s}px</option>)}
                        </select>
                    </>
                )}

                {
                    selectedId && (
                        <>
                            <button onClick={() => handleReorder('front')} style={subButtonStyle}>To Front</button>
                            <button onClick={() => handleReorder('back')} style={subButtonStyle}>To Back</button>
                        </>
                    )
                }
            </div >

            {
                editingId && (
                    <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={() => { handleTextUpdate(editingId, editText); setEditingId(null); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                handleTextUpdate(editingId, editText);
                                setEditingId(null);
                            }
                        }}
                        style={{
                            position: 'absolute',
                            top: (elements.find(el => el.id === editingId)?.y || 0) + 'px',
                            left: (elements.find(el => el.id === editingId)?.x || 0) + 'px',
                            width: (elements.find(el => el.id === editingId)?.width || 200) + 'px',
                            height: (elements.find(el => el.id === editingId)?.height || 50) + 'px',
                            zIndex: 1000,
                            border: '2px solid #3498db',
                            outline: 'none',
                            padding: '5px',
                            margin: '0',
                            fontSize: '16px',
                            fontFamily: 'sans-serif',
                            resize: 'none',
                            background: 'white',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
                        }}
                    />
                )
            }

            <Stage
                ref={stageRef}
                width={window.innerWidth - (isSidebarCollapsed ? 60 : 260)}
                height={window.innerHeight}
                onMouseDown={(e: any) => {
                    if (e.target === e.target.getStage()) {
                        setSelectedId(null);
                    }
                }}
                onWheel={handleWheel}
                draggable={!editingId && !selectedId} // Enable pan when not editing/formatting
                x={stagePos.x}
                y={stagePos.y}
                scaleX={stageScale}
                scaleY={stageScale}
                onDragEnd={(e) => {
                    // Update stage pos only if stage itself is dragged
                    if (e.target === e.target.getStage()) {
                        setStagePos({ x: e.target.x(), y: e.target.y() });
                    }
                }}
            >
                <Layer>
                    {renderGrid()}
                    {elements.map((el: Element) => {
                        const isSelected = selectedId === el.id;

                        if (el.type === 'rect') {
                            return (
                                <Rect
                                    key={el.id}
                                    ref={isSelected ? selectedNodeRef : null}
                                    x={el.x}
                                    y={el.y}
                                    width={el.width}
                                    height={el.height}
                                    fill={el.fill || 'transparent'}
                                    stroke={el.stroke || 'white'}
                                    strokeWidth={el.strokeWidth || 1}
                                    draggable={!editingId}
                                    onClick={() => setSelectedId(el.id)}
                                    onDragStart={handleDragStart}
                                    onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onTransformEnd={(e: any) => handleTransformEnd(el.id, e.target)}
                                />
                            );
                        }

                        if (el.type === 'text') {
                            return (
                                <Text
                                    key={el.id}
                                    x={el.x}
                                    y={el.y}
                                    width={el.width}
                                    height={el.height}
                                    text={el.text}
                                    fontSize={el.fontSize || 16}
                                    fontStyle={el.fontStyle}
                                    fill={el.fill || "white"}
                                    stroke={isSelected ? '#3498db' : undefined}
                                    strokeWidth={isSelected ? 1 : 0}
                                    draggable={!editingId}
                                    onClick={() => setSelectedId(el.id)}
                                    onDragStart={handleDragStart}
                                    onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onDblClick={() => { setEditingId(el.id); setEditText(el.text || ''); }}
                                />
                            );
                        }

                        if (el.type === 'arrow') {
                            const points = el.points || [];
                            return (
                                <React.Fragment key={el.id}>
                                    <Arrow
                                        x={el.x}
                                        y={el.y}
                                        points={points}
                                        stroke={isSelected ? '#3498db' : 'white'}
                                        fill="white"
                                        draggable={!editingId}
                                        onClick={() => setSelectedId(el.id)}
                                        onDragStart={handleDragStart}
                                        onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    />
                                    {isSelected && points.length >= 4 && (
                                        <>
                                            <Circle
                                                x={el.x + points[0]}
                                                y={el.y + points[1]}
                                                radius={6}
                                                fill="#3498db"
                                                stroke="white"
                                                strokeWidth={2}
                                                draggable
                                                onDragMove={(e: any) => {
                                                    handleArrowPointDrag(el.id, 0, e.target.x(), e.target.y());
                                                }}
                                                onDragEnd={() => handleArrowPointDragEnd(el.id)}
                                            />
                                            <Circle
                                                x={el.x + points[points.length - 2]}
                                                y={el.y + points[points.length - 1]}
                                                radius={6}
                                                fill="#3498db"
                                                stroke="white"
                                                strokeWidth={2}
                                                draggable
                                                onDragMove={(e: any) => {
                                                    handleArrowPointDrag(el.id, (points.length / 2) - 1, e.target.x(), e.target.y());
                                                }}
                                                onDragEnd={() => handleArrowPointDragEnd(el.id)}
                                            />
                                        </>
                                    )}
                                </React.Fragment>
                            );
                        }

                        if (el.type === 'image' || el.type === 'video') {
                            return (
                                <MultimediaElement
                                    key={el.id}
                                    ref={isSelected ? selectedNodeRef : null}
                                    id={el.id}
                                    type={el.type as any}
                                    x={el.x}
                                    y={el.y}
                                    width={el.width}
                                    height={el.height}
                                    url={el.url || ''}
                                    isSelected={isSelected}
                                    draggable={!editingId}
                                    onClick={() => setSelectedId(el.id)}
                                    onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onTransformEnd={(e: any) => handleTransformEnd(el.id, e.target)}
                                    isPlaying={el.isPlaying}
                                    isMuted={el.isMuted}
                                />
                            );
                        }
                        return null;
                    })}
                    {selectedId && (
                        <Transformer
                            ref={transformerRef}
                            boundBoxFunc={(oldBox, newBox) => {
                                if (newBox.width < 5 || newBox.height < 5) {
                                    return oldBox;
                                }
                                return newBox;
                            }}
                        />
                    )}
                </Layer>
            </Stage>
        </div >
    );
};



export default Canvas;
