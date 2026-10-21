import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET } from "./s3.js";
import { query, getRecordingById, getBatchById, type VideoRow } from "./db.js";
import { buildFolder, buildFileBase } from "./paths.js";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_THUMB_BYTES = 5 * 1024 * 1024; // 5 MB
const URL_TTL_SECONDS = 60 * 60; // 1 hour

const VIDEO_EXT: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
};
const THUMB_EXT: Record<string, string> = {
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

function presignGet(key: string) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
        expiresIn: URL_TTL_SECONDS,
    });
}

function extractS3Key(urlOrKey: string, bucket: string): string {
    if (!urlOrKey.startsWith("http")) return urlOrKey;
    try {
        const url = new URL(urlOrKey);
        let key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
        if (key.startsWith(`${bucket}/`)) {
            key = key.slice(bucket.length + 1);
        }
        return key;
    } catch {
        return urlOrKey;
    }
}

async function toDto(row: VideoRow) {
    let thumbUrl: string | null = null;
    if (row.thumbnail_key) {
        try {
            thumbUrl = await presignGet(row.thumbnail_key);
        } catch {
            thumbUrl = null;
        }
    }

    const dateStr =
        typeof row.date === "string"
            ? row.date.slice(0, 10)
            : row.date instanceof Date
            ? row.date.toISOString().slice(0, 10)
            : "";

    return {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        videoDate: dateStr,
        originalFilename: row.original_filename ?? "",
        originalSize: Number(row.original_size ?? 0),
        compressedSize: Number(row.compressed_size ?? 0),
        mimeType: row.mime_type ?? "video/mp4",
        thumbnailUrl: thumbUrl,
        batch: row.course_name
            ? {
                  id: row.schedule_id ?? "",
                  courseName: row.course_name,
                  teacherName: row.teacher_name ?? "",
                  schedule: row.schedule ?? "",
                  timing: row.timing ?? "",
              }
            : null,
        createdAt:
            row.created_at instanceof Date
                ? row.created_at.toISOString()
                : String(row.created_at ?? ""),
        updatedAt:
            row.updated_at instanceof Date
                ? row.updated_at.toISOString()
                : String(row.updated_at ?? ""),
    };
}

export const videos = new Hono();

// 1) Upload Video
videos.post(
    "/",
    bodyLimit({
        maxSize: MAX_VIDEO_BYTES + MAX_THUMB_BYTES + 1024 * 1024,
        onError: (c) => c.json({ error: "Upload is too large" }, 413),
    }),
    async (c) => {
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
        let thumbExt: string | undefined;
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
            return c.json(
                { error: "Invalid fields", details: parsed.error.issues.map((i) => i.message) },
                400
            );
        }
        const meta = parsed.data;

        // Fetch batch details from schedule table
        const batch = await getBatchById(meta.batchId);
        if (!batch) {
            return c.json({ error: "Invalid fields", details: ["Selected batch was not found"] }, 400);
        }

        const id = randomUUID();
        const daysStr = Array.isArray(batch.days)
            ? batch.days.join(", ")
            : batch.schedule || batch.days || "general";

        const folder = buildFolder(
            {
                courseName: batch.course_name || "course",
                teacherName: batch.teacher_name || "teacher",
                schedule: daysStr,
                timing: batch.timing || "timing",
            },
            meta.videoDate
        );
        const fileBase = buildFileBase(meta.title, id);
        const videoKey = `${folder}${fileBase}.${videoExt}`;
        const thumbKey = thumb && thumbExt ? `${folder}${fileBase}_thumb.${thumbExt}` : null;
        const uploadedKeys: string[] = [];

        try {
            await s3.send(
                new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: videoKey,
                    Body: Buffer.from(await video.arrayBuffer()),
                    ContentType: video.type,
                })
            );
            uploadedKeys.push(videoKey);

            if (thumb && thumbKey) {
                await s3.send(
                    new PutObjectCommand({
                        Bucket: BUCKET,
                        Key: thumbKey,
                        Body: Buffer.from(await thumb.arrayBuffer()),
                        ContentType: thumb.type,
                    })
                );
                uploadedKeys.push(thumbKey);
            }

            const region = process.env.AWS_REGION || "ap-south-1";
            const videoUrl = `https://${BUCKET}.s3.${region}.amazonaws.com/${videoKey}`;

            // Calculate order
            const orderRes = await query<{ next_order: number }>(
                `SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM recording WHERE schedule_id = $1`,
                [batch.id]
            );
            const nextOrder = orderRes[0]?.next_order ?? 1;

            // Store in recording table in PostgreSQL
            await query(
                `INSERT INTO recording (
                    id,
                    schedule_id,
                    course_id,
                    teacher_id,
                    title,
                    description,
                    video_url,
                    "order",
                    date,
                    thumbnail_key,
                    original_filename,
                    original_size,
                    compressed_size,
                    mime_type,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
                [
                    id,
                    batch.id,
                    batch.course_id,
                    batch.teacher_id,
                    meta.title,
                    meta.description,
                    videoUrl,
                    nextOrder,
                    meta.videoDate,
                    thumbKey,
                    meta.originalFilename,
                    meta.originalSize,
                    video.size,
                    video.type,
                ]
            );

            console.log("Uploaded to S3 and stored in Neon DB:", videoUrl);

            const row = await getRecordingById(id);
            if (!row) {
                throw new Error("Failed to retrieve newly created recording");
            }
            return c.json({ video: await toDto(row) }, 201);
        } catch (e: any) {
            console.error("Upload failed:", e);
            await Promise.allSettled(
                uploadedKeys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key })))
            );
            return c.json({ error: "Upload failed", detail: e?.message ?? e?.name ?? "UnknownError" }, 500);
        }
    }
);

// 2) List All Videos (from recording table)
videos.get("/", async (c) => {
    try {
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
            ORDER BY r.created_at DESC, r.date DESC
            LIMIT 200`
        );
        const list = await Promise.all(rows.map(toDto));
        return c.json({ videos: list });
    } catch (err: any) {
        console.error("Failed to list videos:", err);
        return c.json({ error: "Failed to list videos", detail: err?.message }, 500);
    }
});

// 3) Playback URL
videos.get("/:id/playback-url", async (c) => {
    try {
        const row = await getRecordingById(c.req.param("id"));
        if (!row) return c.json({ error: "Video not found" }, 404);

        let url = row.video_url;
        // If the video belongs to our configured S3 bucket or is an S3 key, presign it
        if (row.video_url.includes(BUCKET) || !row.video_url.startsWith("http")) {
            const key = extractS3Key(row.video_url, BUCKET);
            try {
                url = await presignGet(key);
            } catch {
                url = row.video_url;
            }
        }
        return c.json({ url, expiresInSeconds: URL_TTL_SECONDS });
    } catch (err: any) {
        console.error("Error generating playback url:", err);
        return c.json({ error: "Playback error", detail: err?.message }, 500);
    }
});

// Direct browser redirect
videos.get("/:id/play", async (c) => {
    const row = await getRecordingById(c.req.param("id"));
    if (!row) return c.json({ error: "Video not found" }, 404);

    let url = row.video_url;
    if (row.video_url.includes(BUCKET) || !row.video_url.startsWith("http")) {
        const key = extractS3Key(row.video_url, BUCKET);
        try {
            url = await presignGet(key);
        } catch {
            url = row.video_url;
        }
    }
    return c.redirect(url);
});

// 4) Delete Video
videos.delete("/:id", async (c) => {
    const id = c.req.param("id");
    try {
        const row = await getRecordingById(id);
        if (!row) return c.json({ error: "Video not found" }, 404);

        // Delete from S3 if in our bucket
        const keysToDelete: string[] = [];
        if (row.video_url.includes(BUCKET) || !row.video_url.startsWith("http")) {
            keysToDelete.push(extractS3Key(row.video_url, BUCKET));
        }
        if (row.thumbnail_key) {
            keysToDelete.push(row.thumbnail_key);
        }

        for (const Key of keysToDelete) {
            try {
                await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
            } catch (s3Err) {
                console.warn("Could not delete S3 object:", Key, s3Err);
            }
        }

        await query("DELETE FROM recording WHERE id = $1", [id]);
        return c.json({ ok: true });
    } catch (e: any) {
        console.error("Delete failed:", e);
        return c.json({ error: "Delete failed", detail: e?.message ?? "UnknownError" }, 500);
    }
});