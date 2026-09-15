# Accessibility report resolution — September 15, 2026

Scope: the supplied 32-page automated homepage report, checked against source at 6ca9d39. Its 24 flagged element instances are grouped into eight checks; this is not a complete authenticated-flow or WCAG conformance audit.

| Report check | Assessment and resolution |
| --- | --- |
| 1. Navigation landmark | Retained native nav, named Primary, replaced navigation buttons with real URL links, and identified the exact current destination with aria-current. Modified clicks retain browser behavior. |
| 2–3. Main landmark | Source already has exactly one main around page content, with header/footer outside. The home container is a descendant, not another main. Retained this correct structure and added a focusable skip-link target. |
| 4. Search landmark | Added named search region, search input name/type, category/sort names, and clear-search button name. Live filtering is unchanged. |
| 5. Sticky header obscures focus | Removed sticky positioning at all viewport widths. Header now scrolls with the document, avoiding overlap when zoomed or navigating backward by keyboard. |
| 6. Decorative graphics | Homepage search/empty-state SVGs now have aria-hidden and focusable=false. |
| 7. Hidden content | Report supplies only an empty body snapshot, with no selector/frame URL identifying a reproducible defect. No safe body-level change is justified: hiding the application body would remove all content from assistive technology. Optional analytics iframe is already hidden/aria-hidden; dialogs use inert background handling. Needs a rerun with an actionable selector and frame URL. |
| 8. Actionable elements | Logo is now a native home link. Category and Custom spans are static metadata with no click handlers; retained as text. Removed misleading pointer cursor from the static custom card. Actual card actions retain native buttons and now have bracket-specific names. |

Additional fixes: Browse heading is h2 above h3 cards; search result counts/loading status are announced; support actions are native buttons; account disclosure exposes expanded state, closes on focus leaving, and supports Escape with focus restoration.

Validation: production build and React regression tests, including native-link modifier behavior, filtering, search semantics, and static badges. CI also runs existing backend and security-rule tests before merge. These checks do not exercise an actual screen reader.

Manual follow-up: rerun the supplied scanner on the deployed revision; investigate check 7 if reproduced; keyboard and screen-reader testing of signed-in bracket creation/picks/saving, pools, dialogs and account flows; inspect 200%/400% zoom and narrow viewports. No claim of full WCAG or legal compliance is made from this homepage report.

References:
- https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html

## Second scan

The second supplied report flags 38 instances across six checks. Search-region, sticky-header and static-badge/button-role findings from the first report no longer appear.

- Check 4: 33 name/text override flags. Sampled failures show View/Fill Out buttons with a decorative arrow omitted from aria-label. W3C's Label in Name guidance allows symbolic characters to be excluded and treats capitalization/punctuation differences as equivalent. Nevertheless, simplify the implementation: remove these ARIA overrides and arrows, retain the visible action text, and append bracket context as visually hidden text. Apply the same pattern to Submissions and the logo so names originate from actual content.
- Checks 1–3: same native Primary navigation and single main already verified in the live browser accessibility tree. No incorrect nesting is demonstrated. Preserve these landmarks.
- Check 5: same empty body snapshot without frame URL/selector. Still unverified, not a reason to hide the application.
- Check 6: the decorative search SVG now triggers the opposite warning (visible but aria-hidden) after the first report requested hiding decorative graphics. Its purpose is already supplied by the Search brackets input name. Retain aria-hidden for the redundant graphic rather than creating a duplicate announcement.

Guidance: https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html and https://www.w3.org/WAI/tutorials/images/decorative/

The scanner's raw count is not a conformance score. Ask its vendor for the specific violated success criterion and reproducible frame/selector for the repeated landmark/empty-body findings. Verify actual accessible names in the deployed browser after this revision.
