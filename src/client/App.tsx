import './index.css';
import { useEffect, useState } from 'react';
import { SetupApp } from './setup';
import { GameApp } from './game';
import type { Challenge, GameMode } from '../shared/game';

type InitResult = {
  challenge?: Challenge | null;
  setup?: boolean;
  subreddit?: string;
  selectedMode?: GameMode | null;
  error?: string;
};

export const App = () => {
  const [screen, setScreen] = useState<'loading' | 'setup' | 'game' | 'error'>('loading');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [subreddit, setSubreddit] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [setupInitialMode, setSetupInitialMode] = useState<GameMode | null>(null);

  useEffect(() => {
    void fetch('/api/init')
      .then(async (res) => {
        const data = (await res.json()) as InitResult;
        if (!res.ok) throw new Error(data.error ?? 'Could not open this RATE.EXE post.');

        if (data.subreddit) {
          setSubreddit(data.subreddit);
        }

        let initialGameMode: GameMode | null = null;
        if (data.selectedMode === 'rating' || data.selectedMode === 'yes_no') {
          initialGameMode = data.selectedMode;
        } else {
          try {
            const local = (localStorage.getItem('rate_exe_selected_mode') ||
              sessionStorage.getItem('rate_exe_selected_mode')) as GameMode | null;
            if (local === 'rating' || local === 'yes_no') {
              initialGameMode = local;
            }
          } catch {
            // ignore
          }
        }

        if (initialGameMode) {
          setSetupInitialMode(initialGameMode);
        }

        if (data.challenge) {
          setChallenge(data.challenge);
          setScreen('game');
        } else if (data.setup) {
          setScreen('setup');
        } else {
          setScreen('setup');
        }
      })
      .catch((err: unknown) => {
        setNotice(err instanceof Error ? err.message : 'Could not initialize post.');
        setScreen('setup');
      });
  }, []);

  if (screen === 'loading') {
    return (
      <main className="game-post-shell">
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
          <h1>Opening RATE.EXE</h1>
          <p>Loading…</p>
          <div className="loading-skeleton">
            <span />
            <span />
            <span />
          </div>
        </div>
      </main>
    );
  }

  if (screen === 'setup') {
    return (
      <SetupApp
        initialMode={setupInitialMode}
        onBack={challenge ? () => {
          try {
            sessionStorage.removeItem('rate_exe_selected_mode');
            localStorage.removeItem('rate_exe_selected_mode');
          } catch {
            // ignore
          }
          void fetch('/api/mode', { method: 'DELETE' });
          setScreen('game');
        } : undefined}
      />
    );
  }

  if (screen === 'game') {
    return (
      <GameApp
        initialChallenge={challenge}
        initialSubreddit={subreddit}
        onCreateYourOwn={() => {
          try {
            sessionStorage.removeItem('rate_exe_selected_mode');
            localStorage.removeItem('rate_exe_selected_mode');
          } catch {
            // ignore
          }
          void fetch('/api/mode', { method: 'DELETE' });
          setSetupInitialMode(null);
          setScreen('setup');
        }}
      />
    );
  }

  return (
    <main className="game-post-shell">
      <div className="empty-state">
        <h2>Post unavailable</h2>
        <p>{notice || 'Could not load this RATE.EXE post.'}</p>
      </div>
    </main>
  );
};
