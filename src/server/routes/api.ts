import { Hono } from 'hono';
import { context, media, reddit, redis } from '@devvit/web/server';
import { randomUUID } from 'node:crypto';
import { demoChallenge } from '../core/post';
import { isValidSubmission } from '../../shared/game';
import type { Challenge, ChallengeEntry, Submission, Session } from '../../shared/game';

export const api = new Hono();

const prefix = () => `rateexe:${context.subredditId || 'local'}:`;
const identityTtl = 60 * 60 * 24 * 30; // 30 days
const challengeKey = (id: string) => `${prefix()}challenge:${id}`;
const sessionKey = (id: string, user: string) => `${prefix()}session:${id}:${user}`;
const resultsKey = (id: string) => `${prefix()}results:${id}`;
const sessionLockKey = (id: string, user: string) => `${prefix()}session-lock:${id}:${user}`;

const acquireSessionLock = async (id: string, user: string) => {
  const key = sessionLockKey(id, user);
  const token = randomUUID();
  const acquired = await redis.set(key, token, { nx: true, expiration: new Date(Date.now() + 30_000) });
  return acquired ? { key, token } : undefined;
};

const releaseSessionLock = async (lock: { key: string; token: string }) => {
  try {
    if ((await redis.get(lock.key)) === lock.token) await redis.del(lock.key);
  } catch (err) {
    console.error('Session lock cleanup failed', err);
  }
};

const getChallenge = async (id: string): Promise<Challenge | undefined> => {
  if (id === demoChallenge.id) return demoChallenge;
  const raw = await redis.get(challengeKey(id));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Challenge;
  } catch {
    return undefined;
  }
};

async function getActiveSubreddit(): Promise<string> {
  if (context.subredditName) return context.subredditName;
  try {
    const sub = await reddit.getCurrentSubreddit();
    return sub?.name ?? 'Rank_EXE';
  } catch {
    return 'Rank_EXE';
  }
}

// 1. Initial State
api.get('/init', async (c) => {
  const postData = context.postData as { challengeId?: string; setup?: boolean } | undefined;
  const challengeId = postData?.challengeId;
  const isSetup = postData?.setup === true || !challengeId;
  let challenge: Challenge | undefined;

  if (challengeId) {
    challenge = await getChallenge(challengeId);
  }

  const subreddit = await getActiveSubreddit();

  return c.json({
    username: context.username ?? 'Redditor',
    postId: context.postId ?? null,
    subreddit,
    challenge: challenge ?? null,
    setup: isSetup && !challenge,
  });
});

// 2. Drafts Management
api.get('/drafts', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ drafts: [] });
  const key = `${prefix()}drafts:${user}`;
  const raw = await redis.hGetAll(key);
  await redis.expire(key, identityTtl);
  const drafts = Object.values(raw).flatMap((value) => {
    try {
      return [JSON.parse(value) as Challenge];
    } catch {
      return [];
    }
  });
  return c.json({ drafts });
});

api.post('/drafts', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ error: 'Sign in to save a draft.' }, 401);
  const input = await c.req.json<Record<string, unknown>>();
  const draftId = String(input.draftId || randomUUID());
  const draft: Challenge = {
    id: draftId,
    title: String(input.title || 'Rating'),
    description: String(input.description || ''),
    category: String(input.category || 'General'),
    mode: 'rating',
    themeColor: typeof input.themeColor === 'string' ? input.themeColor : '#4979D0',
    entries: Array.isArray(input.entries) ? (input.entries as ChallengeEntry[]) : [],
    creator: context.username ?? 'Redditor',
    createdAt: Date.now(),
    status: 'draft',
  };
  const key = `${prefix()}drafts:${user}`;
  await redis.hSet(key, { [draftId]: JSON.stringify(draft) });
  await redis.expire(key, identityTtl);
  return c.json({ draft });
});

// 3. Publish New Challenge From Setup Panel
api.post('/publish', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json({ error: 'Sign in to publish challenge.' }, 401);

  const input = await c.req.json<{
    title: string;
    description?: string;
    category?: string;
    themeColor?: string;
    entries: Array<{ id?: string; text?: string; imageUrl?: string }>;
  }>();

  const title = (input.title || '').trim();
  if (!title) return c.json({ error: 'Please enter a game title.' }, 400);

  const rawEntries = Array.isArray(input.entries) ? input.entries : [];
  const validEntries = rawEntries
    .filter((e) => Boolean(e.imageUrl?.trim() || e.text?.trim()))
    .map((e, idx) => ({
      id: e.id || `e${idx + 1}`,
      text: (e.text || '').trim(), // Blank by default, optional
      imageUrl: e.imageUrl?.trim(),
    }));

  if (validEntries.length === 0) {
    return c.json({ error: 'Please add at least 1 image to rate.' }, 400);
  }

  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const subredditName = await getActiveSubreddit();

  const challenge: Challenge = {
    id,
    title,
    description: (input.description || '').trim(),
    category: (input.category || 'Rating').trim(),
    mode: 'rating',
    themeColor: input.themeColor || '#4979D0',
    entries: validEntries,
    creator: context.username ?? 'Moderator',
    createdAt: Date.now(),
    status: 'published',
    subredditName,
  };

  await redis.set(challengeKey(id), JSON.stringify(challenge));

  // Submit custom post to Reddit
  let post;
  try {
    post = await reddit.submitCustomPost({
      title: `[RATE.EXE] ${challenge.title}`,
      subredditName,
      entry: 'default',
      postData: {
        challengeId: id,
      },
    });
  } catch (err) {
    console.error('Failed to submit custom post:', err);
    return c.json({ error: 'Failed to create Reddit post.' }, 502);
  }

  challenge.postId = post.id;
  await redis.set(challengeKey(id), JSON.stringify(challenge));

  const postUrl = `https://reddit.com/r/${subredditName}/comments/${post.id}`;
  return c.json({ ok: true, challenge, postUrl });
});

// 3. Load or Start Session
api.get('/session/:id', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ error: 'Sign in to save your game.' }, 401);

  const challenge = await getChallenge(c.req.param('id'));
  if (!challenge) return c.json({ error: 'Challenge not found.' }, 404);

  const subreddit = await getActiveSubreddit();
  const key = sessionKey(challenge.id, String(user));
  const existing = await redis.get(key);

  if (existing) {
    try {
      const prev = JSON.parse(existing) as Session;
      await redis.expire(key, identityTtl);
      return c.json({ session: prev, challenge, subreddit });
    } catch {
      await redis.del(key);
    }
  }

  const session: Session = {
    challengeId: challenge.id,
    mode: 'rating',
    order: challenge.entries.map((entry) => entry.id),
    values: {},
    createdAt: Date.now(),
    status: 'in-progress',
  };

  await redis.set(key, JSON.stringify(session), {
    nx: true,
    expiration: new Date(Date.now() + identityTtl * 1000),
  });

  return c.json({ session, challenge, subreddit });
});

// 4. Save In-Progress Progress
api.post('/session/:id/progress', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ error: 'Sign in to save progress.' }, 401);

  const id = c.req.param('id');
  const challenge = await getChallenge(id);
  if (!challenge) return c.json({ error: 'Challenge not found.' }, 404);

  const lock = await acquireSessionLock(id, String(user));
  if (!lock) return c.json({ error: 'Your game is saving. Try that choice again in a moment.' }, 409);

  try {
    const key = sessionKey(id, String(user));
    const raw = await redis.get(key);
    const session = raw ? (JSON.parse(raw) as Session) : undefined;
    if (!session || session.status !== 'in-progress') {
      return c.json({ error: 'No active game to save.' }, 409);
    }

    const body = await c.req.json<{ values?: Record<string, number> }>();
    if (!body.values || typeof body.values !== 'object') {
      return c.json({ error: 'Invalid progress data.' }, 400);
    }

    session.values = body.values;
    await redis.set(key, JSON.stringify(session), {
      expiration: new Date(Date.now() + identityTtl * 1000),
    });

    return c.json({ ok: true });
  } finally {
    await releaseSessionLock(lock);
  }
});

// 5. Complete Session & Aggregate Ratings
api.post('/session/:id/complete', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ error: 'Sign in to complete game.' }, 401);

  const id = c.req.param('id');
  const challenge = await getChallenge(id);
  if (!challenge) return c.json({ error: 'Challenge not found.' }, 404);

  const lock = await acquireSessionLock(id, String(user));
  if (!lock) return c.json({ error: 'Saving completion. Please wait a moment.' }, 409);

  try {
    const key = sessionKey(id, String(user));
    const raw = await redis.get(key);
    const session = raw ? (JSON.parse(raw) as Session) : undefined;
    if (!session) return c.json({ error: 'No active session.' }, 404);

    const body = await c.req.json<{ values?: Record<string, number> }>();
    const values = body.values ?? session.values;
    const submission: Submission = { mode: 'rating', values };

    if (!isValidSubmission(challenge, submission)) {
      return c.json({ error: 'Please rate all entries from 1 to 10.' }, 400);
    }

    const aggKey = resultsKey(id);
    try {
      await redis.hIncrBy(aggKey, 'plays', 1);
      for (const [entryId, score] of Object.entries(values)) {
        await redis.hIncrBy(aggKey, `rating_sum:${entryId}`, Number(score));
        await redis.hIncrBy(aggKey, `rating_count:${entryId}`, 1);
      }

      session.status = 'completed';
      session.values = values;
      await redis.set(key, JSON.stringify(session), {
        expiration: new Date(Date.now() + identityTtl * 1000),
      });
    } catch (err) {
      console.error('Aggregation failed', err);
      return c.json({ error: 'Could not record ratings. Please try again.' }, 503);
    }

    return c.json({ ok: true, submission });
  } finally {
    await releaseSessionLock(lock);
  }
});

// 6. Results & Stats
api.get('/results/:id', async (c) => {
  const challenge = await getChallenge(c.req.param('id'));
  if (!challenge) return c.json({ error: 'Challenge not found.' }, 404);

  const totals = (await redis.hGetAll(resultsKey(challenge.id))) ?? {};
  return c.json({
    challenge,
    plays: Number(totals['plays'] ?? 0),
    totals: Object.fromEntries(Object.entries(totals).filter(([k]) => k !== 'plays')),
  });
});

// 7. Comment User Ratings on Reddit Post
api.post('/comment/:id', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ error: 'Sign in to comment.' }, 401);

  const id = c.req.param('id');
  const challenge = await getChallenge(id);
  if (!challenge || !challenge.postId) {
    return c.json({ error: 'Challenge post not found.' }, 404);
  }

  const raw = await redis.get(sessionKey(id, String(user)));
  if (!raw) return c.json({ error: 'Complete the rating game first.' }, 409);

  const session = JSON.parse(raw) as Session;
  if (session.status !== 'completed') {
    return c.json({ error: 'Complete the rating game before commenting.' }, 409);
  }

  const commentKey = `${prefix()}comment:${id}:${user}`;
  const alreadyCommented = await redis.set(commentKey, 'pending', {
    nx: true,
    expiration: new Date(Date.now() + identityTtl * 1000),
  });

  if (!alreadyCommented) {
    return c.json({ error: 'You have already posted a comment for this challenge.' }, 409);
  }

  const byId = Object.fromEntries(
    challenge.entries.map((entry, idx) => [
      entry.id,
      entry.text && entry.text.trim().length > 0 ? entry.text.trim() : `Item ${idx + 1}`,
    ])
  );
  const sortedRatings = Object.entries(session.values).sort(
    (a, b) => Number(b[1]) - Number(a[1])
  );

  const commentText =
    `⭐ **RATE.EXE Verdict**\n\n` +
    sortedRatings.map(([entryId, score]) => `⭐ **${byId[entryId] ?? 'Item'}**: ${score}/10`).join('\n');

  try {
    const posted = await reddit.submitComment({
      id: challenge.postId as `t3_${string}`,
      text: commentText,
      runAs: 'USER',
    });
    await redis.set(commentKey, posted.id);
    return c.json({ ok: true, commentId: posted.id });
  } catch (err) {
    await redis.del(commentKey);
    console.error('Comment submit error:', err);
    return c.json({ error: 'Reddit failed to submit comment.' }, 502);
  }
});

// 8. Subscribe to Current Subreddit
api.post('/subscribe', async (c) => {
  const subreddit = await getActiveSubreddit();
  try {
    await reddit.subscribeToCurrentSubreddit();
    return c.json({ ok: true, subreddit });
  } catch (err) {
    console.warn('Subreddit subscribe warning:', err);
    return c.json({ ok: false, subreddit });
  }
});

// 9. Media Uploads (Uploaded directly to Reddit CDN via media.upload)
api.post('/media', async (c) => {
  if (!context.userId) return c.json({ error: 'Sign in to upload media.' }, 401);
  const body = await c.req.json<{ dataUrls?: string[]; dataUrl?: string }>();
  const rawUrls = Array.isArray(body.dataUrls)
    ? body.dataUrls
    : typeof body.dataUrl === 'string'
      ? [body.dataUrl]
      : [];
  const dataUrls = rawUrls.filter((v) => typeof v === 'string' && v.trim().length > 0);

  if (dataUrls.length === 0 || dataUrls.length > 30) {
    return c.json({ error: 'Choose 1 to 30 images or videos.' }, 400);
  }

  try {
    const uploaded = await Promise.all(
      dataUrls.map((url) =>
        media.upload({
          url,
          type: url.startsWith('data:image/gif') ? 'gif' : 'image',
        })
      )
    );
    const imageUrls = uploaded.map((img) => img.mediaUrl);
    return c.json({ imageUrl: imageUrls[0], imageUrls });
  } catch (err) {
    console.error('Media upload failed:', err);
    return c.json({ error: 'Media upload failed.' }, 502);
  }
});
