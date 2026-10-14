# DUKAAN 2.0 – FULL PRODUCT, STRATEGIC & TECHNICAL CONTEXT

This file is meant to give a contextual foundation to Claude Code
so that all subsequent code generation is aligned, accurate and
bug-free from the start.

---

## SECTION 1 – COMPETITION & PERSONAL STAKES

**Competition:** Paradox Hacks 2026  
**Event:** Breeze'26 at Shiv Nadar University  
**Support:** Masters’ Union

**Prize Structure:**

- All prizes are _in kind_, not cash.
- Top worth: ₹5,00,000 of resources / credits / tools.
- Masters’ Union degree worth ~₹22,65,000.
  - 1st Place: 80% discount (~₹18L value)
  - 2nd Place: 50% discount (~₹11L value)
  - 3rd Place: 20% discount (~₹4.5L value)

**Personal Goal:**  
I want to win 1st place to unlock the 80% discount Masters’ Union degree.  
If I don’t win, my career progression is significantly impacted due
to limited budget for advanced education. This project is crucial
for my future.

---

## SECTION 2 – HIGH-LEVEL VISION

**Product:**  
Dukaan 2.0 – an AI-Adaptive Commerce OS built on top of a grocery
commerce app.

**Core Vision:**  
Not just a grocery app.  
An _adaptive business OS_ that transforms to serve multiple small
business types like:

- Grocery / Kirana
- Salon
- Restaurant
- Chemist
- Other (AI determined)

**One Clear Narrative:**  
Same codebase.  
Different business experiences.  
Adaptive UX based on business context collected via AI.

This _visible adaptability_ is a core judge magnet.

---

## SECTION 3 – WHAT THIS APP IS (TECH & ARCHITECTURE)

**Frontend Stack:**

- React (v19.1.1)
- TypeScript
- Vite
- Tailwind CSS (CDN)

**State Management:**

- React Context API
- useState useEffect inside App.tsx

**Storage:**

- localStorage only
- No backend
- No WebSocket / Webhooks

**AI Integration:**

- Gemini API (gemini-2.5-flash)
- AI used for:
  - Dynamic onboarding questions
  - Insights generation
  - OCR bill parsing

**Deployment:**

- GitHub Pages (static)
- No server

---

## SECTION 4 – EXISTING SYSTEM (WHAT CURRENT CODE DOES)

**App.tsx Responsibilities:**

- Controls activeScreen using a switch
- Runs simulated order engine (every 20–40 sec)
- Manages global states for orders, products, modals
- Persists orders and products to localStorage
- Handles stock deduction logic

**BottomNav:**
Currently hardcoded 5 screens:

- Dashboard
- Sales
- Orders
- Catalog
- Settings

**Order Flow:**

1. Simulated order arrives
2. NewOrderModal shows
3. User accepts (swipe)
4. Stock deducts
5. QR payment screen
6. Order marked complete

**AI Behavior:**

- Onboarding collects business context
- Insights run via streaming JSON parse
- Bill OCR integrated

---

## SECTION 5 – WHAT WE ARE ADDING (FEATURE REQUIREMENTS)

### Adaptive Navigation

Purpose:
Make UI adapt to _business type_ from onboarding.

Tabs MUST:

- Remain in same physical order
- Remain same navigation keys
- Only change labels dynamically
- Keep underlying screens intact

**Preset Tab Labels:**

Grocery:

Dashboard | Sales | Orders | Catalog | Settings

Salon:

Dashboard | Sales | Appointments | Services | Settings

Restaurant:

Dashboard | Sales | Orders | Menu | Settings

Chemist:

Dashboard | Sales | Orders | Medicines | Settings

Other:
Use AI context to pick:

- What label to use for Orders
- What label to use for Catalog

### Rules:

- Dashboard / Sales / Settings NEVER change
- Tabs are only relabeled
- activeScreen keys remain the same:  
  `DASHBOARD | SALES | ORDERS | CATALOG | SETTINGS`
- Icons remain unchanged
- Demo safe -> no new screens
- Performance must stay smooth

---

## SECTION 6 – WHY THIS MATTERS

If the onboarding collects context but UI stays static,
then adaptation is only cosmetic.

If the UI _visibly changes_ to fit business type,
judges immediately understand:

**“This is an adaptive AI Business OS.”**

This is a _killer differentiation_ in the hackathon.

---

## SECTION 7 – WHAT CLOUD CODE MUST NOT DO

Please _strictly avoid_ the following:

- Adding backend infrastructure
- Introducing routing libraries (react-router)
- Refactoring global architecture
- Using new state libraries (Redux / Zustand)
- Changing order lifecycle logic
- Modifying localStorage keys or structure
- Adding tests
- Adding authentication logic

Cloud Code must assume:

- Code will run in GitHub Pages
- Client-only environment
- Static hosting

---

## SECTION 8 – DEMO SUCCESS CRITERIA

Cloud Code must generate code that:

- Compiles without TypeScript errors
- Renders adaptive tabs correctly
- Does not break existing flows
- Shows dynamic labels per business type
- Preserves order workflow
- Has zero runtime errors
- Loads fast (<2s)
- Works on mobile screens

Judge Focus Areas:

- Business viability
- UX clarity
- Scalability potential
- AI adaptation visible
- Stability

---

## SECTION 9 – TAB ADAPTIVE IMPLEMENTATION PLAN

1. Add `/data/businessTabPresets.ts`
   - Contains preset tab configs
2. Add `/utils/tabResolver.ts`
   - Resolves tab labels from business type + AI context
3. Modify `App.tsx`
   - Read `dukan-store-category`
   - Read AI context
   - Generate `tabs` array
4. Modify `BottomNav.tsx`
   - Render nav based on `tabs.map()`
5. Ensure navigation keys stay unchanged
6. Add optional `useBusinessLabel` for UI headers

---

## SECTION 10 – WHY THIS FEATURE WINS

This feature demonstrates:

- AI-enabled UX adaptation
- Cross-business applicability
- Minimal, safe, stable integration
- Visible, judge-friendly change
- Business-first thinking
- Strategic prioritization of reliability over complexity

---

## END OF CONTEXT
