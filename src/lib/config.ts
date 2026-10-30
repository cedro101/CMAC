// Change the Claude model here.
export const CLAUDE_MODEL = "claude-sonnet-5-5";

// Higher effort means more careful replies, but they're slower and cost more.
export const CLAUDE_EFFORT = "medium";

export const CLAUDE_MAX_TOKENS = 16000;

// A single message can't go back and forth with Claude more times than this.
export const MAX_TOOL_ROUNDS = 10;

// A new logging day starts at this local hour, so late-night food counts toward the previous day.
export const DAY_ROLLOVER_HOUR = 4;

export const PASSCODE_HEADER = "x-app-passcode";
