export type CompressOutcome = {
    file: File;
    compressed: boolean;
    note: string | null;
};

// Mediabunny ko function ke andar import kiya hai taaki server-side render mein na chale
export async function compressVideo(
    file: File,
    onProgress: (percent: number) => void
): Promise<CompressOutcome> {
    if (typeof VideoEncoder === "undefined") {
        return {
            file,
            compressed: false,
            note: "This browser can't compress videos (use Chrome or Edge). Uploading the original.",
        };
    }

    try {
        const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS } =
            await import("mediabunny");

        const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

        const duration = await input.computeDuration();
        if (!duration || !isFinite(duration)) {
            throw new Error("Could not determine video duration");
        }

        // Target: original size ka lagbhag 70%
        const targetBits = file.size * 8 * 0.7;
        const totalBps = targetBits / duration;
        const videoBps = Math.max(200_000, Math.round(totalBps - 128_000));

        const target = new BufferTarget();
        const output = new Output({ format: new Mp4OutputFormat(), target });

        const conversion = await Conversion.init({
            input,
            output,
            video: { codec: "avc", bitrate: videoBps },
        });
        if (!conversion.isValid) {
            throw new Error("This video can't be converted in the browser");
        }

        conversion.onProgress = (p: number) => onProgress(Math.round(p * 100));
        await conversion.execute();

        const buffer = target.buffer;
        if (!buffer) throw new Error("No output was produced");

        if (buffer.byteLength >= file.size) {
            return {
                file,
                compressed: false,
                note: "The compressed version wasn't smaller, so the original is uploaded.",
            };
        }

        const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
        return {
            file: new File([buffer], `${baseName}.mp4`, { type: "video/mp4" }),
            compressed: true,
            note: null,
        };
    } catch (e) {
        console.error("Compression failed:", e);
        return {
            file,
            compressed: false,
            note: "Compression failed, so the original video is uploaded.",
        };
    }
}