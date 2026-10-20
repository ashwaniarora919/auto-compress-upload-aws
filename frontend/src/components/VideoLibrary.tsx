"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchVideos, type VideoDto } from "@/lib/api";
import UploadModal from "./UploadModal";
import VideoCard from "./VideoCard";

export default function VideoLibrary() {
    console.log("render");
    const [videos, setVideos] = useState<VideoDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showUpload, setShowUpload] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            setVideos(await fetchVideos());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load videos");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    function retry() {
        setLoading(true);
        load();
    }

    async function handleUploaded() {
        setShowUpload(false);
        setToast("Video uploaded successfully");
        setTimeout(() => setToast(null), 4000);
        await load();
    }

    return (
        <main className="min-h-screen bg-gray-100 px-4 py-10 text-gray-900">
            <div className="mx-auto max-w-6xl">
                <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Class Videos</h1>
                        <p className="mt-1 text-sm text-gray-600">Upload short videos and play them from here.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowUpload(true)}
                        className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700"
                    >
                        Upload Video
                    </button>
                </header>

                {toast && (
                    <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                        {toast}
                    </div>
                )}

                {loading ? (
                    <p className="animate-pulse text-gray-600">Loading videos...</p>
                ) : error ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <p>{error}</p>
                        <button
                            type="button"
                            onClick={retry}
                            className="mt-2 font-semibold underline hover:no-underline"
                        >
                            Try again
                        </button>
                    </div>
                ) : videos.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                        <p className="text-lg font-semibold text-gray-800">No videos yet</p>
                        <p className="mt-1 text-sm text-gray-500">Click &quot;Upload Video&quot; to add your first one.</p>
                    </div>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {videos.map((v) => (
                            <VideoCard key={v.id} video={v} onDeleted={load} />
                        ))}
                    </div>
                )}
            </div>

            {showUpload && (
                <UploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />
            )}
        </main>
    );
}