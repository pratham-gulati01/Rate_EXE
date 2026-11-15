export type GameMode = 'rating' | 'yes_no';

export type ChallengeEntry = {
  id: string;
  text: string;
  imageUrl?: string;
};

export type Challenge = {
  id: string;
  title: string;
  description: string;
  category?: string;
  mode: GameMode;
  themeColor?: string;
  entries: ChallengeEntry[];
  creator?: string;
  createdAt?: number;
  postId?: `t3_${string}` | string;
  status?: 'draft' | 'published';
  subredditName?: string;
};

export type Submission = {
  mode: GameMode;
  values: Record<string, number | string>;
};

export type Session = {
  challengeId: string;
  mode: GameMode;
  order: string[];
  values: Record<string, number | string>;
  status: 'in-progress' | 'completed';
  createdAt?: number;
};

export const isVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  return (
    /\.(avi|mp4|webm|mov|mkv)(\?|$)/i.test(url) ||
    url.startsWith('data:video/') ||
    url.includes('v.redd.it')
  );
};

export function isValidSubmission(challenge: Challenge, submission: Submission): boolean {
  if (challenge.entries.length === 0) return false;
  const validIds = new Set(challenge.entries.map((entry) => entry.id));
  const entries = Object.entries(submission.values);
  if (entries.length !== challenge.entries.length) return false;

  if (submission.mode === 'rating') {
    return entries.every(
      ([id, val]) =>
        validIds.has(id) &&
        Number.isInteger(Number(val)) &&
        Number(val) >= 1 &&
        Number(val) <= 10
    );
  }

  if (submission.mode === 'yes_no') {
    return entries.every(
      ([id, val]) => validIds.has(id) && (val === 'YES' || val === 'NO')
    );
  }

  return false;
}
