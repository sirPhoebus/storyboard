import React, { useEffect, useRef, useState, forwardRef } from 'react';
import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';

interface MultimediaElementProps {
    id: string;
    type: 'image' | 'video';
    x: number;
    y: number;
    width?: number;
    height?: number;
    url: string;
    draggable?: boolean;
    onDragEnd?: (e: any) => void;
    onTransformEnd?: (e: any) => void;
    isSelected?: boolean;
    onClick?: () => void;
    // Video controls
    isPlaying?: boolean;
    isMuted?: boolean;
}

const MultimediaElement = forwardRef<any, MultimediaElementProps>(({
    type,
    url,
    x,
    y,
    width = 200,
    height = 150,
    draggable,
    onDragEnd,
    onTransformEnd,
    isSelected,
    onClick,
    isPlaying = true, // Default to auto-play for now, or controllable
    isMuted = true,
}, ref) => {
    const [image] = useImage(url);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
    const imageRef = useRef<any>(null);

    useEffect(() => {
        if (type === 'video' && videoElement) {
            if (isPlaying) videoElement.play().catch(() => { });
            else videoElement.pause();
            videoElement.muted = isMuted;
        }
    }, [isPlaying, isMuted, videoElement, type]);

    useEffect(() => {
        if (type === 'video') {
            const video = document.createElement('video');
            video.src = url;
            video.crossOrigin = 'Anonymous';
            video.loop = true;
            video.muted = isMuted; // Initial state
            // video.play(); // Handled by other effect
            setVideoElement(video);
            videoRef.current = video;

            const anim = new (window as any).Konva.Animation(() => {
                // This forces re-draw
            }, imageRef.current?.getLayer());

            anim.start();

            return () => {
                anim.stop();
                video.pause();
                video.src = '';
                video.load();
            };
        }
    }, [url, type]);

    if (type === 'image') {
        return (
            <KonvaImage
                ref={ref}
                image={image}
                x={x}
                y={y}
                width={width}
                height={height}
                stroke={isSelected ? '#3498db' : undefined}
                strokeWidth={isSelected ? 4 : 0}
                draggable={draggable}
                onDragEnd={onDragEnd}
                onTransformEnd={onTransformEnd}
                onClick={onClick}
            />
        );
    }

    return (
        <KonvaImage
            ref={ref || imageRef}
            image={videoElement || undefined}
            x={x}
            y={y}
            width={width}
            height={height}
            stroke={isSelected ? '#3498db' : undefined}
            strokeWidth={isSelected ? 4 : 0}
            draggable={draggable}
            onDragEnd={onDragEnd}
            onTransformEnd={onTransformEnd}
            onClick={onClick}
        />
    );
});

MultimediaElement.displayName = 'MultimediaElement';

export default MultimediaElement;
