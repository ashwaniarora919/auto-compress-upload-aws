import { PREFIX } from "./s3.js";

const ENTRY_FOLDER = "entry";

const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
];

// "Semi Classical Dance" -> "semi_classical_dance"
export function snake(input: string, fallback = "unknown", max = 60): string {
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

// "TT" -> "tt", "17-18" -> "17-18"
export function segment(input: string, fallback = "unknown"): string {
    const s = input.toLowerCase().replace(/[^a-z0-9-]+/g, "").replace(/^-+|-+$/g, "");
    return s || fallback;
}

// "2026-10-17" -> "2026"
export function yearFolder(videoDate: string): string {
    const year = videoDate.slice(0, 4);
    return /^\d{4}$/.test(year) ? year : "unknown";
}

// "2026-10-17" -> "october"
export function monthFolder(videoDate: string): string {
    const index = Number(videoDate.slice(5, 7)) - 1;
    return MONTHS[index] ?? "unknown";
}

export type BatchInfo = {
    courseName: string;
    teacherName: string;
    schedule: string;
    timing: string;
};

export function buildFolder(batch: BatchInfo, videoDate: string): string {
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

// File ka naam: title + id ke shuru ke 8 characters, taaki do videos ka naam kabhi na takraye
export function buildFileBase(title: string, id: string): string {
    return `${snake(title, "video")}_${id.slice(0, 8)}`;
}