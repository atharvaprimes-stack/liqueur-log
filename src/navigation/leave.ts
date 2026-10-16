import { router, type Href } from 'expo-router';

/** Close this screen onto its parent. History back is avoided because tab history often returns to Home. */
export function leaveScreen(parent: Href): void {
  router.dismissTo(parent);
}
