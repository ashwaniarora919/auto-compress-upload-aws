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

// "TT" -> "tt"
export function segment(input: string, fallback = "unknown"): string {
    const s = input.toLowerCase().replace(/[^a-z0-9-]+/g, "").replace(/^-+|-+$/g, "");
    return s || fallback;
}

// "11:00-11:57" -> "11:00-11:57", "11-12" -> "11:00-12:00", "5-6" -> "05:00-06:00"
export function timingSegment(input: string, fallback = "unknown"): string {
    if (!input) return fallback;
    const trimmed = input.trim();

    // Match patterns: 11-12, 17-18, 5-6, 11:00-11:57, 11:00-12:00, 11:00 - 12:00
    const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?$/i);
    if (match) {
        const [, h1, m1, h2, m2] = match;
        const startH = h1.padStart(2, "0");
        const startM = m1 ?? "00";
        const endH = h2.padStart(2, "0");
        const endM = m2 ?? "00";
        return `${startH}:${startM}-${endH}:${endM}`;
    }

    const cleaned = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9:-]+/g, "")
        .replace(/^[-:]+|[-:]+$/g, "");
    return cleaned || fallback;
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
        timingSegment(batch.timing),
        yearFolder(videoDate),
        monthFolder(videoDate),
    ];
    return `${PREFIX}${parts.join("/")}/`;
}

// File ka naam: title + id ke shuru ke 8 characters, taaki do videos ka naam kabhi na takraye
export function buildFileBase(title: string, id: string): string {
    return `${snake(title, "video")}_${id.slice(0, 8)}`;
}