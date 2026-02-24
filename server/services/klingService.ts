import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import jwt from 'jsonwebtoken';

export interface KlingConfig {
    klingApiKey?: string;
    klingAccessKey?: string;
    klingSecretKey?: string;
}

export type KlingModel = 'kling-v1' | 'kling-v1-5' | 'kling-v1-6' | 'kling-v2-master' | 'kling-v2-1' | 'kling-v2-5-turbo' | 'kling-v2-6' | 'kling-v3';
export type KlingMode = 'std' | 'pro';
export type CameraControlType = 'simple' | 'down_back' | 'forward_up' | 'right_turn_forward' | 'left_turn_forward';

export interface CameraControlConfig {
    horizontal?: number;
    vertical?: number;
    pan?: number;
    tilt?: number;
    roll?: number;
    zoom?: number;
}

export interface CameraControl {
    type: CameraControlType;
    config?: CameraControlConfig;
}

export interface KlingTaskOptions {
    prompt?: string;
    negative_prompt?: string;
    image?: string;
    image_tail?: string;
    middle_images?: string[];
    model_name?: KlingModel;
    mode?: KlingMode;
    duration?: '5' | '10' | '15';
    sound?: boolean; // Only for v2.6+
    cfg_scale?: number;
    aspect_ratio?: string; // Not in new spec? Double check. Spec says image dimensions matter. Removed from top level if unused, but kept for compatibility if needed. Actually spec says "aspect ratio of the image should be...", user sends image. If generating from text-only, ratio might matter, but this is image2video.
    camera_control?: CameraControl;
    callback_url?: string;
    external_task_id?: string;
}

export class KlingService {
    // API URL updated to v1 endpoint
    private static get API_BASE_URL(): string {
        return 'https://api-singapore.klingai.com/v1/videos/image2video';
    }

    private static getHeaders(config: KlingConfig): any {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.klingApiKey}`
        };
    }

    // Helper to download video from URL to local storage
    private static async downloadVideo(url: string): Promise<string> {
        const dataDir = process.env.DATA_DIR || process.cwd();
        const generatedDir = path.join(dataDir, 'uploads', 'generated');

        if (!fs.existsSync(generatedDir)) {
            fs.mkdirSync(generatedDir, { recursive: true });
        }

        const fileName = `${crypto.randomUUID()}.mp4`;
        const filePath = path.join(generatedDir, fileName);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch video: ${response.statusText}`);

        const fileStream = fs.createWriteStream(filePath);
        // @ts-ignore - response.body is a ReadableStream in global fetch
        await pipeline(response.body, fileStream);

        return `/uploads/generated/${fileName}`;
    }

    static async createVideoTask(
        config: KlingConfig,
        options: KlingTaskOptions
    ): Promise<string> {

        // Construct Payload
        const payload: any = {
            model_name: options.model_name || 'kling-v3',
            mode: options.mode || 'pro',
            duration: options.duration || '5',
            image: options.image, // Required
        };

        if (options.prompt) payload.prompt = options.prompt;
        if (options.negative_prompt) payload.negative_prompt = options.negative_prompt;
        if (options.image_tail) payload.image_tail = options.image_tail;
        if (options.middle_images?.length) payload.middle_images = options.middle_images;
        if (options.cfg_scale !== undefined) payload.cfg_scale = options.cfg_scale;
        if (options.camera_control) payload.camera_control = options.camera_control;
        if (options.callback_url !== undefined) payload.callback_url = options.callback_url;
        if (options.external_task_id !== undefined) payload.external_task_id = options.external_task_id;

        if ((options.model_name || 'kling-v3') === 'kling-v3') {
            payload.multi_shot = options.middle_images?.length ? 'true' : 'false';
            if (options.middle_images?.length) {
                payload.shot_type = 'customize';
            }
        }

        // Sound is only for v2.6+
        if (options.model_name?.includes('2-6') && options.sound !== undefined) {
            payload.sound = options.sound ? 'on' : 'off';
        }

        console.log(`📡 [Kling] Creating task...`);
        console.log(`📦 [Kling] Payload: ${JSON.stringify(payload, null, 2)}`);

        const response = await fetch(this.API_BASE_URL, {
            method: 'POST',
            headers: this.getHeaders(config),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Kling API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json() as any;
        if (data.code !== 0 || !data.data?.task_id) {
            throw new Error(data.message || 'Unknown API Error: Missing task_id');
        }

        return data.data.task_id;
    }

    static async checkTaskStatus(config: KlingConfig, taskId: string): Promise<any> {
        const response = await fetch(`${this.API_BASE_URL}/${taskId}`, {
            method: 'GET',
            headers: this.getHeaders(config)
        });

        if (!response.ok) {
            throw new Error(`Failed to check status: ${response.statusText}`);
        }

        const data = await response.json() as any;
        if (data.code === 0) {
            return data.data;
        } else {
            throw new Error(`API error: ${data.message || 'Unknown code'}`);
        }
    }

    static async generateVideo(
        config: KlingConfig,
        options: KlingTaskOptions,
        onStatusUpdate?: (status: string, videoUrl?: string) => void | Promise<void>
    ): Promise<string> {

        try {
            // 1. Submit Task
            const taskId = await this.createVideoTask(config, options);

            console.log(`✓ [Kling] Task submitted: ${taskId}`);
            if (onStatusUpdate) await onStatusUpdate('generating');

            // 2. Poll for Status
            let attempts = 0;
            const maxAttempts = 120; // 10 minutes (5s * 120)

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000));

                const taskData = await this.checkTaskStatus(config, taskId);
                console.log(`⌛ [Kling] Task ${taskId} status: ${taskData.task_status}`);

                if (taskData.task_status === 'succeed') {
                    const videoResult = taskData.task_result?.videos?.[0];
                    if (!videoResult || !videoResult.url) throw new Error("Task succeeded but no video URL found");

                    console.log(`✓ [Kling] Task completed! Downloading video...`);
                    const localVideoUrl = await this.downloadVideo(videoResult.url);

                    if (onStatusUpdate) await onStatusUpdate('completed', localVideoUrl);
                    return localVideoUrl;

                } else if (taskData.task_status === 'failed') {
                    throw new Error(`Kling generation failed: ${taskData.task_status_msg || 'Unknown error'}`);
                }
                attempts++;
            }

            throw new Error("Kling generation timed out");
        } catch (err) {
            if (onStatusUpdate) await onStatusUpdate('failed');
            throw err;
        }
    }
}

export class KlingImageToVideoService {
    private static get API_URL(): string {
        return 'https://api-singapore.klingai.com/v1/videos/image2video';
    }

    private static getHeaders(config: KlingConfig): any {
        const token = this.getAuthToken(config);
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    private static getAuthToken(config: KlingConfig): string {
        // If we have AK/SK, generate JWT
        if (config.klingAccessKey && config.klingSecretKey) {
            const now = Math.floor(Date.now() / 1000);
            const payload = {
                iss: config.klingAccessKey,
                exp: now + 1800, // 30 minutes
                nbf: now - 5
            };
            return jwt.sign(payload, config.klingSecretKey, { algorithm: 'HS256' });
        }
        // Fallback to static key
        if (config.klingApiKey) {
            return config.klingApiKey;
        }
        throw new Error('Missing Kling credentials: Provide either (klingAccessKey + klingSecretKey) or klingApiKey');
    }

    private static async downloadVideo(url: string): Promise<string> {
        const dataDir = process.env.DATA_DIR || process.cwd();
        const generatedDir = path.join(dataDir, 'uploads', 'generated');

        if (!fs.existsSync(generatedDir)) {
            fs.mkdirSync(generatedDir, { recursive: true });
        }

        const fileName = `${crypto.randomUUID()}.mp4`;
        const filePath = path.join(generatedDir, fileName);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch video: ${response.statusText}`);

        const fileStream = fs.createWriteStream(filePath);
        // @ts-ignore
        await pipeline(response.body, fileStream);

        return `/uploads/generated/${fileName}`;
    }

    static async createTask(
        config: KlingConfig,
        params: {
            image?: string;
            image_tail?: string;
            middle_images?: string[];
            prompt?: string;
            duration?: '5' | '10' | '15';
            model_name?: string;
            mode?: 'std' | 'pro';
            cfg_scale?: number;
            negative_prompt?: string;
            sound?: boolean;
            callback_url?: string;
            external_task_id?: string;
        }
    ): Promise<string> {
        const payload: any = {
            model_name: params.model_name || 'kling-v3',
            mode: params.mode || 'pro',
            duration: params.duration || '5'
        };

        payload.prompt = params.prompt || '';
        if (params.cfg_scale) payload.cfg_scale = params.cfg_scale;
        payload.negative_prompt = params.negative_prompt || '';

        const resolveImage = async (rawUrl: string): Promise<string> => {
            if (!rawUrl) return rawUrl;
            
            // 1. If it's already a full URL, return it
            if (rawUrl.startsWith('http')) {
                let finalUrl = rawUrl;
                 // Force HTTPS for Railway
                if (finalUrl.includes('.up.railway.app') && finalUrl.startsWith('http:')) {
                    finalUrl = finalUrl.replace('http:', 'https:');
                }
                return finalUrl;
            }

            // 2. Try to construct absolute URL if BASE_URL is set
            const baseUrl = process.env.STORYBOARD_BASE_URL;
            if (baseUrl) {
                const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
                return `${baseUrl}${cleanPath}`;
            }

            // 3. Fallback: Convert to Base64
            console.warn(`⚠️ STORYBOARD_BASE_URL not set for relative path ${rawUrl}, attempting Base64 conversion...`);
            
            try {
                const dataDir = process.env.DATA_DIR || process.cwd();
                // Remove leading slash to join correctly
                const relativePath = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
                const localPath = path.join(dataDir, relativePath);

                if (fs.existsSync(localPath)) {
                    const fileBuffer = await fs.promises.readFile(localPath);
                    const base64Image = fileBuffer.toString('base64');
                    console.log(`✓ Converted image to Base64 (${base64Image.length} chars)`);
                    return base64Image;
                } else {
                    console.error(`❌ Local file not found at ${localPath}`);
                    return rawUrl;
                }
            } catch (err) {
                console.error(`❌ Failed to convert to Base64: ${err}`);
                return rawUrl;
            }
        };

        if (params.image) payload.image = await resolveImage(params.image);
        if (params.image_tail) payload.image_tail = await resolveImage(params.image_tail);
        if (params.middle_images?.length) {
            payload.middle_images = await Promise.all(params.middle_images.map(resolveImage));
        }

        if ((params.model_name || 'kling-v3') === 'kling-v3') {
            const durationValue = Number(params.duration || '5');
            const middleCount = params.middle_images?.length || 0;
            const totalShots = Math.max(1, middleCount + 1);
            const base = Math.max(1, Math.floor(durationValue / totalShots));
            const remainder = Math.max(0, durationValue - (base * totalShots));
            const multiPrompt = Array.from({ length: totalShots }, (_, idx) => ({
                index: idx + 1,
                prompt: params.prompt || '',
                duration: String(base + (idx < remainder ? 1 : 0))
            }));

            payload.multi_shot = middleCount > 0 ? 'true' : 'false';
            if (middleCount > 0) {
                payload.shot_type = 'customize';
                payload.multi_prompt = multiPrompt;
            }
            payload.sound = params.sound ? 'on' : 'off';
            payload.callback_url = params.callback_url ?? '';
            payload.external_task_id = params.external_task_id ?? '';
        }

        console.log(`📡 [Kling I2V] Creating task`, JSON.stringify(payload, null, 2));

        const response = await fetch(this.API_URL, {
            method: 'POST',
            headers: this.getHeaders(config),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Kling I2V API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json() as any;
        if (data.code !== 0 || !data.data?.task_id) {
            throw new Error(data.message || 'Unknown I2V API Error: Missing task_id');
        }

        return data.data.task_id;
    }

    static async checkStatus(config: KlingConfig, taskId: string): Promise<any> {
        const response = await fetch(`${this.API_URL}/${taskId}`, {
            method: 'GET',
            headers: this.getHeaders(config)
        });

        if (!response.ok) {
            throw new Error(`Failed to check I2V status: ${response.statusText}`);
        }

        const data = await response.json() as any;
        if (data.code === 0 && data.data) {
            return data.data;
        } else {
            throw new Error(`I2V API error: ${data.message || 'Unknown code'}`);
        }
    }

    static async generate(
        config: KlingConfig,
        params: {
            image?: string;
            image_tail?: string;
            middle_images?: string[];
            prompt?: string;
            duration?: '5' | '10' | '15';
            model_name?: string;
            mode?: 'std' | 'pro';
            cfg_scale?: number;
            negative_prompt?: string;
            sound?: boolean;
            callback_url?: string;
            external_task_id?: string;
        },
        onStatusUpdate?: (status: string, videoUrl?: string) => void | Promise<void>
    ): Promise<string> {
        try {
            const taskId = await this.createTask(config, params);
            console.log(`✓ [Kling I2V] Task submitted: ${taskId}`);
            if (onStatusUpdate) await onStatusUpdate('generating');

            let attempts = 0;
            const maxAttempts = 120;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000));

                const taskData = await this.checkStatus(config, taskId);
                const status = taskData.task_status;
                console.log(`⌛ [Kling I2V] Task ${taskId} status: ${status}`);

                if (status === 'succeed') {
                    const videos = taskData.task_result?.videos;
                    if (!videos || !videos.length || !videos[0].url) {
                        throw new Error("Task succeeded but no video URL found");
                    }
                    const remoteUrl = videos[0].url;
                    console.log(`✓ [Kling I2V] Task completed! Downloading video...`);
                    const localUrl = await this.downloadVideo(remoteUrl);

                    if (onStatusUpdate) await onStatusUpdate('completed', localUrl);
                    return localUrl;

                } else if (status === 'failed') {
                    throw new Error(`Kling I2V failed: ${taskData.task_status_msg || 'Unknown error'}`);
                }
                attempts++;
            }
            throw new Error("Kling I2V generation timed out");
        } catch (err) {
            if (onStatusUpdate) await onStatusUpdate('failed');
            throw err;
        }
    }
}
