/** Adds persistent story messages without repeating the current log entry. */

export const MAX_STORY_MESSAGES = 200;

/** Insert a story message unless it is already the newest log entry. */
export function addStoryMessage(story: string[], message: string): void {
  if (story[0] === message) return;

  story.unshift(message);
  if (story.length > MAX_STORY_MESSAGES) story.pop();
}
