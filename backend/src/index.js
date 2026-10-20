import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, BUCKET, PREFIX } from "./s3.js";
import { videos } from "./videos.js";
import { batches } from "./batches.js";
const app = new Hono();
app.use(logger());
app.use("*", cors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
}));
app.get("/", (c) => c.json({ server: "teacher-video-demo-backend" }));
app.get("/health", (c) => c.json({ ok: true }));
// Sirf setup check ke liye, baad mein hata denge
app.get("/s3-check", async (c) => {
    const key = `${PREFIX}_healthcheck.txt`;
    try {
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: "ok", ContentType: "text/plain" }));
        const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const body = await res.Body?.transformToString();
        return c.json({ ok: true, bucket: BUCKET, key, canWrite: true, canRead: body === "ok" });
    }
    catch (e) {
        return c.json({ ok: false, error: e.name, message: e.message }, 500);
    }
});
app.route("/api/videos", videos);
app.route("/api/batches", batches);
const port = 4000;
serve({ fetch: app.fetch, port }, () => {
    console.log(`Backend running on http://localhost:${port}`);
});
