declare module 'get-video-dimensions' {
    interface VideoDimensions {
        width: number;
        height: number;
    }

    function getVideoDimensions(filePath: string): Promise<VideoDimensions>;

    export = getVideoDimensions;
}
