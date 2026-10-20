import { Hono } from "hono";
import { db, type BatchRow } from "./db.js";

export const batches = new Hono();

// Demo mein saare batches. Real app mein yahan logged-in teacher ke batches filter honge.
batches.get("/", (c) => {
    const rows = db
        .prepare("SELECT * FROM batches ORDER BY course_name, schedule, timing")
        .all() as BatchRow[];
    return c.json({
        batches: rows.map((r) => ({
            id: r.id,
            courseName: r.course_name,
            teacherName: r.teacher_name,
            schedule: r.schedule,
            timing: r.timing,
        })),
    });
});