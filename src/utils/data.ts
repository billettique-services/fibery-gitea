import {config} from "../config.js";
import {ValidationError} from "../errors/errors.js";

// Gitea user, organization and repository names: ASCII letters, digits, "_", "." and "-".
const NAME_SEGMENT = /^[A-Za-z0-9_.-]+$/;

/** Split an "owner/repo" full name into its parts; both must be plain Gitea names. */
export const parseRepoFullName = (fullName: string): {owner: string; repo: string} => {
  const parts = typeof fullName === "string" ? fullName.split("/") : [];
  const valid = parts.length === 2 && parts.every((part) => NAME_SEGMENT.test(part) && part !== "." && part !== "..");
  if (!valid) {
    throw new ValidationError(`Invalid repository name "${fullName}", expected "owner/repo"`);
  }
  return {owner: parts[0], repo: parts[1]};
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
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    throw new ValidationError("Gitea URL is empty");
  }
  if (/[?#\s]/.test(trimmed)) {
    throw new ValidationError(`"${baseUrl}" must not contain "?", "#" or spaces`);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new ValidationError("Gitea URL must start with http:// or https://");
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ValidationError(`"${baseUrl}" is not a valid URL`);
  }
  if (url.username || url.password) {
    throw new ValidationError("Gitea URL must not contain credentials; use the Access Token field");
  }
  const allowed = config.allowedGiteaHosts;
  if (
    allowed.length > 0 &&
    !allowed.includes(url.host.toLowerCase()) &&
    !allowed.includes(url.hostname.toLowerCase())
  ) {
    throw new ValidationError(`Host "${url.host}" is not allowed by this connector`);
  }
};
