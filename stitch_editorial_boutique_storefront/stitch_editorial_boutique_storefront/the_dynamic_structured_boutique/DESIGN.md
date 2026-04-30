---
name: The Dynamic & Structured Boutique
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#434656'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#747688'
  outline-variant: '#c4c5d9'
  surface-tint: '#124af0'
  primary: '#0040e0'
  on-primary: '#ffffff'
  primary-container: '#2e5bff'
  on-primary-container: '#efefff'
  inverse-primary: '#b8c3ff'
  secondary: '#5d5f5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2e2e2'
  on-secondary-container: '#636564'
  tertiary: '#993100'
  on-tertiary: '#ffffff'
  tertiary-container: '#c24100'
  on-tertiary-container: '#ffece6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c3ff'
  on-primary-fixed: '#001356'
  on-primary-fixed-variant: '#0035be'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c6'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59b'
  on-tertiary-fixed: '#380d00'
  on-tertiary-fixed-variant: '#812800'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  h1:
    fontFamily: Noto Serif
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h2:
    fontFamily: Noto Serif
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h3:
    fontFamily: Noto Serif
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0em
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.1em
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
spacing:
  base: 8px
  container-max: 1440px
  gutter: 24px
  margin-x: 48px
  stack-sm: 16px
  stack-md: 32px
  stack-lg: 64px
---

## Brand & Style
This design system is defined by a sophisticated tension between rigid structure and fluid, high-end editorial storytelling. It targets a discerning audience that values clarity, exclusivity, and the tactile feel of a digital magazine.

The aesthetic blends **Minimalism** with **Bold/High-Contrast** elements. It prioritizes heavy whitespace and a strict mathematical grid to evoke the feeling of a premium printed publication. The brand personality is authoritative yet modern, utilizing sharp architectural lines to frame content, contrasted by highly kinetic, interactive elements that respond to user motion.

## Colors
The palette is intentionally restrained to maintain an editorial focus. 

- **Primary Canvas:** An off-white (#F9F9F9) serves as the background, providing a softer, more premium feel than pure white.
- **Typography & Structure:** Dark charcoal (#1A1C1C) is used for all text and structural borders, ensuring maximum legibility and a grounded feel.
- **Action & Focus:** The Electric Blue (#2E5BFF) is reserved strictly for interactive elements, calls to action, and critical feedback loops, slicing through the neutral palette with high-energy precision.

## Typography
The typographic hierarchy relies on the interplay between the classic authority of **Noto Serif** (substituting for Playfair Display) and the functional clarity of **Inter**.

- **Headlines:** Use Noto Serif for all editorial titles. Large-scale headings should feature tight letter-spacing to mimic high-end mastheads.
- **Body & UI:** Inter is used for all functional text to maintain a modern, systematic feel. 
- **Metadata:** Use small, all-caps Inter with increased tracking for labels, categories, and price tags to create a structured, organized appearance.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy inspired by print layouts. A 12-column grid is used for desktop, with generous 48px outer margins to "frame" the content.

Elements should feel "grid-locked." Vertical rhythm is maintained through a 8px base unit. Use exaggerated vertical spacing (64px+) between sections to allow the editorial photography to breathe. Borders are used sparingly but decisively to separate content blocks, mimicking the columns of a broadsheet newspaper.

## Elevation & Depth
This design system avoids traditional shadows in favor of **Bold Borders** and **Tonal Layers**. 

Depth is communicated through 1px solid lines in charcoal (#1A1C1C) or very light grey (#E0E0E0). Overlapping elements should use hard edges and high-contrast stacking rather than blurs. When an element is "raised" or active, it may shift position slightly (e.g., a 2px offset) or change its border weight, maintaining a flat, tactile, and structured feel.

## Shapes
The primary shape language is **Sharp (0px)**. All containers, product images, input fields, and structural cards must have square corners to reinforce the grid-locked, architectural aesthetic.

The sole exception to this rule is **Buttons**. Primary and secondary buttons utilize a **Pill-shape** (fully rounded) to provide a clear visual affordance for interactivity and to create a sophisticated organic contrast against the rigid, rectangular environment.

## Components

- **Buttons:** Primary buttons are pill-shaped, filled with Electric Blue (#2E5BFF), using white text. Secondary buttons are pill-shaped with a 1px Charcoal border. On hover, buttons should undergo a slight scale increase or color shift.
- **Cards:** Product cards are strictly rectangular with no border radius. Use a 1px Charcoal border that only appears on hover to signal interactivity. Text within cards must be strictly aligned to the bottom or top left.
- **Input Fields:** Rectangular with a 1px bottom-border only for a "minimalist stationery" feel, or a full 1px Charcoal stroke. No rounded corners.
- **Chips/Tags:** Small, rectangular boxes with sharp corners. Use Electric Blue for active states and off-white with a Charcoal border for inactive states.
- **Lists:** Separated by horizontal 1px rules spanning the full width of the container. 
- **Editorial Callouts:** High-impact text blocks using Noto Serif, often spanning multiple columns, used to break up product grids with storytelling.
- **Navigation:** A minimal top bar with persistent visibility, using sharp-edged dropdowns and "Inter" for all menu items.