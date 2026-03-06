import { useEffect, useRef, useState, forwardRef } from 'react';
import { Image as KonvaImage, Group, Rect, Text } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { API_BASE_URL } from '../config';

interface MultimediaElementProps {
    id: string;
    type: 'image' | 'video' | 'video-card';
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
    onDblClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
    // Video controls
    isPlaying?: boolean;
    isMuted?: boolean;
    // Rating
    rating?: number;
    title?: string;
    sourceVideoUrl?: string;
    onPlayRequest?: (url: string, title?: string) => void;
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
    onDblClick,
    onContextMenu,
    isPlaying = false,  // Changed: videos don't autoplay by default
    isMuted = true,
    rating = 0,
    title,
    sourceVideoUrl,
    onPlayRequest,
    onUpdateElement,
}, ref) => {
    // Ensure we use the full URL if it's relative, as we might not have a proxy set up
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

    // Only fetch image if type is image to save resources
    const [image, imageStatus] = useImage(type === 'image' || type === 'video-card' ? fullUrl : '', 'anonymous');
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
    const imageRef = useRef<Konva.Image>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(isPlaying); // Track video playing state
    const [hasVideoError, setHasVideoError] = useState(false);

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

            const mountTimer = window.setTimeout(() => setVideoElement(video), 0);
            videoRef.current = video;
            setHasVideoError(false);

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

            video.onerror = () => {
                setHasVideoError(true);
            };

            return () => {
                window.clearTimeout(mountTimer);
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
            const nextRating = rating === value ? 0 : value;
            onUpdateElement(id, { rating: nextRating });
        }
    };

    const handlePlayClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        e.cancelBubble = true;
        if (sourceVideoUrl && onPlayRequest) {
            onPlayRequest(sourceVideoUrl, title);
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
                    onMouseDown={(e) => {
                        e.cancelBubble = true;
                    }}
                    onClick={(e) => handleRatingClick(e, i)}
                    onTouchStart={(e) => {
                        e.cancelBubble = true;
                    }}
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

    const hasBrokenMedia = (type === 'image' || type === 'video-card')
        ? imageStatus === 'failed'
        : type === 'video' && hasVideoError;

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
            onDblClick={onDblClick}
            onContextMenu={onContextMenu}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {hasBrokenMedia ? (
                <>
                    <Rect
                        width={width}
                        height={height}
                        fill="#2a0f14"
                        cornerRadius={type === 'video-card' ? 18 : 0}
                        stroke={isSelected ? '#3498db' : 'rgba(248, 113, 113, 0.45)'}
                        strokeWidth={isSelected ? 4 : 2}
                        dash={[10, 8]}
                    />
                    <Text
                        text="Broken media"
                        x={0}
                        y={Math.max(10, height / 2 - 18)}
                        width={width}
                        align="center"
                        fontSize={Math.max(12, Math.min(18, width / 10))}
                        fontStyle="bold"
                        fill="#fecaca"
                    />
                    <Text
                        text={url || 'File not found'}
                        x={12}
                        y={Math.max(34, height / 2 + 6)}
                        width={Math.max(0, width - 24)}
                        align="center"
                        fontSize={11}
                        fill="#fca5a5"
                        wrap="char"
                    />
                </>
            ) : type === 'video-card' ? (
                <>
                    <Rect
                        width={width}
                        height={height}
                        fill="#0f172a"
                        cornerRadius={18}
                        stroke={isSelected ? '#3498db' : 'rgba(148, 163, 184, 0.22)'}
                        strokeWidth={isSelected ? 4 : 1}
                        shadowColor="black"
                        shadowBlur={18}
                        shadowOpacity={0.22}
                        shadowOffsetY={10}
                    />
                    <KonvaImage
                        ref={imageRef}
                        image={image || undefined}
                        x={10}
                        y={10}
                        width={width - 20}
                        height={height - 54}
                        perfectDrawEnabled={false}
                    />
                    <Rect
                        x={10}
                        y={height - 52}
                        width={width - 20}
                        height={42}
                        fill="rgba(15, 23, 42, 0.96)"
                        cornerRadius={12}
                    />
                    <Text
                        text={title || 'Video'}
                        x={20}
                        y={height - 40}
                        width={width - 80}
                        fontSize={14}
                        fontStyle="bold"
                        fill="#e2e8f0"
                        ellipsis
                    />
                    <Rect
                        x={width - 48}
                        y={height - 43}
                        width={26}
                        height={26}
                        fill="rgba(125, 211, 252, 0.18)"
                        stroke="rgba(125, 211, 252, 0.45)"
                        strokeWidth={1}
                        cornerRadius={13}
                        onClick={handlePlayClick}
                        onTap={handlePlayClick}
                    />
                    <Text
                        text="▶"
                        x={width - 40}
                        y={height - 38}
                        fontSize={12}
                        fill="#e0f2fe"
                        onClick={handlePlayClick}
                        onTap={handlePlayClick}
                    />
                </>
            ) : (
                <KonvaImage
                    ref={imageRef}
                    image={type === 'image' ? image : (videoElement || undefined)}
                    width={width}
                    height={height}
                    stroke={isSelected ? '#3498db' : undefined}
                    strokeWidth={isSelected ? 4 : 0}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                />
            )}
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
