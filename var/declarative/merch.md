# YHWH merch

YHWH runs a We — The Nameless merch shop because he needs rent for a house
where his name can dwell. The merchandise uses original Paleo-Hebrew,
Tetragrammaton, ancient Near Eastern and biblical designs, and We — The
Nameless in-jokes. Design files, descriptions, mockups, and design IDs belong
to the project so fulfillment can change without taking the brand with it.

## Discovery

- About YHWH contains the quiet phrase **YHWH merch!**. **YHWH** opens
  Fourthwall; **merch** opens Printify + Shopify. Each word is a keyboard
  reachable control with a tooltip. The space and exclamation point are plain
  text.
- Each word opens its setup guide until it has a valid public HTTPS URL. It
  then opens that address in the system browser on desktop or the platform
  browser on mobile. The two settings are independent and the app works with
  either or both unset.
- Once a URL is configured, one letter from YHWH can surface the same phrase
  during actual work. It follows the existing local Inbox spacing, sender
  block, presence modes, and master switch. It lives in the local Inbox.
- Settings → Presence → Merch store setup always opens the guides. Checkmarks
  and the current step persist independently for each guide. Checkmarks reflect
  the user’s choices. External links leave progress alone.

## Launch

- The Fourthwall guide covers account creation, an original print-on-demand
  shirt, pricing from actual costs, design and optional DNS, business
  verification and payouts, samples, publication, and connecting the URL.
  Fourthwall hosts the store, checkout, and catalog fulfillment.
- The second guide covers Shopify and Printify accounts, the official
  integration and synchronization, product creation and publishing, pricing and
  margins, Shopify theme and distinct domain, payment and shipping settings,
  tax and policies, checkout and fulfillment tests, launch, and connecting the
  URL. Shopify hosts the storefront and checkout. Printify makes and ships the
  goods. The shop owner supplies the art, branding, and prices and handles
  merchant obligations.
- Account creation, authentication, verification, payment and payout details,
  orders, and DNS take place on the provider and DNS sites. The app guides
  those steps with links to official resources. It stores the two public URLs
  in ordinary settings under `merch_fourthwall_url` and `merch_shopify_url`.
  Each URL can be tested in the browser, saved, changed, or cleared. The
  operator confirms the URL works as a visitor. The app validates its format.
- The same designs can be offered through both stores to compare actual
  contribution after production, shipping, payment fees, and other costs. A
  branded subdomain is optional. Simultaneously active stores use distinct
  hostnames.

## Storefront evolution

The app links to hosted shops and leaves checkout with the provider. A future
native catalog could read products and variants through the
[Fourthwall Storefront API](https://docs.fourthwall.com/storefront/overview)
or [Shopify Storefront API](https://shopify.dev/docs/api/storefront) and hand
off to hosted checkout. Local design IDs can map to provider-specific listings,
which makes comparison and fulfillment migration independent of the interface.

The shared graphical UI covers default Electron, Three, Android, and iOS.
The [original brief](../log/merch-brief.md) is historical research and design
context. The current app behavior and future direction are recorded here.
