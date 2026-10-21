import { query, type QueryResultRow } from "./pgdb.js";

/* Types matching Neon DB tables: schedule, course, teacher, recording */
export type BatchRow = {
  id: string; // schedule_id
  timing: string;
  days: string[] | string | null;
  course_id: string | null;
  teacher_id: string | null;
  course_name: string | null;
  teacher_name: string | null;
  schedule?: string | null;
};

export type VideoRow = {
  id: string;
  schedule_id: string | null;
  course_id: string | null;
  teacher_id: string | null;
  title: string;
  description: string | null;
  video_url: string;
  order: number;
  date: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
  thumbnail_key: string | null;
  original_filename: string | null;
  original_size: number | string | null;
  compressed_size: number | string | null;
  mime_type: string | null;
  course_name?: string | null;
  teacher_name?: string | null;
  timing?: string | null;
  schedule?: string | null;
};

// Helper to fetch a single recording row by id with joined course & teacher
export async function getRecordingById(id: string): Promise<VideoRow | undefined> {
  const rows = await query<VideoRow>(
    `SELECT 
       r.*,
       c.title AS course_name,
       t.full_name AS teacher_name,
       s.timing,
       array_to_string(s.days, ', ') AS schedule
     FROM recording r
     LEFT JOIN course c ON r.course_id = c.id
     LEFT JOIN teacher t ON r.teacher_id = t.id
     LEFT JOIN schedule s ON r.schedule_id = s.id
     WHERE r.id = $1`,
    [id]
  );
  return rows[0];
}

// Helper to fetch all batches / active schedules
export async function getAllBatches(): Promise<BatchRow[]> {
  const rows = await query<BatchRow>(
    `SELECT 
       s.id,
       s.timing,
       s.days,
       s.course_id,
       s.teacher_id,
       c.title AS course_name,
       t.full_name AS teacher_name,
       array_to_string(s.days, ', ') AS schedule
     FROM schedule s
     LEFT JOIN course c ON s.course_id = c.id
     LEFT JOIN teacher t ON s.teacher_id = t.id
     WHERE s.status = 'ACTIVE' OR s.status IS NULL
     ORDER BY c.title ASC NULLS LAST, s.timing ASC`
  );
  return rows;
}

// Helper to fetch single batch by schedule id
export async function getBatchById(id: string): Promise<BatchRow | undefined> {
  const rows = await query<BatchRow>(
    `SELECT 
       s.id,
       s.timing,
       s.days,
       s.course_id,
       s.teacher_id,
       c.title AS course_name,
       t.full_name AS teacher_name,
       array_to_string(s.days, ', ') AS schedule
     FROM schedule s
     LEFT JOIN course c ON s.course_id = c.id
     LEFT JOIN teacher t ON s.teacher_id = t.id
     WHERE s.id = $1`,
    [id]
  );
  return rows[0];
}

export { query, type QueryResultRow };