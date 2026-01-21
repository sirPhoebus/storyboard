import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import db from './db';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Configure Multer
const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
        cb(null, 'uploads/');
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
app.get('/api/pages', (req: any, res: any) => {
    const pages = db.prepare('SELECT * FROM pages ORDER BY order_index ASC').all();
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
    const { title, storyboardId } = req.body;
    const id = crypto.randomUUID();
    const orderIndex = (db.prepare('SELECT COUNT(*) as count FROM pages WHERE storyboard_id = ?').get(storyboardId) as any).count;
    db.prepare('INSERT INTO pages (id, storyboard_id, title, order_index) VALUES (?, ?, ?, ?)').run(
        id, storyboardId, title, orderIndex
    );
    res.json({ id, title, storyboard_id: storyboardId, order_index: orderIndex });
});

app.post('/api/pages/duplicate', (req: any, res: any) => {
    const { pageId } = req.body;
    const oldPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as any;
    if (!oldPage) return res.status(404).json({ error: 'Page not found' });

    const newId = crypto.randomUUID();
    const newTitle = `${oldPage.title} (Copy)`;
    const orderIndex = oldPage.order_index + 1; // Insert after default or handle reordering later

    // Shift others
    db.prepare('UPDATE pages SET order_index = order_index + 1 WHERE storyboard_id = ? AND order_index >= ?').run(oldPage.storyboard_id, orderIndex);

    db.prepare('INSERT INTO pages (id, storyboard_id, title, order_index, thumbnail) VALUES (?, ?, ?, ?, ?)').run(
        newId, oldPage.storyboard_id, newTitle, orderIndex, oldPage.thumbnail
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
    const url = `http://localhost:5000/uploads/${req.file.filename}`;
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
    io.emit('element:add', { ...element, content: JSON.parse(element.content) });

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

io.on('connection', (socket: any) => {
    console.log('A user connected:', socket.id);

    socket.on('element:move', (data: any) => {
        socket.broadcast.emit('element:move', data);
        db.prepare('UPDATE elements SET x = ?, y = ? WHERE id = ?').run(data.x, data.y, data.id);
    });

    socket.on('element:update', (data: any) => {
        socket.broadcast.emit('element:update', data);

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

        if (updates.length > 0) {
            values.push(data.id);
            db.prepare(`UPDATE elements SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
    });

    socket.on('element:delete', (data: { id: string }) => {
        socket.broadcast.emit('element:delete', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = 5000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
