import { S3Client } from "@aws-sdk/client-s3";

export const BUCKET = process.env.S3_BUCKET!;

// Sabhi video keys isi prefix ke andar jayengi
const rawPrefix = process.env.S3_PREFIX ?? "videos/";
export const PREFIX = rawPrefix && !rawPrefix.endsWith("/") ? rawPrefix + "/" : rawPrefix;

// Credentials AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env se apne aap pick hote hain
export const s3 = new S3Client({ region: process.env.AWS_REGION }); -