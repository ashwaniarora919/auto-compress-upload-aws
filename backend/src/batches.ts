import { Hono } from "hono";
import { getAllBatches } from "./db.js";

export const batches = new Hono();

// Fetch all batches / schedules from Neon DB
batches.get("/", async (c) => {
    try {
        const rows = await getAllBatches();
        return c.json({
            batches: rows.map((r) => {
                const daysStr = Array.isArray(r.days) ? r.days.join(", ") : (r.schedule || r.days || "");
                return {
                    id: r.id,
                    courseName: r.course_name || "General Course",
                    teacherName: r.teacher_name || "Instructor",
                    schedule: daysStr,
                    timing: r.timing || "",
                };
            }),
        });
    } catch (err: any) {
        console.error("Error fetching batches:", err);
        return c.json({ error: "Failed to fetch batches", detail: err?.message }, 500);
    }
});