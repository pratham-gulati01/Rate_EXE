import { Hono } from 'hono';
import { context, media, reddit, redis } from '@devvit/web/server';
import { randomUUID } from 'node:crypto';
import { demoChallenge } from '../core/post';
import type { Challenge, ChallengeEntry } from '../../shared/game';

export const api = new Hono();

const prefix = () => `rateexe:${context.subredditId || 'local'}:`;
const identityTtl = 60 * 60 * 24 * 30; // 30 days
const challengeKey = (id: string) => `${prefix()}challenge:${id}`;

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

  const userId = context.userId;
  let userRating: number | null = null;
  let stats: Record<string, string> = {};

  if (userId && challenge) {
    try {
      const existing = await redis.hGet(`${prefix()}ratings:${challenge.id}`, userId);
      if (existing) userRating = Number(existing);
      stats = (await redis.hGetAll(`${prefix()}stats:${challenge.id}`)) ?? {};
    } catch (e) {
      console.warn('Error reading user rating / stats:', e);
    }
  }

  const subreddit = await getActiveSubreddit();

  return c.json({
    username: context.username ?? 'Redditor',
    postId: context.postId ?? null,
    subreddit,
    challenge: challenge ?? null,
    userRating,
    stats,
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
      text: (e.text || '').trim(),
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

  // Submit custom post to Reddit with user attribution and UGC
  let post;
  const ugcTextParts = [
    challenge.title,
    challenge.description,
    ...validEntries.map((e, idx) => (e.text ? `${idx + 1}. ${e.text}` : '')).filter(Boolean),
  ].filter(Boolean);
  const ugcText = ugcTextParts.join('\n\n').trim() || challenge.title;

  const ugcImageUrls = validEntries
    .map((e) => e.imageUrl)
    .filter((url): url is string => Boolean(url && (url.startsWith('https://') || url.startsWith('http://'))));

  try {
    post = await reddit.submitCustomPost({
      title: `[RATE.EXE] ${challenge.title}`,
      subredditName,
      entry: 'default',
      runAs: 'USER',
      userGeneratedContent: {
        text: ugcText,
        ...(ugcImageUrls.length > 0 ? { imageUrls: ugcImageUrls } : {}),
      },
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

// 4. Rate Challenge Once (Single Score from 1 to 10 for the Entire Challenge)
api.post('/rate', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json({ error: 'Must be logged in to rate.' }, 401);

  const { challengeId, score } = await c.req.json<{ challengeId: string; score: number }>();
  if (!score || score < 1 || score > 10) {
    return c.json({ error: 'Score must be between 1 and 10.' }, 400);
  }

  const subKey = prefix();
  try {
    const existing = await redis.hGet(`${subKey}ratings:${challengeId}`, userId);
    if (existing) {
      await redis.hIncrBy(`${subKey}stats:${challengeId}`, existing, -1);
    } else {
      await redis.hIncrBy(`${subKey}stats:${challengeId}`, 'total_votes', 1);
    }

    await redis.hSet(`${subKey}ratings:${challengeId}`, { [userId]: String(score) });
    await redis.hIncrBy(`${subKey}stats:${challengeId}`, String(score), 1);
  } catch (err) {
    console.error('Failed to save rating:', err);
    return c.json({ error: 'Failed to record rating.' }, 500);
  }

  return c.json({ ok: true, score });
});

// 5. Results & Stats (Aggregates Single Rating Distribution)
api.get('/results/:id', async (c) => {
  const challengeId = c.req.param('id');
  const challenge = await getChallenge(challengeId);
  if (!challenge) return c.json({ error: 'Challenge not found.' }, 404);

  const stats = (await redis.hGetAll(`${prefix()}stats:${challengeId}`)) ?? {};
  const totalVotes = Number(stats['total_votes'] || 0);

  let sum = 0;
  let topCount = 0;
  let topScore = 10;
  for (let s = 1; s <= 10; s++) {
    const count = Number(stats[String(s)] || 0);
    sum += s * count;
    if (count > topCount) {
      topCount = count;
      topScore = s;
    }
  }
  const average = totalVotes > 0 ? Number((sum / totalVotes).toFixed(1)) : 0;

  return c.json({
    challenge,
    stats,
    totalVotes,
    average,
    topScore,
  });
});

// 6. Comment User Rating on Reddit Post
api.post('/comment/:id', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ error: 'Sign in to comment.' }, 401);

  const id = c.req.param('id');
  const challenge = await getChallenge(id);
  if (!challenge || !challenge.postId) {
    return c.json({ error: 'Challenge post not found.' }, 404);
  }

  const rawRating = await redis.hGet(`${prefix()}ratings:${id}`, String(user));
  if (!rawRating) return c.json({ error: 'Rate before commenting.' }, 409);

  const score = Number(rawRating);
  const commentKey = `${prefix()}comment:${id}:${user}`;
  const alreadyCommented = await redis.set(commentKey, 'pending', {
    nx: true,
    expiration: new Date(Date.now() + identityTtl * 1000),
  });

  if (!alreadyCommented) {
    return c.json({ error: 'You have already posted a comment for this challenge.' }, 409);
  }

  const commentText = `⭐ **RATE.EXE Verdict**: I rated this **${score}/10**!`;

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

// 7. Subscribe to Current Subreddit
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

// 8. Media Uploads with Safe Fallback
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

  const uploadedUrls: string[] = [];
  for (const url of dataUrls) {
    try {
      const uploaded = await media.upload({
        url,
        type: url.startsWith('data:image/gif') ? 'gif' : 'image',
      });
      uploadedUrls.push(uploaded.mediaUrl);
    } catch (uploadErr) {
      console.warn('media.upload fallback to direct url:', uploadErr);
      uploadedUrls.push(url);
    }
  }

  return c.json({ imageUrl: uploadedUrls[0], imageUrls: uploadedUrls });
});
