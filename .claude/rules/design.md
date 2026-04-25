# Zaph — Design System
# Inspired by Offsuit. Pure dark, data-forward, gamified.

---

## Philosophy

Zaph's visual language is **dark, minimal, and content-first**. The interface disappears — data, scores, and people are the heroes. No gradients on dark surfaces, no card shadows, no decorative noise. Elevation is communicated purely through color lightness differentials. Every screen should feel like a premium mobile game, not a wellness app.

---

## Color Tokens

### Backgrounds (elevation layers — no shadows, only color steps)
```
color.bg.base        = #000000   ← Screen background. Always pure black.
color.bg.card        = #1C1C1E   ← Standard card / elevated surface
color.bg.card.active = #2C2C2E   ← Pressed / selected card state
color.bg.input       = #000000   ← Input fields sit on base
color.bg.subtle      = #111111   ← Rare: section dividers, separators
```

### Text
```
color.text.primary   = #FFFFFF   ← All primary labels, headers, values
color.text.secondary = #8E8E93   ← Subtitles, captions, helper text
color.text.disabled  = #48484A   ← Disabled states only
```

### Brand & Actions
```
color.brand.green        = #3DAA6A   ← Primary CTA button fill (muted forest green)
color.brand.green.bright = #39D353   ← Logo accent, toggle ON, active pill indicator
color.brand.green.text   = #FFFFFF   ← Text on green buttons
```

### Accent Colors (gamification only — use sparingly)
```
color.accent.gold    = #FFB800   ← Premium tier, golden items, 1st place
color.accent.silver  = #A8A9AD   ← 2nd place, silver tier
color.accent.bronze  = #CD7F32   ← 3rd place, bronze tier
color.accent.blue    = #5DADE2   ← Currency gem, info icons, activity
color.accent.pink    = #FF375F   ← Danger end of progress spectrum
```

### Progress Bar Gradient (always this exact spectrum, left to right)
```
green (#39D353) → teal (#30D5C8) → blue (#5DADE2) → purple (#BF5AF2) → pink (#FF375F)
```
Apply as a horizontal LinearGradient on all progress/stat bars.

### Gradient Card Backgrounds (horizontal scroll category cards only)
```
Mint variant:    rgba(180,235,210,0.92) → rgba(200,235,225,0.92)
Lavender variant: rgba(210,200,240,0.92) → rgba(220,215,245,0.92)
Peach variant:   rgba(255,210,180,0.92) → rgba(255,220,200,0.92)
```
These are the ONLY screens with light backgrounds. Text on these cards is dark (`#1C1C1E`).

---

## Typography

Use the system font stack. On iOS this is SF Pro. Do not import custom fonts unless explicitly decided.

```
text.hero        size: 72   weight: 800 (ExtraBold)  color: primary   ← Large stat number on home
text.display     size: 40   weight: 700 (Bold)        color: primary   ← Metric values inside cards
text.title       size: 20   weight: 600 (SemiBold)    color: primary   ← Screen titles (centered)
text.section     size: 17   weight: 600 (SemiBold)    color: primary   ← Section headers ("Weekly leaderboard")
text.body        size: 17   weight: 400 (Regular)     color: primary   ← List rows, button labels
text.label       size: 14   weight: 400 (Regular)     color: secondary ← Card subtitles, stat names
text.caption     size: 12   weight: 400 (Regular)     color: secondary ← Timestamps, version strings
text.overline    size: 11   weight: 600 (SemiBold)    color: secondary ← Uppercase category labels
```

Letter spacing: default system. Never apply custom tracking unless it's an overline/label context.
Line height: let React Native default. Only override when stacking multiline in tight cards.

---

## Spacing & Layout

```
space.screen.horizontal = 20   ← Left/right padding on all screens
space.screen.top        = 16   ← Top padding below safe area / header
space.section.gap       = 28   ← Vertical gap between page sections
space.card.padding      = 16   ← Internal padding inside all cards
space.grid.gap          = 12   ← Gap between cards in any grid
space.row.gap           = 12   ← Vertical gap between list rows
space.inline.gap        = 10   ← Horizontal gap between icon + text in a row
```

---

## Border Radius

```
radius.pill    = 999   ← Buttons, input fields, segment tabs, currency pills
radius.card    = 16    ← Standard cards, modal sheets
radius.card.sm = 12    ← Small cards (2-col grid items, store items)
radius.icon    = 10    ← Icon container backgrounds
radius.tag     = 20    ← Corner labels on radar chart (TAG, LAG, ROCK, FISH)
```

---

## Component Specs

### Primary Button
- Full width, height: 54, radius: pill
- Background: `color.brand.green`
- Text: `text.body`, white, weight 600
- No border

### Secondary Button (SSO / dark variant)
- Full width, height: 54, radius: pill
- Background: `color.bg.card` (#1C1C1E)
- Text: `text.body`, white, weight 500
- Optional leading icon (16x16, system or brand logo)
- No border

### Text Link
- Underline decoration, `text.body`, white
- Used only at screen bottom for secondary flows ("I already have an account")

### Input Field
- Height: 54, radius: pill
- Background: `#000000`, border: 1px `#2C2C2E`
- Placeholder: `color.text.secondary`
- Text: white, `text.body`
- No label above — placeholder IS the label

### Stat Card (2-column grid)
- Background: `color.bg.card`
- Radius: `radius.card.sm`
- Padding: `space.card.padding`
- Top row: small icon (emoji or SF Symbol) left, info (?) circle right
- Middle: large metric value (`text.display` or larger)
- Below value: thin progress bar (height 4, gradient)
- Bottom: category label (`text.label`, secondary)

### Leaderboard Row
- Height: ~72, horizontal padding: `space.screen.horizontal`
- Left: medal icon (gold/silver/bronze, 40x40)
- Center-left: avatar (circular, 48x48)
- Center: username (`text.body` bold) + XP subline (`text.label` secondary)
- No right element (XP is in the label, not trailing)
- Divider: none — whitespace separates rows

### Category Card (horizontal scroll)
- Width: ~75% of screen width, height: ~160, radius: `radius.card`
- Background: gradient (light variant — see Gradient Card Backgrounds)
- Top: emoji/icon (48x48)
- Bottom-left: title (`text.section` dark), subtitle (`text.label` dark)
- Cards peek at the right edge — always design for horizontal scroll

### Tab Bar
- 3 icons only — no text labels
- Active icon: white, Inactive: `color.text.secondary`
- Background: `#000000` with subtle top border `#1C1C1E`
- Items: Store (bag), Home (house/diamond), Profile (person)

### Segment Control (scrollable tabs)
- Pill-shaped tabs, horizontal scroll
- Active: `color.bg.card.active` fill, white text, bold
- Inactive: transparent, `color.text.secondary` text
- Height: 36, radius: pill, padding: 12px horizontal

### Progress Bar
- Height: 4, radius: pill
- Background track: `#2C2C2E`
- Fill: gradient (see Progress Bar Gradient)
- Never use a solid color — always use the gradient

### Toggle
- On: `color.brand.green.bright` (#39D353)
- Off: `#3A3A3C` (dark gray)
- Thumb: white

### Avatar
- Circular crop, 48x48 (list), 80x80 (profile header)
- Memoji / emoji style — no square crops, always circular
- Edit state: small pencil badge (20x20 white circle, pencil icon) bottom-right

### Settings List Row
- Full width, height: 52
- Left: label text (`text.body`, white)
- Right: trailing value (`text.body`, secondary) + chevron, OR toggle
- Divider: 1px `#2C2C2E` at bottom, inset 0 (full width)

### Circular Progress Indicator (header widget)
- Size: 40x40
- Track: `#2C2C2E`, stroke width: 3
- Fill: gold (#FFB800) or green — context dependent
- Center label: small number (`text.caption`, white)

### Radar / Spider Chart
- Grid: dashed lines, `#2C2C2E`
- Fill: multicolor gradient (pink → orange → yellow → teal)
- Axis labels: positioned at cardinal points, `text.label` with color coding
- Corner quadrant labels: pill-shaped tags, active = green fill, inactive = `color.bg.card`

---

## Screen Structure

Every screen follows this pattern:
```
SafeAreaView (bg: #000000)
  ├── Header row (back arrow left, title center, action right) — height 52
  ├── ScrollView OR FlatList
  │     ├── [Content sections with space.section.gap between them]
  │     └── ...
  └── [Fixed bottom element if needed — button or tab bar]
```

Screens with a tab bar: tab bar is outside the scroll area, always fixed to the bottom of the safe area.

---

## Zaph-Specific Mapping

These are the direct translations from Offsuit's patterns to Zaph's context:

| Offsuit Element | Zaph Equivalent |
|---|---|
| Weekly leaderboard | Circle weekly leaderboard (same layout) |
| XP display | Points/score display |
| Category cards (Cash Games, AI Arena) | Circle cards on home (horizontal scroll) |
| Stat cards (VPIP, PFR, etc.) | Task completion stats (streak, tasks done, win rate) |
| Radar chart | Optional: "Balance chart" showing task category breakdown (fitness, work, social, mindfulness) |
| Chest/store | Rewards screen (unlock badges, streaks) |
| Avatar / Memoji | User profile avatar |
| Rank progress row | Circle role/rank progress |
| Add Friends CTA | Invite to Circle CTA (same pill button, white border, no fill) |

---

## What NOT to do

- No white or light backgrounds on any screen (except gradient category cards)
- No card drop shadows (`shadowColor`, `elevation`) — elevation is color only
- No colored text other than the defined accent palette
- No thick borders — 1px max, always `#2C2C2E`
- No gradient on background or full screens — only on cards (light variant) and progress bars
- No icons larger than 28x28 in list rows or tab bars
- No text-heavy cards — if a card needs more than 3 lines, it's a screen, not a card
- Never use blue as a primary action color — green is the only CTA color
