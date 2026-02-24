import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import db from './db';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { KlingService, KlingImageToVideoService } from './services/klingService';
import getVideoDimensions from 'get-video-dimensions';

const dataDir = process.env.DATA_DIR || process.cwd();
const uploadsDir = path.join(dataDir, 'uploads');

// Ensure uploads directory exists
import fs from 'fs';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
}, express.static(uploadsDir));


// Configure Multer with dynamic project-based paths
const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
        const projectId = req.body.projectId || 'default-project';
        const projectDir = path.join(uploadsDir, projectId);

        // Ensure project directory exists
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        cb(null, projectDir);
    },

    filename: (req: any, file: any, cb: any) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    }
});
const KLING_MULTI_PROMPT_MAX_IMAGES = 3;
const KLING_MULTI_PROMPT_MAX_SHOTS = 6;

// ===========================
// PROJECT ENDPOINTS
// ===========================

app.get('/api/projects', (req: any, res: any) => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all();
    res.json(projects);
});

app.post('/api/projects', (req: any, res: any) => {
    const { name } = req.body;
    const id = crypto.randomUUID();

    try {
        db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, name || 'New Project');

        // Auto-create a default storyboard for the new project
        const storyboardId = crypto.randomUUID();
        db.prepare('INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)').run(
            storyboardId, id, 'My First Storyboard'
        );

        // Auto-create first chapter and page
        const chapterId = crypto.randomUUID();
        db.prepare('INSERT INTO chapters (id, storyboard_id, title, order_index) VALUES (?, ?, ?, ?)').run(
            chapterId, storyboardId, 'Chapter 1', 0
        );

        const pageId = crypto.randomUUID();
        db.prepare('INSERT INTO pages (id, storyboard_id, chapter_id, title, order_index) VALUES (?, ?, ?, ?, ?)').run(
            pageId, storyboardId, chapterId, 'Page 1', 0
        );

        // Create Videos page for the first chapter
        const videosPageId = crypto.randomUUID();
        db.prepare('INSERT INTO pages (id, storyboard_id, chapter_id, title, order_index, type) VALUES (?, ?, ?, ?, ?, ?)').run(
            videosPageId, storyboardId, chapterId, 'Videos', -1, 'videos'
        );

        const newProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        io.emit('project:add', newProject);
        res.json(newProject);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/projects/:id', (req: any, res: any) => {
    const { name } = req.body;
    try {
        db.prepare('UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, req.params.id);
        const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
        io.emit('project:update', updatedProject);
        res.json(updatedProject);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', (req: any, res: any) => {
    const projectId = req.params.id;

    // Prevent deletion of the last project
    const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
    if (projectCount.count <= 1) {
        return res.status(403).json({ error: 'Cannot delete the last project' });
    }

    try {
        // CASCADE will handle storyboards, chapters, pages, elements
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

        // Delete project assets folder
        const projectDir = path.join(uploadsDir, projectId);
        if (fs.existsSync(projectDir)) {
            console.log(`🗑️ Deleting project folder: ${projectDir}`);
            fs.rmSync(projectDir, { recursive: true, force: true });
        }

        io.emit('project:delete', { id: projectId });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get storyboard for a project
app.get('/api/projects/:id/storyboard', (req: any, res: any) => {
    const projectId = req.params.id;
    try {
        const storyboard = db.prepare('SELECT * FROM storyboards WHERE project_id = ?').get(projectId);
        if (!storyboard) {
            return res.status(404).json({ error: 'Storyboard not found for this project' });
        }
        res.json(storyboard);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===========================
// CHAPTER ENDPOINTS
// ===========================

app.get('/api/chapters', (req: any, res: any) => {
    const { storyboardId } = req.query;
    if (!storyboardId) return res.status(400).json({ error: 'storyboardId required' });
    const chapters = db.prepare('SELECT * FROM chapters WHERE storyboard_id = ? ORDER BY order_index ASC').all(storyboardId);
    res.json(chapters);
});

app.post('/api/chapters', (req: any, res: any) => {
    const { title, storyboardId } = req.body;
    const id = crypto.randomUUID();

    const createChapterTransaction = db.transaction(() => {
        const result = db.prepare('SELECT COUNT(*) as count FROM chapters WHERE storyboard_id = ?').get(storyboardId) as any;
        const orderIndex = result ? result.count : 0;

        db.prepare('INSERT INTO chapters (id, storyboard_id, title, order_index) VALUES (?, ?, ?, ?)').run(
            id, storyboardId, title, orderIndex
        );

        // Auto-create first page for the new chapter
        const pageId = crypto.randomUUID();
        db.prepare('INSERT INTO pages (id, storyboard_id, chapter_id, title, order_index) VALUES (?, ?, ?, ?, ?)').run(
            pageId, storyboardId, id, 'Page 1', 0
        );

        return { id, title, storyboard_id: storyboardId, order_index: orderIndex };
    });

    try {
        const chapterData = createChapterTransaction();
        io.emit('chapter:add', chapterData);
        // Also emit the auto-created page if it exists
        const firstPage = db.prepare('SELECT * FROM pages WHERE chapter_id = ?').get(chapterData.id) as any;
        if (firstPage) {
            io.emit('page:add', firstPage);
        }
        res.json(chapterData);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/chapters/:id', (req: any, res: any) => {
    const { title } = req.body;
    try {
        db.prepare('UPDATE chapters SET title = ? WHERE id = ?').run(title, req.params.id);
        io.emit('chapter:update', { id: req.params.id, title });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/chapters/:id', (req: any, res: any) => {
    const chapterId = req.params.id;

    // Prevent deletion of chapters containing system pages
    const hasSystemPage = db.prepare("SELECT id FROM pages WHERE chapter_id = ? AND type = 'videos'").get(chapterId);
    if (hasSystemPage) {
        return res.status(403).json({ error: 'Chapters containing system pages cannot be deleted' });
    }

    const transaction = db.transaction(() => {
        const pages = db.prepare('SELECT id FROM pages WHERE chapter_id = ?').all(chapterId) as { id: string }[];
        for (const page of pages) {
            db.prepare('DELETE FROM elements WHERE page_id = ?').run(page.id);
            db.prepare('DELETE FROM pages WHERE id = ?').run(page.id);
        }
        db.prepare('DELETE FROM chapters WHERE id = ?').run(chapterId);
    });

    try {
        transaction();
        io.emit('chapter:delete', { id: chapterId });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pages', (req: any, res: any) => {
    const { storyboardId, chapterId } = req.query;
    if (!storyboardId) return res.status(400).json({ error: 'storyboardId required' });

    let query = 'SELECT * FROM pages WHERE storyboard_id = ?';
    const params = [storyboardId];

    if (chapterId) {
        query += ' AND chapter_id = ?';
        params.push(chapterId);
    }

    query += ' ORDER BY order_index ASC';

    const pages = db.prepare(query).all(...params);
    res.json(pages);
});

app.get('/api/elements/:pageId', (req: any, res: any) => {
    const elements = db.prepare('SELECT * FROM elements WHERE page_id = ? ORDER BY z_index ASC').all(req.params.pageId);
    res.json(elements.map((el: any) => ({
        ...el,
        content: JSON.parse(el.content)
    })));
});

// Restored Page Endpoints
app.post('/api/pages', (req: any, res: any) => {
    const { title, storyboardId, chapterId } = req.body;
    const id = crypto.randomUUID();

    // Default order index logic
    // If chapterId provided, count pages in chapter
    let orderIndex = 0;
    if (chapterId) {
        orderIndex = (db.prepare('SELECT COUNT(*) as count FROM pages WHERE chapter_id = ?').get(chapterId) as any).count;
    } else {
        orderIndex = (db.prepare('SELECT COUNT(*) as count FROM pages WHERE storyboard_id = ?').get(storyboardId) as any).count;
    }

    db.prepare('INSERT INTO pages (id, storyboard_id, chapter_id, title, order_index) VALUES (?, ?, ?, ?, ?)').run(
        id, storyboardId, chapterId, title, orderIndex
    );
    const newPage = { id, title, storyboard_id: storyboardId, chapter_id: chapterId, order_index: orderIndex };
    io.emit('page:add', newPage);
    res.json(newPage);
});

app.post('/api/pages/duplicate', (req: any, res: any) => {
    const { pageId } = req.body;
    const oldPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as any;
    if (!oldPage) return res.status(404).json({ error: 'Page not found' });

    const newId = crypto.randomUUID();
    const newTitle = `${oldPage.title} (Copy)`;
    const chapterId = oldPage.chapter_id;
    const orderIndex = oldPage.order_index + 1; // Insert after default or handle reordering later

    // Shift others
    if (chapterId) {
        db.prepare('UPDATE pages SET order_index = order_index + 1 WHERE chapter_id = ? AND order_index >= ?').run(chapterId, orderIndex);
    } else {
        db.prepare('UPDATE pages SET order_index = order_index + 1 WHERE storyboard_id = ? AND order_index >= ?').run(oldPage.storyboard_id, orderIndex);
    }

    db.prepare('INSERT INTO pages (id, storyboard_id, chapter_id, title, order_index, thumbnail) VALUES (?, ?, ?, ?, ?, ?)').run(
        newId, oldPage.storyboard_id, chapterId, newTitle, orderIndex, oldPage.thumbnail
    );

    const oldElements = db.prepare('SELECT * FROM elements WHERE page_id = ?').all(pageId) as any[];
    const idMap = new Map<string, string>(); // Old ID -> New ID

    // First pass: Create new elements and map IDs
    oldElements.forEach(el => {
        const newElId = crypto.randomUUID();
        idMap.set(el.id, newElId);
    });

    // Second pass: Insert with updated references
    const insertEl = db.prepare(`
        INSERT INTO elements (
            id, page_id, type, x, y, width, height, content, z_index, start_element_id, end_element_id, group_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    oldElements.forEach(el => {
        const newElId = idMap.get(el.id);
        const startId = el.start_element_id ? idMap.get(el.start_element_id) : null;
        const endId = el.end_element_id ? idMap.get(el.end_element_id) : null;
        // group_id needs to be re-generated if we want to separate copies? 
        // Or keep if copying to same storyboard? 
        // Actually, if we duplicate page, we probably want new group IDs for those elements so they don't link to old page elements
        // This is complex. For now, let's just nullify group_id or generate new if we track groups?
        // Let's just nullify for simplicity or copy as is (risk of collision if group_id is unique per storyboard?)
        // Assuming group_id is just a string shared by elements, copying it is fine, they form a new group on new page.

        insertEl.run(
            newElId, newId, el.type, el.x, el.y, el.width, el.height,
            el.content, el.z_index, startId, endId, el.group_id
        );
    });

    const newPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(newId) as any;
    io.emit('page:add', newPage);
    res.json({ success: true, newPageId: newId });
});

app.put('/api/pages/reorder', (req: any, res: any) => {
    const { order } = req.body; // array of page objects { id, order_index }? Or just ids
    // Simplest: array of ids in order
    const update = db.prepare('UPDATE pages SET order_index = ? WHERE id = ?');
    const transaction = db.transaction((ids: string[]) => {
        ids.forEach((id, index) => {
            update.run(index, id);
        });
    });
    transaction(order);
    io.emit('pages:reorder', { order });
    res.json({ success: true });
});

app.post('/api/elements/move', (req: any, res: any) => {
    const { elementIds, targetPageId } = req.body;
    if (!elementIds || !targetPageId) return res.status(400).json({ error: 'elementIds and targetPageId required' });

    try {
        const moveElements = db.transaction(() => {
            // Get current pages of elements to emit delete events
            const elements = db.prepare(`SELECT id, page_id FROM elements WHERE id IN (${elementIds.map(() => '?').join(',')})`).all(...elementIds) as { id: string, page_id: string }[];

            // Update page_id
            db.prepare(`UPDATE elements SET page_id = ? WHERE id IN (${elementIds.map(() => '?').join(',')})`).run(targetPageId, ...elementIds);

            return elements;
        });

        const movedElements = moveElements();

        // Broadcast move (delete from old pages, add to new page)
        movedElements.forEach((el: { id: string, page_id: string }) => {
            io.emit('element:delete', { id: el.id, pageId: el.page_id });
            // Fetch updated element with content for add event
            const updatedEl = db.prepare('SELECT * FROM elements WHERE id = ?').get(el.id) as any;
            if (updatedEl) {
                io.emit('element:add', {
                    ...updatedEl,
                    pageId: targetPageId,
                    content: JSON.parse(updatedEl.content)
                });
            }
        });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/elements/batch-move', (req: any, res: any) => {
    const { elements } = req.body; // Array of { id, x, y }
    if (!elements || !Array.isArray(elements)) {
        return res.status(400).json({ error: 'elements array required' });
    }

    try {
        const updateStmt = db.prepare('UPDATE elements SET x = ?, y = ? WHERE id = ?');
        const batchUpdate = db.transaction((updates: any[]) => {
            for (const el of updates) {
                updateStmt.run(el.x, el.y, el.id);
            }
        });

        batchUpdate(elements);

        // Broadcast to all clients
        elements.forEach(el => {
            io.emit('element:move', el);
        });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/search', (req: any, res: any) => {
    const { q } = req.query;
    if (!q) return res.json([]);

    // Search in elements content (text) or title?
    // Elements content is a JSON string. We can use LIKE %q% on content column as a basic search.
    // Also join with pages to get page title.
    const results = db.prepare(`
        SELECT e.id, e.type, e.page_id, p.title as page_title, e.content 
        FROM elements e
        JOIN pages p ON e.page_id = p.id
        WHERE e.content LIKE ? OR e.type LIKE ?
    `).all(`%${q}%`, `%${q}%`);

    res.json(results.map((r: any) => ({
        ...r,
        content: JSON.parse(r.content)
    })));
});

app.patch('/api/pages/:id', (req: any, res: any) => {
    const updates = req.body;
    const allowedFields = ['title', 'thumbnail', 'viewport_x', 'viewport_y', 'viewport_scale'];
    const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fieldsToUpdate.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = fieldsToUpdate.map(key => `${key} = ?`).join(', ');
    const values = fieldsToUpdate.map(key => updates[key]);

    try {
        db.prepare(`UPDATE pages SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
        const updatedPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id) as any;
        io.emit('page:update', updatedPage);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/pages/:id/move-chapter', (req: any, res: any) => {
    const { chapterId } = req.body;
    const pageId = req.params.id;

    try {
        const result = db.prepare('SELECT COUNT(*) as count FROM pages WHERE chapter_id = ?').get(chapterId) as any;
        const newOrderIndex = result ? result.count : 0;

        db.prepare('UPDATE pages SET chapter_id = ?, order_index = ? WHERE id = ?').run(chapterId, newOrderIndex, pageId);

        const updatedPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as any;
        io.emit('page:update', updatedPage);

        res.json({ success: true, page: updatedPage });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/pages/:id/move-project', (req: any, res: any) => {
    const { targetProjectId } = req.body;
    const pageId = req.params.id;

    if (!targetProjectId) return res.status(400).json({ error: 'targetProjectId required' });

    try {
        // Find default storyboard for target project
        const storyboard = db.prepare('SELECT id FROM storyboards WHERE project_id = ?').get(targetProjectId) as { id: string } | undefined;
        if (!storyboard) return res.status(404).json({ error: 'Target project has no storyboard' });

        // Find a suitable chapter in the target storyboard (e.g., first chapter or "Imported")
        let chapter = db.prepare('SELECT id FROM chapters WHERE storyboard_id = ? ORDER BY order_index ASC LIMIT 1').get(storyboard.id) as { id: string } | undefined;

        // If no chapter exists, create one
        if (!chapter) {
            const newChapterId = crypto.randomUUID();
            db.prepare('INSERT INTO chapters (id, storyboard_id, title, order_index) VALUES (?, ?, ?, ?)').run(
                newChapterId, storyboard.id, 'Imported Pages', 0
            );
            chapter = { id: newChapterId };
            io.emit('chapter:add', { id: newChapterId, storyboard_id: storyboard.id, title: 'Imported Pages', order_index: 0 });
        }

        // Get new order index
        const countResult = db.prepare('SELECT COUNT(*) as count FROM pages WHERE chapter_id = ?').get(chapter.id) as any;
        const newOrderIndex = countResult ? countResult.count : 0;

        // Perform the move
        db.prepare('UPDATE pages SET storyboard_id = ?, chapter_id = ?, order_index = ? WHERE id = ?').run(
            storyboard.id, chapter.id, newOrderIndex, pageId
        );

        const updatedPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as any;

        // Broadcast events
        // 1. Tell current project it's gone
        io.emit('page:delete', { id: pageId });

        // 2. Tell target project users (or global listeners) it's added/moved there
        // Actually, since we're filtering by storyboard on client, 'page:add' might be safer if the client isn't smart enough to handle a 'move across storyboards' event
        io.emit('page:add', updatedPage);

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


// Helper to resolve file path from URL
const getFilePathFromUrl = (url: string) => {
    try {
        let decodedUrl = decodeURIComponent(url);

        // Handle full URLs by stripping protocol/domain if present
        if (decodedUrl.startsWith('http')) {
            try {
                const urlObj = new URL(decodedUrl);
                decodedUrl = urlObj.pathname;
            } catch (e) {
                // Keep original if URL parsing fails
            }
        }

        // Normalize slashes
        decodedUrl = decodedUrl.replace(/\\/g, '/');

        // improved stripping of /uploads/ prefix or finding it in the path
        const uploadsMarker = '/uploads/';
        const index = decodedUrl.indexOf(uploadsMarker);

        let relativePath = '';
        if (index !== -1) {
            // Take everything after /uploads/
            relativePath = decodedUrl.substring(index + uploadsMarker.length);
        } else if (decodedUrl.startsWith('uploads/')) {
            relativePath = decodedUrl.substring(8);
        } else {
            // If just a filename or path without uploads prefix, assume relative
            relativePath = decodedUrl;
        }

        // Strip leading slashes to avoid absolute path behavior in path.join
        relativePath = relativePath.replace(/^[\/\\]+/, '');

        // 4. Join with the absolute uploadsDir
        return path.join(uploadsDir, relativePath);
    } catch (err) {
        console.error('Error resolving path from URL:', url, err);
        return '';
    }
};

const hardDeleteAssets = (ids: string[]) => {
    try {
        if (!ids || ids.length === 0) return;

        const placeholders = ids.map(() => '?').join(',');
        const elements = db.prepare(`SELECT id, content FROM elements WHERE id IN (${placeholders})`).all(...ids) as any[];

        elements.forEach(el => {
            const content = JSON.parse(el.content || '{}');
            if (content.url) {
                const fileName = path.basename(content.url);
                const filePath = getFilePathFromUrl(content.url);

                // Check if any OTHER element uses this file
                // We exclude the elements being deleted from the check
                const countResult = db.prepare(`
                    SELECT COUNT(*) as count 
                    FROM elements 
                    WHERE id NOT IN (${placeholders}) 
                    AND content LIKE ?
                `).get(...ids, `%${fileName}%`) as { count: number };

                if (countResult.count === 0) {
                    if (fs.existsSync(filePath)) {
                        console.log(`🗑️ Hard deleting file: ${filePath}`);
                        fs.unlinkSync(filePath);
                    }
                } else {
                    console.log(`🛡️ Preserving file ${fileName}, used by ${countResult.count} other elements`);
                }
            }
        });
    } catch (err) {
        console.error('Error in hardDeleteAssets:', err);
    }
};

app.delete('/api/pages/:id', (req: any, res: any) => {
    const pageId = req.params.id;

    // Prevent deletion of system pages
    const page = db.prepare('SELECT type FROM pages WHERE id = ?').get(pageId) as any;
    if (page?.type === 'videos') {
        return res.status(403).json({ error: 'System pages cannot be deleted' });
    }

    // Get all element IDs for this page to hard delete their assets
    const elements = db.prepare('SELECT id FROM elements WHERE page_id = ?').all(pageId) as { id: string }[];
    const elementIds = elements.map(e => e.id);
    if (elementIds.length > 0) {
        hardDeleteAssets(elementIds);
    }

    const deletePage = db.transaction(() => {
        db.prepare('DELETE FROM elements WHERE page_id = ?').run(pageId);
        db.prepare('DELETE FROM pages WHERE id = ?').run(pageId);
    });
    deletePage();
    io.emit('page:delete', { id: pageId });
    res.json({ success: true });
});

app.delete('/api/elements/batch', (req: any, res: any) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids array required' });
    }

    try {
        hardDeleteAssets(ids);

        const deleteStmt = db.prepare('DELETE FROM elements WHERE id = ?');
        const batchDelete = db.transaction((elementIds: string[]) => {
            for (const id of elementIds) {
                deleteStmt.run(id);
            }
        });

        batchDelete(ids);

        // Broadcast to all clients
        ids.forEach(id => {
            io.emit('element:delete', { id });
        });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/elements/:id', (req: any, res: any) => {
    try {
        hardDeleteAssets([req.params.id]);
        db.prepare('DELETE FROM elements WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload', upload.single('file'), (req: any, res: any) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const projectId = req.body.projectId || 'default-project';
    const url = `/uploads/${projectId}/${req.file.filename}`;
    res.json({ url, type: req.file.mimetype });
});

app.post('/api/download-zip', (req: any, res: any) => {
    const { elementIds } = req.body;
    if (!elementIds || !Array.isArray(elementIds)) {
        return res.status(400).json({ error: 'elementIds array required' });
    }

    console.log(`📦 [Download] Request for ${elementIds.length} elements`);

    try {
        const elements = db.prepare(`SELECT * FROM elements WHERE id IN (${elementIds.map(() => '?').join(',')})`).all(...elementIds) as any[];
        console.log(`📦 [Download] Found ${elements.length} elements in DB`);

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        res.attachment('assets.zip');
        archive.pipe(res);

        let addedCount = 0;
        let missedCount = 0;
        const missingFiles: string[] = [];

        elements.forEach(el => {
            try {
                const content = JSON.parse(el.content);
                if (content.url) {
                    const filePath = getFilePathFromUrl(content.url);
                    const fileName = path.basename(content.url);

                    if (filePath && fs.existsSync(filePath)) {
                        archive.file(filePath, { name: fileName });
                        addedCount++;
                    } else {
                        console.warn(`⚠️ [Download] File missing for element ${el.id}: ${filePath} (URL: ${content.url})`);
                        missedCount++;
                        missingFiles.push(`Element ID: ${el.id}\nOriginal URL: ${content.url}\nResolved Path: ${filePath}\nComputed Uploads Dir: ${uploadsDir}\n`);
                    }
                }
            } catch (parseErr) {
                console.error(`❌ [Download] Error parsing content for element ${el.id}:`, parseErr);
                missingFiles.push(`Element ID: ${el.id} - content parse error`);
            }
        });

        if (missedCount > 0) {
            archive.append(missingFiles.join('\n\n-------------------\n\n'), { name: 'MISSING_FILES_REPORT.txt' });
        }

        console.log(`✅ [Download] Finalizing zip. Added: ${addedCount}, Missed: ${missedCount}`);
        archive.finalize();
    } catch (err: any) {
        console.error('❌ [Download] Error generating zip:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

app.post('/api/elements', (req: any, res: any) => {
    const data = req.body;
    const { pageId, type, x, y, width, height } = data;
    const id = crypto.randomUUID();

    // Get max z_index
    const result = db.prepare('SELECT MAX(z_index) as maxZ FROM elements WHERE page_id = ?').get(pageId) as { maxZ: number };
    const zIndex = (result && result.maxZ !== null) ? result.maxZ + 1 : 0;

    const dbColumns = [
        'page_id', 'type', 'x', 'y', 'width', 'height', 'rotation',
        'style', 'z_index', 'start_element_id', 'end_element_id', 'group_id'
    ];

    const finalContent = { ...(data.content || {}) };
    const columnValues: any = {
        id,
        page_id: pageId,
        type,
        x,
        y,
        width,
        height,
        z_index: zIndex,
        start_element_id: data.start_element_id,
        end_element_id: data.end_element_id,
        group_id: data.group_id
    };

    // Capture other fields into content
    for (const key of Object.keys(data)) {
        if (key === 'content' || key === 'pageId') continue; // pageId is alias for page_id in req
        if (!dbColumns.includes(key) && key !== 'id') {
            finalContent[key] = data[key];
        }
    }

    db.prepare(`
        INSERT INTO elements (
            id, page_id, type, x, y, width, height, content, z_index, start_element_id, end_element_id, group_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, columnValues.page_id, columnValues.type, columnValues.x, columnValues.y,
        columnValues.width, columnValues.height, JSON.stringify(finalContent),
        zIndex, columnValues.start_element_id, columnValues.end_element_id, columnValues.group_id
    );

    const fullElement = { ...columnValues, content: finalContent };

    // Broadcast to other clients
    io.emit('element:add', { ...fullElement, pageId }); // consistency with client pageId
    res.json(fullElement);
});

app.put('/api/elements/reorder', (req: any, res: any) => {
    const { pageId, order } = req.body; // order is array of ids

    const updateStmt = db.prepare('UPDATE elements SET z_index = ? WHERE id = ?');
    const transaction = db.transaction((ids: string[]) => {
        ids.forEach((id, index) => {
            updateStmt.run(index, id);
        });
    });

    transaction(order);

    io.emit('element:reorder', { pageId, order });
    res.json({ success: true });
});
const broadcastUserCount = () => {
    const count = io.sockets.sockets.size;
    console.log(`👥 Active connections: ${count}`);
    io.emit('user_count', count);
};

const parseMiddleUrls = (raw: unknown): string[] => {
    if (!raw || typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
};

const parseMultiPromptItems = (raw: unknown, fallbackRawUrls?: unknown): Array<{ url?: string; prompt: string; duration: string }> => {
    if (raw && typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((item) => item && typeof item === 'object')
                    .map((item: any) => ({
                        ...(typeof item.url === 'string' && item.url ? { url: item.url } : {}),
                        prompt: typeof item.prompt === 'string' ? item.prompt : '',
                        duration: typeof item.duration === 'string' ? item.duration : ''
                    }));
            }
        } catch {
            // fallback below
        }
    }
    return [];
};

app.get('/api/batch/tasks', (req: any, res: any) => {
    try {
        const tasks = db.prepare('SELECT * FROM batch_tasks ORDER BY created_at DESC').all();
        res.json(tasks.map((t: any) => ({
            ...t,
            audio_enabled: !!t.audio_enabled,
            aspect_ratio: t.aspect_ratio || '16:9',
            multi_prompt_items: parseMultiPromptItems(t.multi_prompt_items, t.middle_frame_urls),
            middle_frame_urls: parseMiddleUrls(t.middle_frame_urls)
        })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/videos/sync', async (req: any, res: any) => {
    const dataDir = process.env.DATA_DIR || process.cwd();
    const generatedDir = path.join(dataDir, 'uploads', 'generated');
    const storyboardId = 'default-storyboard';

    if (!fs.existsSync(generatedDir)) {
        return res.json({ success: true, added: 0 });
    }

    try {
        const videosPage = db.prepare("SELECT id FROM pages WHERE storyboard_id = ? AND type = 'videos'").get(storyboardId) as { id: string } | undefined;
        if (!videosPage) return res.status(404).json({ error: 'Videos page not found' });

        const existingElements = db.prepare("SELECT content FROM elements WHERE page_id = ? AND type = 'video'").all(videosPage.id) as { content: string }[];
        const existingUrls = new Set(existingElements.map(e => JSON.parse(e.content).url));

        const files = fs.readdirSync(generatedDir).filter(file => file.endsWith('.mp4'));
        let addedCount = 0;

        const countResult = db.prepare('SELECT COUNT(*) as count FROM elements WHERE page_id = ?').get(videosPage.id) as { count: number };
        let currentCount = countResult.count;

        for (const file of files) {
            const url = `/uploads/generated/${file}`;
            if (!existingUrls.has(url)) {
                const elementId = crypto.randomUUID();
                const x = 50 + (currentCount % 3) * 450;
                const y = 50 + Math.floor(currentCount / 3) * 350;

                let width: number;
                let height: number;

                try {
                    const filePath = path.join(generatedDir, file);
                    const dimensions = await getVideoDimensions(filePath);
                    if (dimensions.width && dimensions.height) {
                        // Use original dimensions without scaling
                        width = dimensions.width;
                        height = dimensions.height;
                    } else {
                        throw new Error(`Could not determine dimensions for ${file}`);
                    }
                } catch (dimErr) {
                    console.error(`Failed to get dimensions for ${file}:`, dimErr);
                    continue; // Skip this file if we can't get dimensions
                }

                const content = { url, width, height };

                db.prepare('INSERT INTO elements (id, page_id, type, x, y, width, height, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
                    elementId, videosPage.id, 'video', x, y, width, height, JSON.stringify(content)
                );

                io.emit('element:add', {
                    id: elementId,
                    pageId: videosPage.id,
                    type: 'video',
                    x, y, width, height,
                    content
                });

                currentCount++;
                addedCount++;
            }
        }

        res.json({ success: true, added: addedCount });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/batch/add-frame', (req: any, res: any) => {
    const { url, role } = req.body; // role: 'first' | 'last' | 'middle'
    if (!url || !role) return res.status(400).json({ error: 'url and role required' });
    if (!['first', 'last', 'middle'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    try {
        if (role === 'middle') {
            const existingRow = db.prepare(`
                SELECT id, middle_frame_urls, multi_prompt_items, first_frame_url, last_frame_url
                FROM batch_tasks
                WHERE status IN ('pending', 'failed')
                ORDER BY created_at DESC
                LIMIT 1
            `).get() as { id: string; middle_frame_urls?: string; multi_prompt_items?: string; first_frame_url?: string; last_frame_url?: string } | undefined;

            if (existingRow) {
                if (existingRow.last_frame_url) {
                    return res.status(400).json({ error: 'Not possible: either first+last frame OR multi_prompt.' });
                }

                const currentMiddleUrls = parseMiddleUrls(existingRow.middle_frame_urls);
                if (currentMiddleUrls.length >= KLING_MULTI_PROMPT_MAX_IMAGES) {
                    return res.status(400).json({ error: `Kling multi_prompt supports a maximum of ${KLING_MULTI_PROMPT_MAX_IMAGES} images.` });
                }

                const updatedMiddleUrls = [...currentMiddleUrls, url];
                db.prepare('UPDATE batch_tasks SET middle_frame_urls = ? WHERE id = ?').run(
                    JSON.stringify(updatedMiddleUrls),
                    existingRow.id
                );
                const updated = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(existingRow.id) as any;
                updated.audio_enabled = !!updated.audio_enabled;
                updated.multi_prompt_items = parseMultiPromptItems(updated.multi_prompt_items, updated.middle_frame_urls);
                updated.middle_frame_urls = parseMiddleUrls(updated.middle_frame_urls);
                io.emit('batch:update', updated);
                return res.json(updated);
            }

            const id = crypto.randomUUID();
            db.prepare('INSERT INTO batch_tasks (id, middle_frame_urls, multi_prompt_items, aspect_ratio, model_name, mode) VALUES (?, ?, ?, ?, ?, ?)').run(
                id,
                JSON.stringify([url]),
                JSON.stringify([]),
                '16:9',
                'kling-v3',
                'pro'
            );
            const newTask = {
                id,
                first_frame_url: null,
                last_frame_url: null,
                middle_frame_urls: [url],
                multi_prompt_items: [],
                prompt: '',
                duration: 5,
                audio_enabled: false,
                aspect_ratio: '16:9',
                model_name: 'kling-v3',
                mode: 'pro',
                status: 'pending',
                created_at: new Date().toISOString()
            };
            io.emit('batch:add', newTask);
            return res.json(newTask);
        }

        const id = crypto.randomUUID();
        const columnToCheck = role === 'first' ? 'last_frame_url' : 'first_frame_url';
        const columnToFill = role === 'first' ? 'first_frame_url' : 'last_frame_url';

        const existingRow = db.prepare(`
            SELECT id FROM batch_tasks 
            WHERE ${columnToFill} IS NULL 
            AND ${columnToCheck} IS NOT NULL 
            ORDER BY created_at ASC LIMIT 1
        `).get() as { id: string } | undefined;

        if (existingRow) {
            if (role === 'last') {
                const row = db.prepare('SELECT middle_frame_urls, multi_prompt_items FROM batch_tasks WHERE id = ?').get(existingRow.id) as any;
                const hasMultiPrompt = parseMultiPromptItems(row?.multi_prompt_items, row?.middle_frame_urls).length > 0;
                if (hasMultiPrompt) {
                    return res.status(400).json({ error: 'Not possible: either first+last frame OR multi_prompt.' });
                }
            }
            db.prepare(`UPDATE batch_tasks SET ${columnToFill} = ? WHERE id = ?`).run(url, existingRow.id);
            const updated = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(existingRow.id) as any;
            updated.audio_enabled = !!updated.audio_enabled;
            updated.multi_prompt_items = parseMultiPromptItems(updated.multi_prompt_items, updated.middle_frame_urls);
            updated.middle_frame_urls = parseMiddleUrls(updated.middle_frame_urls);
            io.emit('batch:update', updated);
            return res.json(updated);
        }

        const middleOnlyRow = db.prepare(`
            SELECT id FROM batch_tasks
            WHERE first_frame_url IS NULL
              AND last_frame_url IS NULL
              AND middle_frame_urls IS NOT NULL
              AND middle_frame_urls != '[]'
              AND status IN ('pending', 'failed')
            ORDER BY created_at DESC
            LIMIT 1
        `).get() as { id: string } | undefined;

        if (middleOnlyRow) {
            if (role === 'last') {
                return res.status(400).json({ error: 'Not possible: either first+last frame OR multi_prompt.' });
            }
            db.prepare(`UPDATE batch_tasks SET ${columnToFill} = ? WHERE id = ?`).run(url, middleOnlyRow.id);
            const updated = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(middleOnlyRow.id) as any;
            updated.audio_enabled = !!updated.audio_enabled;
            updated.multi_prompt_items = parseMultiPromptItems(updated.multi_prompt_items, updated.middle_frame_urls);
            updated.middle_frame_urls = parseMiddleUrls(updated.middle_frame_urls);
            io.emit('batch:update', updated);
            return res.json(updated);
        }

        db.prepare(`INSERT INTO batch_tasks (id, ${columnToFill}, aspect_ratio, model_name, mode) VALUES (?, ?, ?, ?, ?)`).run(id, url, '16:9', 'kling-v3', 'pro');
        const newTask = {
            id,
            [columnToFill]: url,
            [columnToCheck]: null,
            middle_frame_urls: [],
            multi_prompt_items: [],
            prompt: '',
            duration: 5,
            audio_enabled: false,
            aspect_ratio: '16:9',
            model_name: 'kling-v3',
            mode: 'pro',
            status: 'pending',
            created_at: new Date().toISOString()
        };
        io.emit('batch:add', newTask);
        res.json(newTask);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/batch/tasks/:id', (req: any, res: any) => {
    const { prompt, duration, audio_enabled, aspect_ratio, status, model_name, mode, cfg_scale, negative_prompt, middle_frame_urls, multi_prompt_items } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (prompt !== undefined) { updates.push('prompt = ?'); values.push(prompt); }
    if (duration !== undefined) { updates.push('duration = ?'); values.push(duration); }
    if (audio_enabled !== undefined) { updates.push('audio_enabled = ?'); values.push(audio_enabled ? 1 : 0); }
    if (aspect_ratio !== undefined) { updates.push('aspect_ratio = ?'); values.push(aspect_ratio); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (model_name !== undefined) { updates.push('model_name = ?'); values.push(model_name); }
    if (mode !== undefined) { updates.push('mode = ?'); values.push(mode); }
    if (cfg_scale !== undefined) { updates.push('cfg_scale = ?'); values.push(cfg_scale); }
    if (negative_prompt !== undefined) { updates.push('negative_prompt = ?'); values.push(negative_prompt); }
    if (middle_frame_urls !== undefined) { updates.push('middle_frame_urls = ?'); values.push(JSON.stringify(Array.isArray(middle_frame_urls) ? middle_frame_urls : [])); }
    if (multi_prompt_items !== undefined) {
        const normalizedItems = Array.isArray(multi_prompt_items)
            ? multi_prompt_items
                .filter((item: any) => item && typeof item === 'object')
                .map((item: any) => ({
                    ...(typeof item.url === 'string' && item.url ? { url: item.url } : {}),
                    prompt: typeof item.prompt === 'string' ? item.prompt : '',
                    duration: typeof item.duration === 'string' ? item.duration : ''
                }))
            : [];
        updates.push('multi_prompt_items = ?');
        values.push(JSON.stringify(normalizedItems));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
        if (middle_frame_urls !== undefined) {
            const current = db.prepare('SELECT last_frame_url FROM batch_tasks WHERE id = ?').get(req.params.id) as any;
            const normalizedMiddle = Array.isArray(middle_frame_urls)
                ? middle_frame_urls.filter((url: any) => typeof url === 'string' && url)
                : [];
            if (current?.last_frame_url && normalizedMiddle.length > 0) {
                return res.status(400).json({ error: 'Not possible: either first+last frame OR multi_prompt.' });
            }
            if (normalizedMiddle.length > KLING_MULTI_PROMPT_MAX_IMAGES) {
                return res.status(400).json({ error: `Kling multi_prompt supports a maximum of ${KLING_MULTI_PROMPT_MAX_IMAGES} images.` });
            }
        }
        if (multi_prompt_items !== undefined) {
            const current = db.prepare('SELECT first_frame_url, last_frame_url, middle_frame_urls FROM batch_tasks WHERE id = ?').get(req.params.id) as any;
            const normalizedItems = Array.isArray(multi_prompt_items)
                ? multi_prompt_items.filter((item: any) => item && typeof item === 'object')
                : [];
            if (current?.last_frame_url && normalizedItems.length > 0) {
                return res.status(400).json({ error: 'Not possible: either first+last frame OR multi_prompt.' });
            }
            if (normalizedItems.length > KLING_MULTI_PROMPT_MAX_SHOTS) {
                return res.status(400).json({ error: `Kling multi_prompt supports a maximum of ${KLING_MULTI_PROMPT_MAX_SHOTS} prompts.` });
            }
            const refsFromPrompts = normalizedItems.filter((item: any) => typeof item.url === 'string' && item.url).length;
            const refsFromMiddle = middle_frame_urls !== undefined
                ? (Array.isArray(middle_frame_urls) ? middle_frame_urls.filter((u: any) => typeof u === 'string' && u).length : 0)
                : parseMiddleUrls(current?.middle_frame_urls).length;
            if (Math.max(refsFromPrompts, refsFromMiddle) > KLING_MULTI_PROMPT_MAX_IMAGES) {
                return res.status(400).json({ error: `Kling multi_prompt supports a maximum of ${KLING_MULTI_PROMPT_MAX_IMAGES} images.` });
            }
        }
        db.prepare(`UPDATE batch_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.params.id);
        const updated = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(req.params.id) as any;
        updated.audio_enabled = !!updated.audio_enabled;
        updated.aspect_ratio = updated.aspect_ratio || '16:9';
        updated.multi_prompt_items = parseMultiPromptItems(updated.multi_prompt_items, updated.middle_frame_urls);
        updated.middle_frame_urls = parseMiddleUrls(updated.middle_frame_urls);
        io.emit('batch:update', updated);
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/batch/tasks/:id', (req: any, res: any) => {
    try {
        db.prepare('DELETE FROM batch_tasks WHERE id = ?').run(req.params.id);
        io.emit('batch:delete', { id: req.params.id });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/batch/tasks/:id/fetch-video', async (req: any, res: any) => {
    try {
        const task = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(req.params.id) as any;
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!task.kling_task_id) return res.status(400).json({ error: 'Missing Kling task ID on this batch item' });

        const klingApiKey = process.env.KLING_API_KEY;
        const klingAccessKey = process.env.KLING_ACCESS_KEY;
        const klingSecretKey = process.env.KLING_SECRET_KEY;
        if (!klingApiKey && (!klingAccessKey || !klingSecretKey)) {
            return res.status(500).json({ error: 'Server configuration error: Kling credentials missing' });
        }
        const klingConfig = {
            ...(klingApiKey ? { klingApiKey } : {}),
            ...(klingAccessKey ? { klingAccessKey } : {}),
            ...(klingSecretKey ? { klingSecretKey } : {})
        };

        const result = await KlingImageToVideoService.fetchVideoByTaskId(klingConfig, task.kling_task_id);

        if (result.task_status === 'succeed' && result.videoUrl) {
            db.prepare('UPDATE batch_tasks SET status = ?, generated_video_url = ?, error = NULL WHERE id = ?').run(
                'completed',
                result.videoUrl,
                task.id
            );
            const updated = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(task.id) as any;
            updated.audio_enabled = !!updated.audio_enabled;
            updated.multi_prompt_items = parseMultiPromptItems(updated.multi_prompt_items, updated.middle_frame_urls);
            updated.middle_frame_urls = parseMiddleUrls(updated.middle_frame_urls);
            io.emit('batch:update', updated);
            return res.json(updated);
        }

        return res.status(409).json({
            error: result.task_status_msg || `Task is still ${result.task_status}`,
            task_status: result.task_status
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/batch/generate', async (req: any, res: any) => {
    const allTasks = db.prepare("SELECT * FROM batch_tasks").all() as any[];
    console.log(`🔍 [Batch] Total tasks in DB: ${allTasks.length}`);
    allTasks.forEach(t => console.log(`   - Task ${t.id}: status=${t.status}, first=${t.first_frame_url}, last=${t.last_frame_url}`));

    const tasks = db.prepare("SELECT * FROM batch_tasks WHERE status IN ('pending', 'failed') AND (first_frame_url IS NOT NULL OR last_frame_url IS NOT NULL OR (middle_frame_urls IS NOT NULL AND middle_frame_urls != '[]'))").all() as any[];
    console.log(`🔍 [Batch] Pending tasks found: ${tasks.length}`);

    if (tasks.length === 0) return res.status(400).json({ error: 'No pending tasks with at least one frame' });

    const klingApiKey = process.env.KLING_API_KEY;
    const klingAccessKey = process.env.KLING_ACCESS_KEY;
    const klingSecretKey = process.env.KLING_SECRET_KEY;

    if (!klingApiKey && (!klingAccessKey || !klingSecretKey)) {
        console.error('❌ Missing Kling credentials (API Key or Access/Secret keys)');
        return res.status(500).json({ error: 'Server configuration error: Kling credentials missing' });
    }

    const klingConfig = {
        ...(klingApiKey ? { klingApiKey } : {}),
        ...(klingAccessKey ? { klingAccessKey } : {}),
        ...(klingSecretKey ? { klingSecretKey } : {})
    };

    res.json({ success: true, count: tasks.length });

    // Background processing
    for (const task of tasks) {
        try {
            console.log(`🚀 [Kling] Starting generation for task ${task.id}...`);

            // URL Resilience: Convert local/railway URLs to full public URLs if possible, or pass as is
            const getPublicUrl = (localUrl: string) => {
                if (!localUrl) return undefined;

                let finalUrl = localUrl;

                // If relative, prepend base URL
                if (!localUrl.startsWith('http')) {
                    const baseUrl = process.env.STORYBOARD_BASE_URL;
                    if (!baseUrl) {
                        // Relative URL is intentionally allowed here.
                        // Kling service will convert relative local files to Base64 if no public base URL is configured.
                        return localUrl;
                    }
                    const cleanPath = localUrl.startsWith('/') ? localUrl : `/${localUrl}`;
                    finalUrl = `${baseUrl}${cleanPath}`;
                }

                // Force HTTPS for railway.app domains or if we are in production
                if (finalUrl.includes('.up.railway.app') && finalUrl.startsWith('http:')) {
                    console.log(`🔒 [Kling] Upgrading URL to HTTPS: ${finalUrl}`);
                    finalUrl = finalUrl.replace('http:', 'https:');
                }

                return finalUrl;
            };

            let firstFrame = getPublicUrl(task.first_frame_url);
            const lastFrame = getPublicUrl(task.last_frame_url);
            let multiPromptItems = parseMultiPromptItems(task.multi_prompt_items, task.middle_frame_urls);
            let middleRefImages = parseMiddleUrls(task.middle_frame_urls)
                .map((url) => getPublicUrl(url))
                .filter((url): url is string => !!url);

            // Recovery path: if no explicit first frame exists, use the first middle reference image as start image.
            if (!firstFrame && middleRefImages.length > 0) {
                const fallbackFirst = middleRefImages[0];
                if (fallbackFirst) {
                    firstFrame = fallbackFirst;
                    middleRefImages = middleRefImages.slice(1);
                }
            }

            if (!firstFrame) {
                console.error(`❌ [Kling] Task ${task.id} missing start image URL, skipping`);
                db.prepare('UPDATE batch_tasks SET status = ?, error = ? WHERE id = ?').run('failed', 'Missing first frame', task.id);
                continue;
            }
            if (lastFrame && multiPromptItems.length > 0) {
                console.error(`❌ [Kling] Task ${task.id} invalid config: last_frame + multi_prompt`);
                db.prepare('UPDATE batch_tasks SET status = ?, error = ? WHERE id = ?').run('failed', 'Not possible: either first+last frame OR multi_prompt', task.id);
                continue;
            }
            if (middleRefImages.length > KLING_MULTI_PROMPT_MAX_IMAGES) {
                console.error(`❌ [Kling] Task ${task.id} invalid config: too many reference images`);
                db.prepare('UPDATE batch_tasks SET status = ?, error = ? WHERE id = ?').run('failed', `Kling multi_prompt supports a maximum of ${KLING_MULTI_PROMPT_MAX_IMAGES} images`, task.id);
                continue;
            }
            if (multiPromptItems.length > KLING_MULTI_PROMPT_MAX_SHOTS) {
                console.error(`❌ [Kling] Task ${task.id} invalid config: too many prompts`);
                db.prepare('UPDATE batch_tasks SET status = ?, error = ? WHERE id = ?').run('failed', `Kling multi_prompt supports a maximum of ${KLING_MULTI_PROMPT_MAX_SHOTS} prompts`, task.id);
                continue;
            }

            // Map DB fields to KlingTaskOptions
            // Map DB fields to KlingTaskOptions - respecting exactOptionalPropertyTypes
            const options = {
                image: firstFrame, // Guaranteed string now
                duration: ([5, 10, 15].includes(task.duration) ? String(task.duration) : '5') as '5' | '10' | '15',
                ...(task.prompt ? { prompt: task.prompt } : { prompt: "Cinematic high quality video" }),
                ...(lastFrame ? { image_tail: lastFrame } : {}),
                ...(multiPromptItems.length ? { multi_prompt_items: multiPromptItems } : {}),
                ...(task.mode ? { mode: task.mode as 'std' | 'pro' } : { mode: 'pro' as const }),
                ...(task.model_name ? { model_name: task.model_name as string } : { model_name: 'kling-v3' }),
                ...(task.cfg_scale ? { cfg_scale: Number(task.cfg_scale) } : { cfg_scale: 0.5 }),
                ...(task.negative_prompt ? { negative_prompt: task.negative_prompt } : {}),
                sound: !!task.audio_enabled
            };

            await KlingImageToVideoService.generate(
                klingConfig,
                options,
                async (status, videoUrl, taskId) => {
                    const updates: any = { status };
                    if (taskId) {
                        updates.kling_task_id = taskId;
                    }
                    if (videoUrl) {
                        updates.generated_video_url = videoUrl;
                        // Automatically add to "Videos" page
                        try {
                            const storyboardId = 'default-storyboard';
                            const videosPage = db.prepare("SELECT id FROM pages WHERE storyboard_id = ? AND type = 'videos'").get(storyboardId) as { id: string } | undefined;

                            if (videosPage) {
                                const elementId = crypto.randomUUID();
                                const count = (db.prepare('SELECT COUNT(*) as count FROM elements WHERE page_id = ?').get(videosPage.id) as any).count;
                                const x = 50 + (count % 3) * 450;
                                const y = 50 + Math.floor(count / 3) * 350;

                                let width: number;
                                let height: number;

                                try {
                                    // videoUrl is /uploads/generated/uuid.mp4
                                    const filePath = path.join(dataDir, videoUrl);
                                    const dimensions = await getVideoDimensions(filePath);
                                    if (dimensions.width && dimensions.height) {
                                        // Use original dimensions without scaling
                                        width = dimensions.width;
                                        height = dimensions.height;
                                    } else {
                                        throw new Error('Could not determine dimensions for generated video');
                                    }
                                } catch (dimErr) {
                                    console.error('Failed to get dimensions for generated video:', dimErr);
                                    // If we strictly require dimensions, we should fail the task here
                                    // rather than returning and leaving it in 'generating' status.
                                    updates.status = 'failed';
                                    updates.error = 'Failed to determine video dimensions';
                                }

                                if (updates.status !== 'failed') {
                                    const content = {
                                        url: videoUrl,
                                        width: width!,
                                        height: height!
                                    };

                                    db.prepare('INSERT INTO elements (id, page_id, type, x, y, width, height, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
                                        elementId, videosPage.id, 'video', x, y, width!, height!, JSON.stringify(content)
                                    );

                                    io.emit('element:add', {
                                        id: elementId,
                                        pageId: videosPage.id,
                                        type: 'video',
                                        x, y, width: width!, height: height!,
                                        content
                                    });
                                    console.log(`🎬 [DB] Auto-added video ${videoUrl} to page ${videosPage.id} at ${width!}x${height!}`);
                                }
                            }
                        } catch (err) {
                            console.error('❌ Failed to auto-add video to canvas:', err);
                        }
                    }

                    const fields: string[] = [];
                    const values: any[] = [];
                    Object.entries(updates).forEach(([k, v]) => {
                        fields.push(`${k} = ?`);
                        values.push(v);
                    });

                    db.prepare(`UPDATE batch_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values, task.id);

                    io.emit('batch:update', {
                        ...task,
                        ...updates,
                        audio_enabled: !!task.audio_enabled,
                        multi_prompt_items: parseMultiPromptItems(task.multi_prompt_items, task.middle_frame_urls),
                        middle_frame_urls: parseMiddleUrls(task.middle_frame_urls)
                    });
                }
            );


        } catch (err) {
            console.error(`❌ [Kling] Error processing batch task ${task.id}:`, err);
            db.prepare("UPDATE batch_tasks SET status = 'failed' WHERE id = ?").run(task.id);
            io.emit('batch:update', {
                ...task,
                status: 'failed',
                audio_enabled: !!task.audio_enabled,
                multi_prompt_items: parseMultiPromptItems(task.multi_prompt_items, task.middle_frame_urls),
                middle_frame_urls: parseMiddleUrls(task.middle_frame_urls)
            });
        }
    }
});

app.get('/api/prompts', (req: any, res: any) => {
    try {
        const promptsPath = path.join(process.cwd(), 'services', 'prompts.md');
        const fileContent = fs.readFileSync(promptsPath, 'utf8');
        const categories: any[] = [];
        const categoryRegex = /\{[^}]*id:\s*'([^']+)'[^}]*title:\s*'([^']+)'[^}]*moves:\s*\[([^\]]+)\]/g;
        let categoryMatch;
        while ((categoryMatch = categoryRegex.exec(fileContent)) !== null) {
            const moves: any[] = [];
            const movesText = categoryMatch[3];
            if (movesText) {
                const moveRegex = /\{\s*id:\s*'([^']+)',\s*title:\s*'([^']+)',\s*description:\s*'([^']+)',\s*prompt:\s*'([^']+)'\s*\}/g;
                let moveMatch;
                while ((moveMatch = moveRegex.exec(movesText)) !== null) {
                    moves.push({ id: moveMatch[1], title: moveMatch[2], description: moveMatch[3], prompt: moveMatch[4] });
                }
            }
            categories.push({ id: categoryMatch[1], title: categoryMatch[2], moves });
        }
        res.json(categories);
    } catch (err: any) {
        console.error('Error reading prompts:', err);
        res.status(500).json({ error: err.message });
    }
});

io.on('connection', (socket: any) => {
    console.log('✅ A user connected:', socket.id);
    broadcastUserCount();

    socket.on('element:move', (data: any) => {
        try {
            console.log('📥 Server received element:move:', data.id);
            socket.broadcast.emit('element:move', data);
            console.log('📤 Server broadcast element:move to other clients');
            db.prepare('UPDATE elements SET x = ?, y = ? WHERE id = ?').run(data.x, data.y, data.id);
        } catch (error) {
            console.error('Error handling element:move:', error);
            socket.emit('error', { event: 'element:move', message: 'Update failed' });
        }
    });

    socket.on('element:update', (data: any) => {
        try {
            console.log('📥 Server received element:update:', data.id);

            // 1. Fetch existing element
            const existing = db.prepare('SELECT * FROM elements WHERE id = ?').get(data.id) as any;
            if (!existing) return;

            const existingContent = JSON.parse(existing.content || '{}');

            // 2. Define DB columns
            const dbColumns = [
                'page_id', 'type', 'x', 'y', 'width', 'height', 'rotation',
                'style', 'z_index', 'start_element_id', 'end_element_id', 'group_id'
            ];

            // 3. Prepare merged state
            const columnUpdates: Map<string, any> = new Map();
            const newContent = { ...existingContent };

            // Special case: if data.content is provided, merge it in first
            if (data.content) {
                Object.assign(newContent, data.content);
                for (const [k, v] of Object.entries(data.content)) {
                    if (dbColumns.includes(k)) columnUpdates.set(k, v);
                }
            }

            // Iterate over all keys in data
            for (const key of Object.keys(data)) {
                if (key === 'id' || key === 'content') continue;

                if (dbColumns.includes(key)) {
                    columnUpdates.set(key, data[key]);
                } else {
                    newContent[key] = data[key];
                }
            }

            // 4. Build SQL
            const updates: string[] = [];
            const values: any[] = [];

            for (const [col, val] of columnUpdates.entries()) {
                updates.push(`${col} = ?`);
                values.push(val);
                // If it's in columns, we can remove it from newContent to keep things clean
                // but actually it's safer to keep it in content too for the client?
                // The client currently merges content, so it's fine.
            }

            // Always update content column
            updates.push('content = ?');
            values.push(JSON.stringify(newContent));

            // 4. Update Database
            values.push(data.id);
            db.prepare(`UPDATE elements SET ${updates.join(', ')} WHERE id = ?`).run(...values);

            // 5. Broadcast MERGED state to all clients
            // Merge everything back for the client
            const broadcastPayload = {
                ...existing,
                ...data,
                content: newContent
            };
            socket.broadcast.emit('element:update', broadcastPayload);
            console.log('📤 Server broadcast merged element:update');

        } catch (error) {
            console.error('Error handling element:update:', error);
            socket.emit('error', { event: 'element:update', message: 'Update failed' });
        }
    });

    socket.on('element:delete', (data: { id: string }) => {
        try {
            console.log('📥 Server received element:delete:', data.id);
            socket.broadcast.emit('element:delete', data);
            console.log('📤 Server broadcast element:delete to other clients');
        } catch (error) {
            console.error('Error handling element:delete:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
        // Small delay to ensure the socket is fully removed from internal maps
        setTimeout(broadcastUserCount, 100);
    });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    const clientDistPath = path.join(process.cwd(), '..', 'client', 'dist');
    app.use(express.static(clientDistPath));

    // Use middleware for catch-all to avoid path-to-regexp v8 issues in Express 5
    app.use((req: any, res: any, next: any) => {
        // Only handle GET requests that haven't been handled yet
        if (req.method !== 'GET') return next();

        // Don't serve index.html for missing assets or API calls
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
            console.log(`🚫 Asset/API not found: ${req.path}`);
            return res.status(404).send('Not Found');
        }

        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

const PORT = Number(process.env.PORT) || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
