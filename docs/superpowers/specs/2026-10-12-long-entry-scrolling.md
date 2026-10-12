# Long task descriptions and internal scrolling

The user reproduced clipped descriptions in compact and expanded editors and requested a task limit of 50,000 characters.

The inner Entry had `min-height: 0px`; the scrollable box shrank it to the viewport. The regression measured Entry height 190 and scroll upper/page both 190 despite a natural text height of 784. Set the document minimum height from wrapped text height, while bounding only the containing ScrollView. Keep the field frame stationary while its transparent text child scrolls.

Caret-follow runs after layout and rechecks updated scroll bounds, including text changes while cursor position remains the end sentinel. Cancel pending callbacks and disconnect focus signals when destroying the field. Preserve keyboard shortcuts, native clipboard, selection, pin and whole-window opacity.

Verify actual wheel scrolling reaches both ends in both sizes, Ctrl+End/Home, typing new lines without clipping the caret, 50,000-character editing/persistence, resize/HiDPI and teardown. Tasks use the requested 50,000 limit; ordinary and private notes retain their existing limits.

Verification: actual wheel scrolling reaches both ends in compact/expanded mode. Exactly 50,000 characters survive edit/save/disk reload. Ctrl+End and newly typed lines retain a visible caret. Pointer, main and Private Shell suites plus domain/storage/vault/installer checks passed; synthetic screenshots were inspected.
