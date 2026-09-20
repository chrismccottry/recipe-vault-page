/*
 * The two addresses the page needs. Both are public by design and safe in a
 * public repository: the LIFF id identifies the app, and the /exec URL refuses
 * anyone whose LINE token is missing, fake, or not one of the two family ids.
 * Proven in Phase 0 on 2026-09-20.
 *
 * LIFF app 2011675849-6UrlDIGD lives in LINE Login channel 2011675849, under the
 * Mccottry Parents provider, the same provider as the Messaging API channel, which
 * is what makes both users resolve to the ids the bot already knows.
 */

export const LIFF_ID = '2011675849-6UrlDIGD';

export const API_URL =
  'https://script.google.com/macros/s/AKfycbyXoLzT2cUlcPx8UorYUusqI_ghLGHUy46JRtRX7WBqMHyioc0rZ42vAb-wQVBCeru2qA/exec';
