# Design spec

[`openslots-design.html`](openslots-design.html) is the visual target for OpenSlots. Open it directly in a browser; it has no build step and no server.

## How to use it

- Every screen has an ID (`S1` to `S10`, `C1`) and numbered acceptance checks (`S4-2`, `T-5`, and so on). A pull request that builds a screen lists the checks it satisfies.
- The booking mockups (`S8`, `S9`, `C1`) are interactive. Their behaviour is the reference behaviour for `@openslots/react`.
- The `<style>` block at the top holds the design tokens under shadcn variable names. **Voltage** is the adopted theme. Copy its light and dark values into `apps/web/app/globals.css`; do not invent colors.
- The mockups are hand-written HTML that imitates shadcn/ui. The real app uses actual shadcn/ui components (new-york style, Tailwind v4). Match layout, hierarchy, color and states; pixel-identical spacing is not required.

## Validating work against it

1. Run the app and open the screen you built.
2. Open the spec beside it, same theme and mode, same viewport width.
3. Walk the screen's checks one by one. Check light and dark.
4. Attach a screenshot of your screen to the pull request.

## Rules that apply to every screen

| ID | Rule |
| --- | --- |
| T-1 | Colors come from the CSS variables only. No raw hex in components. |
| T-2 | shadcn/ui primitives only. Tailwind v4, new-york style. |
| T-3 | Geist for UI. Geist Mono for times, durations, keys and code. |
| T-4 | Text contrast meets WCAG AA in light and dark. |
| T-5 | Any state shown with color also has an icon, label or text decoration. No red-versus-green. |
| T-6 | Visible 2px focus ring on every interactive element. |

The maintainer is colorblind. T-5 is a hard requirement, not polish.
