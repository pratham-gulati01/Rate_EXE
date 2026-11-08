import { context, reddit } from '@devvit/web/server';
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
      text: '',
      imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'e2',
      text: '',
      imageUrl: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'e3',
      text: '',
      imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'e4',
      text: '',
      imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    },
  ],
  creator: 'Moderator',
  createdAt: Date.now(),
  status: 'published',
};

export const createPost = async () => {
  const subredditName = context.subredditName ?? 'Rank_EXE';
  const post = await reddit.submitCustomPost({
    subredditName,
    title: 'RATE.EXE — Create a rating game',
    entry: 'default',
    postData: {
      setup: true,
    },
  });

  return post;
};
