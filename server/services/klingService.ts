import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';

export interface KlingConfig {
    klingApiKey: string;
}

export class KlingService {
    // Backend uses real API URL from environment
    private static get API_BASE_URL(): string {
        const url = process.env.KLING_API_BASE_URL;
        if (!url) throw new Error('KLING_API_BASE_URL environment variable is not set');
        return url;
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
        prompt: string,
        frameUrl?: string,
        duration: '5' | '10' = '5',
        sound: boolean = false,
        aspectRatio: string = '16:9'
    ): Promise<string> {

        let finalImageUrl = "";
        if (frameUrl) {
            const baseUrl = process.env.STORYBOARD_BASE_URL;
            if (!baseUrl) throw new Error('STORYBOARD_BASE_URL environment variable is not set');

            let relativePath = frameUrl;
            if (frameUrl.startsWith('http')) {
                // If it's a local URL, extract the path
                if (frameUrl.includes('localhost') || frameUrl.includes('127.0.0.1')) {
                    try {
                        const urlObj = new URL(frameUrl);
                        relativePath = urlObj.pathname;
                    } catch (e) {
                        console.error('Failed to parse URL:', frameUrl);
                    }
                } else {
                    // It's already an external URL
                    finalImageUrl = frameUrl;
                }
            }

            if (!finalImageUrl) {
                const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
                finalImageUrl = `${baseUrl}${cleanPath}`;
            }
        }

        const payload: any = {
            prompt: prompt,
            aspect_ratio: aspectRatio,
            duration: duration,
            sound: sound
        };

        if (finalImageUrl) {
            payload.image_urls = [finalImageUrl];
        }

        console.log(`📡 [Kling] Creating task for prompt: "${prompt}"`);
        console.log(`📦 [Kling] Payload: ${JSON.stringify(payload, null, 2)}`);

        const response = await fetch(`${this.API_BASE_URL}/generate`, {
            method: 'POST',
            headers: this.getHeaders(config),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Kling API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json() as any;
        if (data.code !== 200 || !data.data?.task_id) {
            throw new Error(data.message || 'Unknown API Error: Missing task_id');
        }

        return data.data.task_id;
    }

    static async checkTaskStatus(config: KlingConfig, taskId: string): Promise<any> {
        const response = await fetch(`${this.API_BASE_URL}/status?task_id=${taskId}`, {
            method: 'GET',
            headers: this.getHeaders(config)
        });

        if (!response.ok) {
            throw new Error(`Failed to check status: ${response.statusText}`);
        }

        const data = await response.json() as any;
        if (data.code === 200) {
            return data.data;
        } else {
            throw new Error(`API error: ${data.message || 'Unknown code'}`);
        }
    }

    static async generateVideo(
        config: KlingConfig,
        startFrameUrl: string | undefined,
        prompt: string,
        duration: '5' | '10',
        sound: boolean,
        aspectRatio: string,
        onStatusUpdate?: (status: string, videoUrl?: string) => void
    ): Promise<string> {

        try {
            // 1. Submit Task
            const taskId = await this.createVideoTask(
                config,
                prompt || "Cinematic high quality video",
                startFrameUrl,
                duration,
                sound,
                aspectRatio
            );

            console.log(`✓ [Kling] Task submitted: ${taskId}`);
            if (onStatusUpdate) onStatusUpdate('generating');

            // 2. Poll for Status
            let attempts = 0;
            const maxAttempts = 120; // 10 minutes (5s * 120)

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000));

                const taskData = await this.checkTaskStatus(config, taskId);
                console.log(`⌛ [Kling] Task ${taskId} status: ${taskData.status}`);

                if (taskData.status === 'SUCCESS') {
                    const remoteVideoUrl = taskData.response?.[0];
                    if (!remoteVideoUrl) throw new Error("Task succeeded but no video URL found");

                    console.log(`✓ [Kling] Task completed! Downloading video...`);
                    const localVideoUrl = await this.downloadVideo(remoteVideoUrl);

                    if (onStatusUpdate) onStatusUpdate('completed', localVideoUrl);
                    return localVideoUrl;

                } else if (taskData.status === 'FAILED') {
                    throw new Error(`Kling generation failed: ${taskData.error_message || 'Unknown error'}`);
                }
                attempts++;
            }

            throw new Error("Kling generation timed out");
        } catch (err) {
            if (onStatusUpdate) onStatusUpdate('failed');
            throw err;
        }
    }
}
