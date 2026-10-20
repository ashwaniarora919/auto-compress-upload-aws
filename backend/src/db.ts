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
const existingColumns = db.prepare("PRAGMA table_info(videos)").all() as { name: string }[];
for (const [name, type] of [
  ["batch_id", "TEXT"],
  ["course_name", "TEXT"],
  ["teacher_name", "TEXT"],
  ["schedule", "TEXT"],
  ["timing", "TEXT"],
] as const) {
  if (!existingColumns.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE videos ADD COLUMN ${name} ${type}`);
  }
}

// Demo ke liye sample batches (real app mein ye admin side se aayenge)
const batchCount = db.prepare("SELECT COUNT(*) AS n FROM batches").get() as { n: number };
if (batchCount.n === 0) {
  const insert = db.prepare(
    "INSERT INTO batches (id, course_name, teacher_name, schedule, timing) VALUES (?, ?, ?, ?, ?)"
  );
  insert.run("batch-1", "Semi Classical Dance", "Anjali Sharma", "tt", "17-18");
  insert.run("batch-2", "Semi Classical Dance", "Anjali Sharma", "mwf", "11-12");
  insert.run("batch-3", "Hip Hop", "Rohit Verma", "ss", "10-11");
  insert.run("batch-4", "Yoga", "Meera Iyer", "mtwtf", "06-07");
}

export type BatchRow = {
  id: string;
  course_name: string;
  teacher_name: string;
  schedule: string;
  timing: string;
};

export type VideoRow = {
  id: string;
  title: string;
  description: string;
  video_date: string;
  s3_key: string;
  thumbnail_key: string | null;
  original_filename: string;
  original_size: number;
  compressed_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
  batch_id: string | null;
  course_name: string | null;
  teacher_name: string | null;
  schedule: string | null;
  timing: string | null;
};