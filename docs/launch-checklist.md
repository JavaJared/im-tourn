# Launch checklist review — September 15, 2026

The 20 items transcribed from the supplied screenshot, with the repository review outcome:

| # | Item | Outcome |
|---|---|---|
| 1 | Privacy policy page | Existing; updated optional analytics disclosure to match the new behavior. No legal-compliance certification implied. |
| 2 | Terms & conditions page | Existing Terms of Service, linked in footer; retained. |
| 3 | Secrets off the frontend | No private credentials found in reviewed client source. Firebase web configuration and GA measurement ID are public identifiers; access is controlled by Firebase rules and server authorization. |
| 4 | Force HTTPS | Existing live HTTP 301 to HTTPS verified; retained. |
| 5 | Cookie consent banner | Added optional analytics consent with equal Accept/Decline controls, default off, withdrawal, and storage-failure handling. Essential storage remains independent. |
| 6 | Meta titles + descriptions | Added view-specific metadata, canonical URLs, and noindex for nonpublic views. Static social metadata is generic; resource-specific server-rendered previews are not provided. |
| 7 | Social preview image | Added 1200×630 PNG (~25 KB), Open Graph and Twitter card metadata. |
| 8 | Add a favicon | Existing SVG and PNG icons retained. Removed broken icon references. |
| 9 | Sitemap + robots.txt | Added public discovery pages only; no private pool or submission URLs. Robots files are not access controls. |
| 10 | Alt text on images | Existing descriptive or intentionally empty alt attributes retained where adjacent text supplies the name. Added social-image descriptions. |
| 11 | Compress your images | Existing canvas JPEG compression, 1200px maximum, quality 0.85 retained. New social graphic is optimized. |
| 12 | Check page load speed | Checked build sizes and live HTTP response timing; added immutable hashed-asset caching, font preconnect, and lazy list images. One remote HTML request took ~5.18s (TTFB ~5.14s); this is not a user-device Core Web Vitals benchmark. Firebase remains the largest shared bundle (~170 KB gzip). |
| 13 | Fix color contrast | Lightened muted text tokens and changed orange button text to dark. This is a targeted improvement, not a full contrast audit of every state. |
| 14 | Make it mobile friendly | Existing responsive cards, touch controls, zoom support and reflow retained. Removed unnecessary portrait-only PWA preference. |
| 15 | Custom 404 page | Added static Netlify 404 and an unknown-view recovery screen. Query-based application routes remain at the root. |
| 16 | Fix broken links | Footer navigation now has real URLs, respects modifier clicks; repaired missing PWA icon references and Create shortcut. |
| 17 | Form validation | Existing client validation and server/Firestore constraints retained. |
| 18 | Spam protection | Existing authentication, UID-bound votes, input limits and invite lookup rate limiting retained. These are basic protections, not comprehensive bot detection. |
| 19 | Set up analytics | Integrated existing GA4 ID G-XLDJ2FB9QQ, opt-in only. Isolated analytics document accepts only general page categories and excludes parent URLs/forms/history. GA dashboard delivery and property ownership are not verified from this environment. |
| 20 | One clear call to action | Added a prominent Create your bracket button to the homepage hero. |

## Analytics implementation

The optional iframe is mounted only after acceptance and removed on withdrawal. It has a no-referrer policy, listens only to its own parent's same-origin messages, and allows a fixed list of section categories. This avoids exposing application query strings and history changes to analytics enhanced measurement. No account IDs, predictions, or invite codes are passed in events. The privacy settings control remains available below the main content. Script blockers may prevent collection.

Google's documentation explains why disabling default pageviews alone does not disable enhanced history measurement: https://developers.google.com/analytics/devguides/collection/ga4/views

## Verification scope

Local tests cover consent gating/withdrawal, category sanitization, metadata, shipped discovery/404 assets, and icon paths. Build and repository CI checks run before merge. Browser visual checks, live GA dashboard verification, and a representative mobile Core Web Vitals measurement remain outstanding.
