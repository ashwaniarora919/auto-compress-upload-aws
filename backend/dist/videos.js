import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET } from "./s3.js";
import { db } from "./db.js";
import { buildFolder, buildFileBase } from "./paths.js";
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_THUMB_BYTES = 5 * 1024 * 1024;
const URL_TTL_SECONDS = 60 * 60;
const VIDEO_EXT = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
};
const THUMB_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};
const metaSchema = z.object({
    batchId: z.string().trim().min(1, "Batch is required"),
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).default(""),
    videoDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
        .refine((v) => {
        const d = new Date(v);
        return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "Invalid date"),
    originalFilename: z.string().trim().min(1).max(255),
    originalSize: z.coerce.number().int().nonnegative(),
});
function presignGet(key) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
        expiresIn: URL_TTL_SECONDS,
    });
}
async function toDto(row) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        videoDate: row.video_date,
        originalFilename: row.original_filename,
        originalSize: row.original_size,
        compressedSize: row.compressed_size,
        mimeType: row.mime_type,
        thumbnailUrl: row.thumbnail_key ? await presignGet(row.thumbnail_key) : null,
        batch: row.batch_id && row.course_name
            ? {
                id: row.batch_id,
                courseName: row.course_name,
                teacherName: row.teacher_name ?? "",
                schedule: row.schedule ?? "",
                timing: row.timing ?? "",
            }
            : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function getRow(id) {
    return db.prepare("SELECT * FROM videos WHERE id = ?").get(id);
}
export const videos = new Hono();
videos.post("/", bodyLimit({
    maxSize: MAX_VIDEO_BYTES + MAX_THUMB_BYTES + 1024 * 1024,
    onError: (c) => c.json({ error: "Upload is too large" }, 413),
}), async (c) => {
    const form = await c.req.parseBody();
    const video = form["video"];
    if (!(video instanceof File) || video.size === 0) {
        return c.json({ error: "Video file is required" }, 400);
    }
    const videoExt = VIDEO_EXT[video.type];
    if (!videoExt) {
        return c.json({ error: `Unsupported video type: ${video.type || "unknown"}` }, 400);
    }
    if (video.size > MAX_VIDEO_BYTES) {
        return c.json({ error: "Video is too large" }, 413);
    }
    const thumbField = form["thumbnail"];
    const thumb = thumbField instanceof File && thumbField.size > 0 ? thumbField : null;
    let thumbExt;
    if (thumb) {
        thumbExt = THUMB_EXT[thumb.type];
        if (!thumbExt) {
            return c.json({ error: `Unsupported thumbnail type: ${thumb.type || "unknown"}` }, 400);
        }
        if (thumb.size > MAX_THUMB_BYTES) {
            return c.json({ error: "Thumbnail is too large" }, 413);
        }
    }
    const parsed = metaSchema.safeParse({
        batchId: form["batchId"],
        title: form["title"],
        description: form["description"],
        videoDate: form["videoDate"],
        originalFilename: form["originalFilename"],
        originalSize: form["originalSize"],
    });
    if (!parsed.success) {
        return c.json({ error: "Invalid fields", details: parsed.error.issues.map((i) => i.message) }, 400);
    }
    const meta = parsed.data;
    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(meta.batchId);
    if (!batch) {
        return c.json({ error: "Invalid fields", details: ["Selected batch was not found"] }, 400);
    }
    const id = randomUUID();
    const folder = buildFolder({
        courseName: batch.course_name,
        teacherName: batch.teacher_name,
        schedule: batch.schedule,
        timing: batch.timing,
    }, meta.videoDate);
    const fileBase = buildFileBase(meta.title, id);
    const videoKey = `${folder}${fileBase}.${videoExt}`;
    const thumbKey = thumb && thumbExt ? `${folder}${fileBase}_thumb.${thumbExt}` : null;
    const uploadedKeys = [];
    try {
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: videoKey,
            Body: Buffer.from(await video.arrayBuffer()),
            ContentType: video.type,
        }));
        uploadedKeys.push(videoKey);
        if (thumb && thumbKey) {
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: thumbKey,
                Body: Buffer.from(await thumb.arrayBuffer()),
                ContentType: thumb.type,
            }));
            uploadedKeys.push(thumbKey);
        }
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO videos
          (id, title, description, video_date, s3_key, thumbnail_key,
           original_filename, original_size, compressed_size, mime_type,
           created_at, updated_at, batch_id, course_name, teacher_name, schedule, timing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, meta.title, meta.description, meta.videoDate, videoKey, thumbKey, meta.originalFilename, meta.originalSize, video.size, video.type, now, now, batch.id, batch.course_name, batch.teacher_name, batch.schedule, batch.timing);
        console.log("Uploaded to S3:", videoKey);
        const row = getRow(id);
        return c.json({ video: await toDto(row) }, 201);
    }
    catch (e) {
        console.error("Upload failed:", e);
        await Promise.allSettled(uploadedKeys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }))));
        return c.json({ error: "Upload failed", detail: e?.name ?? "UnknownError" }, 500);
    }
});
videos.get("/", async (c) => {
    const rows = db
        .prepare("SELECT * FROM videos ORDER BY video_date DESC, created_at DESC")
        .all();
    const list = await Promise.all(rows.map(toDto));
    return c.json({ videos: list });
});
videos.get("/:id/playback-url", async (c) => {
    const row = getRow(c.req.param("id"));
    if (!row)
        return c.json({ error: "Video not found" }, 404);
    const url = await presignGet(row.s3_key);
    return c.json({ url, expiresInSeconds: URL_TTL_SECONDS });
});
videos.get("/:id/play", async (c) => {
    const row = getRow(c.req.param("id"));
    if (!row)
        return c.json({ error: "Video not found" }, 404);
    return c.redirect(await presignGet(row.s3_key));
});
videos.delete("/:id", async (c) => {
    const row = getRow(c.req.param("id"));
    if (!row)
        return c.json({ error: "Video not found" }, 404);
    try {
        const keys = [row.s3_key, ...(row.thumbnail_key ? [row.thumbnail_key] : [])];
        for (const Key of keys) {
            await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
        }
        db.prepare("DELETE FROM videos WHERE id = ?").run(row.id);
        return c.json({ ok: true });
    }
    catch (e) {
        console.error("Delete failed:", e);
        return c.json({ error: "Delete failed", detail: e?.name ?? "UnknownError" }, 500);
    }
});
//# sourceMappingURL=videos.js.map