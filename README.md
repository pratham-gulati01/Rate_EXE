# RATE.EXE (`rate-exe-game`)

A focused Reddit rating game built on the official Reddit Developer Platform using `@devvit/web`, React 19, Vite, and Hono.

---

## 🎮 Game Panel & Rating Game Flow

1. **Rating Game Panel (`RatingGameView`)**:
   - Central Media Stage (`RatingMediaStage`): Supports images, GIFs, and videos with full image modal preview (`⛶ Full image`).
   - Title row with progress indicator (`Item 1 of N`).
   - Unified Rating Controls Card:
     - Live score display with star indicator (`★ 7 / 10`).
     - Interactive 10-segment horizontal rating bar (scores 1 to 10).
     - Lock In action button (`Lock In →`).
2. **Completion Modal (`GameCompletionModal`)**:
   - Displays completion celebration badge 🏆.
   - **Comment my ratings**: Submits a formatted Reddit comment with the player's ratings breakdown.
   - **Join r/{subreddit}**: Instantly subscribes the player to the host subreddit.
   - **Maybe later**: Dismisses to explore results.
3. **Leaderboard & Results Views**:
   - **You Tab (`YourResults`)**: Displays personal ratings list with score badges and expandable Reddit comment preview.
   - **All Tab (`EveryoneResults`)**: Displays community rankings sorted by highest average rating, highlighting the `#1` top entry, medal tiers (`#1 Gold`, `#2 Silver`, `#3 Bronze`), exact averages (`★ X.X / 10`), and total rating counts.
   - Bottom navigation bar with smooth scroll helpers and sticky comment submission button.

---

## 🛠️ Commands

Inside `rate-exe-game`:

```bash
# Test typecheck
npm run test:types

# Run linter
npm run lint

# Build production bundle
npm run build

# Playtest in your subreddit
npm run dev

# Deploy / Upload to Reddit Devvit
npm run deploy

# Publish
npm run launch
```
