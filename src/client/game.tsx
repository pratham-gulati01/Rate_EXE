import './index.css';
import { useEffect, useState, useRef } from 'react';
import type { CSSProperties, TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { navigateTo } from '@devvit/web/client';
import type { Challenge } from '../shared/game';

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

export const GameApp = ({
  initialChallenge,
  initialSubreddit,
}: {
  initialChallenge?: Challenge | null;
  initialSubreddit?: string | undefined;
} = {}) => {
  const [challenge, setChallenge] = useState<Challenge | null>(initialChallenge ?? null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [subreddit, setSubreddit] = useState<string>(() =>
    initialSubreddit ?? detectSubreddit(initialChallenge?.subredditName ?? 'Rank_EXE')
  );
  const [tab, setTab] = useState<'Your Rating' | 'Community'>('Your Rating');
  const [results, setResults] = useState<{
    totalVotes: number;
    average: number;
    topScore: number;
    stats: Record<string, string>;
  } | null>(null);
  const [loading, setLoading] = useState(!initialChallenge);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        let targetChallenge = initialChallenge;
        const initData = await fetch('/api/init')
          .then((r) => r.json() as Promise<API<{ challenge: Challenge | null; subreddit?: string; userRating?: number | null }>>)
          .catch(() => null);

        if (initData?.subreddit) {
          setSubreddit(initData.subreddit);
        }
        if (initData?.userRating) {
          setUserRating(initData.userRating);
        }
        if (!targetChallenge) {
          if (!initData?.challenge) {
            throw new Error('This post is not connected to a rating game.');
          }
          targetChallenge = initData.challenge;
          setChallenge(targetChallenge);
          if (targetChallenge.subredditName) {
            setSubreddit(targetChallenge.subredditName);
          }
        }
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
      void request<{ totalVotes: number; average: number; topScore: number; stats: Record<string, string> }>(
        `/api/results/${challengeId}`
      )
        .then(setResults)
        .catch(() => setResults(null));
    };
    fetchResults();
    if (tab === 'Community') {
      const interval = setInterval(fetchResults, 3000);
      return () => clearInterval(interval);
    }
  }, [challengeId, userRating, tab]);

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
        <span className="post-kind">RATING GAME</span>
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
          <p>Loading…</p>
        </div>
      ) : challenge ? (
        <PlayView
          challenge={challenge}
          userRating={userRating}
          setUserRating={setUserRating}
          tab={tab}
          setTab={setTab}
          results={results}
          subreddit={subreddit}
          onNotice={setNotice}
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
  userRating,
  setUserRating,
  tab,
  setTab,
  results,
  subreddit,
  onNotice,
}: {
  challenge: Challenge;
  userRating: number | null;
  setUserRating: (rating: number) => void;
  tab: 'Your Rating' | 'Community';
  setTab: (t: 'Your Rating' | 'Community') => void;
  results: { totalVotes: number; average: number; topScore: number; stats: Record<string, string> } | null;
  subreddit?: string;
  onNotice: (n: string) => void;
}) {
  const [commenting, setCommenting] = useState(false);
  const [commented, setCommented] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const isCompleted = userRating !== null;

  const handleRate = async (score: number) => {
    try {
      await request('/api/rate', {
        method: 'POST',
        body: JSON.stringify({ challengeId: challenge.id, score }),
      });
      setUserRating(score);
      setShowCompletionModal(true);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Could not submit rating.');
    }
  };

  const postComment = async () => {
    setCommenting(true);
    try {
      await request(`/api/comment/${challenge.id}`, { method: 'POST', body: '{}' });
      onNotice('Your comment was submitted! 🎉');
      setCommented(true);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not comment.');
    } finally {
      setCommenting(false);
    }
  };

  return (
    <section className="play-page">
      {!isCompleted ? (
        <RatingGamePlayStage challenge={challenge} onRate={handleRate} />
      ) : tab === 'Your Rating' ? (
        <YourResultsView challenge={challenge} userRating={userRating} onPostComment={postComment} commented={commented} commenting={commenting} />
      ) : (
        <CommunityResultsView challenge={challenge} results={results} />
      )}

      {isCompleted && (
        <GameBottomBar
          tab={tab}
          setTab={setTab}
          commenting={commenting}
          commented={commented}
          onComment={() => void postComment()}
        />
      )}

      {showCompletionModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <GameCompletionModal
            score={userRating ?? 7}
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

// Interactive Carousel Stage & 1-Time Rating Controls
function RatingGamePlayStage({
  challenge,
  onRate,
}: {
  challenge: Challenge;
  onRate: (score: number) => Promise<void> | void;
}) {
  const entries = challenge.entries && challenge.entries.length > 0 ? challenge.entries : [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedScore, setSelectedScore] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const total = entries.length;
  const current = entries[currentIndex] ?? entries[0];

  const handlePrev = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  };

  const handleNext = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  };

  const onTouchStart = (e: TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? null;
    if (endX !== null) {
      const diff = touchStartXRef.current - endX;
      if (diff > 45) handleNext();
      else if (diff < -45) handlePrev();
    }
    touchStartXRef.current = null;
  };

  const lockIn = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onRate(selectedScore);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="game-card rating-carousel-card">
      {/* Title & Description Header */}
      <div className="game-title-row rating-title-row">
        <h1 className="game-title rating-game-title">{challenge.title || 'Rating'}</h1>
        {total > 1 && (
          <div className="game-progress-pill rating-progress-pill" aria-label={`Slide ${currentIndex + 1} of ${total}`}>
            <span className="game-progress-current rating-progress-current">{currentIndex + 1}</span>
            <span className="game-progress-sep rating-progress-sep">of</span>
            <span className="game-progress-total rating-progress-total">{total}</span>
          </div>
        )}
      </div>

      {challenge.description && (
        <p className="rating-challenge-desc">{challenge.description}</p>
      )}

      {/* Center Image Stage with Side Swipe Buttons */}
      <div
        className="rating-stage-container"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {total > 1 && (
          <button
            type="button"
            className="carousel-side-btn carousel-btn-prev"
            onClick={handlePrev}
            aria-label="Previous image"
          >
            ‹
          </button>
        )}

        <div className="carousel-image-frame">
          {current?.imageUrl ? (
            <>
              <img
                src={current.imageUrl}
                alt=""
                className="carousel-main-image"
                onClick={() => setExpandedImage(current.imageUrl ?? null)}
              />
              <button
                type="button"
                className="carousel-expand-btn"
                onClick={() => setExpandedImage(current.imageUrl ?? null)}
                title="View full image"
              >
                ⛶ Full image
              </button>
              {current?.text && current.text.trim().length > 0 && (
                <div className="carousel-caption-overlay">
                  <span>{current.text}</span>
                </div>
              )}
            </>
          ) : current?.text && current.text.trim().length > 0 ? (
            <div className="carousel-text-slide">
              <div className="carousel-text-content">
                <p className="carousel-slide-text">{current.text}</p>
              </div>
            </div>
          ) : (
            <div className="carousel-no-image">
              <span className="no-image-icon">📷</span>
              <p>No image attached</p>
            </div>
          )}
        </div>

        {total > 1 && (
          <button
            type="button"
            className="carousel-side-btn carousel-btn-next"
            onClick={handleNext}
            aria-label="Next image"
          >
            ›
          </button>
        )}
      </div>

      {/* Single Rating Controls Card */}
      <div className="rating-controls-card">
        <div className="rating-controls-top">
          <div className="rating-score-display" aria-label={`Selected score: ${selectedScore} of 10`}>
            <span className="rating-score-star" aria-hidden="true">
              ★
            </span>
            <b className="rating-score-num">{selectedScore}</b>
            <span className="rating-score-max">/ 10</span>
          </div>
          <button
            type="button"
            className="rating-submit-btn"
            disabled={submitting}
            onClick={() => void lockIn()}
          >
            <span>{submitting ? 'Locking In…' : 'Lock In'}</span>
            <span className="arrow-icon" aria-hidden="true">
              →
            </span>
          </button>
        </div>

        {/* 10-Segment Rating Bar */}
        <div className="rating-segments-bar" role="radiogroup" aria-label="Rating score from 1 to 10">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
            const isFilled = num <= selectedScore;
            const isSelected = num === selectedScore;
            return (
              <button
                key={num}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Score ${num}`}
                className={`rating-segment-btn ${isFilled ? 'filled' : 'unselected'} ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedScore(num)}
              >
                <span className="segment-number">{num}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full Image Modal Portal */}
      {expandedImage &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="full-image-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setExpandedImage(null)}
          >
            <button
              type="button"
              className="close-full-image"
              onClick={() => setExpandedImage(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <img src={expandedImage} alt="" className="full-image-dialog-img" />
          </div>,
          document.body
        )}
    </div>
  );
}

// Personal Results View
function YourResultsView({
  challenge,
  userRating,
  onPostComment,
  commented,
  commenting,
}: {
  challenge: Challenge;
  userRating: number | null;
  onPostComment: () => void;
  commented: boolean;
  commenting: boolean;
}) {
  const entries = challenge.entries ?? [];

  return (
    <div className="results-card personal-results">
      <div className="results-heading">
        <span className="success-mark">✓</span>
        <div>
          <span className="eyebrow">RATING LOCKED IN</span>
          <h2>Your Verdict</h2>
        </div>
      </div>

      <div className="your-rating-hero-badge">
        <span className="star-icon" aria-hidden="true">⭐</span>
        <strong className="your-score-big">{userRating ?? 7}</strong>
        <span className="your-score-out-of">/ 10</span>
      </div>

      {/* Image Thumbnail Preview Gallery - Preserving all rated thumbnails in original order */}
      {entries.length > 0 && (
        <div className="your-verdict-gallery" role="group" aria-label="Rated post items">
          {entries.map((entry, idx) => (
            <div key={entry.id || idx} className="verdict-thumb-slot">
              {entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt={entry.text ? entry.text : `Slide ${idx + 1}`}
                  className="verdict-thumb-img"
                />
              ) : (
                <div className="verdict-thumb-text-fallback">
                  <span>{entry.text ? entry.text : `Item ${idx + 1}`}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="comment-cta-row">
        <button
          type="button"
          className="completion-primary-cta verdict-comment-cta"
          disabled={commenting || commented}
          onClick={onPostComment}
        >
          <span>{commented ? 'Commented ✓' : commenting ? 'Posting…' : 'Post my rating as comment'}</span>
        </button>
      </div>
    </div>
  );
}

// Community Results View (1-Time Rating Distribution)
function CommunityResultsView({
  results,
}: {
  challenge?: Challenge;
  results: { totalVotes: number; average: number; topScore: number; stats: Record<string, string> } | null;
}) {
  const total = results?.totalVotes ?? 0;
  const average = results?.average ?? 0;
  const stats = results?.stats ?? {};

  return (
    <div className="results-card community-results">
      <div className="results-heading">
        <span className="community-mark">👥</span>
        <div>
          <span className="eyebrow">COMMUNITY VERDICT</span>
          <h2>Results</h2>
        </div>
      </div>

      {total > 0 ? (
        <>
          <div className="community-winner-banner" role="status">
            <div className="community-banner-left">
              <span className="winner-icon" aria-hidden="true">
                ★
              </span>
              <div className="community-score-lead">
                <strong className="community-avg-num">{average.toFixed(1)}</strong>
                <span className="community-avg-max">/ 10</span>
              </div>
            </div>
            <span className="community-total-pill">
              {total} {total === 1 ? 'rating' : 'ratings'}
            </span>
          </div>

          {/* 10-Bar Community Distribution Chart - Compact Space-Efficient Block */}
          <div className="score-distribution-chart">
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => {
              const count = Number(stats[String(s)] || 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const hasVotes = count > 0;
              return (
                <div className={`dist-row ${hasVotes ? 'has-votes' : 'zero-votes'}`} key={s}>
                  <span className="dist-score-num">{s}★</span>
                  <div className="dist-bar-track">
                    <div className="dist-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="dist-stats-group">
                    <span className="dist-score-pct">{pct}%</span>
                    <span className="dist-score-count">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h3>You're the first to rate!</h3>
          <p>Community ratings will appear as more Redditors vote on this post.</p>
        </div>
      )}
    </div>
  );
}

function GameBottomBar({
  tab,
  setTab,
  commenting,
  commented,
  onComment,
}: {
  tab: 'Your Rating' | 'Community';
  setTab: (t: 'Your Rating' | 'Community') => void;
  commenting: boolean;
  commented: boolean;
  onComment: () => void;
}) {
  return (
    <nav className="game-bottom-bar" aria-label="Rating view controls">
      <button
        type="button"
        className={`game-nav-tab my-rank-control ${tab === 'Your Rating' ? 'selected' : ''}`}
        onClick={() => setTab('Your Rating')}
      >
        You
      </button>
      <button
        type="button"
        className={`game-nav-tab all-rank-control ${tab === 'Community' ? 'selected' : ''}`}
        onClick={() => setTab('Community')}
      >
        Community
      </button>
      <button
        type="button"
        className={`game-nav-tab comment-rank-control ${commented ? 'commented' : ''}`}
        disabled={commenting || commented}
        onClick={onComment}
      >
        {commented ? 'Commented ✓' : commenting ? 'Sending…' : 'Comment rating'}
      </button>
    </nav>
  );
}

function GameCompletionModal({
  score,
  onClose,
  onComment,
  commenting,
  commented,
  subreddit = 'Rank_EXE',
  onNotice,
}: {
  score: number;
  onClose: () => void;
  onComment: () => Promise<void> | void;
  commenting: boolean;
  commented: boolean;
  subreddit?: string;
  onNotice: (n: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const handleJoin = async () => {
    if (joining || joined) return;
    setJoining(true);
    try {
      await request('/api/subscribe', { method: 'POST', body: '{}' });
      setJoined(true);
      onNotice(`Joined r/${subreddit}! 🎉`);
    } catch {
      try {
        navigateTo(`https://www.reddit.com/r/${subreddit}`);
        setJoined(true);
      } catch {
        onNotice(`Visit r/${subreddit} to join!`);
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
      onClick={onClose}
    >
      <div className="completion-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="completion-modal-badge">
          <span className="completion-trophy-emoji">❤️</span>
        </div>
        <h2 className="completion-modal-heading">Rating Locked In!</h2>
        <p className="completion-modal-sub">You rated this post ★ {score} / 10</p>

        <button
          type="button"
          className="completion-primary-cta"
          disabled={commenting || commented}
          onClick={async () => {
            await onComment();
          }}
        >
          <span>{commented ? 'Commented ✓' : commenting ? 'Posting…' : 'Comment my rating'}</span>
        </button>

        <button
          type="button"
          className={`completion-secondary-cta ${joined ? 'joined' : ''}`}
          disabled={joining}
          onClick={() => void handleJoin()}
        >
          <span>{joined ? `Joined r/${subreddit} ✓` : joining ? 'Joining…' : `Join r/${subreddit}`}</span>
        </button>

        <button type="button" className="completion-dismiss-btn" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
