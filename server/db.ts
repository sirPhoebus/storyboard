import Database from 'better-sqlite3';
import path from 'path';

const dataDir = process.env.DATA_DIR || process.cwd();
const dbPath = path.join(dataDir, 'storyboard.db');
const db: any = new Database(dbPath);


db.exec(`
  CREATE TABLE IF NOT EXISTS storyboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    storyboard_id TEXT NOT NULL,
    title TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    thumbnail TEXT,
    FOREIGN KEY (storyboard_id) REFERENCES storyboards (id) ON DELETE CASCADE
  );
`);

try {
  db.exec('ALTER TABLE pages ADD COLUMN thumbnail TEXT');
} catch (e) {
  // Column already exists
}

db.exec(`
  CREATE TABLE IF NOT EXISTS elements (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    type TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL,
    height REAL,
    rotation REAL DEFAULT 0,
    content TEXT,
    style TEXT,
    z_index INTEGER DEFAULT 0,
    start_element_id TEXT,
    end_element_id TEXT,
    group_id TEXT,
    FOREIGN KEY (page_id) REFERENCES pages (id) ON DELETE CASCADE
  );
`);

try {
  db.exec('ALTER TABLE elements ADD COLUMN z_index INTEGER DEFAULT 0');
} catch (e) { /* Column already exists */ }

try {
  db.exec('ALTER TABLE elements ADD COLUMN start_element_id TEXT');
  db.exec('ALTER TABLE elements ADD COLUMN end_element_id TEXT');
  db.exec('ALTER TABLE elements ADD COLUMN group_id TEXT');
} catch (e) { /* Columns already exist */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    storyboard_id TEXT NOT NULL,
    title TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (storyboard_id) REFERENCES storyboards (id) ON DELETE CASCADE
  );
`);

try {
  db.exec('ALTER TABLE pages ADD COLUMN chapter_id TEXT');
} catch (e) {
  // Column already exists
}

// Seed initial data if empty
const storyboardCount = db.prepare('SELECT COUNT(*) as count FROM storyboards').get() as { count: number };
if (storyboardCount.count === 0) {
  const storyboardId = 'default-storyboard';
  db.prepare('INSERT INTO storyboards (id, name) VALUES (?, ?)').run(storyboardId, 'My First Storyboard');

  const chapterId = 'default-chapter';
  db.prepare('INSERT INTO chapters (id, storyboard_id, title, order_index) VALUES (?, ?, ?, ?)').run(chapterId, storyboardId, 'Chapter 1', 0);

  const pageId = 'default-page';
  db.prepare('INSERT INTO pages (id, storyboard_id, chapter_id, title, order_index) VALUES (?, ?, ?, ?, ?)').run(
    pageId,
    storyboardId,
    chapterId,
    'Page 1',
    0
  );

  const elements = [
    { id: '1', page_id: pageId, type: 'rect', x: 50, y: 50, width: 100, height: 100, fill: 'red' },
    { id: '2', page_id: pageId, type: 'rect', x: 200, y: 200, width: 100, height: 100, fill: 'blue' },
  ];

  const insertElement = db.prepare(`
    INSERT INTO elements (id, page_id, type, x, y, width, height, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const el of elements) {
    insertElement.run(el.id, el.page_id, el.type, el.x, el.y, el.width, el.height, JSON.stringify({ fill: el.fill }));
  }
} else {
  // Migration: Ensure all pages have a chapter_id
  const pagesWithoutChapter = db.prepare('SELECT id FROM pages WHERE chapter_id IS NULL').all();
  if (pagesWithoutChapter.length > 0) {
    // Create a default chapter if no chapters exist for the storyboard
    // Assuming single storyboard for now
    const storyboardId = 'default-storyboard'; // or fetch from db
    let defaultChapter = db.prepare('SELECT id FROM chapters WHERE storyboard_id = ? ORDER BY order_index ASC LIMIT 1').get(storyboardId) as { id: string } | undefined;

    if (!defaultChapter) {
      const newChapterId = 'default-chapter-migrated';
      db.prepare('INSERT INTO chapters (id, storyboard_id, title, order_index) VALUES (?, ?, ?, ?)').run(newChapterId, storyboardId, 'Chapter 1', 0);
      defaultChapter = { id: newChapterId };
    }

    const updatePage = db.prepare('UPDATE pages SET chapter_id = ? WHERE id = ?');
    for (const page of pagesWithoutChapter) {
      updatePage.run(defaultChapter.id, page.id);
    }
  }
}

export default db;
