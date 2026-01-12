export function requireNonEmpty(value: string, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  return value;
}

export function parseUserRef(value: string): string {
  // TODO: Resolve @user or email to user ID via users.lookupByEmail or users.list.
  return value;
}

export function parseChannelRef(value: string): string {
  // TODO: Resolve #channel or name to channel ID via conversations.list.
  return value;
}
