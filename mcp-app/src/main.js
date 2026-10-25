import { App, PostMessageTransport, applyDocumentTheme } from '@modelcontextprotocol/ext-apps';
import './style.css';

const app = new App({ name: 'Dukaan Checkout', version: '1.0.0' }, {});
const root = document.getElementById('root');

let quote = null;
let placing = false;
let placed = null;
let error = null;

const rupees = (value) => (typeof value === 'string' ? value : `₹${Number(value || 0).toFixed(2)}`);

function render() {
  if (placed) {
    root.innerHTML = `
      <div class="card receipt">
        <div class="tick">✓</div>
        <h1>Order placed</h1>
        <p class="sub">${escapeHtml(placed.order_id)} · ${escapeHtml(placed.shop?.name || 'Shop')}</p>
        <p class="sub">Total ${escapeHtml(placed.total_display || rupees(placed.total))} · cash on delivery</p>
        <p class="note">The shop will accept or reject it. Ask your assistant for the status at any time.</p>
      </div>`;
    return;
  }

  if (!quote) {
    root.innerHTML = '<p class="loading">Waiting for the order preview…</p>';
    return;
  }

  const lines = (quote.items || []).map((item) => `
    <li class="line">
      <span>${item.quantity} × ${escapeHtml(item.name)} <span class="sub">(${escapeHtml(item.unit || '')})</span></span>
      <span>${escapeHtml(item.total || rupees((item.pricePaise || 0) * (item.quantity || 1) / 100))}</span>
    </li>`).join('');

  root.innerHTML = `
    <div class="card">
      <div class="head">
        <div>
          <h1>${escapeHtml(quote.shop?.name || 'Your order')}</h1>
          <p class="sub">${quote.distance_km ? `${quote.distance_km} km away · ` : ''}Cash on delivery</p>
        </div>
        <span class="badge">Draft</span>
      </div>
      <ul class="lines">${lines}</ul>
      <div class="total"><span>Total</span><span>${escapeHtml(quote.total_display || rupees(quote.total))}</span></div>
      <p class="address"><strong>Deliver to:</strong> ${escapeHtml(quote.address || '')}</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      <div class="actions">
        <button type="button" id="cancel">Close</button>
        <button type="button" class="primary" id="place" ${placing ? 'disabled' : ''}>
          ${placing ? 'Placing…' : 'Place order'}
        </button>
      </div>
      <p class="note">Only place this order if you have confirmed the items, total, and address.</p>
    </div>`;

  document.getElementById('place')?.addEventListener('click', place);
  document.getElementById('cancel')?.addEventListener('click', () => {
    quote = null;
    error = null;
    render();
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function place() {
  if (!quote || placing) return;
  placing = true;
  error = null;
  render();
  try {
    const result = await app.callServerTool({
      name: 'place_order',
      arguments: { quote_id: quote.quote_id, confirmed: true },
    });
    if (result?.isError) {
      error = result.structuredContent?.message || result.content?.[0]?.text || 'The order could not be placed.';
    } else if (result?.structuredContent?.order) {
      placed = result.structuredContent.order;
    } else {
      error = 'The order could not be placed. Ask your assistant to try again.';
    }
  } catch (caught) {
    error = caught?.message || 'The order could not be placed.';
  } finally {
    placing = false;
    render();
  }
}

app.ontoolresult = (params) => {
  const structured = params?.structuredContent;
  if (structured?.order) {
    placed = structured.order;
  } else if (structured?.quote) {
    quote = structured.quote;
    error = null;
  }
  render();
};

app.onhostcontextchanged = (context) => {
  if (context?.theme) applyDocumentTheme(context.theme);
};

app.onteardown = async () => ({});

render();

async function init() {
  try {
    await app.connect(new PostMessageTransport(window.parent, window.parent));
    const context = app.getHostContext();
    if (context?.theme) applyDocumentTheme(context.theme);
  } catch (caught) {
    root.innerHTML = `<div class="card"><div class="error">Could not connect to the host: ${escapeHtml(caught?.message || 'unknown error')}</div></div>`;
  }
}

void init();
