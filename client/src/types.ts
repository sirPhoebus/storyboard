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

export interface Project {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface Chapter {
    id: string;
    title: string;
    storyboardId: string;
    projectId?: string;
}

export interface Page {
    id: string;
    title: string;
    chapter_id: string;
    storyboardId: string;
    thumbnail?: string;
    type: 'normal' | 'videos';
    viewport_x?: number;
    viewport_y?: number;
    viewport_scale?: number;
}

export interface BatchTask {
    id: string;
    first_frame_url?: string;
    last_frame_url?: string;
    middle_frame_urls?: string[];
    multi_prompt_items?: Array<{ url?: string; prompt: string; duration: string }>;
    prompt: string;
    duration: number;
    audio_enabled: boolean;
    aspect_ratio: '16:9' | '9:16' | '1:1' | '21:9';
    status: 'pending' | 'generating' | 'completed' | 'failed';
    generated_video_url?: string;
    kling_task_id?: string;
    created_at: string;
    model_name: string;
    mode: 'std' | 'pro';
    cfg_scale: number;
    negative_prompt?: string;
}
