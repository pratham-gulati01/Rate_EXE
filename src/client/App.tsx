import './index.css';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { navigateTo } from '@devvit/web/client';
import { isVideoUrl } from '../shared/game';
import type { Challenge, ChallengeEntry, Session } from '../shared/game';

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

const detectSubreddit = (fallback = 'Rank_EXE'): string => {
  if (typeof window !== 'undefined') {
    const match = (window.location.href + ' ' + (document.referrer || '')).match(/\/r\/([a-zA-Z0-9_]+)/i);
    if (match?.[1]) return match[1];
  }
  return fallback;
};

export const App = ({
  initialChallenge,
  initialSubreddit,
}: {
  initialChallenge?: Challenge | null;
  initialSubreddit?: string;
} = {}) => {
  const [challenge, setChallenge] = useState<Challenge | null>(initialChallenge ?? null);
  const [session, setSession] = useState<Session | null>(null);
  const [subreddit, setSubreddit] = useState<string>(() =>
    initialSubreddit ?? detectSubreddit(initialChallenge?.subredditName ?? 'Rank_EXE')
  );
  const [active, setActive] = useState(false);
  const [tab, setTab] = useState<'Your Choices' | 'Everyone Played'>('Your Choices');
  const [results, setResults] = useState<{ plays: number; totals: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(!initialChallenge);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        let targetChallenge = initialChallenge;
        const initData = await fetch('/api/init')
          .then((r) => r.json() as Promise<API<{ challenge: Challenge | null; subreddit?: string }>>)
          .catch(() => null);

        if (initData?.subreddit) {
          setSubreddit(initData.subreddit);
        }
        if (!targetChallenge) {
          if (!initData?.challenge) {
            throw new Error('This post is not connected to a game.');
          }
          targetChallenge = initData.challenge;
          setChallenge(targetChallenge);
          if (targetChallenge.subredditName) {
            setSubreddit(targetChallenge.subredditName);
          }
        }
        const result = await request<{ session: Session; subreddit?: string }>(
          `/api/session/${targetChallenge.id}`
        );
        if (result.subreddit) {
          setSubreddit(result.subreddit);
        }
        setSession(result.session);
        setActive(true);
      } catch (error: unknown) {
        setNotice(error instanceof Error ? error.message : 'Could not load this game post.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [initialChallenge]);

  const challengeId = challenge?.id;
  useEffect(() => {
    if (!challengeId) return;
    const fetchResults = () => {
      void request<{ plays: number; totals: Record<string, string> }>(`/api/results/${challengeId}`)
        .then(setResults)
        .catch(() => setResults(null));
    };
    fetchResults();
    if (tab === 'Everyone Played') {
      const interval = setInterval(fetchResults, 3000);
      return () => clearInterval(interval);
    }
  }, [challengeId, session?.status, tab]);

  return (
    <main
      className="game-post-shell"
      style={{ '--game-accent': challenge?.themeColor ?? '#4979D0' } as CSSProperties}
    >
      <header className="game-post-brand">
        <span className="brand-mark">R</span>
        <span>
          RATE<span className="accent">.EXE</span>
        </span>
        <span className="post-kind">GAME POST</span>
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {loading ? (
        <div className="game-loading-screen" role="status" aria-live="polite">
          <div className="loading-brand">
            <span className="loading-mark">R</span>
            <span>
              RATE<span className="accent">.EXE</span>
            </span>
          </div>
          <div className="loading-orbit">
            <i />
            <i />
            <i />
          </div>
          <h1>Opening rating game</h1>
          <p>Loading challenges…</p>
          <div className="loading-skeleton">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : challenge ? (
        <PlayView
          challenge={challenge}
          active={active}
          session={session}
          tab={tab}
          setTab={setTab}
          results={results}
          subreddit={subreddit}
          onNotice={setNotice}
          onSession={setSession}
        />
      ) : (
        <div className="empty-state">
          <h2>Game unavailable</h2>
          <p>{notice || 'This post is not connected to a game.'}</p>
        </div>
      )}
    </main>
  );
};

function PlayView({
  challenge,
  active,
  session,
  tab,
  setTab,
  results,
  subreddit,
  onNotice,
  onSession,
}: {
  challenge: Challenge;
  active: boolean;
  session: Session | null;
  tab: 'Your Choices' | 'Everyone Played';
  setTab: (t: 'Your Choices' | 'Everyone Played') => void;
  results: { plays: number; totals: Record<string, string> } | null;
  subreddit?: string;
  onNotice: (n: string) => void;
  onSession: (s: Session) => void;
}) {
  const completed = session?.status === 'completed';
  const [commenting, setCommenting] = useState(false);
  const [commented, setCommented] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const postComment = async () => {
    setCommenting(true);
    const done = await comment(challenge, onNotice);
    setCommented(done);
    setCommenting(false);
  };

  return (
    <section className="play-page">
      {!active || !session ? null : completed ? (
        tab === 'Your Choices' ? (
          <YourResults challenge={challenge} session={session} />
        ) : (
          <EveryoneResults challenge={challenge} results={results} />
        )
      ) : (
        <GameBoard
          challenge={challenge}
          session={session}
          onSession={onSession}
          onNotice={onNotice}
          onComplete={async (values) => {
            onSession({ ...session, values, status: 'completed' });
            setTab('Your Choices');
            setShowCompletionModal(true);
            try {
              await request(`/api/session/${challenge.id}/complete`, {
                method: 'POST',
                body: JSON.stringify({ values }),
              });
            } catch (error) {
              onNotice(error instanceof Error ? error.message : 'Could not submit.');
            }
          }}
        />
      )}
      {completed && (
        <GameBottomBar
          tab={tab}
          setTab={setTab}
          commenting={commenting}
          commented={commented}
          onComment={() => void postComment()}
        />
      )}
      {completed &&
        showCompletionModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <GameCompletionModal
            onClose={() => setShowCompletionModal(false)}
            onComment={() => void postComment()}
            commenting={commenting}
            commented={commented}
            subreddit={subreddit || challenge.subredditName || 'Rank_EXE'}
            onNotice={onNotice}
          />,
          document.body
        )}
    </section>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function scrollPage(direction: -1 | 1) {
  const list = document.querySelector<HTMLElement>('.results-card .community-list, .results-card .ranking-feed');
  if (!list) return;

  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  if (maxScroll <= 0) return;

  const row = list.querySelector<HTMLElement>('.ranking-feed-row');
  const step = row ? Math.max(row.offsetHeight + 6, 44) * 1.5 : 75;
  const target = Math.max(0, Math.min(maxScroll, list.scrollTop + step * direction));
  list.scrollTo({ top: target, behavior: 'smooth' });
}

function GameBottomBar({
  tab,
  setTab,
  commenting,
  commented,
  onComment,
}: {
  tab: 'Your Choices' | 'Everyone Played';
  setTab: (t: 'Your Choices' | 'Everyone Played') => void;
  commenting: boolean;
  commented: boolean;
  onComment: () => void;
}) {
  return (
    <nav className="game-bottom-bar" aria-label="Leaderboard controls">
      <button className="scroll-control" onClick={() => scrollPage(-1)} aria-label="Scroll up">
        <ArrowUpIcon />
      </button>
      <button
        className={`my-rank-control ${tab === 'Your Choices' ? 'selected' : ''}`}
        onClick={() => setTab('Your Choices')}
      >
        You
      </button>
      <button
        className={`all-rank-control ${tab === 'Everyone Played' ? 'selected' : ''}`}
        onClick={() => setTab('Everyone Played')}
      >
        All
      </button>
      <button
        className="comment-rank-control"
        disabled={commenting || commented}
        onClick={onComment}
      >
        {commented ? 'Commented ✓' : commenting ? 'Sending…' : 'Comment my ratings'}
      </button>
      <button className="scroll-control" onClick={() => scrollPage(1)} aria-label="Scroll down">
        <ArrowDownIcon />
      </button>
    </nav>
  );
}

function CommentIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GameCompletionModal({
  onClose,
  onComment,
  commenting,
  commented,
  subreddit: initialSubreddit = 'Rank_EXE',
  onNotice,
}: {
  onClose: () => void;
  onComment: () => Promise<void> | void;
  commenting: boolean;
  commented: boolean;
  subreddit?: string;
  onNotice: (n: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinedSubreddit, setJoinedSubreddit] = useState<string | null>(null);
  const activeSubreddit = joinedSubreddit ?? initialSubreddit;

  const handleJoin = async () => {
    if (joining || joined) return;
    setJoining(true);
    try {
      const res = await request<{ ok: boolean; subreddit?: string }>('/api/subscribe', {
        method: 'POST',
        body: '{}',
      });
      const targetSub = res.subreddit || activeSubreddit;
      if (res.subreddit) setJoinedSubreddit(res.subreddit);
      setJoined(true);
      onNotice(`Joined r/${targetSub}! 🎉`);
    } catch {
      try {
        navigateTo(`https://www.reddit.com/r/${activeSubreddit}`);
        setJoined(true);
      } catch {
        onNotice(`Visit r/${activeSubreddit} to join!`);
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      className="completion-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-modal-title"
      onClick={onClose}
    >
      <div className="completion-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="completion-modal-badge" aria-hidden="true">
          <span className="completion-trophy-emoji" role="img" aria-label="Trophy">
            🏆
          </span>
        </div>
        <h2 id="completion-modal-title" className="completion-modal-heading">
          Game Completed!
        </h2>
        <p className="completion-modal-sub">Your ratings are ready. Share your verdict!</p>

        <button
          type="button"
          className="completion-primary-cta"
          disabled={commenting || commented}
          onClick={async () => {
            await onComment();
          }}
        >
          <CommentIcon />
          <span>{commented ? 'Commented ✓' : commenting ? 'Posting comment…' : 'Comment my ratings'}</span>
        </button>

        <button
          type="button"
          className={`completion-secondary-cta ${joined ? 'joined' : ''}`}
          disabled={joining}
          onClick={() => void handleJoin()}
        >
          <CommunityIcon />
          <span>{joined ? `Joined r/${activeSubreddit} ✓` : joining ? 'Joining…' : `Join r/${activeSubreddit}`}</span>
        </button>

        <button type="button" className="completion-dismiss-btn" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

function RatingMediaStage({ entry }: { entry: ChallengeEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isTextOnly = !entry.imageUrl;

  return (
    <div className={`rating-media-stage ${isTextOnly ? 'text-only' : ''}`}>
      {entry.imageUrl ? (
        <>
          <button
            type="button"
            className="rating-full-image-btn"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            aria-label="View full image"
          >
            <span>⛶</span>
            <span className="rating-full-label">Full image</span>
          </button>
          <div className="rating-media-wrap">
            <MediaView
              url={entry.imageUrl}
              alt={entry.text || 'Rating entry'}
              eager
              className="rating-media-img"
            />
          </div>
          {expanded &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className="full-image-overlay"
                role="dialog"
                aria-modal="true"
                aria-label={`${entry.text || 'Challenge'} full image`}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(false);
                }}
              >
                <button
                  type="button"
                  className="close-full-image"
                  aria-label="Close full image"
                  onClick={() => setExpanded(false)}
                >
                  ✕
                </button>
                <MediaView url={entry.imageUrl} alt={entry.text || 'Challenge entry full size'} fullImage />
              </div>,
              document.body
            )}
        </>
      ) : (
        <div className="rating-text-card">
          <span className="rating-text-card-label">{entry.text || 'Text entry'}</span>
        </div>
      )}
      {entry.imageUrl && entry.text ? (
        <strong className="rating-item-name">{entry.text}</strong>
      ) : null}
    </div>
  );
}

function RatingGameView({
  current,
  index,
  total,
  onRate,
}: {
  current: ChallengeEntry;
  index: number;
  total: number;
  onRate: (score: number) => Promise<void> | void;
}) {
  const [value, setValue] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  const handleRate = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onRate(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="game-title-row rating-title-row">
        <h1 className="game-title rating-game-title">Rating</h1>
        <div className="game-progress-pill rating-progress-pill" aria-label={`Item ${index + 1} of ${total}`}>
          <span className="game-progress-current rating-progress-current">{index + 1}</span>
          <span className="game-progress-sep rating-progress-sep">of</span>
          <span className="game-progress-total rating-progress-total">{total}</span>
        </div>
      </div>
      <div className="game-panel rating-panel rating-unified-container">
        {/* Central Media Stage */}
        <RatingMediaStage key={current.id} entry={current} />

        {/* Rating Controls Card */}
        <div className="rating-controls-card">
          <div className="rating-controls-top">
            <div className="rating-score-display" aria-label={`Selected score: ${value} of 10`}>
              <span className="rating-score-star" aria-hidden="true">
                ★
              </span>
              <b className="rating-score-num">{value}</b>
              <span className="rating-score-max">/ 10</span>
            </div>
            <button
              type="button"
              className="rating-submit-btn"
              disabled={submitting}
              onClick={() => void handleRate()}
            >
              <span>{submitting ? 'Locking In…' : 'Lock In'}</span>
              <span className="arrow-icon" aria-hidden="true">
                →
              </span>
            </button>
          </div>

          {/* 10-Segment Horizontal Rating Bar */}
          <div className="rating-segments-bar" role="radiogroup" aria-label="Rating score from 1 to 10">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
              const isFilled = num <= value;
              const isSelected = num === value;
              return (
                <button
                  key={num}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`Score ${num}`}
                  className={`rating-segment-btn ${isFilled ? 'filled' : 'unselected'} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setValue(num)}
                >
                  <span className="segment-number">{num}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function GameBoard({
  challenge,
  session,
  onSession,
  onNotice,
  onComplete,
}: {
  challenge: Challenge;
  session: Session;
  onSession: (s: Session) => void;
  onNotice: (n: string) => void;
  onComplete: (v: Record<string, number>) => void;
}) {
  const [values, setValues] = useState<Record<string, number>>(session.values ?? {});
  const entries = useMemo(
    () =>
      session.order
        .map((id) => challenge.entries.find((entry) => entry.id === id))
        .filter((entry): entry is ChallengeEntry => Boolean(entry)),
    [session.order, challenge.entries]
  );

  const save = async (next: Record<string, number>) => {
    setValues(next);
    onSession({ ...session, values: next });
    try {
      await request(`/api/session/${challenge.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ values: next }),
      });
    } catch (e) {
      onNotice(e instanceof Error ? e.message : 'Progress could not be saved.');
    }
  };

  const currentIndex = entries.findIndex((entry) => values[entry.id] === undefined);
  const current = entries[currentIndex];

  if (!current) {
    return (
      <div className="game-panel">
        <h2>All items rated.</h2>
        <button className="primary" onClick={() => onComplete(values)}>
          See results →
        </button>
      </div>
    );
  }

  const onRate = async (score: number) => {
    const next = { ...values, [current.id]: score };
    setValues(next);
    if (Object.keys(next).length === entries.length) {
      onComplete(next);
      return;
    }
    await save(next);
  };

  return (
    <RatingGameView
      key={current.id}
      current={current}
      index={currentIndex}
      total={entries.length}
      onRate={onRate}
    />
  );
}

function MediaView({
  url,
  alt,
  className,
  fullImage = false,
  eager = false,
}: {
  url?: string;
  alt?: string;
  className?: string;
  fullImage?: boolean;
  eager?: boolean;
}) {
  if (!url) return null;
  if (isVideoUrl(url)) {
    return (
      <video
        className={className}
        src={url}
        autoPlay
        loop
        muted
        playsInline
        controls={fullImage}
      />
    );
  }
  return (
    <img
      className={className}
      src={url}
      alt={alt || ''}
      loading={eager ? 'eager' : 'lazy'}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

function YourResults({ challenge, session }: { challenge: Challenge; session: Session }) {
  const byId = Object.fromEntries(challenge.entries.map((entry) => [entry.id, entry]));
  const rows = Object.entries(session.values)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([id, value]) => ({
      label: `★ ${value}/10`,
      posNum: '',
      entry: byId[id],
      detail: `Your rating: ${value} of 10`,
    }));

  const commentPreview =
    `⭐ My Ratings:\n` +
    Object.entries(session.values)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([id, value]) => `⭐ ${byId[id]?.text || 'Item'}: ${value}/10`)
      .join('\n');

  return (
    <div className="results-card personal-results">
      <div className="results-heading">
        <span className="success-mark">✓</span>
        <div>
          <span className="eyebrow">GAME COMPLETE</span>
          <h2>Results</h2>
          <p className="results-option">My ratings</p>
        </div>
      </div>
      <div className="ranking-feed">
        {rows.map((row, index) => (
          <div className="ranking-feed-row" key={`${row.label}-${row.entry?.id ?? index}`}>
            <span className="ranking-position">{index + 1}</span>
            {row.entry?.imageUrl ? (
              <MediaView url={row.entry.imageUrl} alt="" />
            ) : (
              <span className="ranking-thumb-fallback">
                {(row.entry?.text ?? '').slice(0, 1) || String(index + 1)}
              </span>
            )}
            <div className="ranking-item-text">
              <b>{row.entry?.text || 'Image entry'}</b>
              {row.detail && <small className="rank-stat-text">{row.detail}</small>}
            </div>
            <span className="ranking-row-label">{row.label}</span>
          </div>
        ))}
        <details className="comment-preview completed-choices">
          <summary>Comment preview</summary>
          <p>{commentPreview}</p>
        </details>
      </div>
    </div>
  );
}

function EveryoneResults({
  challenge,
  results,
}: {
  challenge: Challenge;
  results: { plays: number; totals: Record<string, string> } | null;
}) {
  const getRatingSum = (entry: ChallengeEntry) => Number(results?.totals[`rating_sum:${entry.id}`] ?? 0);
  const getRatingCount = (entry: ChallengeEntry) => Number(results?.totals[`rating_count:${entry.id}`] ?? 0);
  const getRatingAvg = (entry: ChallengeEntry) => {
    const count = getRatingCount(entry);
    return count > 0 ? getRatingSum(entry) / count : 0;
  };

  const rankedEntries = [...challenge.entries].sort((a, b) => {
    const aAvg = getRatingAvg(a);
    const bAvg = getRatingAvg(b);
    if (bAvg !== aAvg) return bAvg - aAvg;
    return getRatingCount(b) - getRatingCount(a);
  });

  const getRatingHighlight = () => {
    if (challenge.entries.length === 0) return '—';
    const top = rankedEntries[0];
    if (!top) return '—';
    const avg = getRatingAvg(top);
    const count = getRatingCount(top);
    if (count === 0) return 'No ratings yet';
    return `🏆 Highest Rated: ${top.text || '—'} · ★ ${avg.toFixed(1)}/10 average (${count} rating${count === 1 ? '' : 's'})`;
  };

  const ranks = rankedEntries.map((_, idx) => idx + 1);

  return (
    <div className="results-card community-results">
      <div className="results-heading">
        <span className="community-mark">👥</span>
        <div>
          <span className="eyebrow">COMMUNITY LEADERBOARD</span>
          <h2>Results</h2>
          <p className="results-option">Everyone's ratings</p>
        </div>
      </div>
      {results && results.plays > 0 ? (
        <>
          <div className="community-winner-banner" role="status">
            <span className="winner-icon" aria-hidden="true">
              ⭐
            </span>
            <p>{getRatingHighlight()}</p>
          </div>
          <div className="ranking-feed community-feed">
            {rankedEntries.map((entry, index) => {
              const avg = getRatingAvg(entry);
              const count = getRatingCount(entry);
              const pos = ranks[index];
              const medalClass = pos === 1 ? 'medal-gold' : pos === 2 ? 'medal-silver' : pos === 3 ? 'medal-bronze' : '';
              return (
                <div className="ranking-feed-row community-feed-row rating-community-row" key={entry.id}>
                  <span className={`ranking-position ${medalClass}`}>#{pos}</span>
                  {entry.imageUrl ? (
                    <MediaView url={entry.imageUrl} alt="" />
                  ) : (
                    <span className="ranking-thumb-fallback">{(entry.text ?? '').slice(0, 1) || ' '}</span>
                  )}
                  <div className="ranking-item-text">
                    <b>{entry.text || 'Image entry'}</b>
                    <span className="rank-stat-text">
                      Average: <b>{avg.toFixed(1)} / 10</b> · {count} rating{count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <b className={`ranking-avg-badge rating-badge ${medalClass}`}>★ {avg.toFixed(1)}/10</b>
                </div>
              );
            })}
            <p className="fine-print">Only completed games are counted. Individual players and usernames are never shown.</p>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h3>You're the first to finish.</h3>
          <p>Community results will appear after more players complete this challenge.</p>
          <p className="fine-print">Only completed games are counted. Individual players and usernames are never shown.</p>
        </div>
      )}
    </div>
  );
}

async function comment(challenge: Challenge, notice: (n: string) => void): Promise<boolean> {
  try {
    await request(`/api/comment/${challenge.id}`, { method: 'POST', body: '{}' });
    notice('Your comment was submitted.');
    return true;
  } catch (error) {
    notice(error instanceof Error ? error.message : 'Could not comment.');
    return false;
  }
}
