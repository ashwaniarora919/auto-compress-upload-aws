export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type BatchDto = {
    id: string;
    courseName: string;
    teacherName: string;
    schedule: string;
    timing: string;
};

export type VideoDto = {
    id: string;
    title: string;
    description: string;
    videoDate: string;
    originalFilename: string;
    originalSize: number;
    compressedSize: number;
    mimeType: string;
    thumbnailUrl: string | null;
    batch: BatchDto | null;
    createdAt: string;
    updatedAt: string;
};

async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(input, init);
    } catch {
        throw new Error(`Could not reach the backend at ${API_URL}. Is it running?`);
    }
}

async function readError(res: Response): Promise<string> {
    try {
        const data = await res.json();
        const details = Array.isArray(data.details) ? `: ${data.details.join(", ")}` : "";
        return `${data.error ?? "Request failed"}${details}`;
    } catch {
        return `Request failed (${res.status})`;
    }
}

export async function fetchBatches(): Promise<BatchDto[]> {
    const res = await safeFetch(`${API_URL}/api/batches`, { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.batches as BatchDto[];
}

export async function fetchVideos(): Promise<VideoDto[]> {
    const res = await safeFetch(`${API_URL}/api/videos`, { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.videos as VideoDto[];
}

export async function fetchPlaybackUrl(id: string): Promise<string> {
    const res = await safeFetch(`${API_URL}/api/videos/${id}/playback-url`, { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.url as string;
}

export async function deleteVideo(id: string): Promise<void> {
    const res = await safeFetch(`${API_URL}/api/videos/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await readError(res));
}

// XMLHttpRequest use kar rahe hain taaki upload progress mil sake
export function uploadVideo(
    form: FormData,
    onProgress: (percent: number) => void
): Promise<VideoDto> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}/api/videos`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };

        xhr.onload = () => {
            let data: any = null;
            try {
                data = JSON.parse(xhr.responseText);
            } catch {
                // JSON nahi tha
            }
            if (xhr.status >= 200 && xhr.status < 300 && data?.video) {
                resolve(data.video as VideoDto);
            } else {
                const details = Array.isArray(data?.details) ? `: ${data.details.join(", ")}` : "";
                reject(new Error(data?.error ? `${data.error}${details}` : `Upload failed (${xhr.status})`));
            }
        };

        xhr.onerror = () =>
            reject(new Error(`Could not reach the backend at ${API_URL}. Is it running?`));

        xhr.send(form);
    });
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(isoDate: string): string {
    const d = new Date(`${isoDate}T00:00:00`);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const SCHEDULE_LABELS: Record<string, string> = {
    mwf: "Mon, Wed, Fri",
    mtwtf: "Mon-Fri",
    tt: "Tue, Thu",
    ss: "Sat, Sun",
};

// "tt" -> "Tue, Thu"
export function scheduleLabel(code: string): string {
    return SCHEDULE_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

// "17-18" -> "17:00 - 18:00"
export function timingLabel(timing: string): string {
    const m = timing.match(/^(\d{1,2})-(\d{1,2})$/);
    return m ? `${m[1].padStart(2, "0")}:00 - ${m[2].padStart(2, "0")}:00` : timing;
}