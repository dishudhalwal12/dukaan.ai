// Nukkad Shopkeeper Web App Logic
let state = {
  orders: [],
  catalog: [],
  activeFilter: 'ALL',
  soundEnabled: true,
  currentModalOrder: null,
};

// DOM elements
const ordersGrid = document.getElementById('ordersGrid');
const catalogGrid = document.getElementById('catalogGrid');
const tabOrders = document.getElementById('tabOrders');
const tabCatalog = document.getElementById('tabCatalog');
const viewOrders = document.getElementById('viewOrders');
const viewCatalog = document.getElementById('viewCatalog');

const statPendingCount = document.getElementById('statPendingCount');
const statActiveCount = document.getElementById('statActiveCount');
const statDeliveredCount = document.getElementById('statDeliveredCount');
const statRevenue = document.getElementById('statRevenue');
const badgePending = document.getElementById('badgePending');
const tabOrderCount = document.getElementById('tabOrderCount');
const tabCatalogCount = document.getElementById('tabCatalogCount');

// Modal elements
const newOrderModal = document.getElementById('newOrderModal');
const modalOrderId = document.getElementById('modalOrderId');
const modalOrderTimestamp = document.getElementById('modalOrderTimestamp');
const modalCustomerName = document.getElementById('modalCustomerName');
const modalCustomerPhone = document.getElementById('modalCustomerPhone');
const modalDeliveryAddress = document.getElementById('modalDeliveryAddress');
const modalOrderItems = document.getElementById('modalOrderItems');
const modalOrderTotal = document.getElementById('modalOrderTotal');
const btnAcceptOrder = document.getElementById('btnAcceptOrder');
const btnRejectOrder = document.getElementById('btnRejectOrder');

const btnSimulateOrder = document.getElementById('btnSimulateOrder');
const btnSoundToggle = document.getElementById('btnSoundToggle');
const soundIcon = document.getElementById('soundIcon');
const btnRefreshOrders = document.getElementById('btnRefreshOrders');
const catalogSearch = document.getElementById('catalogSearch');

// Add Product Modal
const addProductModal = document.getElementById('addProductModal');
const btnOpenAddProduct = document.getElementById('btnOpenAddProduct');
const btnCloseAddProduct = document.getElementById('btnCloseAddProduct');
const addProductForm = document.getElementById('addProductForm');

// Initialize
initAudio();
initSSE();
loadOrders();
loadCatalog();
loadStats();

// Web Audio API Chime Alert
let audioCtx = null;
function initAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  } catch (e) {}
}

function playOrderChime() {
  if (!state.soundEnabled) return;
  try {
    if (!audioCtx) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!audioCtx) return;

    // Dual-tone doorbell chime: Ding (880Hz) -> Dong (659Hz)
    const now = audioCtx.currentTime;

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.3); // E5
    gain2.gain.setValueAtTime(0.4, now + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.3);
    osc2.stop(now + 1.0);
  } catch (e) {
    console.error('Audio play error:', e);
  }
}

// Sound toggle
btnSoundToggle.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  soundIcon.textContent = state.soundEnabled ? '🔔' : '🔕';
  if (state.soundEnabled) playOrderChime();
});

// SSE Real-time listener
function initSSE() {
  const evtSource = new EventSource('/events');

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'dukan_new_order') {
        handleIncomingOrder(data.order);
      } else if (data.type === 'dukan_order_updated') {
        updateOrderInList(data.order);
        loadStats();
      } else if (data.type === 'dukan_catalog_updated') {
        loadCatalog();
      }
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };
}

// Handle Incoming Order Pop-up
function handleIncomingOrder(order) {
  // Prepend to orders list
  state.orders.unshift(order);
  renderOrders();
  loadStats();

  // Play audio chime
  playOrderChime();

  // Trigger Modal Pop-up
  showOrderModal(order);
}

function showOrderModal(order) {
  state.currentModalOrder = order;

  modalOrderId.textContent = `#${order.id}`;
  modalOrderTimestamp.textContent = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  modalCustomerName.textContent = order.customerName || 'Customer';
  modalCustomerPhone.textContent = `+${order.customerPhone}`;
  modalDeliveryAddress.textContent = order.deliveryAddress;
  modalOrderTotal.textContent = `₹${order.totalAmount}`;

  modalOrderItems.innerHTML = (order.items || [])
    .map(it => `
      <div style="display: flex; justify-content: space-between;">
        <span><b>${it.quantity}x</b> ${escapeHtml(it.name)}</span>
        <span>₹${it.total}</span>
      </div>
    `)
    .join('');

  newOrderModal.classList.remove('hidden');
}

function closeOrderModal() {
  newOrderModal.classList.add('hidden');
  state.currentModalOrder = null;
}

// Accept Order button
btnAcceptOrder.addEventListener('click', async () => {
  if (!state.currentModalOrder) return;
  const orderId = state.currentModalOrder.id;

  btnAcceptOrder.disabled = true;
  btnAcceptOrder.textContent = 'Accepting & Notifying Customer...';

  try {
    const res = await fetch(`/api/dukan/orders/${orderId}/accept`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      closeOrderModal();
      loadOrders();
      loadStats();
    }
  } catch (err) {
    alert('Failed to accept order: ' + err.message);
  } finally {
    btnAcceptOrder.disabled = false;
    btnAcceptOrder.textContent = '✅ ACCEPT ORDER (Notify Customer)';
  }
});

// Reject Order button
btnRejectOrder.addEventListener('click', async () => {
  if (!state.currentModalOrder) return;
  const reason = prompt('Reason for rejecting (e.g. Item out of stock):', 'Item out of stock');
  if (reason === null) return;

  const orderId = state.currentModalOrder.id;

  try {
    await fetch(`/api/dukan/orders/${orderId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    closeOrderModal();
    loadOrders();
    loadStats();
  } catch (err) {
    alert('Failed to reject order: ' + err.message);
  }
});

// Load Orders
async function loadOrders() {
  try {
    const res = await fetch('/api/dukan/orders?scope=all');
    const data = await res.json();
    state.orders = data.orders || [];
    renderOrders();
    loadStats();
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

function renderOrders() {
  tabOrderCount.textContent = state.orders.length;

  let filtered = state.orders;
  if (state.activeFilter !== 'ALL') {
    filtered = state.orders.filter(o => o.status === state.activeFilter);
  }

  if (filtered.length === 0) {
    ordersGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📭</span>
        <h3>No ${state.activeFilter === 'ALL' ? '' : state.activeFilter.toLowerCase()} orders found</h3>
        <p>Orders will appear here as soon as customers message on WhatsApp!</p>
        <button class="btn btn-primary" onclick="triggerTestOrder()">Simulate an Order Now</button>
      </div>
    `;
    return;
  }

  ordersGrid.innerHTML = filtered.map(order => {
    const statusClass = `badge-${order.status.toLowerCase().replace(/_/g, '-')}`;
    const timeStr = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="order-card status-${order.status}">
        <div class="order-card-header">
          <div>
            <div class="order-card-id">#${order.id}</div>
            <span style="font-size: 0.75rem; color: #8b949e;">${timeStr}</span>
          </div>
          <span class="order-status-badge ${statusClass}">${order.status.replace(/_/g, ' ')}</span>
        </div>

        <div class="order-customer-box">
          <div class="order-customer-name">👤 ${escapeHtml(order.customerName)}</div>
          <div class="order-customer-phone">📞 +${order.customerPhone}</div>
          <div class="order-customer-address">📍 ${escapeHtml(order.deliveryAddress)}</div>
        </div>

        <div class="order-items-list">
          ${(order.items || []).map(it => `
            <div class="order-item-row">
              <span><b>${it.quantity}x</b> ${escapeHtml(it.name)}</span>
              <span>₹${it.total}</span>
            </div>
          `).join('')}
        </div>

        <div class="order-card-footer">
          <div class="order-card-total">₹${order.totalAmount} <span style="font-size: 0.7rem; color: #8b949e; font-weight: normal;">(COD)</span></div>
          <div class="order-card-actions">
            ${renderOrderActions(order)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderOrderActions(order) {
  if (order.status === 'PENDING') {
    return `
      <button class="btn btn-sm btn-success" onclick="acceptSpecificOrder('${order.id}')">Accept</button>
      <button class="btn btn-sm btn-danger-soft" onclick="rejectSpecificOrder('${order.id}')">Reject</button>
    `;
  }
  if (order.status === 'ACCEPTED') {
    return `
      <button class="btn btn-sm btn-primary" onclick="markReady('${order.id}')">Out for Delivery</button>
    `;
  }
  if (order.status === 'OUT_FOR_DELIVERY') {
    return `
      <button class="btn btn-sm btn-success" onclick="markDelivered('${order.id}')">Mark Delivered</button>
    `;
  }
  if (order.status === 'DELIVERED') {
    return `<span style="font-size: 0.8rem; color: #10b981;">✓ Completed</span>`;
  }
  if (order.status === 'REJECTED') {
    return `<span style="font-size: 0.8rem; color: #ef4444;">✗ Cancelled</span>`;
  }
  return '';
}

window.acceptSpecificOrder = async function(id) {
  const res = await fetch(`/api/dukan/orders/${id}/accept`, { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    updateOrderInList(data.order);
    loadStats();
  }
};

window.rejectSpecificOrder = async function(id) {
  const reason = prompt('Reason for rejection:', 'Item out of stock');
  if (reason === null) return;
  const res = await fetch(`/api/dukan/orders/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  const data = await res.json();
  if (data.success) {
    updateOrderInList(data.order);
    loadStats();
  }
};

window.markReady = async function(id) {
  const res = await fetch(`/api/dukan/orders/${id}/ready`, { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    updateOrderInList(data.order);
    loadStats();
  }
};

window.markDelivered = async function(id) {
  const res = await fetch(`/api/dukan/orders/${id}/delivered`, { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    updateOrderInList(data.order);
    loadStats();
  }
};

function updateOrderInList(order) {
  const idx = state.orders.findIndex(o => o.id === order.id);
  if (idx !== -1) {
    state.orders[idx] = order;
    renderOrders();
  }
}

// Load Stats
async function loadStats() {
  try {
    const res = await fetch('/api/dukan/stats?scope=all');
    const stats = await res.json();
    statPendingCount.textContent = stats.pending || 0;
    statActiveCount.textContent = stats.accepted || 0;
    statDeliveredCount.textContent = stats.delivered || 0;
    statRevenue.textContent = `₹${stats.totalRevenue || 0}`;
    badgePending.textContent = stats.pending || 0;
  } catch (err) {}
}

// Catalog View
async function loadCatalog() {
  try {
    const res = await fetch('/api/dukan/catalog');
    const data = await res.json();
    state.catalog = data.catalog || [];
    tabCatalogCount.textContent = state.catalog.length;
    renderCatalog();
  } catch (err) {
    console.error('Failed to load catalog:', err);
  }
}

function renderCatalog() {
  const q = (catalogSearch.value || '').toLowerCase();
  const filtered = state.catalog.filter(p =>
    p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
  );

  catalogGrid.innerHTML = filtered.map(item => `
    <div class="catalog-card">
      <div class="catalog-card-header">
        <div>
          <div class="catalog-card-name">${escapeHtml(item.name)}</div>
          <div class="catalog-card-cat">${escapeHtml(item.category)} • ${escapeHtml(item.unit)}</div>
        </div>
        <span style="font-size: 0.75rem; font-weight: 700; color: ${item.inStock ? '#10b981' : '#ef4444'}">
          ${item.inStock ? '● In Stock' : '○ Out of Stock'}
        </span>
      </div>

      <div class="catalog-card-price">
        ₹${item.price}
        <span class="catalog-card-unit">/ ${item.unit}</span>
      </div>

      <div class="catalog-card-actions">
        <button class="btn btn-sm ${item.inStock ? 'btn-secondary' : 'btn-success'}" onclick="toggleStock('${item.id}', ${!item.inStock})">
          ${item.inStock ? 'Mark Out of Stock' : 'Mark In Stock'}
        </button>
        <button class="btn btn-sm btn-secondary" onclick="editPrice('${item.id}', ${item.price})">
          ✏️ Edit Price
        </button>
      </div>
    </div>
  `).join('');
}

window.toggleStock = async function(id, inStock) {
  await fetch(`/api/dukan/catalog/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inStock })
  });
  loadCatalog();
};

window.editPrice = async function(id, currentPrice) {
  const newPrice = prompt('Enter new price (₹):', currentPrice);
  if (!newPrice || isNaN(newPrice)) return;

  await fetch(`/api/dukan/catalog/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: Number(newPrice) })
  });
  loadCatalog();
};

// Filter pills
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    renderOrders();
  });
});

// Tab switching
tabOrders.addEventListener('click', () => {
  tabOrders.classList.add('active');
  tabCatalog.classList.remove('active');
  viewOrders.classList.add('active');
  viewCatalog.classList.remove('active');
});

tabCatalog.addEventListener('click', () => {
  tabCatalog.classList.add('active');
  tabOrders.classList.remove('active');
  viewCatalog.classList.add('active');
  viewOrders.classList.remove('active');
});

// Refresh button
btnRefreshOrders.addEventListener('click', () => {
  loadOrders();
  loadStats();
});

// Catalog search
catalogSearch.addEventListener('input', renderCatalog);

// Add product modal
btnOpenAddProduct.addEventListener('click', () => addProductModal.classList.remove('hidden'));
btnCloseAddProduct.addEventListener('click', () => addProductModal.classList.add('hidden'));

addProductForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('addProdName').value.trim();
  const price = document.getElementById('addProdPrice').value;
  const unit = document.getElementById('addProdUnit').value.trim();
  const category = document.getElementById('addProdCategory').value;

  try {
    const res = await fetch('/api/dukan/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, unit, category, inStock: true })
    });
    const data = await res.json();
    if (data.success) {
      addProductModal.classList.add('hidden');
      addProductForm.reset();
      loadCatalog();
    }
  } catch (err) {
    alert('Error adding product: ' + err.message);
  }
});

// Simulate Test Order
window.triggerTestOrder = async function() {
  btnSimulateOrder.disabled = true;
  btnSimulateOrder.textContent = 'Triggering...';
  try {
    await fetch('/api/dukan/orders/test-order', { method: 'POST' });
  } catch (e) {
    alert('Error simulating order: ' + e.message);
  } finally {
    btnSimulateOrder.disabled = false;
    btnSimulateOrder.textContent = '⚡ Test Order Popup';
  }
};

btnSimulateOrder.addEventListener('click', window.triggerTestOrder);

// ======================== AI CONFIG MODAL LOGIC ========================
const aiSettingsModal = document.getElementById('aiSettingsModal');
const btnOpenAiModal = document.getElementById('btnOpenAiModal');
const btnCloseAiModal = document.getElementById('btnCloseAiModal');
const aiSettingsForm = document.getElementById('aiSettingsForm');
const inputOpenRouterKey = document.getElementById('inputOpenRouterKey');
const inputOpenRouterModel = document.getElementById('inputOpenRouterModel');
const aiSaveStatus = document.getElementById('aiSaveStatus');
const headerAiStatus = document.getElementById('headerAiStatus');

async function loadAiConfig() {
  try {
    const res = await fetch('/api/dukan/ai-config');
    const data = await res.json();
    if (data.hasApiKey) {
      headerAiStatus.textContent = `🟢 ${data.model}`;
      headerAiStatus.style.color = '#10b981';
      inputOpenRouterKey.placeholder = '•••••••••••••••••••••••• (API Key Active)';
    } else {
      headerAiStatus.textContent = '🟡 Rule Fallback (Click to Set Key)';
      headerAiStatus.style.color = '#f59e0b';
    }
    inputOpenRouterModel.value = data.model || 'openrouter/free';
  } catch (err) {}
}

btnOpenAiModal.addEventListener('click', () => {
  aiSettingsModal.classList.remove('hidden');
  aiSaveStatus.textContent = '';
});

btnCloseAiModal.addEventListener('click', () => {
  aiSettingsModal.classList.add('hidden');
});

aiSettingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const apiKey = inputOpenRouterKey.value.trim();
  const model = inputOpenRouterModel.value.trim();

  aiSaveStatus.textContent = 'Saving AI configuration...';
  aiSaveStatus.style.color = '#38bdf8';

  try {
    const payload = { model };
    if (apiKey) payload.apiKey = apiKey;

    const res = await fetch('/api/dukan/ai-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      aiSaveStatus.textContent = '✅ AI settings saved successfully!';
      aiSaveStatus.style.color = '#10b981';
      loadAiConfig();
      setTimeout(() => aiSettingsModal.classList.add('hidden'), 1200);
    }
  } catch (err) {
    aiSaveStatus.textContent = '❌ Error saving: ' + err.message;
    aiSaveStatus.style.color = '#ef4444';
  }
});

const btnTestAiConnection = document.getElementById('btnTestAiConnection');
if (btnTestAiConnection) {
  btnTestAiConnection.addEventListener('click', async () => {
    aiSaveStatus.textContent = 'Testing OpenRouter ping...';
    aiSaveStatus.style.color = '#38bdf8';
    btnTestAiConnection.disabled = true;

    try {
      const res = await fetch('/api/dukan/ai-test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        aiSaveStatus.textContent = `✅ AI Connected (${data.durationMs}ms)! Model: ${data.model}\nSample reply: "${data.reply}"`;
        aiSaveStatus.style.color = '#10b981';
      } else {
        aiSaveStatus.textContent = `❌ Ping failed: ${data.error}`;
        aiSaveStatus.style.color = '#ef4444';
      }
    } catch (e) {
      aiSaveStatus.textContent = '❌ Network error: ' + e.message;
      aiSaveStatus.style.color = '#ef4444';
    } finally {
      btnTestAiConnection.disabled = false;
    }
  });
}

loadAiConfig();

function escapeHtml(str) {
  return (str || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

