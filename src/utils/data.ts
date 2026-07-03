import {ValidationError} from "../errors/errors.js";

/** Split an "owner/repo" full name into its parts. */
export const parseRepoFullName = (fullName: string): {owner: string; repo: string} => {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new ValidationError(`Invalid repository name "${fullName}", expected "owner/repo"`);
  }
  return {owner, repo};
};

/** Stable Fibery key for an issue/pull request: "owner/repo#number". */
export const issueKey = (repoFullName: string, number: number): string => `${repoFullName}#${number}`;

/**
 * Maps a list of entities to their string ids, tolerating a null/undefined list
 * and null entries inside it. Gitea can return null elements in arrays such as
 * `requested_reviewers` (e.g. when a reviewer's account was removed).
 */
export const idsOf = (items?: Array<{id: number | string} | null | undefined>): string[] =>
  (items ?? []).filter((item): item is {id: number | string} => item != null).map((item) => String(item.id));

/** Extract the trailing numeric index from an issue/pull request API url. */
export const parseIndexFromUrl = (url?: string): number | undefined => {
  if (!url) {
    return undefined;
  }
  const match = url.match(/(\d+)\/?$/);
  return match ? Number(match[1]) : undefined;
};

export const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || (Array.isArray(value) && value.length === 0) || value === "";

export const validateBaseUrl = (baseUrl?: string): void => {
  if (!baseUrl || !baseUrl.trim()) {
    throw new ValidationError("Gitea URL is empty");
  }
  const candidate = /^https?:\/\//i.test(baseUrl.trim()) ? baseUrl.trim() : `https://${baseUrl.trim()}`;
  try {
    void new URL(candidate);
  } catch {
    throw new ValidationError(`"${baseUrl}" is not a valid URL`);
  }
};
