type LiveBody = Record<string, unknown>;

let sender: ((body: LiveBody) => void) | null = null;

export function bindLive(next: ((body: LiveBody) => void) | null) {
  sender = next;
}

export function pushLive(body: LiveBody) {
  sender?.(body);
}
