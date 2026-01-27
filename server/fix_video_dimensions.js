const db = require('better-sqlite3')('storyboard.db');
const getVideoDimensions = require('get-video-dimensions');
const path = require('path');
const fs = require('fs');

async function fixVideos() {
    const vids = db.prepare("SELECT id, content FROM elements WHERE type = 'video'").all();
    console.log(`Checking ${vids.length} videos...`);

    const dataDir = process.env.DATA_DIR || process.cwd();

    for (const v of vids) {
        const content = JSON.parse(v.content);
        if (!content.url) continue;

        // Extract relative path from URL (handle both absolute and relative URLs)
        let relativePath = content.url;
        if (content.url.startsWith('http')) {
            try {
                const urlObj = new URL(content.url);
                relativePath = urlObj.pathname;
            } catch (e) {
                console.error(`Failed to parse URL: ${content.url}`);
                continue;
            }
        }

        const filePath = path.join(dataDir, relativePath);
        if (fs.existsSync(filePath)) {
            try {
                const dimensions = await getVideoDimensions(filePath);
                if (dimensions.width && dimensions.height) {
                    // Update database
                    const maxWidth = 533; // Standard 16:9 base width we use for thumbnails
                    const factor = maxWidth / dimensions.width;
                    const width = Math.round(dimensions.width * factor);
                    const height = Math.round(dimensions.height * factor);

                    console.log(`Updating ${v.id}: ${width}x${height} (Native: ${dimensions.width}x${dimensions.height})`);

                    const updatedContent = { ...content, width, height };
                    db.prepare("UPDATE elements SET width = ?, height = ?, content = ? WHERE id = ?").run(
                        width, height, JSON.stringify(updatedContent), v.id
                    );
                }
            } catch (err) {
                console.error(`Failed to get dimensions for ${filePath}:`, err);
            }
        } else {
            console.warn(`File not found: ${filePath}`);
        }
    }
    console.log("Finished fixing videos.");
}

fixVideos().catch(console.error);
