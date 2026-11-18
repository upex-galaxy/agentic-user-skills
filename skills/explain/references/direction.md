# Visual direction

Rules for scenes that read well on first view. Each rule has a number to hit and a do/don't pair. `check` enforces the mechanical ones (bounds, overlap, overflow); the rest you verify on the stills.

## Length and rhythm

- **5 to 9 scenes, 6 to 12 s each, 45 to 90 s in total.** One idea per scene. A tenth scene means two videos.
- **The first 3 s say what the video explains**: scene 1 opens with `titleCard`, or a heading plus the hero, never an empty frame. The **last scene recaps in at most 3 points** (a 3-node `row`, or one `table`).
- **Reading time: about 1 s per 4 words**, counted from when the text finishes appearing. Leave the finished scene on screen at least that long before the transition. A 12-word caption needs 3 s visible.
- Do: `caption` typed at 4.0, scene ends at 9.0. Don't: caption typed at 8.0 in a scene that ends at 9.0.

## Hierarchy

- **One hero per scene**: the thing being explained. Make it larger (about 1.5x the area of its neighbors) and give it the scene's accent color; support elements stay `ink` or `dim`.
- **At most 3 colors on screen**, counting `ink`. One accent for the hero, one more only to contrast a second group. Do: `accent` hero, `dim` supporting nodes. Don't: `accent`, `accent2`, `good` and `warn` on four sibling nodes with no meaning behind the colors.
- Color carries meaning, so keep it constant across scenes: the same concept gets the same token in every scene (the user is always `accent`, the tool always `accent2`).
- A `good` or `bad` token means pass or fail. Do not use them as decoration.

## Fill the frame

- **Use the whole frame, vertically too.** Every scene has three bands: the heading (`s.heading`, `y` 124 to 228), the content area (`s.area`, `y` 244 to 880) and the caption and footer below it. Leave `area` out: pieces center in the content area and the layout ones (`flow`, `stateMachine`, `architecture`, `timeline`, `row`, `grid`...) grow to fill about 80 % of it, so nothing hugs the top. Diagram on one side and explanation on the other, or one centered composition spanning the width.
- `check` warns (`composition-balance`) when a half holds under 12 % of the content, the content covers under 28 % of the frame or spans under 30 % of its height, or its center of mass sits high or low. Treat any warning as a layout error; the usual fix is to delete a hand-placed `area` or make the nodes bigger (a row of 3 nodes wants `h` 300 to 400, not 140).
- The heading, section tag, caption, footer and `journeyRail` are HUD: they stay put when the camera zooms, and the heading and rail fade while zoomed.
- Keep 24 px or more from every edge; target 80 px for anything that matters.
- Do: three 480 x 300 nodes with 200 px gaps, no `area`. Don't: three 200 x 100 nodes in a corner, or an `area` that leaves the lower half empty.

## Make everything move

- **Every scene moves**, and each movement has a reason: an object that draws or enters, a mockup that types or clicks, packets that travel between icons, kinetic text, a camera move. A frozen scene is a slide; cut it or add the motion that explains it.
- **One hero per scene.** One piece owns the eye (the editor, the counter, the pipeline); everything else supports it and enters after it.
- **Row-shaped diagrams use the auto layouts.** For a row of nodes, a chain of steps or a grid, call `s.row`, `s.grid`, `flow` or `architecture` without `area`, so the group is centered and grows to the content area. Do not hand-place three small boxes in a corner.
- **Pick the piece that moves for you.** `packets` instead of a static arrow, `pipeline` instead of boxes with check marks, `terminal` and `editor` instead of a code screenshot, `counter` instead of a typed number.

## Motion explains

- **Reveal in reading order**: left to right, top to bottom, cause before effect. Space reveals by 0.3 to 0.6 s.
- **Draw the connection after the things it connects**: an `edge` starts at least 0.3 s after both nodes are on screen.
- **Move the camera to what is being said, then pull back**: `focus` 0.8 to 1 s, hold on the target, `reset` 0.6 to 0.8 s. `focus` fits the target into the content area, so the zoom is capped and the caption never covers it; `zoom` is only a wish. Aim for 1.4 to 2.2. One camera move per scene is enough.
- Use `pulse`, `highlight` and `travelDot` to point at the thing named in the caption at the moment it is named. Do: `pulse` the `db` node as the caption says "the database". Don't: pulse every node.
- No motion without a reason: a decorative loop makes viewers look at the wrong thing.

## Text

- **Labels 2 to 5 words. Captions under 12 words. No paragraphs.** One sentence per caption.
- **No widows**: do not let the last line of a label be a single short word; rewrite the text or widen the rect. Do: "Claude loads the skill on demand". Don't: "Claude loads the skill on" / "demand".
- Never an opening inverted question or exclamation mark; close questions and exclamations with `?` or `!` only. Do: "Cuando se carga la skill?". Don't: the same sentence opened with the inverted mark.
- **Text is never tiny.** Rely on the preset's sizes (`s.style.defaults`): the engine fits text from them and will not shrink below the preset's `minPx` (30 in `sketch`, 20 in `poster`, 18 in `hologram`). If text gets that small, cut words or enlarge the shape instead of accepting it. Never set a fixed small `px`.
- Write in the language of the request. Same language in headings, labels, captions and the footer prefix.
- Section tag at the top-left of every scene (`01 / 07 Topic`), so a viewer who joins late knows where they are.

## Facts and sources

- **Every factual claim has a `sourceFooter`** naming the document, page or section it came from, one per scene: "Source: docs page, Skill content lifecycle". Facts you cannot source do not go in the video.
- Numbers on screen come from the source, with the same units. Do not round a limit to a friendlier figure.
- For a PR: name the PR number and the files or commit the scene is about in the footer.

## Transitions

- **`light-sweep` or `push-zoom` between big topics, `crossfade` inside a topic.** Never more than 2 types in one video.
- 0.4 to 0.6 s. A transition longer than 0.8 s eats the scene.

## Before you export

Look at every still and ask, in this order: is the hero the first thing the eye lands on; can each label be read at phone size; does an arrow point at the thing the caption names; is any half of the frame empty; is the source footer there. Fix what fails, rebuild, re-run `check` and `stills`.
