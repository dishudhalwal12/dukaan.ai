import { checkoutHtml } from './checkoutHtml.generated.js';

/** The MCP App resource that renders the checkout card. */
export const CHECKOUT_URI = 'ui://dukaan/checkout.html';

/**
 * The content item for `resources/read`.
 *
 * CSP is attached to the content item (not the registration) because the
 * content item's metadata takes precedence in hosts that support MCP Apps.
 * The card makes no network requests: it calls MCP tools through the host.
 */
export function checkoutResourceContents() {
  return {
    contents: [
      {
        uri: CHECKOUT_URI,
        mimeType: 'text/html;profile=mcp-app',
        text: checkoutHtml,
        _meta: {
          ui: {
            csp: {
              connectDomains: [],
              resourceDomains: [],
            },
            prefersBorder: false,
          },
        },
      },
    ],
  };
}
