export const COLLECT_CRON = '* * * * *';

// 03:17 keeps maintenance away from the top of the hour, when every cron in
// every timezone wants attention at once.
export const PRUNE_CRON = '17 3 * * *';
