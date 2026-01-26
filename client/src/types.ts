export interface Element {
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
    pageId?: string;
    rating?: number;
}

export interface Chapter {
    id: string;
    title: string;
    storyboardId: string;
}

export interface Page {
    id: string;
    title: string;
    chapter_id: string;
    storyboardId: string;
    thumbnail?: string;
    viewport_x?: number;
    viewport_y?: number;
    viewport_scale?: number;
}

export interface BatchTask {
    id: string;
    first_frame_url?: string;
    last_frame_url?: string;
    prompt: string;
    duration: number;
    audio_enabled: boolean;
    status: 'pending' | 'generating' | 'completed' | 'failed';
    generated_video_url?: string;
    created_at: string;
}
