import { S3Client } from "@aws-sdk/client-s3";
export const BUCKET = process.env.S3_BUCKET;
const rawPrefix = process.env.S3_PREFIX ?? "videos/";
export const PREFIX = rawPrefix && !rawPrefix.endsWith("/") ? rawPrefix + "/" : rawPrefix;
export const s3 = new S3Client({ region: process.env.AWS_REGION });
//# sourceMappingURL=s3.js.map