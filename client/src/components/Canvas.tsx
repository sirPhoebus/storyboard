import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Arrow, Circle, Transformer, Line as KonvaLine } from 'react-konva';
import Konva from 'konva';
import { Socket } from 'socket.io-client';
import MultimediaElement from './MultimediaElement';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { UploadProgress } from './canvas/UploadProgress';
import { NoPagePlaceholder } from './canvas/NoPagePlaceholder';
import { API_BASE_URL } from '../config';
import type { Element, Chapter, Page } from '../types';

interface CanvasProps {
    pageId: string | null;
    isSidebarCollapsed: boolean;
    sidebarWidth: number;
    chapters: Chapter[];
    allPages: Page[];
    onSelectPage: (id: string) => void;
    onOpenBatchManagement?: () => void;
    socket: Socket | null;
}

import type { UploadState } from './canvas/UploadProgress';

const Canvas: React.FC<CanvasProps> = ({ pageId, isSidebarCollapsed, sidebarWidth, chapters, allPages, onSelectPage, onOpenBatchManagement, socket }) => {


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
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    // Element refs map
    const elementRefs = useRef<{ [key: string]: Konva.Node }>({});

    // NOTE: selectedNodeRef is removed, using elementRefs instead

    // Selection Box State
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const selectionStartRef = useRef<{ x: number, y: number } | null>(null);

    // Zoom & Pan State
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

    // Grid & Snapping State
    const [showGrid, /* setShowGrid */] = useState(false);
    const [snapToGrid, /* setSnapToGrid */] = useState(false);
    const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
    const [uploadsInProgress, setUploadsInProgress] = useState<UploadState[]>([]);
    const [ratingFilter, setRatingFilter] = useState(0);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, elementId: string } | null>(null);
    const gridSize = 20;

    // Viewport Persistence Helpers
    const saveViewport = (id: string, x: number, y: number, scale: number) => {
        if (!id) return;
        localStorage.setItem(`viewport_${id}`, JSON.stringify({ x, y, scale }));
    };

    const loadViewport = useCallback((id: string) => {
        // 1. Try Local Storage
        const saved = localStorage.getItem(`viewport_${id}`);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.warn('Failed to parse viewport state', e);
            }
        }

        // 2. Try Server Data
        const page = allPages.find(p => p.id === id);
        if (page && page.viewport_scale) {
            return {
                x: page.viewport_x || 0,
                y: page.viewport_y || 0,
                scale: page.viewport_scale
            };
        }

        return null;
    }, [allPages]);

    const saveToHistory = () => {
        setHistory(prev => [...prev.slice(-19), elements]);
        setRedoStack([]);
    };


    useEffect(() => {
        if (!pageId) {
            // Clear elements when no page is selected (e.g., after page deletion)
            setElements([]);
            setHistory([]);
            setRedoStack([]);
            setSelectedIds([]);
            return;
        }

        // Restore Viewport for this page
        const savedViewport = loadViewport(pageId);
        if (savedViewport) {
            setStagePos({ x: savedViewport.x, y: savedViewport.y });
            setStageScale(savedViewport.scale);
        } else {
            // Default View
            setStagePos({ x: 0, y: 0 });
            setStageScale(1);
        }

        fetch(`${API_BASE_URL}/api/elements/${pageId}`)

            .then(res => res.json())
            .then((data: (Element & { content: Record<string, unknown> })[]) => {
                setElements(data.map(el => ({
                    ...el,
                    ...el.content
                })));
                setHistory([]);
                setRedoStack([]);
            });
    }, [pageId, loadViewport]);

    useEffect(() => {
        const currentPage = allPages.find(p => p.id === pageId);
        if (pageId && currentPage?.type === 'videos') {
            fetch(`${API_BASE_URL}/api/videos/sync`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.added > 0) {
                        console.log(`✅ Synced ${data.added} new videos to canvas`);
                    }
                })
                .catch(err => console.error('Failed to sync videos:', err));
        }
    }, [pageId, allPages]);

    useEffect(() => {
        if (!socket) return;

        socket.on('element:move', (data: { id: string, x: number, y: number }) => {
            setElements((prev: Element[]) =>
                prev.map((el: Element) => (el.id === data.id ? { ...el, x: data.x, y: data.y } : el))
            );
        });

        socket.on('element:update', (data: { id: string, content?: Record<string, unknown> } & Partial<Element>) => {
            setElements((prev: Element[]) => {
                return prev.map((el: Element) => {
                    if (el.id === data.id) {
                        // Merge content if present, plus any top-level fields
                        const { content, ...otherFields } = data;
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

        socket.on('element:add', (data: Element & { content: Record<string, unknown>, pageId: string }) => {
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
            setElements((prev: Element[]) => {
                // Only delete if the element exists in current page
                const elementExists = prev.some(el => el.id === data.id);
                if (!elementExists) {
                    console.log('⏭️ Skipping element:delete - element not on this page');
                    return prev;
                }
                console.log('🗑️ Deleting element:', data.id);
                return prev.filter(el => el.id !== data.id);
            });
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
                if (selectedIds.length > 0 && !editingId) {
                    e.preventDefault();
                    handleDeleteElements(selectedIds);
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
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { id: _, ...content } = newElement;

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
                            });
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, editingId, history, redoStack, elements, clipboard, pageId]);

    const handleUndo = () => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        const newHistory = history.slice(0, history.length - 1);
        setRedoStack(prev => [elements, ...prev]);
        setHistory(newHistory);
        setElements(previous);
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[0];
        const newRedoStack = redoStack.slice(1);
        setHistory(prev => [...prev, elements]);
        setRedoStack(newRedoStack);
        setElements(next);
    };

    const handleDeleteElements = async (ids: string[]) => {
        if (ids.length === 0) return;
        saveToHistory();

        try {
            if (ids.length === 1) {
                await fetch(`${API_BASE_URL}/api/elements/${ids[0]}`, { method: 'DELETE' });
            } else {
                await fetch(`${API_BASE_URL}/api/elements/batch`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids })
                });
            }

            setElements(prev => prev.filter(el => !ids.includes(el.id)));
            setSelectedIds([]);

            if (socket) {
                ids.forEach(id => socket.emit('element:delete', { id }));
            }
        } catch (err) {
            console.error('Failed to delete elements:', err);
        }
    };

    /*
    const handleDeleteElement = (id: string) => {
        handleDeleteElements([id]);
    };
    */

    const handleMoveSelectionToPage = async (targetPageId: string) => {
        if (!targetPageId || targetPageId === pageId) return;

        const elementsToMove = elements.filter(el => selectedIds.includes(el.id));
        if (elementsToMove.length === 0) return;

        saveToHistory();

        try {
            const response = await fetch(`${API_BASE_URL}/api/elements/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    elementIds: selectedIds,
                    targetPageId
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Failed to move elements:', errorData);
                return;
            }

            // Successfully moved.
            // The socket will broadcast 'element:delete' for current page
            // and 'element:add' for target page.

            // We can preemptively remove them from UI to make it snappy, 
            // but since we are navigating away, it might not matter much.
            // However, updating local state is good practice.
            setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
            setSelectedIds([]);
            setIsMoveMenuOpen(false);

            // Navigate to target page
            onSelectPage(targetPageId);
        } catch (err) {
            console.error('Error moving elements:', err);
        }
    };

    const handleDragStart = () => {
        saveToHistory();
    };

    const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>, id: string) => {
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
        const elementsToUpdate = [{ id, x: finalX, y: finalY }];

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
        const arrowsToUpdate: Partial<Element>[] = [];

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
                        const finalArrowX = existingUpdate.x || 0;
                        const finalArrowY = existingUpdate.y || 0;
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
    };

    const handleTransformEnd = (id: string, node: Konva.Node) => {
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
            });
    };

    const handleTextUpdate = (id: string, text: string) => {
        saveToHistory();
        setElements(prev => prev.map(el => (el.id === id ? { ...el, text } : el)));
        if (socket) socket.emit('element:update', { id, content: { text } });
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
            });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0 || !pageId) return;
        saveToHistory();

        const fileList = Array.from(files);

        const uploadPromises = fileList.map(async (file) => {
            const uploadId = crypto.randomUUID();
            const newUpload: UploadState = {
                id: uploadId,
                fileName: file.name,
                progress: 0,
                status: 'uploading'
            };

            setUploadsInProgress(prev => [...prev, newUpload]);

            try {
                // Use XMLHttpRequest for progress tracking
                const { url, type } = await new Promise<{ url: string, type: string }>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    const formData = new FormData();
                    formData.append('file', file);

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const progress = Math.round((e.loaded / e.total) * 100);
                            setUploadsInProgress(prev =>
                                prev.map(u => u.id === uploadId ? { ...u, progress } : u)
                            );
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(JSON.parse(xhr.responseText));
                        } else {
                            reject(new Error(`Upload failed with status ${xhr.status}`));
                        }
                    };

                    xhr.onerror = () => reject(new Error('Network error during upload'));

                    xhr.open('POST', `${API_BASE_URL}/api/upload`);
                    xhr.send(formData);
                });

                setUploadsInProgress(prev =>
                    prev.map(u => u.id === uploadId ? { ...u, status: 'processing', progress: 100 } : u)
                );

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

                setUploadsInProgress(prev =>
                    prev.map(u => u.id === uploadId ? { ...u, status: 'completed' } : u)
                );

                // Remove from progress list after a delay
                setTimeout(() => {
                    setUploadsInProgress(prev => prev.filter(u => u.id !== uploadId));
                }, 2000);

                return { type: elementType, width: finalWidth, height: finalHeight, url };
            } catch (error) {
                console.error('Upload failed:', error);
                setUploadsInProgress(prev =>
                    prev.map(u => u.id === uploadId ? { ...u, status: 'error', error: 'Upload failed' } : u)
                );
                setTimeout(() => {
                    setUploadsInProgress(prev => prev.filter(u => u.id !== uploadId));
                }, 5000);
                return null;
            }
        });

        const results = await Promise.all(uploadPromises);
        const validResults = results.filter(Boolean);

        const baseX = 100;
        const baseY = 100;
        const spacing = 20;
        const columns = 5;

        let col = 0;
        let maxRowHeight = 0;
        let currentX = baseX;
        let currentY = baseY;

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

                // Prepare next position
                col++;
                maxRowHeight = Math.max(maxRowHeight, data.height);

                if (col >= columns) {
                    col = 0;
                    currentX = baseX;
                    currentY += maxRowHeight + spacing;
                    maxRowHeight = 0;
                } else {
                    currentX += data.width + spacing;
                }
            } catch (e) {
                console.error('Failed to create element:', e);
            }
        }
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

    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const scaleBy = 1.1;
        const stage = e.target.getStage();
        if (!stage) return;
        const oldScale = stage.scaleX();
        const pointerPos = stage.getPointerPosition();
        if (!pointerPos) return;

        const mousePointTo = {
            x: pointerPos.x / oldScale - stage.x() / oldScale,
            y: pointerPos.y / oldScale - stage.y() / oldScale
        };

        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        setStageScale(newScale);
        setStagePos({
            x: -(mousePointTo.x - pointerPos.x / newScale) * newScale,
            y: -(mousePointTo.y - pointerPos.y / newScale) * newScale
        });

        if (pageId) {
            saveViewport(pageId,
                -(mousePointTo.x - pointerPos.x / newScale) * newScale,
                -(mousePointTo.y - pointerPos.y / newScale) * newScale,
                newScale
            );
        }
    };


    const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        // clicked on stage - clear selection
        if (e.target === e.target.getStage()) {
            if (e.evt.ctrlKey) {
                const stage = e.target.getStage();
                if (!stage) return;
                const pos = stage.getPointerPosition();
                if (!pos) return;

                setIsSelecting(true);
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
        const clickedOnTransformer = e.target.getParent()?.className === 'Transformer';
        if (clickedOnTransformer) {
            return;
        }
    };

    const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (!isSelecting || !selectionStartRef.current) return;

        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;

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

    const handleStageMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
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
    };

    // Local-only video control (no socket sync)
    const handleLocalVideoControl = (id: string, style: Partial<Element>) => {
        setElements(prev => prev.map(el => (el.id === id ? { ...el, ...style } : el)));
        // NO socket emit, NO history save - purely local playback state
    };

    const handleDownload = async () => {
        const mediaElements = elements.filter(el => selectedIds.includes(el.id) && (el.type === 'image' || el.type === 'video'));
        if (mediaElements.length === 0) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/download-zip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ elementIds: mediaElements.map(el => el.id) })
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = mediaElements.length === 1 ? 'asset.zip' : 'assets.zip';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Error downloading assets:', err);
            alert('Failed to download assets');
        }
    };

    const handleCreateGrid = async () => {
        if (selectedIds.length < 2) return;
        saveToHistory();

        const selectedElements = elements
            .filter(el => selectedIds.includes(el.id))
            .sort((a, b) => (a.y - b.y) || (a.x - b.x));

        const columns = 5;
        const spacing = 20;

        // Use the position of the first (top-leftmost) element as the anchor
        const baseX = selectedElements[0].x;
        const baseY = selectedElements[0].y;

        let currentX = baseX;
        let currentY = baseY;
        let maxRowHeight = 0;
        const updates: { id: string, x: number, y: number }[] = [];

        selectedElements.forEach((el, index) => {
            updates.push({ id: el.id, x: currentX, y: currentY });

            maxRowHeight = Math.max(maxRowHeight, el.height);

            if ((index + 1) % columns === 0) {
                currentX = baseX;
                currentY += maxRowHeight + spacing;
                maxRowHeight = 0;
            } else {
                currentX += el.width + spacing;
            }
        });

        // Optimistically update local state
        setElements(prev => prev.map(el => {
            const update = updates.find(u => u.id === el.id);
            return update ? { ...el, x: update.x, y: update.y } : el;
        }));

        try {
            await fetch(`${API_BASE_URL}/api/elements/batch-move`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ elements: updates })
            });
        } catch (err) {
            console.error('Error creating grid:', err);
        }
    };




    const handleResetSize = (ids: string[]) => {
        ids.forEach(id => {
            let node = elementRefs.current[id];
            if (!node) return;

            // If it's a MultimediaElement, it's a Group with an _innerImage
            if (node instanceof Konva.Group && (node as any)._innerImage) {
                node = (node as any)._innerImage;
            }

            if (!(node instanceof Konva.Image)) return;

            const image = node.image();
            if (image) {
                let width, height;
                if (image instanceof HTMLVideoElement) {
                    width = image.videoWidth;
                    height = image.videoHeight;
                } else if (image instanceof HTMLImageElement) {
                    width = image.naturalWidth;
                    height = image.naturalHeight;
                }

                if (width && height) {
                    handleUpdateStyle(id, { width, height });
                }
            }
        });
    };

    const handleSaveView = () => {
        if (!pageId) return;

        // Optimistically save locally too
        saveViewport(pageId, stagePos.x, stagePos.y, stageScale);

        fetch(`${API_BASE_URL}/api/pages/${pageId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                viewport_x: stagePos.x,
                viewport_y: stagePos.y,
                viewport_scale: stageScale
            })
        })
            .then(() => alert('Viewport saved to server!'))
            .catch(err => console.error('Failed to save viewport', err));
    };


    const handleSendToBatch = (elementId: string, role: 'first' | 'last') => {
        const el = elements.find(item => item.id === elementId);
        if (!el || !el.url) return;

        fetch(`${API_BASE_URL}/api/batch/add-frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: el.url, role })
        })
            .then(res => res.json())
            .then(() => {
                setContextMenu(null);
                // Optionally show a toast/notification
            })
            .catch(err => console.error('Failed to add frame to batch:', err));
    };

    const handleSyncVideos = useCallback(() => {
        fetch(`${API_BASE_URL}/api/videos/sync`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.added > 0) {
                    console.log(`✅ Synced ${data.added} new videos to canvas`);
                }
            })
            .catch(err => console.error('Failed to sync videos:', err));
    }, []);

    return (
        <div
            style={{ flex: 1, background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}
            onClick={() => contextMenu && setContextMenu(null)}
        >
            <CanvasToolbar
                pageId={pageId}
                selectedIds={selectedIds}
                elements={elements}
                chapters={chapters}
                allPages={allPages}
                isMoveMenuOpen={isMoveMenuOpen}
                onToggleMoveMenu={setIsMoveMenuOpen}
                onAddZone={handleAddZone}
                onAddText={handleAddText}
                onAddArrow={handleAddArrow}
                onAddMedia={() => fileInputRef.current?.click()}
                onUpdateStyle={handleUpdateStyle}
                onLocalVideoControl={handleLocalVideoControl}
                onReorder={handleReorder}
                onDelete={handleDeleteElements}
                onDownload={handleDownload}
                onCreateGrid={handleCreateGrid}
                onSyncVideos={handleSyncVideos}
                onMoveSelectionToPage={handleMoveSelectionToPage}
                onResetSize={handleResetSize}
                onSaveView={handleSaveView}
                onRatingFilterChange={setRatingFilter}
                ratingFilter={ratingFilter}
            />

            {contextMenu && (
                <div style={{
                    position: 'absolute',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    zIndex: 2000,
                    background: '#2c3e50',
                    border: '1px solid #34495e',
                    borderRadius: '4px',
                    padding: '4px 0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    minWidth: '160px'
                }}>
                    <div
                        onClick={() => handleSendToBatch(contextMenu.elementId, 'first')}
                        style={{ padding: '8px 16px', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                        onMouseOver={(e) => (e.currentTarget.style.background = '#34495e')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        Send as first frame
                    </div>
                    <div
                        onClick={() => handleSendToBatch(contextMenu.elementId, 'last')}
                        style={{ padding: '8px 16px', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                        onMouseOver={(e) => (e.currentTarget.style.background = '#34495e')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        Send as last frame
                    </div>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                    <div
                        onClick={() => {
                            setContextMenu(null);
                            if (onOpenBatchManagement) onOpenBatchManagement();
                        }}
                        style={{ padding: '8px 16px', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                        onMouseOver={(e) => (e.currentTarget.style.background = '#34495e')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        Open Batch Management
                    </div>
                </div>
            )}
            <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,video/*" />

            <UploadProgress uploads={uploadsInProgress} />

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
                        }}></textarea>
                )
            }

            {!pageId && <NoPagePlaceholder />}

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
                        const newPos = { x: e.target.x(), y: e.target.y() };
                        setStagePos(newPos);
                        if (pageId) saveViewport(pageId, newPos.x, newPos.y, stageScale);
                    }
                }}
            >
                <Layer>
                    {renderGrid()}
                    {elements.filter(el => {
                        if (ratingFilter === 0) return true;
                        if (el.type !== 'image' && el.type !== 'video') return true;
                        return (el.rating || 0) >= ratingFilter;
                    }).map((el: Element) => {
                        const isSelected = selectedIds.includes(el.id);

                        // Attach ref
                        const attachRef = (node: Konva.Node | null) => {
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
                                    onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(e, el.id)}
                                    onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onTransformEnd={(e: Konva.KonvaEventObject<Event>) => handleTransformEnd(el.id, e.target)}
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
                                    onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(e, el.id)}
                                    onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onDblClick={() => { setEditingId(el.id); setEditText(el.text || ''); }}
                                    onTransformEnd={(e: Konva.KonvaEventObject<Event>) => handleTransformEnd(el.id, e.target)}
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
                                        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(e, el.id)}
                                        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                        onTransformEnd={(e: Konva.KonvaEventObject<Event>) => handleTransformEnd(el.id, e.target)}
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
                                                onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
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
                                                onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
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
                                    type={el.type as 'image' | 'video'}
                                    x={el.x}
                                    y={el.y}
                                    width={el.width}
                                    height={el.height}
                                    url={el.url || ''}
                                    isSelected={isSelected}
                                    draggable={!editingId}
                                    onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
                                        e.cancelBubble = true;
                                        if (e.evt.ctrlKey) {
                                            if (isSelected) {
                                                setSelectedIds(prev => prev.filter(id => id !== el.id));
                                            } else {
                                                setSelectedIds(prev => [...prev, el.id]);
                                            }
                                        } else {
                                            if (el.type === 'video') {
                                                handleLocalVideoControl(el.id, { isPlaying: !el.isPlaying });
                                            }
                                            setSelectedIds([el.id]);
                                        }
                                    }}
                                    onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e.target.x(), e.target.y())}
                                    onTransformEnd={(e: Konva.KonvaEventObject<Event>) => handleTransformEnd(el.id, e.target)}
                                    isPlaying={el.isPlaying}
                                    isMuted={el.isMuted}
                                    rating={el.rating}
                                    onUpdateElement={handleUpdateStyle}
                                    onContextMenu={(e: Konva.KonvaEventObject<PointerEvent>) => {
                                        e.evt.preventDefault();
                                        const stage = e.target.getStage();
                                        if (!stage) return;
                                        const pos = stage.getPointerPosition();
                                        if (!pos) return;
                                        setContextMenu({
                                            x: pos.x,
                                            y: pos.y,
                                            elementId: el.id
                                        });
                                    }}
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
