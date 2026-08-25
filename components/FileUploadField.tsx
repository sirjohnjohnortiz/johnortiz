"use client";

import { useState } from "react";
import { uploadFile, getSignedUrl } from "@/lib/storage";

export default function FileUploadField({
  bucket,
  label,
  existingPath,
  onUploaded,
  accept = "image/*,.pdf",
}: {
  bucket: string;
  label: string;
  existingPath?: string | null;
  onUploaded: (path: string) => void;
  accept?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(existingPath ? existingPath.split("/").pop()! : null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const path = await uploadFile(bucket, file);
      setFileName(file.name);
      onUploaded(path);
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleView() {
    if (!existingPath) return;
    const url = await getSignedUrl(bucket, existingPath);
    if (url) window.open(url, "_blank");
  }

  return (
    <div>
      <label className="label-field">{label}</label>
      <div className="flex items-center gap-2">
        <label className="btn-secondary cursor-pointer text-xs">
          {uploading ? "Uploading…" : fileName ? "Replace file" : "Choose file"}
          <input type="file" accept={accept} className="hidden" onChange={handleChange} disabled={uploading} />
        </label>
        {existingPath && (
          <button type="button" onClick={handleView} className="text-xs text-seal underline">
            View current
          </button>
        )}
        {fileName && <span className="text-xs text-inkmuted truncate max-w-[140px]">{fileName}</span>}
      </div>
      {error && <p className="text-xs text-bad mt-1">{error}</p>}
    </div>
  );
}
