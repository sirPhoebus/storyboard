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

export type KlingModel = 'kling-v1' | 'kling-v1-5' | 'kling-v1-6' | 'kling-v2-master' | 'kling-v2-1' | 'kling-v2-5-turbo' | 'kling-v2-6';
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
    model_name?: KlingModel;
    mode?: KlingMode;
    duration?: '5' | '10';
    sound?: boolean; // Only for v2.6+
    cfg_scale?: number;
    aspect_ratio?: string; // Not in new spec? Double check. Spec says image dimensions matter. Removed from top level if unused, but kept for compatibility if needed. Actually spec says "aspect ratio of the image should be...", user sends image. If generating from text-only, ratio might matter, but this is image2video.
    camera_control?: CameraControl;
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
            model_name: options.model_name || 'kling-v1',
            mode: options.mode || 'std',
            duration: options.duration || '5',
            image: options.image, // Required
        };

        if (options.prompt) payload.prompt = options.prompt;
        if (options.negative_prompt) payload.negative_prompt = options.negative_prompt;
        if (options.image_tail) payload.image_tail = options.image_tail;
        if (options.cfg_scale !== undefined) payload.cfg_scale = options.cfg_scale;
        if (options.camera_control) payload.camera_control = options.camera_control;

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
            prompt?: string;
            duration?: '5' | '10';
            model_name?: string;
            mode?: 'std' | 'pro';
            cfg_scale?: number;
            negative_prompt?: string;
        }
    ): Promise<string> {
        const payload: any = {
            model_name: params.model_name || 'kling-v1',
            mode: params.mode || 'pro',
            duration: params.duration || '5'
        };

        if (params.prompt) payload.prompt = params.prompt;
        if (params.cfg_scale) payload.cfg_scale = params.cfg_scale;
        if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;

        const resolveUrl = (rawUrl: string): string => {
            if (!rawUrl) return rawUrl;
            let finalUrl = rawUrl;

            // Handle relative URLs
            if (!rawUrl.startsWith('http')) {
                const baseUrl = process.env.STORYBOARD_BASE_URL;
                if (!baseUrl) return rawUrl; // Can't resolve without base URL
                const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
                finalUrl = `${baseUrl}${cleanPath}`;
            }

            // Force HTTPS for Railway
            if (finalUrl.includes('.up.railway.app') && finalUrl.startsWith('http:')) {
                finalUrl = finalUrl.replace('http:', 'https:');
            }

            return finalUrl;
        };

        if (params.image) payload.image = resolveUrl(params.image);
        if (params.image_tail) payload.image_tail = resolveUrl(params.image_tail);

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
            prompt?: string;
            duration?: '5' | '10';
            model_name?: string;
            mode?: 'std' | 'pro';
            cfg_scale?: number;
            negative_prompt?: string;
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

