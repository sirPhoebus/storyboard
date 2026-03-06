import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Stage, Layer, FastLayer, Transformer, Rect, Line as KonvaLine } from 'react-konva';
import Konva from 'konva';
import { Socket } from 'socket.io-client';
import CanvasItem from './canvas/CanvasItem';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { UploadProgress } from './canvas/UploadProgress';
import { NoPagePlaceholder } from './canvas/NoPagePlaceholder';
import { API_BASE_URL } from '../config';
import type { Element, Chapter, Page } from '../types';
import { fetchCachedJson, readCachedData, setCachedData } from '../utils/queryCache';

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

const mapRawElements = (data: RawElement[]): Element[] =>
    data.map((el) => {
        const content = typeof el.content === 'string' ? JSON.parse(el.content) : el.content;
        return {
            ...content,
            ...el,
            content
        };
    });

const areNumberArraysEqual = (a?: number[], b?: number[]) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const mergeDefinedFields = <T extends object>(...sources: Array<Partial<T> | undefined>) => {
    const merged: Partial<T> = {};
    sources.forEach((source) => {
        if (!source) return;
        Object.entries(source).forEach(([key, value]) => {
            if (value !== undefined) {
                (merged as Record<string, unknown>)[key] = value;
            }
        });
    });
    return merged;
};

const hasElementPatchChanges = (element: Element, patch: Partial<Element>) =>
    Object.entries(patch).some(([key, value]) => {
        const currentValue = (element as unknown as Record<string, unknown>)[key];
        if (key === 'points') {
            return !areNumberArraysEqual(currentValue as number[] | undefined, value as number[] | undefined);
        }
        return currentValue !== value;
    });

const isMediaElementType = (type: string) => type === 'image' || type === 'video' || type === 'video-card';

const isElementInViewport = (
    element: Element,
    viewport: { left: number; top: number; right: number; bottom: number }
) => !(
    element.x > viewport.right ||
    element.x + element.width < viewport.left ||
    element.y > viewport.bottom ||
    element.y + element.height < viewport.top
);

const scaleForViewport = (baseSize: number, scale: number, minSize: number, maxSize: number) => {
    const safeScale = scale > 0 ? scale : 1;
    return Math.round(Math.max(minSize, Math.min(maxSize, baseSize / safeScale)));
};

const getGridGroupingKey = (element: Element) => {
    const width = Math.max(1, element.width);
    const height = Math.max(1, element.height);
    const aspectRatio = width / height;
    const roundedRatio = Math.round(aspectRatio * 4) / 4;
    const areaBucket = Math.round((width * height) / 50000);
    return `${roundedRatio}:${areaBucket}`;
};

const normalizeViewportValue = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
};

const sanitizeViewport = (viewport: { x?: unknown; y?: unknown; scale?: unknown } | null) => {
    if (!viewport) return null;

    const x = normalizeViewportValue(viewport.x);
    const y = normalizeViewportValue(viewport.y);
    const scale = normalizeViewportValue(viewport.scale);

    if (x === null || y === null || scale === null) return null;
    if (scale < 0.1 || scale > 8) return null;
    if (Math.abs(x) > 50000 || Math.abs(y) > 50000) return null;

    return { x, y, scale };
};

const mediaDimensionCacheKey = (url: string) => `media-dim:${url}`;

const readMediaDimensions = (url: string) => readCachedData<{ width: number; height: number }>(mediaDimensionCacheKey(url));

const storeMediaDimensions = (url: string, width: number, height: number) => {
    setCachedData(mediaDimensionCacheKey(url), { width, height }, 7 * 24 * 60 * 60 * 1000);
};

const getMediaSourceUrl = (element: Element) =>
    element.type === 'video-card' && element.sourceVideoUrl ? element.sourceVideoUrl : element.url;

const resolveNativeMediaDimensions = async (element: Element) => {
    const sourceUrl = getMediaSourceUrl(element);
    if (!sourceUrl) return null;

    const cached = readMediaDimensions(sourceUrl);
    if (cached?.width && cached?.height) {
        return cached;
    }

    const fullUrl = sourceUrl.startsWith('http') ? sourceUrl : `${API_BASE_URL}${sourceUrl}`;

    const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
        if (element.type === 'image') {
            const img = new window.Image();
            img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
            img.onerror = () => resolve(null);
            img.src = fullUrl;
            return;
        }

        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
        video.onerror = () => resolve(null);
        video.src = fullUrl;
    });

    if (dimensions?.width && dimensions?.height) {
        storeMediaDimensions(sourceUrl, dimensions.width, dimensions.height);
    }

    return dimensions;
};

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

    // State Refs for stable handlers
    const elementsRef = useRef(elements);
    const selectedIdsRef = useRef(selectedIds);
    const historyRef = useRef(history);
    const pageIdRef = useRef(pageId);

    // Keep refs in sync
    elementsRef.current = elements;
    selectedIdsRef.current = selectedIds;
    historyRef.current = history;
    pageIdRef.current = pageId;

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
    const [middleMenuDisabledReason, setMiddleMenuDisabledReason] = useState<string | null>(null);
    const [videoModal, setVideoModal] = useState<{ url: string; title?: string } | null>(null);
    const [imageModalId, setImageModalId] = useState<string | null>(null);
    const isMountedRef = useRef(true);
    const uploadCleanupTimersRef = useRef<number[]>([]);
    const gridSize = 20;

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            uploadCleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            uploadCleanupTimersRef.current = [];
        };
    }, []);

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
                return sanitizeViewport(JSON.parse(saved));
            } catch (e) {
                console.warn('Failed to parse viewport state', e);
            }
        }

        // 2. Try Server Data
        const page = allPages.find(p => p.id === id);
        if (page && page.viewport_scale) {
            return sanitizeViewport({
                x: page.viewport_x || 0,
                y: page.viewport_y || 0,
                scale: page.viewport_scale
            });
        }

        return null;
    }, [allPages]);

    const saveToHistory = useCallback(() => {
        setHistory(prev => [...prev.slice(-19), elementsRef.current]);
        setRedoStack([]);
    }, []);

    const applyElementPatch = useCallback((id: string, patch: Partial<Element>) => {
        setElements((prev) => {
            let changed = false;
            const next = prev.map((el) => {
                if (el.id !== id) return el;
                if (!hasElementPatchChanges(el, patch)) return el;
                changed = true;
                return { ...el, ...patch };
            });
            return changed ? next : prev;
        });
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

        const cacheKey = `elements:${pageId}`;
        const cachedElements = readCachedData<Element[]>(cacheKey);
        if (Array.isArray(cachedElements)) {
            setElements(cachedElements);
        }

        fetchCachedJson<RawElement[]>(
            cacheKey,
            `${API_BASE_URL}/api/elements/${pageId}`,
            undefined,
            { ttlMs: 15_000 }
        )
            .then((data: unknown) => {
                if (Array.isArray(data)) {
                    const next = mapRawElements(data as RawElement[]);
                    setElements(next);
                    setCachedData(cacheKey, next, 15_000);
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
        if (!socket) return;

        const handleSocketMove = (data: { id: string, x: number, y: number }) => {
            applyElementPatch(data.id, { x: data.x, y: data.y });
            const currentPageId = pageIdRef.current;
            const cacheKey = currentPageId ? `elements:${currentPageId}` : null;
            const cached = cacheKey ? readCachedData<Element[]>(cacheKey) : null;
            if (cacheKey && Array.isArray(cached)) {
                setCachedData(cacheKey, cached.map((el) => el.id === data.id ? { ...el, x: data.x, y: data.y } : el), 15_000);
            }
        };

        const handleSocketUpdate = (data: { id: string, content?: Record<string, unknown> } & Partial<Element>) => {
            const { content, id, ...otherFields } = data;
            const patch = mergeDefinedFields<Element>(content as Partial<Element> | undefined, otherFields);
            if (Object.keys(patch).length === 0) return;
            applyElementPatch(id, patch);
            const currentPageId = pageIdRef.current;
            const cacheKey = currentPageId ? `elements:${currentPageId}` : null;
            const cached = cacheKey ? readCachedData<Element[]>(cacheKey) : null;
            if (cacheKey && Array.isArray(cached)) {
                setCachedData(cacheKey, cached.map((el) => el.id === id ? { ...el, ...patch } : el), 15_000);
            }
        };

        const handleSocketAdd = (data: Element & { content: Record<string, unknown>, pageId: string }) => {
            console.log('📥 Client received element:add:', data.id, 'for page:', data.pageId, 'current page:', pageId);
            if (data.pageId !== pageIdRef.current) {
                console.log('⏭️ Skipping element:add - different page');
                return;
            }
            setElements((prev: Element[]) => {
                if (prev.find(el => el.id === data.id)) {
                    console.log('⏭️ Element already exists, skipping');
                    return prev;
                }
                console.log('✅ Adding new element to canvas');
                const next = [...prev, { ...data, ...data.content }];
                setCachedData(`elements:${data.pageId}`, next, 15_000);
                return next;
            });
        };

        const handleSocketDelete = (data: { id: string }) => {
            setElements((prev: Element[]) => {
                // Only delete if the element exists in current page
                const elementExists = prev.some(el => el.id === data.id);
                if (!elementExists) {
                    console.log('⏭️ Skipping element:delete - element not on this page');
                    return prev;
                }
                console.log('🗑️ Deleting element:', data.id);
                const next = prev.filter(el => el.id !== data.id);
                const currentPageId = pageIdRef.current;
                if (currentPageId) {
                    setCachedData(`elements:${currentPageId}`, next, 15_000);
                }
                return next;
            });
            if (selectedIdsRef.current.includes(data.id)) {
                setSelectedIds(prev => prev.filter(id => id !== data.id));
            }
        };

        const handleSocketReorder = (data: { pageId: string, order: string[] }) => {
            if (data.pageId !== pageIdRef.current) return;
            setElements(prev => {
                const elementMap = new Map(prev.map(el => [el.id, el]));
                const reordered = data.order.map(id => elementMap.get(id)).filter(Boolean) as Element[];
                const unchanged = reordered.length === prev.length && reordered.every((el, index) => el === prev[index]);
                if (!unchanged) {
                    setCachedData(`elements:${data.pageId}`, reordered, 15_000);
                }
                return unchanged ? prev : reordered;
            });
        };

        socket.on('element:move', handleSocketMove);
        socket.on('element:update', handleSocketUpdate);
        socket.on('element:add', handleSocketAdd);
        socket.on('element:delete', handleSocketDelete);
        socket.on('element:reorder', handleSocketReorder);

        return () => {
            socket.off('element:move', handleSocketMove);
            socket.off('element:update', handleSocketUpdate);
            socket.off('element:add', handleSocketAdd);
            socket.off('element:delete', handleSocketDelete);
            socket.off('element:reorder', handleSocketReorder);
        };
    }, [socket, applyElementPatch]);

    // Sync transformer to selected elements
    useEffect(() => {
        if (transformerRef.current) {
            const selectedNodes = selectedIds
                .filter(id => {
                    const element = elementsRef.current.find(el => el.id === id);
                    return element ? !isMediaElementType(element.type) : false;
                })
                .map(id => elementRefs.current[id])
                .filter(Boolean);
            transformerRef.current.nodes(selectedNodes);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [selectedIds]);

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

        const arrowUpdatesById = new Map(arrowsToUpdate.map(update => [update.id, update]));

        setElements((prev) => {
            let changed = false;
            const next = prev.map((el) => {
                const moveUpdate = elementsToUpdate.find(u => u.id === el.id);
                const arrowUpdate = el.id ? arrowUpdatesById.get(el.id) : undefined;
                if (!moveUpdate && !arrowUpdate) return el;

                const patch = mergeDefinedFields<Element>(
                    moveUpdate ? { x: moveUpdate.x, y: moveUpdate.y } : undefined,
                    arrowUpdate as Partial<Element> | undefined
                );

                if (!hasElementPatchChanges(el, patch)) return el;
                changed = true;
                return { ...el, ...patch };
            });
            return changed ? next : prev;
        });

        arrowsToUpdate.forEach(u => {
            if (socket) socket.emit('element:update', { id: u.id, content: u });
        });

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
        } else if (!isMediaElementType(element.type)) {
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
        } else {
            setElements(prev => prev.map(el =>
                el.id === id ? { ...el, x: finalX, y: finalY } : el
            ));

            if (socket) {
                socket.emit('element:update', {
                    id,
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

    const handleDblClick = useCallback((element: Element) => {
        if (element.type === 'text') {
            setEditingId(element.id);
            setEditText(element.text || '');
            return;
        }

        if (element.type === 'image') {
            setImageModalId(element.id);
        }
    }, []);

    const handleContextMenu = useCallback(async (e: Konva.KonvaEventObject<PointerEvent>, id: string) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/batch/tasks?projectId=${encodeURIComponent(currentProjectId || '')}`);
            const tasks = await res.json() as any[];
            const latestOpenTask = Array.isArray(tasks)
                ? tasks.find((task) => ['pending', 'failed'].includes(task.status))
                : null;
            if (!latestOpenTask) {
                setMiddleMenuDisabledReason(null);
            } else if (latestOpenTask.last_frame_url) {
                setMiddleMenuDisabledReason('Not possible: either first frame + last frame OR multi_prompt.');
            } else {
                const refs = Array.isArray(latestOpenTask.middle_frame_urls) ? latestOpenTask.middle_frame_urls : [];
                const maxItems = 3;
                setMiddleMenuDisabledReason(refs.length >= maxItems ? `Maximum images reached for multi_prompt (${maxItems} images max).` : null);
            }
        } catch {
            setMiddleMenuDisabledReason(null);
        }
        setContextMenu({
            x: pos.x,
            y: pos.y,
            elementId: id
        });
    }, [currentProjectId]);

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

    const getViewportSpawnPoint = useCallback(() => {
        const stageWidth = window.innerWidth - (isSidebarCollapsed ? 60 : sidebarWidth);
        const stageHeight = window.innerHeight;
        return {
            x: (-stagePos.x + stageWidth * 0.18) / stageScale,
            y: (-stagePos.y + stageHeight * 0.18) / stageScale
        };
    }, [isSidebarCollapsed, sidebarWidth, stagePos.x, stagePos.y, stageScale]);

    const handleAddZone = () => {
        if (!pageId) return;
        saveToHistory();
        const spawn = getViewportSpawnPoint();
        const width = scaleForViewport(200, stageScale, 80, 1200);
        const height = scaleForViewport(150, stageScale, 60, 900);
        const newZone = {
            pageId,
            type: 'rect',
            x: spawn.x,
            y: spawn.y,
            width,
            height,
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
        const spawn = getViewportSpawnPoint();
        const newText = {
            pageId,
            type: 'text',
            x: spawn.x,
            y: spawn.y,
            fontSize: scaleForViewport(48, stageScale, 18, 240),
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
        const spawn = getViewportSpawnPoint();
        const arrowLength = scaleForViewport(100, stageScale, 40, 800);
        const strokeWidth = scaleForViewport(5, stageScale, 2, 24);
        const newArrow = {
            pageId,
            type: 'arrow',
            x: spawn.x,
            y: spawn.y,
            width: 0,
            height: 0,
            content: { points: [0, 0, arrowLength, 0], fill: 'black', stroke: 'black', strokeWidth }
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
        type UploadedCanvasMedia = {
            type: string;
            width: number;
            height: number;
            url: string;
            sourceVideoUrl?: string;
            sourceKind?: 'imported';
            title?: string;
        };

        const results: (UploadedCanvasMedia | null)[] = [];
        const scheduleUploadCleanup = (uploadId: string, delayMs: number) => {
            const timer = window.setTimeout(() => {
                if (!isMountedRef.current) return;
                setUploadsInProgress(prev => prev.filter(u => u.id !== uploadId));
                uploadCleanupTimersRef.current = uploadCleanupTimersRef.current.filter(id => id !== timer);
            }, delayMs);
            uploadCleanupTimersRef.current.push(timer);
        };

        // Helper function to process a single file
        const processFile = async (file: File) => {
            const uploadId = crypto.randomUUID();
            const newUpload: UploadState = {
                id: uploadId,
                fileName: file.name,
                progress: 0,
                status: 'uploading'
            };

            if (isMountedRef.current) {
                setUploadsInProgress(prev => [...prev, newUpload]);
            }

            try {
                // Use XMLHttpRequest for progress tracking
                const uploadResult = await new Promise<{
                    url: string;
                    type: string;
                    sourceVideoUrl?: string;
                    sourceKind?: 'imported';
                    sourceId?: string;
                    title?: string;
                }>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    const formData = new FormData();

                    formData.append('projectId', currentProjectId || 'default-project');
                    formData.append('file', file);
                    if (file.type.startsWith('video/')) {
                        formData.append('importToProjectVideos', 'true');
                    }

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const progress = Math.round((e.loaded / e.total) * 100);
                            if (isMountedRef.current) {
                                setUploadsInProgress(prev =>
                                    prev.map(u => u.id === uploadId ? { ...u, progress } : u)
                                );
                            }
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

                if (isMountedRef.current) {
                    setUploadsInProgress(prev =>
                        prev.map(u => u.id === uploadId ? { ...u, status: 'processing', progress: 100 } : u)
                    );
                }

                const { url, type, sourceVideoUrl, sourceKind, title } = uploadResult;
                const elementType = sourceVideoUrl
                    ? 'video-card'
                    : (type.startsWith('video') ? 'video' : 'image');
                let finalWidth: number | undefined;
                let finalHeight: number | undefined;

                const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

                if (elementType === 'image') {
                    const img = new Image();
                    img.src = fullUrl;
                    await new Promise((resolve, reject) => {
                        img.onload = () => {
                            finalWidth = img.width;
                            finalHeight = img.height;
                            resolve(null);
                        };
                        img.onerror = () => reject(new Error('Failed to load image metadata'));
                    });
                } else if (elementType === 'video' || elementType === 'video-card') {
                    const video = document.createElement('video');
                    video.preload = 'metadata'; // Explicitly hint to load metadata
                    video.src = sourceVideoUrl ? (sourceVideoUrl.startsWith('http') ? sourceVideoUrl : `${API_BASE_URL}${sourceVideoUrl}`) : fullUrl;
                    await new Promise((resolve, reject) => {
                        const timeoutId = window.setTimeout(() => reject(new Error('Timeout loading video metadata')), 10000);
                        const clearVideoTimeout = () => window.clearTimeout(timeoutId);
                        video.onloadedmetadata = () => {
                            clearVideoTimeout();
                            finalWidth = video.videoWidth;
                            finalHeight = video.videoHeight;
                            resolve(null);
                        };
                        video.onerror = () => {
                            clearVideoTimeout();
                            reject(new Error('Failed to load video metadata'));
                        };
                    });
                }

                if (!finalWidth || !finalHeight) {
                    throw new Error('Could not determine asset dimensions');
                }

                if (isMountedRef.current) {
                    setUploadsInProgress(prev =>
                        prev.map(u => u.id === uploadId ? { ...u, status: 'completed' } : u)
                    );
                }

                scheduleUploadCleanup(uploadId, 2000);

                return {
                    type: elementType,
                    width: finalWidth,
                    height: finalHeight,
                    url,
                    sourceVideoUrl,
                    sourceKind,
                    title: title || file.name.replace(/\.[^.]+$/, '')
                };
            } catch (error) {
                console.error('Upload failed:', error);
                if (isMountedRef.current) {
                    setUploadsInProgress(prev =>
                        prev.map(u => u.id === uploadId ? { ...u, status: 'error', error: 'Upload failed' } : u)
                    );
                }
                scheduleUploadCleanup(uploadId, 5000);
                return null;
            }
        };

        // Execute with concurrency limit
        for (let i = 0; i < fileList.length; i += concurrencyLimit) {
            const batch = fileList.slice(i, i + concurrencyLimit);
            const batchResults = await Promise.all(batch.map(file => processFile(file)));
            results.push(...batchResults);
        }

        const validResults = results.filter((result): result is UploadedCanvasMedia => !!result);

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
            const newElement = {
                pageId,
                type: data.type,
                x: currentX,
                y: currentY,
                width: data.width,
                height: data.height,
                content: data.type === 'video-card'
                    ? {
                        url: data.url,
                        text: data.title,
                        sourceVideoUrl: data.sourceVideoUrl,
                        sourceKind: data.sourceKind,
                        originalWidth: data.width,
                        originalHeight: data.height
                    }
                    : {
                        url: data.url,
                        originalWidth: data.width,
                        originalHeight: data.height
                    }
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

    const stageWidth = window.innerWidth - (isSidebarCollapsed ? 60 : sidebarWidth);
    const stageHeight = window.innerHeight;
    const getCenteredViewport = useCallback(() => ({
        x: stageWidth / 2,
        y: stageHeight / 2
    }), [stageHeight, stageWidth]);
    const viewportOverscan = 600;
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const editingElement = useMemo(
        () => (editingId ? elements.find(el => el.id === editingId) || null : null),
        [editingId, elements]
    );
    const viewportBounds = useMemo(() => {
        const left = -stagePos.x / stageScale - viewportOverscan;
        const top = -stagePos.y / stageScale - viewportOverscan;
        const right = left + stageWidth / stageScale + viewportOverscan * 2;
        const bottom = top + stageHeight / stageScale + viewportOverscan * 2;

        return { left, top, right, bottom };
    }, [stageHeight, stagePos.x, stagePos.y, stageScale, stageWidth]);

    const renderGrid = () => {
        if (!showGrid) return null;

        // Alternative: Efficient grid
        const gridStageWidth = stageWidth / stageScale;
        const gridStageHeight = stageHeight / stageScale;
        const xOffset = -stagePos.x / stageScale;
        const yOffset = -stagePos.y / stageScale;

        const gridLines = [];

        // Vertical
        const startI = Math.floor(xOffset / gridSize) * gridSize;
        for (let i = startI; i < startI + gridStageWidth + gridSize; i += gridSize) {
            gridLines.push(
                <KonvaLine key={`v${i}`} points={[i, yOffset, i, yOffset + gridStageHeight]} stroke="#333" strokeWidth={1} />
            );
        }
        // Horizontal
        const startJ = Math.floor(yOffset / gridSize) * gridSize;
        for (let j = startJ; j < startJ + gridStageHeight + gridSize; j += gridSize) {
            gridLines.push(
                <KonvaLine key={`h${j}`} points={[xOffset, j, xOffset + gridStageWidth, j]} stroke="#333" strokeWidth={1} />
            );
        }
        return gridLines;
    };


    const visibleElements = useMemo(() => {
        return elements.filter(el => {
            if (ratingFilter === 0) return true;
            if (el.type !== 'image' && el.type !== 'video' && el.type !== 'video-card') return true;
            return (el.rating || 0) >= ratingFilter;
        });
    }, [elements, ratingFilter]);

    const renderedElements = useMemo(() => {
        return visibleElements.filter((el) => {
            if (selectedIdsSet.has(el.id) || editingId === el.id) return true;
            if (el.type === 'arrow') return true;
            return isElementInViewport(el, viewportBounds);
        });
    }, [editingId, selectedIdsSet, viewportBounds, visibleElements]);

    const imageModalItems = useMemo(
        () => visibleElements.filter((el) => el.type === 'image' && el.url),
        [visibleElements]
    );
    const imageModalIndex = useMemo(
        () => imageModalItems.findIndex((el) => el.id === imageModalId),
        [imageModalId, imageModalItems]
    );
    const imageModalItem = imageModalIndex >= 0 ? imageModalItems[imageModalIndex] : null;

    const closeImageModal = useCallback(() => {
        setImageModalId(null);
    }, []);

    const showPreviousImage = useCallback(() => {
        if (imageModalItems.length === 0 || imageModalIndex < 0) return;
        const nextIndex = (imageModalIndex - 1 + imageModalItems.length) % imageModalItems.length;
        setImageModalId(imageModalItems[nextIndex].id);
    }, [imageModalIndex, imageModalItems]);

    const showNextImage = useCallback(() => {
        if (imageModalItems.length === 0 || imageModalIndex < 0) return;
        const nextIndex = (imageModalIndex + 1) % imageModalItems.length;
        setImageModalId(imageModalItems[nextIndex].id);
    }, [imageModalIndex, imageModalItems]);

    useEffect(() => {
        if (!imageModalItem) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeImageModal();
            } else if (event.key === 'ArrowLeft') {
                showPreviousImage();
            } else if (event.key === 'ArrowRight') {
                showNextImage();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [closeImageModal, imageModalItem, showNextImage, showPreviousImage]);

    useEffect(() => {
        if (imageModalId && !imageModalItem) {
            setImageModalId(null);
        }
    }, [imageModalId, imageModalItem]);

    const handleUpdateStyle = useCallback((id: string, style: Partial<Element>) => {
        saveToHistory();
        applyElementPatch(id, style);
        if (socket) socket.emit('element:update', { id, ...style });
    }, [applyElementPatch, saveToHistory, socket]);

    const handleDownload = async () => {
        const mediaElements = elements.filter(el => selectedIds.includes(el.id) && (el.type === 'image' || el.type === 'video' || el.type === 'video-card'));
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

    const handlePlayVideoCard = useCallback((url: string, title?: string) => {
        setVideoModal({ url, title });
    }, []);

    const handleResetViewport = useCallback(async () => {
        const centeredViewport = getCenteredViewport();
        const mediaElements = elementsRef.current.filter((element) => isMediaElementType(element.type));
        const resolvedMedia: Array<{ id: string; width: number; height: number } | null> = [];

        for (let i = 0; i < mediaElements.length; i += 4) {
            const batch = mediaElements.slice(i, i + 4);
            const batchResolved = await Promise.all(batch.map(async (element) => {
                const sourceUrl = getMediaSourceUrl(element);
                if (!sourceUrl) return null;

                const cachedDimensions = readMediaDimensions(sourceUrl);
                const dimensions = cachedDimensions || await resolveNativeMediaDimensions(element) || (
                    element.originalWidth && element.originalHeight
                        ? { width: element.originalWidth, height: element.originalHeight }
                        : null
                );

                if (!dimensions?.width || !dimensions?.height) return null;
                if (
                    element.width === dimensions.width &&
                    element.height === dimensions.height &&
                    element.originalWidth === dimensions.width &&
                    element.originalHeight === dimensions.height
                ) {
                    return null;
                }

                return {
                    id: element.id,
                    width: dimensions.width,
                    height: dimensions.height
                };
            }));

            resolvedMedia.push(...batchResolved);
        }

        const mediaPatches = resolvedMedia.filter((item): item is { id: string; width: number; height: number } => !!item);

        setStageScale(1);
        setStagePos(centeredViewport);

        if (mediaPatches.length > 0) {
            saveToHistory();
            setElements((prev) => prev.map((element) => {
                const patch = mediaPatches.find((item) => item.id === element.id);
                if (!patch) return element;
                return {
                    ...element,
                    width: patch.width,
                    height: patch.height,
                    originalWidth: patch.width,
                    originalHeight: patch.height
                };
            }));

            mediaPatches.forEach((patch) => {
                if (socket) {
                    socket.emit('element:update', {
                        id: patch.id,
                        width: patch.width,
                        height: patch.height,
                        content: {
                            width: patch.width,
                            height: patch.height,
                            originalWidth: patch.width,
                            originalHeight: patch.height
                        }
                    });
                }
            });
        }

        if (!pageId) return;

        saveViewport(pageId, centeredViewport.x, centeredViewport.y, 1);
        fetch(`${API_BASE_URL}/api/pages/${pageId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                viewport_x: centeredViewport.x,
                viewport_y: centeredViewport.y,
                viewport_scale: 1
            })
        }).catch((err) => console.error('Failed to reset viewport', err));
    }, [getCenteredViewport, pageId, saveToHistory, socket]);

    const handleCreateGrid = async (rows: number, columns: number) => {
        if (selectedIds.length < 2) return;
        if (rows < 1 || columns < 1) return;
        saveToHistory();

        const selectedElements = elements
            .filter(el => selectedIds.includes(el.id))
            .sort((a, b) => {
                const groupA = getGridGroupingKey(a);
                const groupB = getGridGroupingKey(b);
                if (groupA !== groupB) return groupA.localeCompare(groupB);

                const areaA = a.width * a.height;
                const areaB = b.width * b.height;
                if (areaA !== areaB) return areaB - areaA;

                if (a.height !== b.height) return b.height - a.height;
                if (a.width !== b.width) return b.width - a.width;

                return (a.y - b.y) || (a.x - b.x);
            });

        const spacing = 5;

        // Use the position of the first (top-leftmost) element as the anchor
        const baseX = selectedElements[0].x;
        const baseY = selectedElements[0].y;

        const gridCellCount = rows * columns;
        const columnWidths = Array.from({ length: columns }, () => 0);
        const rowHeights = Array.from({ length: rows }, () => 0);

        selectedElements.forEach((el, index) => {
            const indexInBlock = index % gridCellCount;
            const columnIndex = indexInBlock % columns;
            const rowIndex = Math.floor(indexInBlock / columns);
            columnWidths[columnIndex] = Math.max(columnWidths[columnIndex], el.width);
            rowHeights[rowIndex] = Math.max(rowHeights[rowIndex], el.height);
        });

        const columnOffsets = columnWidths.map((_, index) =>
            columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0) + index * spacing
        );
        const rowOffsets = rowHeights.map((_, index) =>
            rowHeights.slice(0, index).reduce((sum, height) => sum + height, 0) + index * spacing
        );
        const gridBlockWidth = columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * spacing;
        const updates: { id: string, x: number, y: number }[] = [];

        selectedElements.forEach((el, index) => {
            const blockIndex = Math.floor(index / gridCellCount);
            const indexInBlock = index % gridCellCount;
            const columnIndex = indexInBlock % columns;
            const rowIndex = Math.floor(indexInBlock / columns);
            const blockOffsetX = blockIndex * (gridBlockWidth + spacing);
            const x = baseX + blockOffsetX + columnOffsets[columnIndex];
            const y = baseY + rowOffsets[rowIndex];

            updates.push({ id: el.id, x, y });
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




    const handleSendToBatch = (elementId: string, role: 'first' | 'last' | 'middle') => {
        const el = elements.find(item => item.id === elementId);
        if (!el || !el.url) return;
        if (role === 'middle' && middleMenuDisabledReason) {
            alert(middleMenuDisabledReason);
            return;
        }

        fetch(`${API_BASE_URL}/api/batch/add-frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: el.url, role, projectId: currentProjectId })
        })
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to add frame to batch');
                }
                return data;
            })
            .then(() => {
                setContextMenu(null);
                // Optionally show a toast/notification
            })
            .catch(err => {
                alert(err.message || 'Failed to add frame to batch');
                console.error('Failed to add frame to batch:', err);
            });
    };

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
                onMoveSelectionToPage={handleMoveSelectionToPage}
                onResetViewport={handleResetViewport}
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
                        style={{ padding: '8px 16px', color: middleMenuDisabledReason ? '#777' : 'white', cursor: middleMenuDisabledReason ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                        onMouseOver={(e) => (e.currentTarget.style.background = middleMenuDisabledReason ? 'transparent' : '#34495e')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                        title={middleMenuDisabledReason || undefined}
                    >
                        Add image to multi_ptompt
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
                            top: ((editingElement?.y || 0) * stageScale + stagePos.y - 7) + 'px',
                            left: ((editingElement?.x || 0) * stageScale + stagePos.x - 7) + 'px',
                            minWidth: '200px',
                            minHeight: '50px',
                            width: 'auto',
                            height: 'auto',
                            zIndex: 1000,
                            border: '2px solid #3498db',
                            outline: 'none',
                            padding: '5px',
                            margin: '0',
                            fontSize: ((editingElement?.fontSize || 16) * stageScale) + 'px',
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
                width={stageWidth}
                height={stageHeight}
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
                <FastLayer listening={false}>
                    {renderGrid()}
                </FastLayer>
                <Layer>
                    {renderedElements.map((el: Element) => (
                        <CanvasItem
                            key={el.id}
                            element={el}
                            isSelected={selectedIdsSet.has(el.id)}
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
                            onPlayRequest={handlePlayVideoCard}
                            onUpdateElement={handleUpdateStyle}
                            onContextMenu={handleContextMenu}
                        />
                    ))}
                </Layer>

                <FastLayer listening={false}>
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
                </FastLayer>

                <Layer>
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

            {videoModal && (
                <div
                    onClick={() => setVideoModal(null)}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 2500,
                        background: 'rgba(2, 6, 23, 0.82)',
                        backdropFilter: 'blur(10px)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '24px'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(960px, 100%)',
                            borderRadius: '24px',
                            background: '#020617',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid rgba(148, 163, 184, 0.14)' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '11px', color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Playback</div>
                                <div style={{ fontSize: '14px', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{videoModal.title || 'Video'}</div>
                            </div>
                            <button
                                onClick={() => setVideoModal(null)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: '18px' }}
                            >
                                x
                            </button>
                        </div>
                        <div style={{ background: '#000' }}>
                            <video
                                key={videoModal.url}
                                controls
                                autoPlay
                                playsInline
                                preload="metadata"
                                style={{ width: '100%', display: 'block', maxHeight: '80vh' }}
                            >
                                <source src={videoModal.url.startsWith('http') ? videoModal.url : `${API_BASE_URL}${videoModal.url}`} type="video/mp4" />
                            </video>
                        </div>
                    </div>
                </div>
            )}

            {imageModalItem && (
                <div
                    onClick={closeImageModal}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 2450,
                        background: 'rgba(2, 6, 23, 0.78)',
                        backdropFilter: 'blur(8px)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '28px'
                    }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            showPreviousImage();
                        }}
                        style={{
                            position: 'absolute',
                            left: '24px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '56px',
                            height: '56px',
                            borderRadius: '999px',
                            border: '1px solid rgba(148, 163, 184, 0.24)',
                            background: 'rgba(15, 23, 42, 0.72)',
                            color: '#e2e8f0',
                            fontSize: '28px',
                            cursor: 'pointer'
                        }}
                        title="Previous image"
                    >
                        ‹
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            showNextImage();
                        }}
                        style={{
                            position: 'absolute',
                            right: '24px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '56px',
                            height: '56px',
                            borderRadius: '999px',
                            border: '1px solid rgba(148, 163, 184, 0.24)',
                            background: 'rgba(15, 23, 42, 0.72)',
                            color: '#e2e8f0',
                            fontSize: '28px',
                            cursor: 'pointer'
                        }}
                        title="Next image"
                    >
                        ›
                    </button>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(92vw, 1600px)',
                            maxHeight: '92vh',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                            alignItems: 'center'
                        }}
                    >
                        <div
                            style={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                color: '#e2e8f0'
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '11px', color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Image Viewer</div>
                                <div style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {imageModalItem.text || `Image ${imageModalIndex + 1}`}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                    {imageModalIndex + 1} / {imageModalItems.length}
                                </div>
                                <button
                                    onClick={closeImageModal}
                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}
                                >
                                    x
                                </button>
                            </div>
                        </div>
                        <img
                            src={(imageModalItem.url || '').startsWith('http') ? (imageModalItem.url || '') : `${API_BASE_URL}${imageModalItem.url || ''}`}
                            alt={imageModalItem.text || 'Canvas image'}
                            style={{
                                maxWidth: '100%',
                                maxHeight: 'calc(92vh - 56px)',
                                objectFit: 'contain',
                                display: 'block',
                                borderRadius: '18px',
                                boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
                                background: '#020617'
                            }}
                        />
                    </div>
                </div>
            )}
        </div >
    );
};



export default Canvas;

