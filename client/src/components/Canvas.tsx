import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Stage, Layer, Transformer, Rect, Line as KonvaLine } from 'react-konva';
import Konva from 'konva';
import { Socket } from 'socket.io-client';
import CanvasItem from './canvas/CanvasItem';
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
    currentProjectId: string | null;
}

import type { UploadState } from './canvas/UploadProgress';
interface RawElement extends Partial<Element> {
    content: string | Record<string, unknown>;
}

const Canvas: React.FC<CanvasProps> = ({ pageId, isSidebarCollapsed, sidebarWidth, chapters, allPages, onSelectPage, onOpenBatchManagement, socket, currentProjectId }) => {


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

    // State Refs for stable handlers
    const elementsRef = useRef(elements);
    const selectedIdsRef = useRef(selectedIds);
    const historyRef = useRef(history);

    // Keep refs in sync
    elementsRef.current = elements;
    selectedIdsRef.current = selectedIds;
    historyRef.current = history;

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

    const saveToHistory = useCallback(() => {
        setHistory(prev => [...prev.slice(-19), elementsRef.current]);
        setRedoStack([]);
    }, []);


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
            .then((data: unknown) => {
                if (Array.isArray(data)) {
                    setElements((data as RawElement[]).map(el => {
                        const content = typeof el.content === 'string' ? JSON.parse(el.content) : el.content;
                        return {
                            ...content, // stale data from JSON
                            ...el,      // fresh data from table columns (id, type, x, y, width, height, etc.)
                            content: content // Keep parsed content for reference
                        };
                    }));
                } else {
                    console.error('API Error: Expected array for elements, got:', data);
                    setElements([]);
                }
                setHistory([]);
                setRedoStack([]);
            })
            .catch(err => {
                console.error('Failed to fetch elements:', err);
                setElements([]);
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

    const handleDragStart = useCallback(() => {
        saveToHistory();
    }, [saveToHistory]);

    const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>, id: string) => {
        const elements = elementsRef.current;
        const selectedIds = selectedIdsRef.current;

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
    }, []);

    const handleDragEnd = useCallback((id: string, x: number, y: number) => {
        const elements = elementsRef.current;
        const selectedIds = selectedIdsRef.current;

        // Snap to grid calc
        let finalX = x;
        let finalY = y;

        // Note: snapToGrid state is not ref-tracked but it toggles rarely. 
        // Ideally we should use a ref for snapToGrid too if we want pure stability, 
        // but rebuilding this on snap toggle is fine.
        // We'll trust closure for snapToGrid for now or add to dependency.
        // Actually, to be safe, let's use the current value from closure, 
        // so we must add snapToGrid to deps.
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
            }
        });

        // Smart Linking Logic - simplified for performance/readability 
        // (Copied from original but using local vars)
        // Note: The original logic was quite complex and used simulation. 
        // We will keep it but accessing 'elements' (ref) for Arrow calculation logic.

        // ... (Smart linking kept same as original logic but referencing scoped variables) ...
        // For brevity in this tool call, I'll allow the arrow update to trigger a second render via setElements
        // or we could combine. But let's stick to the structure.

        const movedIds = elementsToUpdate.map(u => u.id);
        const arrowsToUpdate: Partial<Element>[] = [];

        // Simulation using current elements ref + updates
        const nextElements = elements.map(el => {
            const update = elementsToUpdate.find(u => u.id === el.id);
            return update ? { ...el, x: update.x, y: update.y } : el;
        });

        nextElements.filter(el => el.type === 'arrow').forEach(arrow => {
            // ... Existing arrow logic ...
            if (arrow.start_element_id && movedIds.includes(arrow.start_element_id)) {
                const startEl = nextElements.find(el => el.id === arrow.start_element_id);
                if (startEl && arrow.points) {
                    const newX = startEl.x + startEl.width / 2;
                    const newY = startEl.y + startEl.height / 2;
                    const dx = newX - arrow.x;
                    const dy = newY - arrow.y;

                    arrowsToUpdate.push({
                        id: arrow.id,
                        x: newX,
                        y: newY,
                        points: arrow.points.map((p, i) => {
                            if (i < 2) return 0;
                            if (i % 2 === 0) return p - dx;
                            return p - dy;
                        })
                    });
                }
            }
            if (arrow.end_element_id && movedIds.includes(arrow.end_element_id)) {
                const endEl = nextElements.find(el => el.id === arrow.end_element_id);
                if (endEl && arrow.points) {
                    const targetX = endEl.x + endEl.width / 2;
                    const targetY = endEl.y + endEl.height / 2;
                    const newPoints = [...arrow.points];

                    // Check if we are already moving this arrow (e.g. start also moved)
                    const existingUpdate = arrowsToUpdate.find(u => u.id === arrow.id);
                    const baseArrowX = existingUpdate ? (existingUpdate.x || 0) : arrow.x;
                    const baseArrowY = existingUpdate ? (existingUpdate.y || 0) : arrow.y;

                    newPoints[newPoints.length - 2] = targetX - baseArrowX;
                    newPoints[newPoints.length - 1] = targetY - baseArrowY;

                    if (existingUpdate) {
                        existingUpdate.points = newPoints;
                    } else {
                        arrowsToUpdate.push({ id: arrow.id, points: newPoints });
                    }
                }
            }
        });

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

    }, [snapToGrid, gridSize, socket]); // Dependencies

    const handleTransformEnd = useCallback((id: string, node: Konva.Node) => {
        saveToHistory();
        const elements = elementsRef.current;
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
    }, [saveToHistory, snapToGrid, gridSize, socket]);

    const handleElementClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
        e.cancelBubble = true;
        const selectedIds = selectedIdsRef.current;
        if (e.evt.ctrlKey) {
            if (selectedIds.includes(id)) {
                setSelectedIds(prev => prev.filter(mid => mid !== id));
            } else {
                setSelectedIds(prev => [...prev, id]);
            }
        } else {
            setSelectedIds([id]);
        }
    }, []);

    const handleDblClick = useCallback((id: string, text: string) => {
        setEditingId(id);
        setEditText(text);
    }, []);

    const handleContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>, id: string) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        setContextMenu({
            x: pos.x,
            y: pos.y,
            elementId: id
        });
    }, []);

    const handleArrowPointDrag = useCallback((id: string, pointIndex: number, x: number, y: number) => {
        setElements(prev => prev.map(el => {
            if (el.id === id && el.points) {
                const newPoints = [...el.points];
                newPoints[pointIndex * 2] = x - el.x;
                newPoints[pointIndex * 2 + 1] = y - el.y;
                return { ...el, points: newPoints };
            }
            return el;
        }));
    }, []);

    const handleArrowPointDragEnd = useCallback((id: string) => {
        const elements = elementsRef.current;
        const element = elements.find(el => el.id === id);
        if (element && socket) {
            socket.emit('element:update', { id, content: { points: element.points } });
        }
    }, [socket]);

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
            fontSize: 48,
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
        const concurrencyLimit = 3; // Limit simultaneous uploads/processing
        const results: ({ type: string; width: number; height: number; url: string } | null)[] = [];

        // Helper function to process a single file
        const processFile = async (file: File) => {
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

                    formData.append('projectId', currentProjectId || 'default-project');
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
                let finalWidth: number | undefined;
                let finalHeight: number | undefined;

                const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

                if (elementType === 'image') {
                    const img = new Image();
                    img.src = fullUrl;
                    await new Promise((resolve, reject) => {
                        img.onload = () => {
                            const ratio = img.width / img.height;
                            const maxWidth = 533;
                            if (ratio > 1) {
                                finalWidth = maxWidth;
                                finalHeight = Math.round(maxWidth / ratio);
                            } else {
                                finalHeight = maxWidth;
                                finalWidth = Math.round(maxWidth * ratio);
                            }
                            resolve(null);
                        };
                        img.onerror = () => reject(new Error('Failed to load image metadata'));
                    });
                } else if (elementType === 'video') {
                    const video = document.createElement('video');
                    video.preload = 'metadata'; // Explicitly hint to load metadata
                    video.src = fullUrl;
                    await new Promise((resolve, reject) => {
                        video.onloadedmetadata = () => {
                            const ratio = video.videoWidth / video.videoHeight;
                            const maxWidth = 533;
                            if (ratio > 1) {
                                finalWidth = maxWidth;
                                finalHeight = Math.round(maxWidth / ratio);
                            } else {
                                finalHeight = maxWidth;
                                finalWidth = Math.round(maxWidth * ratio);
                            }
                            resolve(null);
                        };
                        video.onerror = () => reject(new Error('Failed to load video metadata'));
                        // Add a timeout fallback for video metadata loading
                        setTimeout(() => reject(new Error('Timeout loading video metadata')), 10000);
                    });
                }

                if (!finalWidth || !finalHeight) {
                    throw new Error('Could not determine asset dimensions');
                }

                setUploadsInProgress(prev =>
                    prev.map(u => u.id === uploadId ? { ...u, status: 'completed' } : u)
                );

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
        };

        // Execute with concurrency limit
        for (let i = 0; i < fileList.length; i += concurrencyLimit) {
            const batch = fileList.slice(i, i + concurrencyLimit);
            const batchResults = await Promise.all(batch.map(file => processFile(file)));
            results.push(...batchResults);
        }

        const validResults = results.filter(Boolean);

        const baseX = 100;
        const baseY = 100;
        const spacing = 20;
        const columns = 5;

        // Calculate layout start position based on existing elements?
        // For now, simpler to just start freshly or append. 
        // Existing logic used `currentX/Y` but they were reset. 
        // Let's stick to the grid logic but be aware it might overlap if we don't check existing.
        // The original code reset variables, so I will too.

        let col = 0;
        let maxRowHeight = 0;
        let currentX = baseX;
        let currentY = baseY;

        // If there are existing elements, try to start below them?
        // But the user just wants them added. The visual pile-up is okay if consistent with previous behavior.
        // Actually, let's just execute the placement logic.

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


    const visibleElements = useMemo(() => {
        return elements.filter(el => {
            if (ratingFilter === 0) return true;
            if (el.type !== 'image' && el.type !== 'video') return true;
            return (el.rating || 0) >= ratingFilter;
        });
    }, [elements, ratingFilter]);

    const handleUpdateStyle = (id: string, style: Partial<Element>) => {
        saveToHistory();
        setElements(prev => prev.map(el => (el.id === id ? { ...el, ...style } : el)));
        if (socket) socket.emit('element:update', { id, ...style });
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
            if (node instanceof Konva.Group && (node as Konva.Group & { _innerImage?: Konva.Image })._innerImage) {
                node = (node as Konva.Group & { _innerImage: Konva.Image })._innerImage;
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


    const handleSendToBatch = (elementId: string, role: 'first' | 'last' | 'middle') => {
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
                    <div
                        onClick={() => handleSendToBatch(contextMenu.elementId, 'middle')}
                        style={{ padding: '8px 16px', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                        onMouseOver={(e) => (e.currentTarget.style.background = '#34495e')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        add a middle image
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
                    {visibleElements.map((el: Element) => (
                        <CanvasItem
                            key={el.id}
                            element={el}
                            isSelected={selectedIds.includes(el.id)}
                            isEditing={editingId === el.id}
                            onRef={(node) => {
                                if (elementRefs.current) {
                                    if (node) elementRefs.current[el.id] = node;
                                    else delete elementRefs.current[el.id];
                                }
                            }}
                            onDragStart={handleDragStart}
                            onDragMove={handleDragMove}
                            onDragEnd={handleDragEnd}
                            onTransformEnd={handleTransformEnd}
                            onClick={handleElementClick}
                            onDblClick={handleDblClick}
                            onArrowPointDrag={handleArrowPointDrag}
                            onArrowPointDragEnd={handleArrowPointDragEnd}
                            onUpdateElement={handleUpdateStyle}
                            onContextMenu={handleContextMenu}
                        />
                    ))}

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
