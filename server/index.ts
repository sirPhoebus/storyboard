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
import { KlingService } from './services/klingService';

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


// Configure Multer
const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
        cb(null, uploadsDir);
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

// API Endpoints
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
    const { chapterId } = req.query;
    if (chapterId) {
        const pages = db.prepare('SELECT * FROM pages WHERE chapter_id = ? ORDER BY order_index ASC').all(chapterId);
        res.json(pages);
    } else {
        const pages = db.prepare('SELECT * FROM pages ORDER BY order_index ASC').all();
        res.json(pages);
    }
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

const hardDeleteAssets = (ids: string[]) => {
    try {
        if (!ids || ids.length === 0) return;

        const placeholders = ids.map(() => '?').join(',');
        const elements = db.prepare(`SELECT id, content FROM elements WHERE id IN (${placeholders})`).all(...ids) as any[];

        elements.forEach(el => {
            const content = JSON.parse(el.content || '{}');
            if (content.url) {
                const fileName = path.basename(content.url);
                const filePath = path.join(uploadsDir, fileName);

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
    const host = req.get('host');
    const protocol = req.protocol;
    const url = `${protocol}://${host}/uploads/${req.file.filename}`;
    res.json({ url, type: req.file.mimetype });
});

app.post('/api/download-zip', (req: any, res: any) => {
    const { elementIds } = req.body;
    if (!elementIds || !Array.isArray(elementIds)) {
        return res.status(400).json({ error: 'elementIds array required' });
    }

    try {
        const elements = db.prepare(`SELECT * FROM elements WHERE id IN (${elementIds.map(() => '?').join(',')})`).all(...elementIds) as any[];

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        res.attachment('assets.zip');
        archive.pipe(res);

        elements.forEach(el => {
            const content = JSON.parse(el.content);
            if (content.url) {
                // Extract filename from URL (e.g., http://localhost:5000/uploads/123-file.jpg -> 123-file.jpg)
                const fileName = path.basename(content.url);
                const filePath = path.join(uploadsDir, fileName);

                if (fs.existsSync(filePath)) {
                    archive.file(filePath, { name: fileName });
                }
            }
        });

        archive.finalize();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
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

app.get('/api/batch/tasks', (req: any, res: any) => {
    try {
        const tasks = db.prepare('SELECT * FROM batch_tasks ORDER BY created_at DESC').all();
        res.json(tasks.map((t: any) => ({
            ...t,
            audio_enabled: !!t.audio_enabled
        })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/batch/add-frame', (req: any, res: any) => {
    const { url, role } = req.body; // role: 'first' | 'last'
    if (!url || !role) return res.status(400).json({ error: 'url and role required' });

    try {
        const id = crypto.randomUUID();
        // 1. Try to find an existing row where the OTHER frame is missing
        const columnToCheck = role === 'first' ? 'last_frame_url' : 'first_frame_url';
        const columnToFill = role === 'first' ? 'first_frame_url' : 'last_frame_url';

        const existingRow = db.prepare(`
            SELECT id FROM batch_tasks 
            WHERE ${columnToFill} IS NULL 
            AND ${columnToCheck} IS NOT NULL 
            ORDER BY created_at ASC LIMIT 1
        `).get() as { id: string } | undefined;

        if (existingRow) {
            db.prepare(`UPDATE batch_tasks SET ${columnToFill} = ? WHERE id = ?`).run(url, existingRow.id);
            const updated = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(existingRow.id) as any;
            updated.audio_enabled = !!updated.audio_enabled;
            io.emit('batch:update', updated);
            res.json(updated);
        } else {
            // 2. Create a new row
            db.prepare(`INSERT INTO batch_tasks (id, ${columnToFill}) VALUES (?, ?)`).run(id, url);
            const newTask = {
                id,
                [columnToFill]: url,
                [columnToCheck]: null,
                prompt: '',
                duration: 5,
                audio_enabled: false,
                status: 'pending',
                created_at: new Date().toISOString()
            };
            io.emit('batch:add', newTask);
            res.json(newTask);
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/batch/tasks/:id', (req: any, res: any) => {
    const { prompt, duration, audio_enabled, status } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (prompt !== undefined) { updates.push('prompt = ?'); values.push(prompt); }
    if (duration !== undefined) { updates.push('duration = ?'); values.push(duration); }
    if (audio_enabled !== undefined) { updates.push('audio_enabled = ?'); values.push(audio_enabled ? 1 : 0); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
        db.prepare(`UPDATE batch_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.params.id);
        const updated = db.prepare('SELECT * FROM batch_tasks WHERE id = ?').get(req.params.id) as any;
        updated.audio_enabled = !!updated.audio_enabled;
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

app.post('/api/batch/generate', async (req: any, res: any) => {
    const allTasks = db.prepare("SELECT * FROM batch_tasks").all() as any[];
    console.log(`🔍 [Batch] Total tasks in DB: ${allTasks.length}`);
    allTasks.forEach(t => console.log(`   - Task ${t.id}: status=${t.status}, first=${t.first_frame_url}, last=${t.last_frame_url}`));

    const tasks = db.prepare("SELECT * FROM batch_tasks WHERE status IN ('pending', 'failed') AND (first_frame_url IS NOT NULL OR last_frame_url IS NOT NULL)").all() as any[];
    console.log(`🔍 [Batch] Pending tasks found: ${tasks.length}`);

    if (tasks.length === 0) return res.status(400).json({ error: 'No pending tasks with at least one frame' });

    const klingApiKey = process.env.KLING_API_KEY;
    if (!klingApiKey) {
        console.error('❌ KLING_API_KEY is not set in environment variables');
        return res.status(500).json({ error: 'Server configuration error: KLING_API_KEY missing' });
    }

    res.json({ success: true, count: tasks.length });

    // Background processing
    for (const task of tasks) {
        try {
            console.log(`🚀 [Kling] Starting generation for task ${task.id}...`);

            await KlingService.generateVideo(
                { klingApiKey },
                task.first_frame_url || task.last_frame_url, // Kling supports single frame or pair
                task.prompt || "Cinematic high quality video",
                task.duration === 10 ? '10' : '5',
                !!task.audio_enabled,
                (status, videoUrl) => {
                    const updates: any = { status };
                    if (videoUrl) updates.generated_video_url = videoUrl;

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
                        audio_enabled: !!task.audio_enabled
                    });
                }
            );

        } catch (err) {
            console.error(`❌ [Kling] Error processing batch task ${task.id}:`, err);
            db.prepare("UPDATE batch_tasks SET status = 'failed' WHERE id = ?").run(task.id);
            io.emit('batch:update', { ...task, status: 'failed', audio_enabled: !!task.audio_enabled });
        }
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

