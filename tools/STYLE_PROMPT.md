# AriMon — locked image-generation style

This is the single style contract every character illustration must follow so all
151 cards look like one set. `tools/gen-art.mjs` prepends this to a per-card line.

## Base style (prepended to every prompt)

> Cute chibi "AriMon" creature, original mascot character (NOT a real Pokémon),
> friendly toddler-appeal design with big rounded eyes and a soft smile.
> Hand-painted trading-card illustration, warm storybook lighting, clean studio
> background that fades to soft color, subtle rim light, gentle cel shading with
> painterly texture. Full body, centered, facing slightly toward the viewer,
> wholesome and gentle. High detail, no text, no card frame, no border,
> transparent background. Square composition.

## Per-card line (filled from the bible)

`{name} — a {type}-type {species} AriMon, {silhouette hint}. {evolution note}.`

- **type → palette anchor**: Grass→leafy greens; Fire→warm orange/red; Water→cool
  blues/teal; Electric→bright yellow; Psychic→violet/magenta; Fighting→earthy
  tan/brown; Colorless→soft cream/grey.
- Keep the same eye style, line weight, and lighting across all cards.
- Evolutions should read as the same character line (shared motifs, growing size).

## Output

- 1024×1024 PNG, transparent background, character only.
- Saved to `tools/art-raw/<id>.png`, then `tools/compose-cards.mjs` drops it into
  the locked AriMon frame and writes the finished card to `public/assets/cards/`.

## Consistency tips

- Use the same provider + a fixed seed where supported.
- Generate evolution lines in one batch so the family stays on-model.
- Spot-check 9-up contact sheets before composing the whole set.
