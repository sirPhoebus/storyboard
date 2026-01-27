import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import sharp from 'sharp';

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

    // New helper to normalize images (convert PNG with alpha to JPEG, resize if too large)
    private static async normalizeImage(imageUrl: string): Promise<string> {
        const dataDir = process.env.DATA_DIR || process.cwd();
        const uploadsDir = path.join(dataDir, 'uploads');
        const normalizedDir = path.join(uploadsDir, 'normalized');

        if (!fs.existsSync(normalizedDir)) {
            fs.mkdirSync(normalizedDir, { recursive: true });
        }

        // 1. Get local path 
        let localPath = "";
        try {
            const urlObj = new URL(imageUrl);
            const fileName = path.basename(urlObj.pathname);
            localPath = path.join(uploadsDir, fileName);

            // Handle subfolders like /uploads/generated/
            if (urlObj.pathname.includes('/generated/')) {
                localPath = path.join(uploadsDir, 'generated', fileName);
            }
        } catch (e) {
            // If relative URL
            const fileName = path.basename(imageUrl);
            localPath = path.join(uploadsDir, fileName);
            if (imageUrl.includes('/generated/')) {
                localPath = path.join(uploadsDir, 'generated', fileName);
            }
        }

        if (!fs.existsSync(localPath)) {
            console.error(`❌ [Kling] Local image not found for normalization: ${localPath}`);
            return imageUrl; // Fallback to original
        }

        const normalizedFileName = `${crypto.randomUUID()}.jpg`;
        const normalizedPath = path.join(normalizedDir, normalizedFileName);

        console.log(`🖼️ [Kling] Normalizing image: ${path.basename(localPath)} -> ${normalizedFileName}`);

        await sharp(localPath)
            .flatten({ background: { r: 255, g: 255, b: 255 } }) // Handle transparency by flattening onto white
            .jpeg({ quality: 90 })
            .toFile(normalizedPath);

        const baseUrl = process.env.STORYBOARD_BASE_URL;
        return `${baseUrl}/uploads/normalized/${normalizedFileName}`;
    }

    static async createVideoTask(
        config: KlingConfig,
        prompt: string,
        frameUrl?: string,
        duration: '5' | '10' = '5',
        sound: boolean = false,
        aspectRatio: string = '16:9'
    ): Promise<string> {

        const payload: any = {
            prompt: prompt,
            aspect_ratio: aspectRatio,
            duration: duration,
            sound: sound
        };

        if (frameUrl) {
            let finalImageUrl = "";
            const baseUrl = process.env.STORYBOARD_BASE_URL;
            if (!baseUrl) throw new Error('STORYBOARD_BASE_URL environment variable is not set');

            // URL Resilience: If it's an absolute URL pointing to any storyboard/railway instance, 
            // extract the path so we can rebuild it with the CURRENT baseUrl.
            if (frameUrl.startsWith('http')) {
                const isLocal = frameUrl.includes('localhost') ||
                    frameUrl.includes('127.0.0.1') ||
                    frameUrl.includes('up.railway.app');

                if (isLocal) {
                    try {
                        const urlObj = new URL(frameUrl);
                        const relativePath = urlObj.pathname;
                        finalImageUrl = `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
                    } catch (e) {
                        finalImageUrl = frameUrl; // Fallback
                    }
                } else {
                    finalImageUrl = frameUrl;
                }
            } else {
                const cleanPath = frameUrl.startsWith('/') ? frameUrl : `/${frameUrl}`;
                finalImageUrl = `${baseUrl}${cleanPath}`;
            }

            // Image Normalization: Convert to JPEG to avoid format errors (alpha channel, PNG profiles, etc.)
            try {
                finalImageUrl = await this.normalizeImage(finalImageUrl);
            } catch (normErr) {
                console.error('⚠️ [Kling] Image normalization failed, using original:', normErr);
            }
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
        onStatusUpdate?: (status: string, videoUrl?: string) => void | Promise<void>
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
            if (onStatusUpdate) await onStatusUpdate('generating');

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

                    if (onStatusUpdate) await onStatusUpdate('completed', localVideoUrl);
                    return localVideoUrl;

                } else if (taskData.status === 'FAILED') {
                    throw new Error(`Kling generation failed: ${taskData.error_message || 'Unknown error'}`);
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
