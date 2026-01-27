const db = require('better-sqlite3')('storyboard.db');
console.log(JSON.stringify(db.prepare("PRAGMA table_info(elements)").all(), null, 2));
process.exit(0);
