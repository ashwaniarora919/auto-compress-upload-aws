import { PREFIX } from "./s3.js";
const ENTRY_FOLDER = "entry";
const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
];
export function snake(input, fallback = "unknown", max = 60) {
    const s = input
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, max)
        .replace(/_+$/g, "");
    return s || fallback;
}
export function segment(input, fallback = "unknown") {
    const s = input.toLowerCase().replace(/[^a-z0-9-]+/g, "").replace(/^-+|-+$/g, "");
    return s || fallback;
}
export function yearFolder(videoDate) {
    const year = videoDate.slice(0, 4);
    return /^\d{4}$/.test(year) ? year : "unknown";
}
export function monthFolder(videoDate) {
    const index = Number(videoDate.slice(5, 7)) - 1;
    return MONTHS[index] ?? "unknown";
}
export function buildFolder(batch, videoDate) {
    const parts = [
        ENTRY_FOLDER,
        snake(batch.courseName),
        snake(batch.teacherName),
        segment(batch.schedule),
        segment(batch.timing),
        yearFolder(videoDate),
        monthFolder(videoDate),
    ];
    return `${PREFIX}${parts.join("/")}/`;
}
export function buildFileBase(title, id) {
    return `${snake(title, "video")}_${id.slice(0, 8)}`;
}
//# sourceMappingURL=paths.js.map