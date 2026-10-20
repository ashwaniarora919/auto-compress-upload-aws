"use client";

import { useState } from "react";
import {
    deleteVideo,
    fetchPlaybackUrl,
    formatBytes,
    formatDate,
    scheduleLabel,
    timingLabel,
    type VideoDto,
} from "@/lib/api";

export default function VideoCard({
    video,
    onDeleted,
}: {
    video: VideoDto;
    onDeleted: () => void;
}) {
    const [playUrl, setPlayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handlePlay() {
        setLoading(true);
        setError(null);
        try {
            setPlayUrl(await fetchPlaybackUrl(video.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load the video");
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete() {
        if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteVideo(video.id);
            onDeleted();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not delete the video");
            setDeleting(false);
        }
    }

    const savedPercent =
        video.originalSize > video.compressedSize
            ? Math.round((1 - video.compressedSize / video.originalSize) * 100)
            : 0;

    return (
        <article className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {playUrl ? (
                <video
                    src={playUrl}
                    controls
                    autoPlay
                    playsInline
                    className="aspect-video w-full bg-black"
                    onError={() => {
                        setPlayUrl(null);
                        setError("Playback failed or the link expired. Click play to retry.");
                    }}
                />
            ) : (
                <button
                    type="button"
                    onClick={handlePlay}
                    disabled={loading}
                    aria-label={`Play ${video.title}`}
                    className="group relative aspect-video w-full bg-gray-900"
                >
                    {video.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={video.thumbnailUrl}
                            alt={`${video.title} thumbnail`}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="h-full w-full bg-gradient-to-br from-gray-700 to-gray-900" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-xl text-gray-900 shadow transition group-hover:scale-110">
                            {loading ? "..." : "▶"}
                        </span>
                    </span>
                </button>
            )}

            <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-lg font-bold text-gray-900">{video.title}</h3>

                {video.batch && (
                    <p className="text-xs font-semibold text-blue-700">
                        {video.batch.courseName} · {scheduleLabel(video.batch.schedule)} ·{" "}
                        {timingLabel(video.batch.timing)}
                        {video.batch.teacherName ? ` · ${video.batch.teacherName}` : ""}
                    </p>
                )}

                <p className="text-xs font-medium text-gray-500">{formatDate(video.videoDate)}</p>
                {video.description && (
                    <p className="line-clamp-3 text-sm text-gray-700">{video.description}</p>
                )}
                <p className="text-xs text-gray-500">
                    {savedPercent > 0
                        ? `${formatBytes(video.originalSize)} → ${formatBytes(video.compressedSize)} (${savedPercent}% smaller)`
                        : formatBytes(video.compressedSize)}
                </p>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="mt-auto pt-2">
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
                    >
                        {deleting ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </div>
        </article>
    );
}