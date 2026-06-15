// Pure formatting for a bug report sent to Discord. No IO.

export interface BugReportInput {
  message: string;
  user: string;
  pageUrl: string;
  at: Date;
}

const MAX_LEN = 2000; // Discord message content limit

export function formatBugReport({
  message,
  user,
  pageUrl,
  at,
}: BugReportInput): string {
  const header =
    `🐞 **Nahlášení chyby**\n` +
    `**Kdo:** ${user}\n` +
    `**Kde:** ${pageUrl}\n` +
    `**Kdy:** ${at.toISOString()}\n` +
    `**Zpráva:**\n`;
  const room = MAX_LEN - header.length;
  const body =
    message.length > room ? message.slice(0, Math.max(0, room - 1)) + "…" : message;
  return header + body;
}
