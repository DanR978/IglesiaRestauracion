// The app's own types for SvelteKit (https://svelte.dev/docs/kit/types#app.d.ts).
declare global {
  namespace App {
    /**
     * `page.state` — shallow-routing entries (pushState from $app/navigation),
     * so the Back gesture closes what they open (target-architecture §4).
     */
    interface PageState {
      /** The admin's navigation drawer is open (≤900px, S37). */
      drawer?: boolean;
    }
  }
}

export {};
