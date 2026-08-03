# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tmp-card-audit.spec.ts >> capture card route analysis views
- Location: tmp-card-audit.spec.ts:5:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /Market analysis/i }).first()
    - locator resolved to <button disabled type="button" aria-busy="false" aria-pressed="false" class="feature-button">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    55 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - link "Pokélyzer home" [ref=e7] [cursor=pointer]:
        - /url: /
        - generic [ref=e13]: Pokélyzer
      - navigation "Main" [ref=e14]:
        - link "Dashboard" [ref=e15] [cursor=pointer]:
          - /url: /
        - link "Explore" [ref=e16] [cursor=pointer]:
          - /url: /search
        - link "Portfolio" [ref=e17] [cursor=pointer]:
          - /url: /portfolio
        - generic [ref=e18]: Card detail
      - generic [ref=e19]:
        - button "Search cards" [ref=e20] [cursor=pointer]:
          - generic [ref=e25]: Ctrl K
        - button "Sign up" [ref=e26] [cursor=pointer]
        - button "Log in" [ref=e27] [cursor=pointer]
  - main [ref=e28]:
    - generic [ref=e30]:
      - generic [ref=e33]:
        - img "Blaine's Charizard" [ref=e35]
        - generic [ref=e36]:
          - generic [ref=e37]:
            - generic [ref=e38]:
              - text: 002/132
              - generic [ref=e39]: Card number 002/132
              - heading "Blaine's Charizard" [level=2] [ref=e40]
              - paragraph [ref=e41]:
                - img "Gym Challenge symbol" [ref=e42]
                - generic [ref=e43]: Gym Challenge
                - generic [ref=e44]: •
                - generic [ref=e45]: Gym
              - generic [ref=e46]:
                - generic [ref=e47]: Rare Holo
                - generic [ref=e48]: Stage 2
            - button "Add to portfolio" [ref=e50] [cursor=pointer]:
              - generic [ref=e53]: Portfolio
          - generic [ref=e54]:
            - link "Buy TCGPlayer listing" [ref=e55] [cursor=pointer]:
              - /url: https://prices.pokemontcg.io/tcgplayer/gym2-2
              - generic [ref=e56]:
                - generic [ref=e57]: TCGPlayer
                - generic [ref=e58]: Buy
              - strong [ref=e63]: $594.19
            - link "Buy Cardmarket listing" [ref=e64] [cursor=pointer]:
              - /url: https://prices.pokemontcg.io/cardmarket/gym2-2
              - generic [ref=e65]:
                - generic [ref=e66]: Cardmarket
                - generic [ref=e67]: Buy
              - strong [ref=e72]: €630.65
          - generic [ref=e73]:
            - generic [ref=e81]:
              - generic [ref=e82]: Artist
              - generic [ref=e83]: Ken Sugimori
            - generic [ref=e87]:
              - generic [ref=e88]: Released
              - generic [ref=e89]: 16 Oct 2000
          - button "Switch Card" [ref=e91] [cursor=pointer]
      - generic [ref=e93]:
        - generic [ref=e94]:
          - generic [ref=e95]:
            - strong [ref=e101]: 1 Credit
            - generic [ref=e102]: per analysis
          - generic [ref=e104]:
            - button "Log in" [ref=e105] [cursor=pointer]
            - generic [ref=e106]: or
            - link "Sign up" [ref=e107] [cursor=pointer]:
              - /url: /signup
            - generic [ref=e108]: for free credits
        - generic [ref=e109]:
          - button "Market analysis TCGPlayer, Cardmarket & sales history" [disabled] [ref=e110]:
            - generic [ref=e115]:
              - generic [ref=e116]: Market analysis
              - generic [ref=e117]: TCGPlayer, Cardmarket & sales history
          - button "Collector value AI score for long-term collectibility" [disabled] [ref=e118]:
            - generic [ref=e123]:
              - generic [ref=e124]: Collector value
              - generic [ref=e125]: AI score for long-term collectibility
          - button "eBay sold Recent comps from real sales" [disabled] [ref=e126]:
            - generic [ref=e131]:
              - generic [ref=e132]: eBay sold
              - generic [ref=e133]: Recent comps from real sales
          - button "Worth grading? PSA economics for this card" [disabled] [ref=e134]:
            - generic [ref=e139]:
              - generic [ref=e140]: Worth grading?
              - generic [ref=e141]: PSA economics for this card
          - button "Sell guidance Where and what to list for" [disabled] [ref=e142]:
            - generic [ref=e147]:
              - generic [ref=e148]: Sell guidance
              - generic [ref=e149]: Where and what to list for
```

# Test source

```ts
  1  | import { test } from "@playwright/test";
  2  | 
  3  | const outDir = "C:/tmp/pokeanalyzer-card-audit";
  4  | 
  5  | test("capture card route analysis views", async ({ page }) => {
  6  |   await page.setViewportSize({ width: 1462, height: 900 });
  7  |   await page.goto("http://localhost:5173/card/gym2-2", {
  8  |     waitUntil: "networkidle",
  9  |   });
  10 |   await page.screenshot({
  11 |     path: `${outDir}/01-default.png`,
  12 |     fullPage: true,
  13 |   });
  14 | 
  15 |   const views = [
  16 |     ["02-market-analysis", /Market analysis/i],
  17 |     ["03-collector-value", /Collector value/i],
  18 |     ["04-ebay-sold", /eBay sold/i],
  19 |     ["05-worth-grading", /Worth grading/i],
  20 |     ["06-sell-guidance", /Sell guidance/i],
  21 |   ] as const;
  22 | 
  23 |   for (const [name, label] of views) {
  24 |     const button = page.getByRole("button", { name: label }).first();
  25 |     await button.scrollIntoViewIfNeeded();
> 26 |     await button.click();
     |                  ^ Error: locator.click: Test timeout of 30000ms exceeded.
  27 |     await page.waitForLoadState("networkidle").catch(() => undefined);
  28 |     await page.waitForTimeout(3500);
  29 |     await page.screenshot({
  30 |       path: `${outDir}/${name}.png`,
  31 |       fullPage: true,
  32 |     });
  33 |   }
  34 | });
  35 | 
```