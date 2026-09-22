# PNG bracket exports

Bracket downloads now use PNG instead of PDF. Legacy result routes retain their existing names/URLs for bookmark compatibility. Blank exports strip results from an in-memory copy; existing picks and account saves are not changed.

The exporter renders the shared BracketBoard cards in an off-screen, non-interactive React tree, waits for fonts, and uses html-to-image to create a single PNG. It bypasses mobile round navigation so every round is captured at any viewport width. The title and champion use the bracket screen's design styles. The export module is loaded only when requested, with visible busy and retry states.

Brackets taller than 1,600 layout pixels switch to two-sided geometry if all branches feed one final and the new layout reduces height. Left and right branches advance toward the central final; irregular/disconnected or multiple-final structures retain their original layout. Geometry changes only in the exported image. Canvas resolution is capped at 12 megapixels and 8,192 pixels per side for large brackets. Temporary DOM nodes and download URLs are cleaned up.
