import { useEffect, useRef, useState, forwardRef } from 'react';
import { Image as KonvaImage, Group, Rect, Text } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { API_BASE_URL } from '../config';

interface MultimediaElementProps {
    id: string;
    type: 'image' | 'video';
    x: number;
    y: number;
    width: number;
    height: number;
    url: string;
    draggable?: boolean;
    onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
    isSelected?: boolean;
    onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
    // Video controls
    isPlaying?: boolean;
    isMuted?: boolean;
    // Rating
    rating?: number;
    onUpdateElement?: (id: string, updates: Partial<MultimediaElementProps>) => void;
}

const MultimediaElement = forwardRef<Konva.Group, MultimediaElementProps>(({
    id,
    type,
    url,
    x,
    y,
    width,
    height,
    draggable,
    onDragStart,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    isSelected,
    onClick,
    onContextMenu,
    isPlaying = false,  // Changed: videos don't autoplay by default
    isMuted = true,
    rating = 0,
    onUpdateElement,
}, ref) => {
    // Ensure we use the full URL if it's relative, as we might not have a proxy set up
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

    // Only fetch image if type is image to save resources
    const [image] = useImage(type === 'image' ? fullUrl : '', 'anonymous');
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
    const imageRef = useRef<Konva.Image>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(isPlaying); // Track video playing state

    // Control video playback based on hover state
    useEffect(() => {
        if (type === 'video') {
            setIsVideoPlaying(isHovered);
        }
    }, [isHovered, type]);

    // Sync play/pause and mute/unmute
    useEffect(() => {
        if (type === 'video' && videoElement) {
            if (isVideoPlaying) {
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
    }, [isVideoPlaying, isMuted, videoElement, type]);

    // Video Setup & Cleanup
    useEffect(() => {
        if (type === 'video') {
            const video = document.createElement('video');
            video.src = fullUrl;
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
                // Ensure first frame is available
                // Usually waiting for 'loadeddata' or 'canplay' is enough,
                // but we explicitly tell Konva to redraw once.
                if (imageRef.current) {
                    const layer = imageRef.current.getLayer();
                    if (layer && !anim) {
                        anim = new Konva.Animation(() => {
                            // Redraw the layer if the video is playing or needs update
                        }, layer);
                        anim.start();
                    }
                }
            };

            // Force first frame render when data is loaded
            video.onloadeddata = () => {
                if (video.currentTime === 0) {
                    video.currentTime = 0.001; // Tiny nudge to ensure frame buffer is valid
                }
                if (imageRef.current && imageRef.current.getLayer()) {
                    imageRef.current.getLayer()?.batchDraw();
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

    const handleRatingClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, value: number) => {
        e.cancelBubble = true;
        if (onUpdateElement) {
            onUpdateElement(id, { rating: value });
        }
    };

    const renderStars = () => {
        const stars = [];
        const starCount = 5;
        const starSpacing = 30;
        const starSize = 26;

        for (let i = 1; i <= starCount; i++) {
            stars.push(
                <Text
                    key={i}
                    text="★"
                    fontSize={starSize}
                    x={width - (starCount - i + 1) * starSpacing - 10}
                    y={6}
                    fill={i <= rating ? '#FFD700' : '#ffffff'}
                    opacity={i <= rating ? 1 : 0.3}
                    shadowBlur={i <= rating ? 10 : 0}
                    shadowColor="#FFD700"
                    onClick={(e) => handleRatingClick(e, i)}
                    onTap={(e) => handleRatingClick(e, i)}
                    onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'pointer';
                    }}
                    onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'default';
                    }}
                />
            );
        }
        return stars;
    };

    return (
        <Group
            ref={(node) => {
                if (typeof ref === 'function') ref(node);
                else if (ref) ref.current = node;
                if (node) {
                    (node as Konva.Group & { _innerImage?: Konva.Image })._innerImage = imageRef.current || undefined;
                }
            }}
            x={x}
            y={y}
            width={width}
            height={height}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onTransformEnd={onTransformEnd}
            onClick={onClick}
            onContextMenu={onContextMenu}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <KonvaImage
                ref={imageRef}
                image={type === 'image' ? image : (videoElement || undefined)}
                width={width}
                height={height}
                stroke={isSelected ? '#3498db' : undefined}
                strokeWidth={isSelected ? 4 : 0}
            />
            {isHovered && (
                <Group>
                    <Rect
                        x={width - 5 * 30 - 20}
                        y={4}
                        width={5 * 30 + 10}
                        height={38}
                        fill="rgba(0,0,0,0.6)"
                        cornerRadius={6}
                        listening={false}
                    />
                    {renderStars()}
                </Group>
            )}
        </Group>
    );
});

MultimediaElement.displayName = 'MultimediaElement';

export default MultimediaElement;
