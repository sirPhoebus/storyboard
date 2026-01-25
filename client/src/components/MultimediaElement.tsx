import { useEffect, useRef, useState, forwardRef } from 'react';
import { Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
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
    onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
    isSelected?: boolean;
    onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    // Video controls
    isPlaying?: boolean;
    isMuted?: boolean;
}

const MultimediaElement = forwardRef<Konva.Image, MultimediaElementProps>(({
    type,
    url,
    x,
    y,
    width = 200,
    height = 150,
    draggable,
    onDragStart,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    isSelected,
    onClick,
    isPlaying = true,
    isMuted = true,
}, ref) => {
    // Only fetch image if type is image to save resources
    const [image] = useImage(type === 'image' ? url : '', 'anonymous');
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
    const imageRef = useRef<Konva.Image>(null);

    // Sync play/pause and mute/unmute
    useEffect(() => {
        if (type === 'video' && videoElement) {
            if (isPlaying) {
                videoElement.play().catch(() => {
                    console.warn('Video play failed - possibly browser policy');
                });
            } else {
                videoElement.pause();
            }
            // Use videoRef.current to avoid mutating state object directly if linter complains
            if (videoRef.current) {
                videoRef.current.muted = isMuted;
            }
        }
    }, [isPlaying, isMuted, videoElement, type]);

    // Video Setup & Cleanup
    useEffect(() => {
        if (type === 'video') {
            const video = document.createElement('video');
            video.src = url;
            video.crossOrigin = 'Anonymous';
            video.loop = true;
            video.muted = isMuted;
            video.playsInline = true;
            video.setAttribute('webkit-playsinline', 'true'); // iOS support

            setTimeout(() => setVideoElement(video), 0);
            videoRef.current = video;

            // Proper animation loop for Konva
            let anim: Konva.Animation | null = null;

            video.oncanplay = () => {
                if (imageRef.current) {
                    const layer = imageRef.current.getLayer();
                    if (layer && !anim) {
                        anim = new Konva.Animation(() => {
                            // Redraw the layer if the video is playing
                            // Konva.Image automatically uses the video element if passed as 'image' prop
                        }, layer);
                        anim.start();
                    }
                }
            };

            return () => {
                if (anim) anim.stop();
                video.pause();
                video.src = '';
                video.load();
                setVideoElement(null);
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onTransformEnd={onTransformEnd}
                onClick={onClick}
            />
        );
    }

    return (
        <KonvaImage
            ref={(node) => {
                // Handle both the forwarded ref and internal ref
                imageRef.current = node;
                if (typeof ref === 'function') ref(node);
                else if (ref) (ref as React.MutableRefObject<Konva.Image | null>).current = node;
            }}
            image={videoElement || undefined}
            x={x}
            y={y}
            width={width}
            height={height}
            stroke={isSelected ? '#3498db' : undefined}
            strokeWidth={isSelected ? 4 : 0}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onTransformEnd={onTransformEnd}
            onClick={onClick}
        />
    );
});

MultimediaElement.displayName = 'MultimediaElement';

export default MultimediaElement;
