"use client";

import { useEffect, useRef, useState } from "react";
import { compressVideo } from "@/lib/compress";
import {
    uploadVideo,
    fetchBatches,
    formatBytes,
    scheduleLabel,
    timingLabel,
    type BatchDto,
    type VideoDto,
} from "@/lib/api";

type Phase = "idle" | "compressing" | "uploading" | "saving";

const MAX_INPUT_BYTES = 1024 * 1024 * 1024; // 1 GB original
const MAX_THUMB_BYTES = 5 * 1024 * 1024; // 5 MB
const THUMB_TYPES = ["image/jpeg", "image/png", "image/webp"];

function useObjectUrl(file: File | null) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!file) {
            setUrl(null);
            return;
        }
        const u = URL.createObjectURL(file);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [file]);
    return url;
}

export default function UploadModal({
    onClose,
    onUploaded,
}: {
    onClose: () => void;
    onUploaded: (video: VideoDto) => void;
}) {
    const [batches, setBatches] = useState<BatchDto[]>([]);
    const [batchesLoading, setBatchesLoading] = useState(true);
    const [batchesError, setBatchesError] = useState<string | null>(null);
    const [batchId, setBatchId] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [videoDate, setVideoDate] = useState(() => new Date().toLocaleDateString("en-CA"));
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [thumbFile, setThumbFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [progress, setProgress] = useState(0);
    const [note, setNote] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const submittingRef = useRef(false);

    const videoPreview = useObjectUrl(videoFile);
    const thumbPreview = useObjectUrl(thumbFile);
    const busy = phase !== "idle";

    useEffect(() => {
        let cancelled = false;
        fetchBatches()
            .then((list) => {
                if (cancelled) return;
                setBatches(list);
                setBatchesLoading(false);
            })
            .catch((e) => {
                if (cancelled) return;
                setBatchesError(e instanceof Error ? e.message : "Could not load batches");
                setBatchesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0] ?? null;
        setError(null);
        if (!f) {
            setVideoFile(null);
            return;
        }
        if (!f.type.startsWith("video/")) {
            setError("Please choose a video file.");
            e.target.value = "";
            setVideoFile(null);
            return;
        }
        if (f.size > MAX_INPUT_BYTES) {
            setError("Video is too large (max 1 GB).");
            e.target.value = "";
            setVideoFile(null);
            return;
        }
        setVideoFile(f);
    }

    function handleThumbChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0] ?? null;
        setError(null);
        if (!f) {
            setThumbFile(null);
            return;
        }
        if (!THUMB_TYPES.includes(f.type)) {
            setError("Thumbnail must be a JPG, PNG or WebP image.");
            e.target.value = "";
            setThumbFile(null);
            return;
        }
        if (f.size > MAX_THUMB_BYTES) {
            setError("Thumbnail is too large (max 5 MB).");
            e.target.value = "";
            setThumbFile(null);
            return;
        }
        setThumbFile(f);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submittingRef.current) return; // double submit se bachne ke liye
        setError(null);
        setNote(null);

        if (!batchId) return setError("Please select a batch.");
        if (!title.trim()) return setError("Please enter a title.");
        if (!videoFile) return setError("Please choose a video.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(videoDate)) return setError("Please choose a date.");

        submittingRef.current = true;
        try {
            setPhase("compressing");
            setProgress(0);
            const result = await compressVideo(videoFile, setProgress);
            setNote(result.note);

            setPhase("uploading");
            setProgress(0);
            const form = new FormData();
            form.append("video", result.file);
            if (thumbFile) form.append("thumbnail", thumbFile);
            form.append("batchId", batchId);
            form.append("title", title.trim());
            form.append("description", description.trim());
            form.append("videoDate", videoDate);
            form.append("originalFilename", videoFile.name);
            form.append("originalSize", String(videoFile.size));

            const video = await uploadVideo(form, (pct) => {
                setProgress(pct);
                if (pct >= 100) setPhase("saving");
            });
            onUploaded(video);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
            setPhase("idle");
        } finally {
            submittingRef.current = false;
        }
    }

    const statusText =
        phase === "compressing"
            ? `Compressing video... ${progress}%`
            : phase === "uploading"
                ? `Uploading... ${progress}%`
                : phase === "saving"
                    ? "Saving to cloud, almost done..."
                    : "";

    const inputClass =
        "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100";
    const fileClass =
        "block w-full rounded-md border border-gray-300 bg-white p-1 text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !busy && onClose()}
        >
            <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Upload Video</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close"
                        className="text-gray-500 hover:text-gray-800 disabled:opacity-40"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-semibold text-gray-700">Batch *</label>
                        <select
                            value={batchId}
                            onChange={(e) => setBatchId(e.target.value)}
                            disabled={busy || batchesLoading || batches.length === 0}
                            className={inputClass}
                        >
                            <option value="">
                                {batchesLoading ? "Loading batches..." : "Select a batch"}
                            </option>
                            {batches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.courseName} | {scheduleLabel(b.schedule)} | {timingLabel(b.timing)} |{" "}
                                    {b.teacherName}
                                </option>
                            ))}
                        </select>
                        {batchesError && <p className="mt-1 text-xs text-red-600">{batchesError}</p>}
                        {!batchesLoading && !batchesError && batches.length === 0 && (
                            <p className="mt-1 text-xs text-gray-500">No batches are available.</p>
                        )}
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-gray-700">Title *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={200}
                            disabled={busy}
                            className={inputClass}
                            placeholder="e.g. Chapter 3: Photosynthesis"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-gray-700">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={2000}
                            rows={3}
                            disabled={busy}
                            className={inputClass}
                            placeholder="What is this video about?"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-gray-700">Date *</label>
                        <input
                            type="date"
                            value={videoDate}
                            onChange={(e) => setVideoDate(e.target.value)}
                            disabled={busy}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-gray-700">Video *</label>
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleVideoChange}
                            disabled={busy}
                            className={fileClass}
                        />
                        {videoFile && (
                            <p className="mt-1 text-xs text-gray-500">
                                {videoFile.name} ({formatBytes(videoFile.size)})
                            </p>
                        )}
                        {videoPreview && (
                            <video
                                src={videoPreview}
                                controls
                                className="mt-2 max-h-48 w-full rounded-md bg-black"
                            />
                        )}
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-gray-700">
                            Thumbnail (optional)
                        </label>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleThumbChange}
                            disabled={busy}
                            className={fileClass}
                        />
                        {thumbPreview && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={thumbPreview}
                                alt="Thumbnail preview"
                                className="mt-2 max-h-32 rounded-md border border-gray-200"
                            />
                        )}
                    </div>

                    {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                    {note && (
                        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                            {note}
                        </div>
                    )}

                    {busy && (
                        <div>
                            <p className="mb-1 text-sm text-gray-700">{statusText}</p>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                                <div
                                    className="h-2 rounded-full bg-blue-600 transition-all"
                                    style={{ width: `${phase === "saving" ? 100 : progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                        >
                            {busy ? "Working..." : "Compress & Upload"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}