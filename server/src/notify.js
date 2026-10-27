export async function pushToUsers(db, userIds, message) {
  if (!userIds.length) return;
  const placeholders = userIds.map(() => "?").join(", ");
  const tokens = db
    .prepare(`SELECT token FROM push_tokens WHERE user_id IN (${placeholders})`)
    .all(...userIds);
  if (!tokens.length) return;

  const messages = tokens.map((row) => ({
    to: row.token,
    title: message.title,
    body: message.body,
    sound: "default",
    priority: "high",
    channelId: "alerts",
    data: message.data || {},
  }));

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch {
    // The in-app channel still delivers the alert if push is unreachable.
  }
}
