import './index.css';
import { useState, useRef } from 'react';
import type { CSSProperties, ChangeEvent, DragEvent } from 'react';
import { navigateTo } from '@devvit/web/client';
import type { ChallengeEntry } from '../shared/game';

type API<T> = T & { error?: string };

const request = async <T,>(url: string, init?: RequestInit): Promise<API<T>> => {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = (await response.json()) as API<T>;
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data;
};

const makeId = () => Math.random().toString(36).slice(2, 9);

const prepareImage = async (file: File): Promise<string> => {
  if (file.type === 'image/gif' || file.type.startsWith('video/')) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Read failed')));
      reader.readAsDataURL(file);
    });
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (blob) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Could not prepare ${file.name}`));
        reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Failed')));
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    /* Fallback */
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Read failed')));
    reader.readAsDataURL(file);
  });
};

const themePresets = [
  { name: 'Blue', value: '#4979D0' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Rose', value: '#F43F5E' },
];

export const SetupApp = ({ onPreviewDemo }: { onPreviewDemo?: () => void }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Tech & Gaming');
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [themeColor, setThemeColor] = useState('#4979D0');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (fileArray.length === 0) {
      setNotice('Please select valid image files.');
      return;
    }

    if (entries.length + fileArray.length > 30) {
      setNotice('Maximum 30 images per rating challenge.');
      return;
    }

    setBusy(true);
    setUploadProgress(`Preparing ${fileArray.length} image${fileArray.length === 1 ? '' : 's'}…`);

    try {
      const preparedUrls = await Promise.all(fileArray.map((file) => prepareImage(file)));
      setUploadProgress(`Uploading to Reddit CDN…`);

      const uploadResult = await request<{ imageUrls: string[] }>('/api/media', {
        method: 'POST',
        body: JSON.stringify({ dataUrls: preparedUrls }),
      });

      const newEntries: ChallengeEntry[] = uploadResult.imageUrls.map((url) => ({
        id: makeId(),
        imageUrl: url,
        text: '', // Keep blank by default per user request
      }));

      setEntries((prev) => [...prev, ...newEntries]);
      setNotice(`Added ${newEntries.length} image${newEntries.length === 1 ? '' : 's'} successfully!`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((item) => item.id !== id));
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    setEntries((prev) => {
      const copy = [...prev];
      const item = copy[index]!;
      copy[index] = copy[target]!;
      copy[target] = item;
      return copy;
    });
  };

  const updateEntryText = (id: string, text: string) => {
    setEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text } : item))
    );
  };

  const publishChallenge = async () => {
    if (!title.trim()) {
      setNotice('Please enter a game title.');
      return;
    }
    if (entries.length === 0) {
      setNotice('Please upload at least 1 image to rate.');
      return;
    }

    setBusy(true);
    setNotice('Publishing your RATE.EXE challenge to Reddit…');

    try {
      const res = await request<{ postUrl: string }>('/api/publish', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          themeColor,
          entries,
        }),
      });

      setNotice('Published! Redirecting to post…');
      navigateTo(res.postUrl);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to publish.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="setup-shell setup-editor-shell" style={{ '--game-accent': themeColor } as CSSProperties}>
      <header className="setup-brand">
        <span className="brand-mark">R</span>
        <span className="setup-brand-title">
          RATE<span className="accent">.EXE</span>
        </span>
        <span className="setup-mode-tag">CREATION PANEL</span>
        {onPreviewDemo && (
          <button
            type="button"
            className="preview-demo-btn"
            onClick={onPreviewDemo}
            title="Preview demo rating game"
          >
            Demo Preview
          </button>
        )}
      </header>

      <div className="setup-content">
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        <div className="setup-heading">
          <h1>Create Rating Challenge</h1>
          <p className="setup-subhead">
            Upload images for your community to evaluate and rate on a scale from 1 to 10.
          </p>
        </div>

        {/* Game Title */}
        <div className="setup-section">
          <h2>Challenge Details</h2>
          <label>
            GAME TITLE <span className="required">*</span>
            <input
              type="text"
              className="setup-text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rate our Cyberpunk Battlestations 🔥"
              maxLength={80}
            />
          </label>

          <label>
            PROMPT / DESCRIPTION <span className="optional">OPTIONAL</span>
            <textarea
              className="setup-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Give context or instructions for your community..."
              maxLength={300}
            />
          </label>

          <div className="setup-row-two">
            <label>
              CATEGORY
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Tech & Gaming">Tech & Gaming</option>
                <option value="Pop Culture">Pop Culture</option>
                <option value="Setups & Battlestations">Setups & Battlestations</option>
                <option value="Fashion & Fits">Fashion & Fits</option>
                <option value="Art & Design">Art & Design</option>
                <option value="Food & Cooking">Food & Cooking</option>
                <option value="General">General</option>
              </select>
            </label>

            <label>
              ACCENT THEME
              <div className="theme-preset-pills">
                {themePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`theme-pill ${themeColor === preset.value ? 'selected' : ''}`}
                    style={{ backgroundColor: preset.value }}
                    onClick={() => setThemeColor(preset.value)}
                    title={preset.name}
                  />
                ))}
              </div>
            </label>
          </div>
        </div>

        {/* Image Uploader */}
        <div className="setup-section">
          <div className="items-heading">
            <div>
              <h2>Upload Images ({entries.length}/30)</h2>
              <p>Add 1 to 30 images. Names are completely optional (leave blank).</p>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            className={`uploader-dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/mp4,video/webm"
              style={{ display: 'none' }}
              onChange={onFileInputChange}
            />
            <span className="dropzone-icon">📷</span>
            <div className="dropzone-text">
              <b>{uploadProgress || 'Click to select or drag & drop images'}</b>
              <small>PNG, JPG, WEBP, GIF (up to 30 images)</small>
            </div>
          </div>

          {/* Uploaded Entries List */}
          {entries.length > 0 && (
            <div className="uploaded-entries-grid">
              {entries.map((entry, idx) => (
                <div className="uploaded-entry-card" key={entry.id}>
                  <div className="entry-thumb-wrapper">
                    {idx === 0 && <span className="cover-badge">Cover</span>}
                    {entry.imageUrl ? (
                      <img src={entry.imageUrl} alt="" className="entry-thumb-img" />
                    ) : (
                      <div className="entry-thumb-placeholder">#{idx + 1}</div>
                    )}
                    <span className="entry-order-badge">#{idx + 1}</span>
                  </div>

                  <div className="entry-meta-inputs">
                    <input
                      type="text"
                      className="entry-name-input"
                      value={entry.text}
                      onChange={(e) => updateEntryText(entry.id, e.target.value)}
                      placeholder="Optional label (leave blank)"
                      maxLength={60}
                    />
                    <div className="entry-actions-row">
                      <button
                        type="button"
                        className="entry-btn move-btn"
                        disabled={idx === 0}
                        onClick={() => moveEntry(idx, -1)}
                        title="Move earlier"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="entry-btn move-btn"
                        disabled={idx === entries.length - 1}
                        onClick={() => moveEntry(idx, 1)}
                        title="Move later"
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className="entry-btn delete-btn"
                        onClick={() => removeEntry(entry.id)}
                        title="Remove image"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <footer className="setup-bottom-bar">
        <span className="setup-summary-text">
          {entries.length === 0
            ? 'Add at least 1 image to publish'
            : `${entries.length} image${entries.length === 1 ? '' : 's'} ready`}
        </span>

        <button
          type="button"
          className="publish-submit-btn"
          disabled={busy || !title.trim() || entries.length === 0}
          onClick={() => void publishChallenge()}
        >
          {busy ? 'Publishing…' : 'Publish Rating Game 🚀'}
        </button>
      </footer>
    </main>
  );
};
