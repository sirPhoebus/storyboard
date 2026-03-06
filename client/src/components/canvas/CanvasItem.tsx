
import React, { memo } from 'react';
import { Rect, Text, Arrow, Circle } from 'react-konva';
import Konva from 'konva';
import MultimediaElement from '../MultimediaElement';
import type { Element } from '../../types';

const arePointsEqual = (a?: number[], b?: number[]) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

interface CanvasItemProps {
    element: Element;
    isSelected: boolean;
    isEditing: boolean;
    onRef: (node: Konva.Node | null) => void;
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>, id: string) => void;
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>, id: string) => void;
    onDragEnd: (id: string, x: number, y: number) => void;
    onTransformEnd: (id: string, node: Konva.Node) => void;
    onClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void;
    onDblClick?: (element: Element) => void;
    onArrowPointDrag?: (id: string, index: number, x: number, y: number) => void;
    onArrowPointDragEnd?: (id: string) => void;
    onPlayRequest?: (url: string, title?: string) => void;
    onUpdateElement?: (id: string, style: Partial<Element>) => void;
    onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>, id: string) => void;
}

const CanvasItem: React.FC<CanvasItemProps> = memo(({
    element: el,
    isSelected,
    isEditing,
    onRef,
    onDragStart,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    onClick,
    onDblClick,
    onArrowPointDrag,
    onArrowPointDragEnd,
    onPlayRequest,
    onUpdateElement,
    onContextMenu
}) => {

    const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => onDragMove(e, el.id);
    const handleDragStartWrapped = (e: Konva.KonvaEventObject<DragEvent>) => onDragStart(e, el.id);
    const handleDragEndWrapped = (e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(el.id, e.target.x(), e.target.y());
    const handleTransformEndWrapped = (e: Konva.KonvaEventObject<Event>) => onTransformEnd(el.id, e.target as Konva.Node);
    const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => onClick(e, el.id);
    const handleDblClick = () => onDblClick && onDblClick(el);
    const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => onContextMenu && onContextMenu(e, el.id);

    if (el.type === 'rect') {
        return (
            <Rect
                ref={onRef}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                fill={el.fill || 'transparent'}
                stroke={el.stroke || 'white'}
                strokeWidth={el.strokeWidth || 1}
                draggable={!isEditing}
                onClick={handleClick}
                onDragStart={handleDragStartWrapped}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEndWrapped}
                onTransformEnd={handleTransformEndWrapped}
                onContextMenu={handleContextMenu}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
            />
        );
    }

    if (el.type === 'text') {
        return (
            <Text
                ref={onRef}
                x={el.x}
                y={el.y}
                text={el.text}
                fontSize={el.fontSize || 16}
                fontStyle={el.fontStyle}
                fill={el.fill || "white"}
                draggable={!isEditing}
                onClick={handleClick}
                onDragStart={handleDragStartWrapped}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEndWrapped}
                onDblClick={handleDblClick}
                onTransformEnd={handleTransformEndWrapped}
                onContextMenu={handleContextMenu}
                perfectDrawEnabled={false}
            />
        );
    }

    if (el.type === 'arrow') {
        const points = el.points || [];
        return (
            <React.Fragment>
                <Arrow
                    ref={onRef}
                    x={el.x}
                    y={el.y}
                    points={points}
                    stroke={isSelected ? '#3498db' : 'white'}
                    strokeWidth={el.strokeWidth || 5}
                    fill="white"
                    draggable={!isEditing}
                    onClick={handleClick}
                    onDragStart={handleDragStartWrapped}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEndWrapped}
                    onTransformEnd={handleTransformEndWrapped}
                    onContextMenu={handleContextMenu}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                />
                {isSelected && points.length >= 4 && onArrowPointDrag && onArrowPointDragEnd && (
                    <>
                        <Circle
                            x={el.x + points[0]}
                            y={el.y + points[1]}
                            radius={6}
                            fill="#3498db"
                            stroke="white"
                            strokeWidth={2}
                            draggable
                            onDragMove={(e) => onArrowPointDrag(el.id, 0, e.target.x(), e.target.y())}
                            onDragEnd={() => onArrowPointDragEnd(el.id)}
                        />
                        <Circle
                            x={el.x + points[points.length - 2]}
                            y={el.y + points[points.length - 1]}
                            radius={6}
                            fill="#3498db"
                            stroke="white"
                            strokeWidth={2}
                            draggable
                            onDragMove={(e) => onArrowPointDrag(el.id, (points.length / 2) - 1, e.target.x(), e.target.y())}
                            onDragEnd={() => onArrowPointDragEnd(el.id)}
                        />
                    </>
                )}
            </React.Fragment>
        );
    }

    if (el.type === 'image' || el.type === 'video' || el.type === 'video-card') {
        return (
            <MultimediaElement
                ref={onRef as any}
                id={el.id}
                type={el.type as 'image' | 'video' | 'video-card'}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                url={el.url || ''}
                originalWidth={el.originalWidth}
                originalHeight={el.originalHeight}
                title={el.text}
                sourceVideoUrl={el.sourceVideoUrl}
                onPlayRequest={onPlayRequest}
                isSelected={isSelected}
                draggable={!isEditing}
                onClick={handleClick}
                onDblClick={el.type === 'image' ? handleDblClick : undefined}
                onUpdateElement={onUpdateElement}
                onDragStart={handleDragStartWrapped}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEndWrapped}
                onContextMenu={handleContextMenu}
                // Pass props needed for video state
                isPlaying={el.isPlaying}
                isMuted={el.isMuted}
                rating={el.rating}
            />
        );
    }

    return null;
}, (prevProps, nextProps) => {
    // Custom comparison for performance
    // Return true if props are equal (do not re-render)

    // Check simple primitives first
    if (prevProps.isSelected !== nextProps.isSelected) return false;
    if (prevProps.isEditing !== nextProps.isEditing) return false;

    // Deep check element properties that affect rendering
    const pEl = prevProps.element;
    const nEl = nextProps.element;

    if (pEl === nEl) return true; // Reference equality

    // Check fields that matter for rendering
    return (
        pEl.type === nEl.type &&
        pEl.x === nEl.x &&
        pEl.y === nEl.y &&
        pEl.width === nEl.width &&
        pEl.height === nEl.height &&
        pEl.fill === nEl.fill &&
        pEl.stroke === nEl.stroke &&
        pEl.strokeWidth === nEl.strokeWidth &&
        pEl.text === nEl.text &&
        pEl.fontSize === nEl.fontSize &&
        pEl.fontStyle === nEl.fontStyle &&
        pEl.url === nEl.url &&
        pEl.originalWidth === nEl.originalWidth &&
        pEl.originalHeight === nEl.originalHeight &&
        pEl.sourceVideoUrl === nEl.sourceVideoUrl &&
        pEl.isPlaying === nEl.isPlaying &&
        pEl.isMuted === nEl.isMuted &&
        pEl.rating === nEl.rating &&
        arePointsEqual(pEl.points, nEl.points)
    );
});

export default CanvasItem;
