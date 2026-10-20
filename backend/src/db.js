import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
mkdirSync("data", { recursive: true });
export const db = new DatabaseSync("data/videos.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    course_name TEXT NOT NULL,
    teacher_name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    timing TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    video_date TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    thumbnail_key TEXT,
    original_filename TEXT NOT NULL,
    original_size INTEGER NOT NULL,
    compressed_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
// Purani videos table mein naye columns jodna (purana data delete nahi hoga)
const existingColumns = db.prepare("PRAGMA table_info(videos)").all();
for (const [name, type] of [
    ["batch_id", "TEXT"],
    ["course_name", "TEXT"],
    ["teacher_name", "TEXT"],
    ["schedule", "TEXT"],
    ["timing", "TEXT"],
]) {
    if (!existingColumns.some((c) => c.name === name)) {
        db.exec(`ALTER TABLE videos ADD COLUMN ${name} ${type}`);
    }
}
// Demo ke liye sample batches (real app mein ye admin side se aayenge)
const batchCount = db.prepare("SELECT COUNT(*) AS n FROM batches").get();
if (batchCount.n === 0) {
    const insert = db.prepare("INSERT INTO batches (id, course_name, teacher_name, schedule, timing) VALUES (?, ?, ?, ?, ?)");
    insert.run("batch-1", "Semi Classical Dance", "Anjali Sharma", "tt", "17-18");
    insert.run("batch-2", "Semi Classical Dance", "Anjali Sharma", "mwf", "11-12");
    insert.run("batch-3", "Hip Hop", "Rohit Verma", "ss", "10-11");
    insert.run("batch-4", "Yoga", "Meera Iyer", "mtwtf", "06-07");
}
