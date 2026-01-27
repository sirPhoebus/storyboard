const db = require('better-sqlite3')('storyboard.db');
const elements = db.prepare("SELECT e.id, e.type, e.width, e.height, e.content, e.page_id, p.title as page_title FROM elements e JOIN pages p ON e.page_id = p.id").all();

console.log("Found " + elements.length + " elements total.");
elements.forEach(el => {
    const c = JSON.parse(el.content);
    const isVideo = (el.type === 'video' || (c.url && (c.url.endsWith('.mp4') || c.url.endsWith('.webm'))));
    if (isVideo) {
        console.log(`--- VIDEO FOUND ---`);
        console.log(`ID: ${el.id}`);
        console.log(`Type: ${el.type}`);
        console.log(`Page: ${el.page_title} (${el.page_id})`);
        console.log(`Dimensions: ${el.width}x${el.height}`);
        console.log(`URL: ${c.url}`);
    }
});
process.exit(0);
