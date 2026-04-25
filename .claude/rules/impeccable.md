# Zaph — Impeccable UI Standards
# These rules enforce visual precision and implementation quality.
# A screen is not done until every rule here passes.

---

## The Standard

"Impeccable" means: if you screenshot this and put it next to Offsuit, a designer would not flinch. Every pixel is intentional. Nothing is approximate.

---

## Hardcoded Values Are Banned

Never hardcode colors, spacing, font sizes, or radii inline. Always reference the design token constants.

```tsx
// ❌ Wrong
<View style={{ backgroundColor: '#1C1C1E', padding: 16, borderRadius: 12 }}>

// ✅ Right
import { Colors, Spacing, Radius } from '@/constants/design'
<View style={{ backgroundColor: Colors.bg.card, padding: Spacing.card, borderRadius: Radius.cardSm }}>
```

Create `src/constants/design.ts` and define all tokens there. This is the single source of truth for all visual values.

---

## No Magic Numbers in StyleSheet

If a number appears in a `StyleSheet.create()` call and it is not from the design constants, it needs either:
1. A comment explaining why it deviates from the system, OR
2. To be moved into the design constants

---

## Pixel-Perfect Alignment Rules

- All text that appears left-aligned must share the same left edge (always `space.screen.horizontal = 20`).
- All cards in a grid must be exactly the same height — never rely on content to set height. Set `minHeight` explicitly.
- Avatar images must always be circular: `borderRadius: size / 2` where `size` is the explicit width/height.
- Progress bars must have a background track rendered below the fill — never render just the fill on the card background.

---

## Loading States Are Not Optional

Every screen that fetches from Supabase must show a skeleton state, not a blank screen or spinner alone.

Skeleton rules:
- Same layout as the loaded state — same card sizes, same positions
- Background: `color.bg.card`, animated shimmer using `Animated` opacity pulse
- Never show a centered `<ActivityIndicator>` as the only loading UI on a content-heavy screen
- Small inline loaders (e.g., button submitting) may use `ActivityIndicator` size="small" color white

---

## Empty States Are Not Optional

If a list or section can be empty (no tasks, no circle members, no leaderboard data), there must be a designed empty state:
- Centered in the available space
- Emoji or simple icon (no heavy illustrations unless explicitly designed)
- Short label (`text.section`, white) + optional sub-label (`text.label`, secondary)
- Optional CTA button if there's an action to take

---

## Touch Targets

Minimum tappable area is 44x44 points (Apple HIG standard). If an icon or text link is visually smaller, use `hitSlop` to expand the touch area:
```tsx
hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
```

Never make a tappable element smaller than 44x44 without hitSlop compensation.

---

## Keyboard Handling

Any screen with a text input must:
- Wrap content in `KeyboardAvoidingView` with `behavior="padding"` on iOS
- Dismiss keyboard on scroll (`keyboardDismissMode="on-drag"` on ScrollView)
- Never let the keyboard cover the primary CTA button

---

## Animation & Feedback

Every interactive element needs visual feedback:
- Buttons: `activeOpacity={0.75}` on `TouchableOpacity` — never the default 0.2
- List rows: `activeOpacity={0.6}` — subtle, not jarring
- Card presses: scale down slightly (`Animated.spring` to `0.97`) for satisfying feel
- Progress bars and stat values: animate on mount — numbers should count up, bars should fill in (300ms ease-out)
- Never animate layout changes directly — use `LayoutAnimation.configureNext` if needed

---

## Typography Enforcement

- Never use `fontWeight` as a string without a matching `fontSize`. They must always be set together.
- Never set `lineHeight` unless the text is wrapping and the default causes layout issues.
- Never mix weight 400 and weight 700 in the same label. If you need emphasis inside a sentence, use two `<Text>` components.
- The `text.hero` style (72px, 800 weight) is reserved for ONE element per screen — the primary hero stat. Do not reuse for decoration.

---

## Color Discipline

- `#FFFFFF` text only on `#000000` or `#1C1C1E` backgrounds. Never white text on a light surface.
- Accent colors (gold, pink, blue) are reserved for gamification data only — rank indicators, currency, achievement states. Never use them for general UI chrome.
- The green CTA (`color.brand.green`) is used for exactly ONE primary action per screen. If there are two buttons, one is green and one is the dark secondary variant.
- Do not approximate colors. Use the exact hex from `design.ts`. `#1C1C1F` is not `#1C1C1E`.

---

## Icon Standards

- Use SF Symbols via `@expo/vector-icons` (Ionicons or MaterialIcons as fallback)
- Icon size in tab bar: 24x24
- Icon size in list rows: 20x20
- Icon size in card headers: 18x18
- Icons that represent currency/gamification items (gems, coins, trophies) use their accent color. All other icons are white or `color.text.secondary`.
- Never scale an icon with `transform` — use the `size` prop directly.

---

## Responsive Layout

- Never use fixed pixel widths for cards or containers — use `flexGrow`, `flex: 1`, or `Dimensions.get('window').width` with arithmetic.
- 2-column grids: `(screenWidth - space.screen.horizontal * 2 - space.grid.gap) / 2` for card width
- Horizontal scroll cards: `screenWidth * 0.75` for card width (25% peek at next card)
- All screen content must be visually correct on iPhone SE (375pt width) through iPhone Pro Max (430pt width)

---

## ScrollView Best Practices

- Always set `showsVerticalScrollIndicator={false}` and `showsHorizontalScrollIndicator={false}`
- Always set `contentContainerStyle` with bottom padding of at least 32 to avoid content clipping above tab bar
- FlatList over ScrollView+map for lists longer than 10 items

---

## Component Completeness Checklist

Before marking any component as done, verify:
- [ ] Loading state handled
- [ ] Empty state handled
- [ ] Error state handled (inline error message, not just a console.log)
- [ ] Touch feedback (activeOpacity or Pressable with pressed style)
- [ ] All colors from design constants (no hardcoded hex)
- [ ] All spacing from design constants (no magic numbers)
- [ ] Works at 375pt width (iPhone SE)
- [ ] Works at 430pt width (iPhone Pro Max)
- [ ] No `any` types
- [ ] No unused imports
