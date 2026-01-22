import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import db from './db';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

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
        res.json(chapterData);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/chapters/:id', (req: any, res: any) => {
    const { title } = req.body;
    try {
        db.prepare('UPDATE chapters SET title = ? WHERE id = ?').run(title, req.params.id);
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
    res.json({ id, title, storyboard_id: storyboardId, chapter_id: chapterId, order_index: orderIndex });
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
    const { title, thumbnail } = req.body;
    if (title !== undefined && thumbnail !== undefined) {
        db.prepare('UPDATE pages SET title = ?, thumbnail = ? WHERE id = ?').run(title, thumbnail, req.params.id);
    } else if (title !== undefined) {
        db.prepare('UPDATE pages SET title = ? WHERE id = ?').run(title, req.params.id);
    } else if (thumbnail !== undefined) {
        db.prepare('UPDATE pages SET thumbnail = ? WHERE id = ?').run(thumbnail, req.params.id);
    }
    res.json({ success: true });
});

app.delete('/api/pages/:id', (req: any, res: any) => {
    const pageId = req.params.id;
    const deletePage = db.transaction(() => {
        db.prepare('DELETE FROM elements WHERE page_id = ?').run(pageId);
        db.prepare('DELETE FROM pages WHERE id = ?').run(pageId);
    });
    deletePage();
    res.json({ success: true });
});

app.delete('/api/elements/:id', (req: any, res: any) => {
    db.prepare('DELETE FROM elements WHERE id = ?').run(req.params.id);
    res.json({ success: true });
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

app.post('/api/elements', (req: any, res: any) => {
    const { pageId, type, x, y, width, height, content } = req.body;
    const id = crypto.randomUUID();

    // Get max z_index
    const result = db.prepare('SELECT MAX(z_index) as maxZ FROM elements WHERE page_id = ?').get(pageId) as { maxZ: number };
    const zIndex = (result && result.maxZ !== null) ? result.maxZ + 1 : 0;

    const { start_element_id, end_element_id, group_id } = req.body;

    const element = {
        id,
        page_id: pageId,
        type,
        x,
        y,
        width,
        height,
        content: JSON.stringify(content),
        z_index: zIndex,
        start_element_id,
        end_element_id,
        group_id
    };

    db.prepare(`
        INSERT INTO elements (
            id, page_id, type, x, y, width, height, content, z_index, start_element_id, end_element_id, group_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, pageId, type, x, y, width, height, element.content, zIndex, start_element_id, end_element_id, group_id
    );

    // Broadcast to other clients
    const broadcastData = {
        ...element,
        pageId: pageId,  // Use camelCase for consistency with client
        content: JSON.parse(element.content)
    };
    console.log('📥 Server creating new element:', id, 'on page:', pageId);
    io.emit('element:add', broadcastData);
    console.log('📤 Server broadcast element:add to all clients');

    res.json({ ...element, content });
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
            socket.broadcast.emit('element:update', data);
            console.log('📤 Server broadcast element:update to other clients');

            // Update DB
            // Check for specific fields to update in the top level object
            // This is getting a bit ad-hoc, ideally we'd have a clearer update contract
            const updates: any[] = [];
            const values: any[] = [];

            if (data.content) {
                updates.push('content = ?');
                values.push(JSON.stringify(data.content));
            }
            if (data.group_id !== undefined) {
                updates.push('group_id = ?');
                values.push(data.group_id);
            }
            if (data.start_element_id !== undefined) {
                updates.push('start_element_id = ?');
                values.push(data.start_element_id);
            }
            if (data.end_element_id !== undefined) {
                updates.push('end_element_id = ?');
                values.push(data.end_element_id);
            }
            // x and y are handled by element:move but sometimes we might want to batch update
            if (data.x !== undefined) { updates.push('x = ?'); values.push(data.x); }
            if (data.y !== undefined) { updates.push('y = ?'); values.push(data.y); }
            if (data.width !== undefined) { updates.push('width = ?'); values.push(data.width); }
            if (data.height !== undefined) { updates.push('height = ?'); values.push(data.height); }

            if (updates.length > 0) {
                values.push(data.id);
                db.prepare(`UPDATE elements SET ${updates.join(', ')} WHERE id = ?`).run(...values);
            }
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
    app.use((req, res) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

const PORT = Number(process.env.PORT) || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

