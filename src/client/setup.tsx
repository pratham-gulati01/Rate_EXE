import './index.css';
import { useEffect, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  addWebViewModeListener,
  exitExpandedMode,
  getWebViewMode,
  navigateTo,
  removeWebViewModeListener,
  requestExpandedMode,
} from '@devvit/web/client';
import { isVideoUrl } from '../shared/game';
import type { Challenge, ChallengeEntry } from '../shared/game';

type API<T> = T & { error?: string };
const request = async <T,>(url: string, init?: RequestInit): Promise<API<T>> => {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = (await response.json()) as API<T>;
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data;
};

const makeId = () => Math.random().toString(36).slice(2, 9);

const isGifFile = (file: File) =>
  file.type === 'image/gif' || file.type === 'image/x-gif' || /\.gif$/i.test(file.name);

const isAviFile = (file: File) =>
  /\.avi$/i.test(file.name) || ['video/x-msvideo', 'video/avi', 'video/msvideo'].includes(file.type);

const isAvifFile = (file: File) =>
  /\.avif$/i.test(file.name) || file.type === 'image/avif';

const prepareImage = async (file: File): Promise<string> => {
  if (isGifFile(file) || isAviFile(file)) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}.`)));
      reader.readAsDataURL(file);
    });
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (blob) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Could not prepare ${file.name}.`));
        reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Could not prepare ${file.name}.`)));
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    /* Fallback */
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}.`)));
    reader.readAsDataURL(file);
  });
};

const themePresets = [
  { name: 'Blue', value: '#4979D0' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Teal', value: '#0F9F9A' },
  { name: 'Orange', value: '#E8753D' },
  { name: 'Rose', value: '#E34D83' },
  { name: 'Green', value: '#49A66A' },
];

function PaletteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r=".75" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".75" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".75" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".75" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z" />
    </svg>
  );
}

function MediaUploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function TextCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function BulkAddIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function PhotoAttachmentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ArrowMiniIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export const SetupApp = ({
  initialMode = null,
  onBack,
}: {
  initialMode?: 'rating' | null | undefined;
  onBack?: (() => void) | undefined;
} = {}) => {
  const [mode, setMode] = useState<'rating' | null>(() => {
    if (initialMode) return initialMode;
    try {
      return getWebViewMode() === 'expanded' ? 'rating' : null;
    } catch {
      return null;
    }
  });
  const [title, setTitle] = useState('Rating');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Tech & Gaming');
  const [entries, setEntries] = useState<ChallengeEntry[]>([{ id: makeId(), text: '' }]);
  const [draftId, setDraftId] = useState('');
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [themeEnabled, setThemeEnabled] = useState(false);
  const [themeColor, setThemeColor] = useState('#4979D0');
  const [drafts, setDrafts] = useState<Challenge[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; active: number } | null>(null);

  const maxEntries = 30;

  useEffect(() => {
    void request<{ drafts: Challenge[] }>('/api/drafts')
      .then((data) => setDrafts(data.drafts))
      .catch(() => undefined);
  }, []);

  // Sync mode with webview presentation:
  // - Expanded mode opens directly into the creation panel (no second click required)
  // - Closing expanded view returns back to "Choose a Mode" (inline)
  useEffect(() => {
    const handleModeChange = (newMode: 'inline' | 'expanded') => {
      if (newMode === 'inline') {
        setMode(null);
      } else if (newMode === 'expanded') {
        setMode('rating');
      }
    };

    try {
      addWebViewModeListener(handleModeChange);
    } catch (e) {
      console.warn('addWebViewModeListener:', e);
    }

    return () => {
      try {
        removeWebViewModeListener(handleModeChange);
      } catch {
        // ignore
      }
    };
  }, []);

  const startMode = (event: ReactMouseEvent<HTMLButtonElement>) => {
    try {
      requestExpandedMode(event.nativeEvent, 'default');
    } catch (e) {
      console.warn('requestExpandedMode:', e);
    }
    setMode('rating');
    setTitle('Rating');
    setNotice('');
  };

  const loadDraft = (draft: Challenge) => {
    setDraftId(draft.id);
    setMode('rating');
    setTitle(draft.title || 'Rating');
    setDescription(draft.description || '');
    setCategory(draft.category || 'Tech & Gaming');
    setThemeEnabled(Boolean(draft.themeColor));
    setThemeColor(draft.themeColor ?? '#4979D0');
    setEntries(draft.entries.length ? draft.entries : [{ id: makeId(), text: '' }]);
    setNotice('Draft loaded.');
  };

  const updateEntry = (entryId: string, patch: Partial<ChallengeEntry>) =>
    setEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)));

  // Batch Image Upload
  const uploadImages = async (selected: FileList | null) => {
    const files = Array.from(selected ?? []);
    if (!files.length) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-gif', 'image/avif', 'video/x-msvideo', 'video/avi', 'video/msvideo', 'video/mp4'];
    const isAllowed = (file: File) => allowed.includes(file.type) || isGifFile(file) || isAviFile(file) || isAvifFile(file) || /\.(png|jpe?g|webp|gif|avif|avi|mp4)$/i.test(file.name);
    if (files.some((file) => !isAllowed(file))) {
      setNotice('Choose PNG, JPEG, WEBP, GIF, AVIF, or AVI files.');
      return;
    }
    if (files.some((file) => file.size > 20 * 1024 * 1024)) {
      setNotice('Choose images under 20 MB each.');
      return;
    }

    const available = maxEntries - completeEntries.length;
    const toUpload = files.slice(0, Math.max(available, 0));
    if (!toUpload.length) {
      setNotice(`This game already has ${maxEntries} items.`);
      return;
    }

    setBusy(true);
    setUploadStatus('Preparing images…');
    setUploadProgress({ done: 0, total: toUpload.length, active: 0 });
    setNotice('');

    try {
      const imageUrls: string[] = Array(toUpload.length);
      let nextIndex = 0;
      let uploaded = 0;
      let activeUploads = 0;

      await Promise.all(
        Array.from({ length: Math.min(3, toUpload.length) }, async () => {
          while (nextIndex < toUpload.length) {
            const index = nextIndex++;
            const file = toUpload[index];
            if (!file) continue;
            setUploadStatus(`Uploading image ${index + 1} of ${toUpload.length}…`);
            try {
              const dataUrl = await prepareImage(file);
              activeUploads += 1;
              setUploadProgress({ done: uploaded, total: toUpload.length, active: activeUploads });
              const result = await request<{ imageUrl: string; imageUrls?: string[] }>('/api/media', {
                method: 'POST',
                body: JSON.stringify({ dataUrl }),
              });
              imageUrls[index] = result.imageUrl || result.imageUrls?.[0] || dataUrl;
            } catch (err) {
              console.error(`Upload error for ${file.name}`, err);
            } finally {
              uploaded += 1;
              activeUploads = Math.max(0, activeUploads - 1);
              setUploadProgress({ done: uploaded, total: toUpload.length, active: activeUploads });
            }
          }
        })
      );

      const successfulImages = toUpload
        .map((file, index) => ({ file, url: imageUrls[index] }))
        .filter((item): item is { file: File; url: string } => Boolean(item.url));

      if (successfulImages.length === 0) {
        throw new Error('Upload failed. Try smaller images.');
      }

      // Add to entries - keep text blank by default
      const incoming = successfulImages.map(({ url }) => ({
        id: makeId(),
        text: '',
        imageUrl: url,
      }));

      setEntries((current) => {
        const next = [...current];
        for (const image of incoming) {
          const emptyIndex = next.findIndex((entry) => !(entry.text ?? '').trim() && !entry.imageUrl?.trim());
          if (emptyIndex >= 0) next[emptyIndex] = { ...image, id: next[emptyIndex]?.id ?? image.id };
          else if (next.length < maxEntries) next.push(image);
        }
        return next;
      });

      setNotice(`${incoming.length} image${incoming.length === 1 ? '' : 's'} added.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setBusy(false);
      setUploadStatus('');
      setUploadProgress(null);
    }
  };

  // Single Item Attachment
  const uploadSingleImage = async (entryId: string, file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-gif', 'image/avif', 'video/x-msvideo', 'video/avi', 'video/msvideo', 'video/mp4'];
    const isAllowed = allowed.includes(file.type) || isGifFile(file) || isAviFile(file) || isAvifFile(file) || /\.(png|jpe?g|webp|gif|avif|avi|mp4)$/i.test(file.name);
    if (!isAllowed) {
      setNotice('Choose PNG, JPEG, WEBP, GIF, AVIF, or AVI files.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice('Choose media under 20 MB.');
      return;
    }
    setBusy(true);
    setNotice('Uploading media…');
    try {
      const dataUrl = await prepareImage(file);
      const result = await request<{ imageUrl: string; imageUrls?: string[] }>('/api/media', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      const url = result.imageUrl || result.imageUrls?.[0] || dataUrl;
      setEntries((current) =>
        current.map((entry) => (entry.id === entryId ? { ...entry, imageUrl: url } : entry))
      );
      setNotice('Media attached.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Media upload failed.');
    } finally {
      setBusy(false);
    }
  };

  // Only count entries with an image or text
  const completeEntries = entries.filter((entry) => Boolean(entry.imageUrl?.trim() || entry.text?.trim()));
  const validCount = completeEntries.length >= 1;

  const saveDraft = async () => {
    setBusy(true);
    try {
      const result = await request<{ draft: Challenge }>('/api/drafts', {
        method: 'POST',
        body: JSON.stringify({ draftId, title, description, category, mode: 'rating', ...(themeEnabled ? { themeColor } : {}), entries }),
      });
      setDraftId(result.draft.id);
      setDrafts((all) => [result.draft, ...all.filter((draft) => draft.id !== result.draft.id)]);
      setNotice('Draft saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save draft.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async (event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (!title.trim() || !validCount) {
      return setNotice(!title.trim() ? 'Give your game a title.' : 'Add at least 1 image to publish.');
    }
    setBusy(true);
    setNotice('Publishing your game post…');
    try {
      const result = await request<{ postUrl: string }>('/api/publish', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          mode: 'rating',
          ...(themeEnabled ? { themeColor } : {}),
          entries: completeEntries,
        }),
      });

      // Fix lag & glitch: exit expanded mode smoothly before navigating
      try {
        if (getWebViewMode() === 'expanded') {
          exitExpandedMode(event?.nativeEvent ?? new MouseEvent('click'));
        }
      } catch {
        /* ignore */
      }

      setNotice('Published! Opening post…');
      setTimeout(() => {
        navigateTo(result.postUrl);
      }, 150);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not publish the game post.');
      setBusy(false);
    }
  };

  // SCREEN 1: Choose a Mode (Centered, no extra text, POST SETUP tag)
  if (!mode) {
    return (
      <main className="setup-shell setup-mode-shell">
        <header className="setup-brand">
          <span className="brand-mark">R</span>
          <span>
            RATE<span className="accent">.EXE</span>
          </span>
          <span className="setup-label">POST SETUP</span>
        </header>

        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}

        <section className="mode-select-centered-section">
          <h1 className="mode-select-centered-title">Choose a Mode</h1>

          <div className="mode-single-card-container">
            <button
              type="button"
              className="mode-option mode-card-prominent"
              onClick={startMode}
            >
              <div className="mode-option-head">
                <div className="mode-option-title-group">
                  <span className="mode-icon">★</span>
                  <b className="mode-title">Rating</b>
                </div>
                <span className="mode-check-badge" aria-hidden="true">
                  <ArrowMiniIcon />
                </span>
              </div>
              <small className="mode-desc">
                Score each entry from 1 to 10 with an interactive slider.
              </small>
            </button>
          </div>

          {drafts.length > 0 && (
            <details className="load-drafts" style={{ marginTop: '20px' }}>
              <summary>Continue a saved draft</summary>
              <div>
                {drafts.map((draft) => (
                  <button key={draft.id} onClick={() => loadDraft(draft)}>
                    {draft.title}
                  </button>
                ))}
              </div>
            </details>
          )}
        </section>
      </main>
    );
  }

  // SCREEN 2: Expanded View (Matching Image 1)
  const statusText =
    completeEntries.length < 1
      ? `${completeEntries.length} of 1 minimum entry`
      : `${completeEntries.length} ${completeEntries.length === 1 ? 'item' : 'items'} ready`;

  return (
    <main className="setup-shell setup-editor-shell">
      {/* Header */}
      <header className="setup-brand">
        <button
          type="button"
          className="setup-back-btn"
          onClick={(event) => {
            setMode(null);
            try {
              if (getWebViewMode() === 'expanded') exitExpandedMode(event.nativeEvent);
            } catch {
              /* ignore */
            }
            onBack?.();
          }}
        >
          ← Back
        </button>
        <span className="setup-brand-title">
          RATE<span className="accent">.EXE</span>
        </span>
        <span className="setup-mode-tag">RATING</span>
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

        {/* Title & Description Heading */}
        <div className="setup-heading">
          <h1>Create your game</h1>
          <p className="setup-subhead">Set up your items and challenge your community.</p>
        </div>

        {/* Game Title Field */}
        <div className="setup-field-group">
          <label className="setup-field-label" htmlFor="game-title-input">
            GAME TITLE
          </label>
          <input
            id="game-title-input"
            className="setup-text-input"
            value={title}
            maxLength={80}
            placeholder="Rating"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        {/* Optional details (Description & Category) */}
        <details className="setup-details-accordion">
          <summary>
            <span>Optional details (description, category)</span>
            <span className="accordion-chevron">›</span>
          </summary>
          <div className="setup-details-body">
            <div className="setup-field-group">
              <label className="setup-field-label" htmlFor="game-desc-input">
                DESCRIPTION
              </label>
              <textarea
                id="game-desc-input"
                className="setup-textarea"
                value={description}
                maxLength={500}
                placeholder="Give players context about this game…"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="setup-field-group">
              <label className="setup-field-label" htmlFor="game-category-select">
                CATEGORY
              </label>
              <select
                id="game-category-select"
                className="setup-select"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {['Tech & Gaming', 'Pop culture', 'Food', 'Gaming', 'Music', 'Sports', 'Everyday life', 'Other'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
        </details>

        {/* Game Appearance (Custom Accent Color) */}
        <div className="setup-section-block">
          <div className="setup-section-header">
            <span className="setup-section-title">Game appearance</span>
            <span className="setup-badge-optional">Optional</span>
          </div>
          <div className="setup-appearance-card">
            <div
              className="setup-appearance-row"
              onClick={() => {
                const nextExpanded = !themeExpanded;
                setThemeExpanded(nextExpanded);
                if (nextExpanded && !themeEnabled) setThemeEnabled(true);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const nextExpanded = !themeExpanded;
                  setThemeExpanded(nextExpanded);
                  if (nextExpanded && !themeEnabled) setThemeEnabled(true);
                }
              }}
            >
              <div className="setup-appearance-info">
                <strong>Custom accent colour</strong>
                <span>Personalise your game</span>
              </div>
              <button
                type="button"
                className="setup-palette-btn"
                style={{ '--palette-accent': themeEnabled ? themeColor : '#4979D0' } as CSSProperties}
                aria-label="Toggle theme color picker"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextExpanded = !themeExpanded;
                  setThemeExpanded(nextExpanded);
                  if (nextExpanded && !themeEnabled) setThemeEnabled(true);
                }}
              >
                <PaletteIcon />
              </button>
            </div>

            {themeExpanded && (
              <div className="setup-appearance-expanded">
                <div className="theme-colors">
                  <div className="theme-swatches">
                    {themePresets.map((preset) => (
                      <button
                        type="button"
                        key={preset.value}
                        className={`theme-swatch ${themeColor === preset.value && themeEnabled ? 'selected' : ''}`}
                        style={{ '--swatch-color': preset.value } as CSSProperties}
                        aria-label={`${preset.name} theme`}
                        aria-pressed={themeColor === preset.value && themeEnabled}
                        onClick={() => {
                          setThemeEnabled(true);
                          setThemeColor(preset.value);
                        }}
                      />
                    ))}
                  </div>
                  <label className="theme-custom-color">
                    Custom
                    <input
                      aria-label="Pick a custom theme color"
                      type="color"
                      value={themeColor}
                      onChange={(event) => {
                        setThemeEnabled(true);
                        setThemeColor(event.target.value.toUpperCase());
                      }}
                    />
                    <span>{themeColor}</span>
                  </label>
                  <button
                    type="button"
                    className="setup-theme-reset-link"
                    onClick={() => {
                      setThemeEnabled(false);
                      setThemeExpanded(false);
                    }}
                  >
                    Reset default
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Add Your Items Header & Toolbar */}
        <div className="setup-section-block">
          <div className="setup-section-header">
            <span className="setup-section-title">Add your items</span>
            <span className="setup-count-pill">
              {completeEntries.length} / {maxEntries}
            </span>
          </div>
          <p className="setup-help-text">Add between 1 and {maxEntries} entries to get started.</p>

          <div className="setup-action-toolbar">
            <label className="setup-toolbar-tile media-tile">
              <div className="toolbar-icon-wrap">
                <MediaUploadIcon />
              </div>
              <span className="toolbar-title">Media</span>
              <span className="toolbar-subtitle">Upload</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/x-msvideo,video/avi,video/msvideo,video/mp4,video/*,image/*"
                multiple
                disabled={busy || completeEntries.length >= maxEntries}
                onChange={(event) => {
                  void uploadImages(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>

            <button
              type="button"
              className="setup-toolbar-tile text-tile"
              disabled={busy || entries.length >= maxEntries}
              onClick={() => setEntries((all) => [...all, { id: makeId(), text: '' }])}
            >
              <div className="toolbar-icon-wrap">
                <TextCardIcon />
              </div>
              <span className="toolbar-title">Text</span>
              <span className="toolbar-subtitle">Add card</span>
            </button>

            <button
              type="button"
              className="setup-toolbar-tile bulk-tile"
              disabled={busy || entries.length >= maxEntries}
              onClick={() =>
                setEntries((all) => [
                  ...all,
                  ...Array.from({ length: Math.min(5, maxEntries - all.length) }, () => ({ id: makeId(), text: '' })),
                ])
              }
            >
              <div className="toolbar-icon-wrap">
                <BulkAddIcon />
              </div>
              <span className="toolbar-title">Bulk</span>
              <span className="toolbar-subtitle">Add 5</span>
            </button>
          </div>

          {/* Upload Progress Banner */}
          {uploadStatus && (
            <div className="upload-status" role="status">
              <span className="upload-spinner" />
              <span className="upload-status-text">{uploadStatus}</span>
              {uploadProgress && (
                <>
                  <b className="upload-progress-count">
                    {uploadProgress.done}/{uploadProgress.total}
                    {uploadProgress.active ? ` · ${uploadProgress.active} active` : ''}
                  </b>
                  <div className="upload-progress-track">
                    <span style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
                    <i />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Entries Subheading */}
          <div className="setup-sub-header">
            <span className="setup-entries-title">Your entries</span>
            <span className="setup-entries-added">{completeEntries.length} added</span>
          </div>

          {/* Numbered Item Rows */}
          <div className="setup-entries-list">
            {entries.map((entry, index) => (
              <div className="setup-entry-strip" key={entry.id}>
                <div className="setup-entry-thumb">
                  {entry.imageUrl ? (
                    <div className="setup-entry-media-wrap">
                      {isVideoUrl(entry.imageUrl) ? (
                        <video src={entry.imageUrl} autoPlay loop muted playsInline />
                      ) : (
                        <img
                          src={entry.imageUrl}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.alt = 'Media error';
                          }}
                        />
                      )}
                      <span className="setup-thumb-num">{String(index + 1).padStart(2, '0')}</span>
                      <button
                        type="button"
                        className="setup-thumb-remove-btn"
                        title="Remove media"
                        onClick={() => updateEntry(entry.id, { imageUrl: '' })}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className="setup-entry-badge-text">{String(index + 1).padStart(2, '0')}</span>
                  )}
                </div>

                <div className="setup-entry-main">
                  <input
                    type="text"
                    className="setup-entry-input"
                    value={entry.text}
                    maxLength={180}
                    placeholder="Name this item"
                    onChange={(event) => updateEntry(entry.id, { text: event.target.value })}
                  />

                  <details className="setup-entry-url-details">
                    <summary>Image URL</summary>
                    <input
                      type="text"
                      className="setup-entry-url-input"
                      value={entry.imageUrl ?? ''}
                      placeholder="https://i.redd.it/…"
                      onChange={(event) => updateEntry(entry.id, { imageUrl: event.target.value })}
                    />
                  </details>
                </div>

                <div className="setup-entry-actions">
                  <label className="setup-entry-action-btn media-btn" title={entry.imageUrl ? 'Change media' : 'Attach media'}>
                    <PhotoAttachmentIcon />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/x-msvideo,video/avi,video/msvideo,video/mp4,video/*,image/*"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) void uploadSingleImage(entry.id, file);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="setup-entry-action-btn remove-btn"
                    disabled={entries.length <= 1}
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => setEntries((all) => all.filter((item) => item.id !== entry.id))}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Another Item Button */}
          <button
            type="button"
            className="setup-add-another-btn"
            disabled={busy || entries.length >= maxEntries}
            onClick={() => setEntries((all) => [...all, { id: makeId(), text: '' }])}
          >
            ＋ Add another item
          </button>

          {/* Draft Management Links */}
          <div className="setup-actions-subrow">
            <button
              type="button"
              className="setup-save-draft-btn"
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              {busy ? 'Saving draft…' : 'Save as draft'}
            </button>
            {drafts.length > 0 && (
              <select
                className="setup-draft-select"
                value={draftId}
                onChange={(event) => {
                  const draft = drafts.find((item) => item.id === event.target.value);
                  if (draft) loadDraft(draft);
                }}
              >
                <option value="">Saved drafts ({drafts.length})…</option>
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Publish Bar */}
      <footer className="setup-publishbar">
        <div className="setup-publish-info">
          <strong className="setup-publish-title">{title.trim() || 'Rating'}</strong>
          <span className="setup-publish-status">{statusText}</span>
        </div>
        <button
          type="button"
          className="primary setup-publish-btn"
          disabled={busy || !title.trim() || !validCount}
          onClick={() => void publish()}
        >
          <span>{busy ? 'Publishing…' : 'Publish'}</span>
          <span className="arrow-icon">→</span>
        </button>
      </footer>
    </main>
  );
};
