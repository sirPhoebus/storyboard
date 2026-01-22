import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Text, Arrow, Circle, Transformer, Line as KonvaLine } from 'react-konva';
import MultimediaElement from './MultimediaElement';
import { API_BASE_URL } from '../config';
import type { Element, Chapter, Page } from '../types';

interface CanvasProps {
    pageId: string | null;
    isSidebarCollapsed: boolean;
    sidebarWidth: number;
    chapters: Chapter[];
    allPages: Page[];
    onSelectPage: (id: string) => void;
    socket: any;
}

const Canvas: React.FC<CanvasProps> = ({ pageId, isSidebarCollapsed, sidebarWidth, chapters, allPages, onSelectPage, socket }) => {

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
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // Derived selectedId for backward compat until full refactor
    const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;

    const setSelectedId = (id: string | null) => {
        if (id === null) setSelectedIds([]);
        else setSelectedIds([id]);
    };

    const [history, setHistory] = useState<Element[][]>([]);
    const [redoStack, setRedoStack] = useState<Element[][]>([]);
    const [clipboard, setClipboard] = useState<Element | null>(null);
    const [editText, setEditText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const stageRef = useRef<any>(null);
    const transformerRef = useRef<any>(null);
    // Element refs map
    const elementRefs = useRef<{ [key: string]: any }>({});

    // NOTE: selectedNodeRef is removed, using elementRefs instead

    // Selection Box State
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const selectionStartRef = useRef<{ x: number, y: number } | null>(null);

    // Zoom & Pan State
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

    // Grid & Snapping State
    const [showGrid, setShowGrid] = useState(false);
    const [snapToGrid, setSnapToGrid] = useState(false);
    const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
    const gridSize = 20;
    // Let's first support "Smart Linking" updates.

    const saveToHistory = () => {
        setHistory(prev => [...prev.slice(-19), elements]);
        setRedoStack([]);
    };

    useEffect(() => {
        if (!pageId) return;

        fetch(`${API_BASE_URL}/api/elements/${pageId}`)

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

        socket.on('element:update', (data: { id: string, content?: any, [key: string]: any }) => {
            setElements((prev: Element[]) => {
                return prev.map((el: Element) => {
                    if (el.id === data.id) {
                        // Merge content if present, plus any top-level fields
                        const { id: _, content, ...otherFields } = data;
                        return {
                            ...el,
                            ...(content || {}),
                            ...otherFields
                        };
                    }
                    return el;
                });
            });
        });

        socket.on('element:add', (data: any) => {
            console.log('📥 Client received element:add:', data.id, 'for page:', data.pageId, 'current page:', pageId);
            if (data.pageId !== pageId) {
                console.log('⏭️ Skipping element:add - different page');
                return;
            }
            setElements((prev: Element[]) => {
                if (prev.find(el => el.id === data.id)) {
                    console.log('⏭️ Element already exists, skipping');
                    return prev;
                }
                console.log('✅ Adding new element to canvas');
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
    }, [socket, selectedId, pageId]);

    // Sync transformer to selected elements
    useEffect(() => {
        if (transformerRef.current) {
            const selectedNodes = selectedIds
                .map(id => elementRefs.current[id])
                .filter(Boolean);
            transformerRef.current.nodes(selectedNodes);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [selectedIds]);

    // Debug: Log socket status
    useEffect(() => {
        if (socket) {
            console.log('🔌 Socket object:', socket.id, 'connected:', socket.connected);
        } else {
            console.warn('⚠️ Socket object is null');
        }
    }, [socket]);

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
                        fetch(`${API_BASE_URL}/api/elements`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...content, pageId }) // Ensure pageId is set
                        })

                            .then(res => res.json())
                            .then(data => {
                                // Element will be added via socket broadcast
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
            fetch(`${API_BASE_URL}/api/pages/${pageId}`, {

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
        fetch(`${API_BASE_URL}/api/elements/${id}`, {

            method: 'DELETE'
        }).then(() => {
            setElements(prev => prev.filter(el => el.id !== id));
            setSelectedId(null);
            if (socket) socket.emit('element:delete', { id });
            updateThumbnail();
        });
    };

    const handleMoveSelectionToPage = async (targetPageId: string) => {
        if (!targetPageId || targetPageId === pageId) return;

        const elementsToMove = elements.filter(el => selectedIds.includes(el.id));
        if (elementsToMove.length === 0) return;

        saveToHistory();

        // 1. Create on target page
        const createPromises = elementsToMove.map(el => {
            // Destructure known DB columns to separate them from content properties
            // Also destructure 'content' to remove the stale object if it exists
            const {
                id, pageId: oldPageId, type, x, y, width, height, z_index,
                group_id, start_element_id, end_element_id,
                content: staleContent,
                ...restContent
            } = el as any;

            // restContent now contains latest state of text, url, points, styling, etc.
            const newContent = restContent;

            const newElement = {
                pageId: targetPageId,
                type,
                x, y, width, height, z_index, group_id, start_element_id, end_element_id,
                content: newContent
            };

            return fetch(`${API_BASE_URL}/api/elements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newElement)
            }).then(res => res.json());
        });

        await Promise.all(createPromises);

        // 2. Delete from current page
        const deletePromises = elementsToMove.map(el => {
            return fetch(`${API_BASE_URL}/api/elements/${el.id}`, {
                method: 'DELETE'
            });
        });

        await Promise.all(deletePromises);

        // 3. Update local state
        setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));

        // Emit delete events so other clients on this page see them vanish
        if (socket) {
            elementsToMove.forEach(el => {
                socket.emit('element:delete', { id: el.id });
            });
        }

        setSelectedIds([]);
        setIsMoveMenuOpen(false);
        updateThumbnail();

        // Navigate to target page
        onSelectPage(targetPageId);
    };

    const handleDragStart = () => {
        saveToHistory();
    };

    const handleDragMove = (e: any, id: string) => {
        const draggedElement = elements.find(el => el.id === id);
        if (!draggedElement) return;

        const node = e.target;
        const newX = node.x();
        const newY = node.y();
        const dx = newX - draggedElement.x;
        const dy = newY - draggedElement.y;

        // Move other selected elements
        if (selectedIds.includes(id)) {
            selectedIds.forEach(selectedId => {
                if (selectedId !== id) {
                    const otherNode = elementRefs.current[selectedId];
                    const otherEl = elements.find(item => item.id === selectedId);
                    if (otherNode && otherEl) {
                        otherNode.x(otherEl.x + dx);
                        otherNode.y(otherEl.y + dy);
                    }
                }
            });
        }

        // Move group members if not selected
        if (draggedElement.group_id && !selectedIds.includes(id)) {
            const groupMembers = elements.filter(el => el.group_id === draggedElement.group_id && el.id !== id);
            groupMembers.forEach(member => {
                const memberNode = elementRefs.current[member.id];
                if (memberNode) {
                    memberNode.x(member.x + dx);
                    memberNode.y(member.y + dy);
                }
            });
        }
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

        // Grouping & Selection Logic
        let elementsToUpdate = [{ id, x: finalX, y: finalY }];

        const dx = finalX - draggedElement.x;
        const dy = finalY - draggedElement.y;

        if (selectedIds.includes(id)) {
            // Move all other selected elements
            selectedIds.forEach(selectedId => {
                if (selectedId !== id) {
                    const el = elements.find(e => e.id === selectedId);
                    if (el) {
                        elementsToUpdate.push({ id: selectedId, x: el.x + dx, y: el.y + dy });
                    }
                }
            });
        } else if (draggedElement.group_id) {
            // If not selected, but part of a group, move group (existing logic)
            const groupMembers = elements.filter(el => el.group_id === draggedElement.group_id && el.id !== id);
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
            if (socket) {
                console.log('📤 Emitting element:move:', update);
                socket.emit('element:move', { id: update.id, x: update.x, y: update.y });
            } else {
                console.warn('⚠️ Cannot emit element:move - socket is null');
            }
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
                    // arrow.x is start.
                    const targetX = endEl.x + endEl.width / 2;
                    const targetY = endEl.y + endEl.height / 2;
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
        const element = elements.find(el => el.id === id);
        if (!element) return;

        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        // Reset scale on the node to prevent logic issues on next transform
        node.scaleX(1);
        node.scaleY(1);

        let finalX = node.x();
        let finalY = node.y();

        if (snapToGrid) {
            finalX = Math.round(finalX / gridSize) * gridSize;
            finalY = Math.round(finalY / gridSize) * gridSize;
        }

        if (element.type === 'text') {
            const currentFontSize = element.fontSize || 16;
            const newFontSize = Math.max(8, Math.round(currentFontSize * scaleY));

            setElements(prev => prev.map(el =>
                el.id === id ? { ...el, fontSize: newFontSize, x: finalX, y: finalY } : el
            ));

            if (socket) {
                socket.emit('element:update', {
                    id,
                    fontSize: newFontSize,
                    x: finalX,
                    y: finalY
                });
            }

        } else if (element.type === 'arrow') {
            const newPoints = (element.points || []).map((p, i) => i % 2 === 0 ? p * scaleX : p * scaleY);

            setElements(prev => prev.map(el =>
                el.id === id ? { ...el, points: newPoints, x: finalX, y: finalY } : el
            ));

            if (socket) {
                socket.emit('element:update', {
                    id,
                    points: newPoints,
                    x: finalX,
                    y: finalY
                });
            }
        } else {
            const newWidth = Math.max(5, node.width() * scaleX);
            const newHeight = Math.max(5, node.height() * scaleY);

            setElements(prev => prev.map(el =>
                el.id === id ? { ...el, width: newWidth, height: newHeight, x: finalX, y: finalY } : el
            ));

            if (socket) {
                socket.emit('element:update', {
                    id,
                    width: newWidth,
                    height: newHeight,
                    x: finalX,
                    y: finalY
                });
            }
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
        fetch(`${API_BASE_URL}/api/elements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newZone)
        })

            .then(res => res.json())
            .then(() => {
                // Element will be added via socket broadcast
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
            fontSize: 16,
            content: { text: 'Double click to edit' }
        };
        fetch(`${API_BASE_URL}/api/elements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newText)
        })

            .then(res => res.json())
            .then(() => {
                // Element will be added via socket broadcast
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
        fetch(`${API_BASE_URL}/api/elements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newArrow)
        })

            .then(res => res.json())
            .then(() => {
                // Element will be added via socket broadcast
                updateThumbnail();
            });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0 || !pageId) return;
        saveToHistory();

        const uploads = Array.from(files).map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {

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
                        img.onerror = () => resolve(null);
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
                        video.onerror = () => resolve(null);
                    });
                }
                return { type: elementType, width: finalWidth, height: finalHeight, url };
            } catch (error) {
                console.error('Upload failed:', error);
                return null;
            }
        });

        const results = await Promise.all(uploads);
        const validResults = results.filter(Boolean);

        let currentX = 100;
        const currentY = 100;
        const spacing = 20;

        for (const data of validResults) {
            if (!data) continue;
            const newElement = {
                pageId,
                type: data.type,
                x: currentX,
                y: currentY,
                width: data.width,
                height: data.height,
                content: { url: data.url }
            };

            try {
                const elementRes = await fetch(`${API_BASE_URL}/api/elements`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newElement)
                });

                await elementRes.json();
                // Element will be added via socket broadcast
                currentX += data.width + spacing;
            } catch (e) {
                console.error('Failed to create element:', e);
            }
        }
        updateThumbnail();
        if (fileInputRef.current) fileInputRef.current.value = '';
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

        fetch(`${API_BASE_URL}/api/elements/reorder`, {

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

    const handleStageMouseDown = (e: any) => {
        // clicked on stage - clear selection
        if (e.target === e.target.getStage()) {
            if (e.evt.ctrlKey) {
                setIsSelecting(true);
                const pos = e.target.getStage().getPointerPosition();
                const x = (pos.x - stagePos.x) / stageScale;
                const y = (pos.y - stagePos.y) / stageScale;
                selectionStartRef.current = { x, y };
                setSelectionBox({ x, y, width: 0, height: 0 });
            } else {
                setSelectedIds([]);
            }
            return;
        }

        // clicked on transformer - do nothing
        const clickedOnTransformer = e.target.getParent().className === 'Transformer';
        if (clickedOnTransformer) {
            return;
        }
    };

    const handleStageMouseMove = (e: any) => {
        if (!isSelecting || !selectionStartRef.current) return;

        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        const x = (pos.x - stagePos.x) / stageScale;
        const y = (pos.y - stagePos.y) / stageScale;

        const startX = selectionStartRef.current.x;
        const startY = selectionStartRef.current.y;

        setSelectionBox({
            x: Math.min(startX, x),
            y: Math.min(startY, y),
            width: Math.abs(x - startX),
            height: Math.abs(y - startY)
        });
    };

    const handleStageMouseUp = (e: any) => {
        if (isSelecting && selectionBox) {
            const box = selectionBox;
            // Find intersecting elements
            const selected = elements.filter(el => {
                // Check intersection
                return !(
                    box.x > el.x + el.width ||
                    box.x + box.width < el.x ||
                    box.y > el.y + el.height ||
                    box.y + box.height < el.y
                );
            });
            setSelectedIds(selected.map(el => el.id));
            setIsSelecting(false);
            setSelectionBox(null);
            selectionStartRef.current = null;
        } else {
            // Drag end logic for stage update is handled in onDragEnd prop
            if (e.target === e.target.getStage()) {
                setStagePos({ x: e.target.x(), y: e.target.y() });
            }
        }
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


    const handleUpdateStyle = (id: string, style: Partial<Element>) => {
        saveToHistory();
        setElements(prev => prev.map(el => (el.id === id ? { ...el, ...style } : el)));
        if (socket) socket.emit('element:update', { id, ...style });
        updateThumbnail();
    };

    // Local-only video control (no socket sync)
    const handleLocalVideoControl = (id: string, style: Partial<Element>) => {
        setElements(prev => prev.map(el => (el.id === id ? { ...el, ...style } : el)));
        // NO socket emit, NO history save - purely local playback state
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
                <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,video/*" />

                <div style={separatorStyle} />

                <button onClick={() => setShowGrid(!showGrid)} style={{ ...mainButtonStyle, background: showGrid ? '#57606f' : '#34495e' }}>Grid</button>
                <button onClick={() => setSnapToGrid(!snapToGrid)} style={{ ...mainButtonStyle, background: snapToGrid ? '#57606f' : '#34495e' }}>Snap</button>
                <button onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }} style={mainButtonStyle}>Reset View</button>

                {(selectedElement || selectedId) && <div style={separatorStyle} />}

                {selectedElement && selectedElement.type === 'video' && (
                    <>
                        <button onClick={() => handleLocalVideoControl(selectedElement.id, { isPlaying: !selectedElement.isPlaying })} style={selectedElement.isPlaying ? activeSubButtonStyle : subButtonStyle}>
                            {selectedElement.isPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button onClick={() => handleLocalVideoControl(selectedElement.id, { isMuted: !selectedElement.isMuted })} style={selectedElement.isMuted ? activeSubButtonStyle : subButtonStyle}>
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

                {selectedIds.length > 0 && (
                    <div style={{ position: 'relative', marginLeft: '5px' }}>
                        <button
                            onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
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
                                            handleMoveSelectionToPage(e.target.value);
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
                                </select>
                            </div>
                        )}
                    </div>
                )}
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
                            top: ((elements.find(el => el.id === editingId)?.y || 0) * stageScale + stagePos.y - 7) + 'px',
                            left: ((elements.find(el => el.id === editingId)?.x || 0) * stageScale + stagePos.x - 7) + 'px',
                            minWidth: '200px',
                            minHeight: '50px',
                            width: 'auto',
                            height: 'auto',
                            zIndex: 1000,
                            border: '2px solid #3498db',
                            outline: 'none',
                            padding: '5px',
                            margin: '0',
                            fontSize: ((elements.find(el => el.id === editingId)?.fontSize || 16) * stageScale) + 'px',
                            fontFamily: 'sans-serif',
                            resize: 'both',
                            overflow: 'hidden',
                            background: 'white',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
                        }}
                    />
                )
            }

            <Stage
                ref={stageRef}
                width={window.innerWidth - (isSidebarCollapsed ? 60 : sidebarWidth)}
                height={window.innerHeight}
                onMouseDown={handleStageMouseDown}
                onMouseMove={handleStageMouseMove}
                onMouseUp={handleStageMouseUp}
                onWheel={handleWheel}
                draggable={!editingId && !selectedId && !isSelecting}
                x={stagePos.x}
                y={stagePos.y}
                scaleX={stageScale}
                scaleY={stageScale}
                onDragEnd={(e) => {
                    if (e.target === e.target.getStage()) {
                        setStagePos({ x: e.target.x(), y: e.target.y() });
                    }
                }}
            >
                <Layer>
                    {renderGrid()}
                    {elements.map((el: Element) => {
                        const isSelected = selectedIds.includes(el.id);

                        // Attach ref
                        const attachRef = (node: any) => {
                            if (elementRefs.current) {
                                if (node) elementRefs.current[el.id] = node;
                                else delete elementRefs.current[el.id];
                            }
                        };

                        if (el.type === 'rect') {
                            return (
                                <Rect
                                    key={el.id}
                                    ref={attachRef}
                                    x={el.x}
                                    y={el.y}
                                    width={el.width}
                                    height={el.height}
                                    fill={el.fill || 'transparent'}
                                    stroke={el.stroke || 'white'}
                                    strokeWidth={el.strokeWidth || 1}
                                    draggable={!editingId}
                                    onClick={(e) => {
                                        e.cancelBubble = true;
                                        if (e.evt.ctrlKey) {
                                            if (isSelected) {
                                                setSelectedIds(prev => prev.filter(id => id !== el.id));
                                            } else {
                                                setSelectedIds(prev => [...prev, el.id]);
                                            }
                                        } else {
                                            setSelectedIds([el.id]);
                                        }
                                    }}
                                    onDragStart={handleDragStart}
                                    onDragMove={(e: any) => handleDragMove(e, el.id)}
                                    onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onTransformEnd={(e: any) => handleTransformEnd(el.id, e.target)}
                                />
                            );
                        }

                        if (el.type === 'text') {
                            return (
                                <Text
                                    key={el.id}
                                    ref={attachRef}
                                    x={el.x}
                                    y={el.y}
                                    text={el.text}
                                    fontSize={el.fontSize || 16}
                                    fontStyle={el.fontStyle}
                                    fill={el.fill || "white"}
                                    draggable={!editingId}
                                    onClick={(e) => {
                                        e.cancelBubble = true;
                                        if (e.evt.ctrlKey) {
                                            if (isSelected) {
                                                setSelectedIds(prev => prev.filter(id => id !== el.id));
                                            } else {
                                                setSelectedIds(prev => [...prev, el.id]);
                                            }
                                        } else {
                                            setSelectedIds([el.id]);
                                        }
                                    }}
                                    onDragStart={handleDragStart}
                                    onDragMove={(e: any) => handleDragMove(e, el.id)}
                                    onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onDblClick={() => { setEditingId(el.id); setEditText(el.text || ''); }}
                                    onTransformEnd={(e: any) => handleTransformEnd(el.id, e.target)}
                                />
                            );
                        }

                        if (el.type === 'arrow') {
                            const points = el.points || [];
                            return (
                                <React.Fragment key={el.id}>
                                    <Arrow
                                        ref={attachRef}
                                        x={el.x}
                                        y={el.y}
                                        points={points}
                                        stroke={isSelected ? '#3498db' : 'white'}
                                        strokeWidth={el.strokeWidth || 5}
                                        fill="white"
                                        draggable={!editingId}
                                        onClick={(e) => {
                                            e.cancelBubble = true;
                                            if (e.evt.ctrlKey) {
                                                if (isSelected) {
                                                    setSelectedIds(prev => prev.filter(id => id !== el.id));
                                                } else {
                                                    setSelectedIds(prev => [...prev, el.id]);
                                                }
                                            } else {
                                                setSelectedIds([el.id]);
                                            }
                                        }}
                                        onDragStart={handleDragStart}
                                        onDragMove={(e: any) => handleDragMove(e, el.id)}
                                        onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                        onTransformEnd={(e: any) => handleTransformEnd(el.id, e.target)}
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
                                    ref={attachRef}
                                    id={el.id}
                                    type={el.type as any}
                                    x={el.x}
                                    y={el.y}
                                    width={el.width}
                                    height={el.height}
                                    url={el.url || ''}
                                    isSelected={isSelected}
                                    draggable={!editingId}
                                    onClick={(e: any) => {
                                        e.cancelBubble = true;
                                        if (e.evt.ctrlKey) {
                                            if (isSelected) {
                                                setSelectedIds(prev => prev.filter(id => id !== el.id));
                                            } else {
                                                setSelectedIds(prev => [...prev, el.id]);
                                            }
                                        } else {
                                            setSelectedIds([el.id]);
                                        }
                                    }}
                                    onDragEnd={(e: any) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onTransformEnd={(e: any) => handleTransformEnd(el.id, e.target)}
                                    isPlaying={el.isPlaying}
                                    isMuted={el.isMuted}
                                />
                            );
                        }
                        return null;
                    })}

                    {selectionBox && (
                        <Rect
                            x={selectionBox.x}
                            y={selectionBox.y}
                            width={selectionBox.width}
                            height={selectionBox.height}
                            fill="rgba(52, 152, 219, 0.2)"
                            stroke="#3498db"
                            strokeWidth={1}
                            listening={false}
                        />
                    )}

                    <Transformer
                        ref={transformerRef}
                        boundBoxFunc={(oldBox, newBox) => {
                            if (newBox.width < 5 || newBox.height < 5) {
                                return oldBox;
                            }
                            return newBox;
                        }}
                    />
                </Layer>
            </Stage >
        </div >
    );
};



export default Canvas;
