import { Hono } from "hono";
import { db } from "./db.js";
export const batches = new Hono();
batches.get("/", (c) => {
    const rows = db
        .prepare("SELECT * FROM batches ORDER BY course_name, schedule, timing")
        .all();
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
//# sourceMappingURL=batches.js.map