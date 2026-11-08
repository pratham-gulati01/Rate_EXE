# RATE.EXE

**RATE.EXE** is an interactive, community-driven rating game built for Reddit using Devvit Web (`@devvit/web`), React 19, Vite, and Hono.

---

## 🌟 Overview

RATE.EXE empowers creators and communities to turn any collection of images or ideas into an engaging social rating challenge. Whether evaluating battlestations, judging creative portfolios, voting on community submissions, or scoring setups, players swipe through the entries and lock in an overall score from 1 to 10 for the entire challenge.

---

## 🎮 How the Game Works

### 1. Interactive Media Carousel
- **Rich Media & Text Cards**: Browse through uploaded images, animated GIFs, or custom text slides.
- **Fluid Side Navigation**: Centered side swipe controls (`‹` and `›`) and touch swipe gestures for seamless navigation.
- **Full-Screen Inspection**: Click or tap **Full image** on any slide to inspect the media in full resolution.
- **Clean Slide Counter**: A minimalist slide tracker in the header shows current progress (e.g. `1 of 4`).

### 2. Single 1-to-10 Rating Lock-In
- **10-Segment Rating Bar**: A responsive, tactile selector ranging from 1 to 10.
- **One Score Per Post**: Players evaluate the collection as a cohesive challenge, keeping scoring focused, intuitive, and fun.
- **Lock In**: Select your rating and submit with a single tap.

### 3. Rating Celebration & Community Join
- **Heart Verdict Badge**: Celebratory confirmation displaying your locked-in score.
- **One-Tap Commenting**: Submit your official verdict directly as a formatted Reddit comment on the post.
- **Join Community**: Quick-subscribe shortcut to join the host subreddit.

### 4. Personal Verdict Screen ("You" Tab)
- **Score Focus**: Prominently highlights your locked-in numerical score out of 10.
- **Preserved Thumbnail Gallery**: Displays all rated images in their original sequence within a compact, evenly spaced horizontal gallery.
- **Comment CTA**: Submit your verdict to the Reddit thread at any time.
- **Create Your Own**: Top-right shortcut to immediately create your own rating post.

### 5. Community Results Screen ("Community" Tab)
- **Community Average**: Live weighted average score across all participating Redditors.
- **Total Rating Counter**: Displays total community votes in real time.
- **Compact 10-Bar Distribution Chart**: A streamlined breakdown showing the exact distribution of votes from 10★ down to 1★ with percentages and raw vote counts.
- **Visually Muted Zero-Vote Rows**: Unvoted scores are softly muted for clean, effortless scanning.
- **Create Your Own Post CTAs**: Dedicated buttons located both in the header and directly below the distribution chart allow any player to launch their own rating challenge.

### 6. Creator Studio & Publishing
- **Expanded Creation Panel**: Opens directly in Reddit's expanded webview modal.
- **Media Uploads & Text Entries**: Add up to 30 items via image upload, text cards, or bulk add.
- **Customization**: Set custom post titles, descriptions, categories, and accent theme colors.
- **Reddit Integration**: Seamlessly publishes a new interactive custom post to the subreddit.

---

## 🏗️ Architecture

- **Client (`src/client`)**: React 19 single-page application with responsive layouts, touch gesture recognition, Devvit webview expanded mode lifecycle management, and accessible UI controls.
- **Server (`src/server`)**: Lightweight Hono service utilizing Redis for atomic rating persistence, real-time distribution aggregation, and Reddit API integrations for comments and custom post submissions.
- **Shared (`src/shared`)**: Shared TypeScript data models, interfaces, and game configuration types.
