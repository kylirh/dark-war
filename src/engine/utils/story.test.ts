import { describe, expect, it } from "vitest";
import { addStoryMessage, MAX_STORY_MESSAGES } from "./story";

describe("addStoryMessage", () => {
  it("does not repeat the newest story message", () => {
    const story: string[] = [];

    addStoryMessage(story, "Same message");
    addStoryMessage(story, "Same message");

    expect(story).toEqual(["Same message"]);
  });

  it("still records a message after a different message", () => {
    const story = ["Older message"];

    addStoryMessage(story, "New message");
    addStoryMessage(story, "Older message");

    expect(story).toEqual(["Older message", "New message", "Older message"]);
  });

  it("keeps the existing story length limit", () => {
    const story = Array.from(
      { length: MAX_STORY_MESSAGES },
      (_, index) => `Message ${index}`,
    );

    addStoryMessage(story, "Newest message");

    expect(story).toHaveLength(MAX_STORY_MESSAGES);
    expect(story[0]).toBe("Newest message");
    expect(story.at(-1)).toBe("Message 198");
  });
});
