import { context, reddit, redis } from '@devvit/web/server';
import type { Challenge } from '../../shared/game';

export const demoChallenge: Challenge = {
  id: 'c_demo_rating',
  title: 'Rate these Cyberpunk Battlestations 🔥',
  description: 'Evaluate each battlestation setup from 1 to 10.',
  category: 'Tech & Gaming',
  mode: 'rating',
  themeColor: '#4979D0',
  entries: [
    {
      id: 'e1',
      text: 'Neon Horizon Ultrawide',
      imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'e2',
      text: 'Minimal Amber Glow',
      imageUrl: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'e3',
      text: 'Cyberpunk Mech & Numpad',
      imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'e4',
      text: 'Midnight Aesthetic Station',
      imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    },
  ],
  creator: 'Moderator',
  createdAt: Date.now(),
  status: 'published',
};

export const createPost = async () => {
  const subredditName = context.subredditName ?? 'Rank_EXE';
  const challengeId = `c_${Date.now()}`;
  const challenge: Challenge = {
    ...demoChallenge,
    id: challengeId,
    createdAt: Date.now(),
    creator: context.username ?? 'Moderator',
    subredditName,
  };

  const subKey = `rateexe:${context.subredditId || 'local'}:`;
  await redis.set(`${subKey}challenge:${challengeId}`, JSON.stringify(challenge));

  const post = await reddit.submitCustomPost({
    subredditName,
    title: `[RATE.EXE] ${challenge.title}`,
    entry: 'default',
    postData: {
      challengeId,
    },
  });

  challenge.postId = post.id;
  await redis.set(`${subKey}challenge:${challengeId}`, JSON.stringify(challenge));

  return post;
};
