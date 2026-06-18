// Common time constants. Always in milliseconds unless the name says otherwise.

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const DAYS_30_MS = 30 * DAY_MS;

// Days after a paid sub expires (or a trial ends) before we purge user data.
export const TRIAL_GRACE_DAYS = 30;
