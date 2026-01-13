type SlackFile = {
  id?: string;
  permalink?: string;
  permalink_public?: string;
};

function extractFile(result: Record<string, unknown>): SlackFile | null {
  const files = (result as { files?: SlackFile[] }).files;
  if (Array.isArray(files) && files.length > 0) {
    return files[0] ?? null;
  }

  const file = (result as { file?: SlackFile }).file;
  if (file) {
    return file;
  }

  return null;
}

export function extractFileId(result: Record<string, unknown>): string {
  const file = extractFile(result);
  if (file?.id) {
    return String(file.id);
  }
  throw new Error("Unable to locate uploaded file id");
}

export function extractFilePermalink(result: Record<string, unknown>): string | undefined {
  const file = extractFile(result);
  if (!file) {
    return undefined;
  }
  if (file.permalink) {
    return String(file.permalink);
  }
  if (file.permalink_public) {
    return String(file.permalink_public);
  }
  return undefined;
}
