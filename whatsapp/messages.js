/**
 * Every message the customer sees, with several phrasings per situation.
 *
 * Why this file exists: the bot used to send one fixed string for each situation,
 * so every customer got word-for-word the same text and it read like a machine.
 * Each family below holds 10 to 12 variants; one is picked at random per send.
 *
 * Rules for every string in here:
 *   - Human and polite, the way a helpful shop assistant writes.
 *   - No em dashes or en dashes. Plain sentences and commas.
 *   - At most one emoji, and only where it carries meaning. No emoji strings.
 *   - Placeholders in {braces} are filled by the named builders at the bottom.
 *
 * Tests pin the picker with setMessageRandom() so a run is reproducible.
 */

export const MESSAGE_TEMPLATES = {
  // --- Onboarding: the customer sent "/hey", we need their location pin --------
  welcome: [
    `Hi, welcome to Dukaan. 📍\n\nFirst send me your location so I can find the store closest to you.\n\nTap + next to the message box, then Location, then Send your current location.`,
    `Hello! Good to have you here.\n\nShare your location pin and I will connect you to the nearest store.\n\nTap +, choose Location, and tap Send your current location. 📍`,
    `Welcome to Dukaan.\n\nI only need one thing to start: your location pin. That is how I pick the right store for your area.\n\nTap + then Location then Send your current location.`,
    `Hi there. 📍\n\nTo order, please send your current location first so I can match you with the nearest store.\n\nTap + next to the message box, then Location, then Send your current location.`,
    `Thanks for reaching out.\n\nPlease share your location pin and I will find the store closest to you.\n\nTap +, tap Location, then Send your current location. 📍`,
    `Hello and welcome.\n\nYour location tells me which store serves you, so send that first.\n\nTap +, choose Location, and tap Send your current location.`,
    `Hi! Let us get your order to the right store. 📍\n\nSend me your current location and I will connect you to the nearest one.\n\nTap + then Location then Send your current location.`,
    `Welcome aboard.\n\nOne quick step: send your location pin so I know which store is closest to you.\n\nTap +, pick Location, and tap Send your current location. 📍`,
    `Hello! I am the Dukaan ordering assistant.\n\nSend your current location and I will set you up with the nearest store.\n\nTap + then Location then Send your current location.`,
    `Hi, glad you are here. 📍\n\nShare your location and I will route you to the closest store.\n\nTap + next to the message box, then Location, then Send your current location.`,
    `Welcome to Dukaan.\n\nTo connect you to a nearby store I need your location pin first.\n\nTap +, tap Location, then Send your current location. 📍`,
    `Good to see you. 📍\n\nSend your location pin and I will take care of the rest.\n\nTap +, choose Location, then Send your current location.`,
  ],

  // --- Still waiting for the pin: patient walkthrough, no AI call -------------
  locationHowto: [
    `I still need your location pin before I can connect you to a store.\n\nTap + next to the message box, tap Location, then Send your current location. 📍`,
    `That pin has not come through yet.\n\nTap +, choose Location, and tap Send your current location. Then I can find your nearest store.`,
    `Almost there. 📍\n\nI just need the location pin.\n\nTap + next to the message box, then Location, then Send your current location.`,
    `Please send your location so I can pick the right store for you.\n\nTap +, tap Location, then Send your current location.`,
    `No pin yet, so I cannot tell which store is closest to you. 📍\n\nTap + next to the message box, choose Location, and tap Send your current location.`,
    `I am ready as soon as I have your location.\n\nTap +, tap Location, then Send your current location and I will take it from there.`,
    `Still waiting on that location pin. 📍\n\nTap + next to the message box, then Location, then Send your current location.`,
    `Location first, then we can order right away.\n\nTap +, choose Location, and tap Send your current location. 📍`,
    `I have not received your location yet, so I cannot connect a store.\n\nTap + next to the message box, tap Location, then Send your current location.`,
    `One tap away. 📍\n\nTap +, pick Location, and tap Send your current location, and I will find your nearest store.`,
    `Your pin has not arrived. Once you send it I can finish setting you up.\n\nTap +, tap Location, then Send your current location. 📍`,
    `Just the location pin and we are set.\n\nTap + next to the message box, then Location, then Send your current location. 📍`,
  ],

  // --- The store directory could not be reached: refuse rather than guess ----
  storeUnreachable: [
    `Our store directory is not responding right now, so I cannot place an order this minute.\n\nNothing has been ordered. Please try again shortly and send /hey with your location.`,
    `I cannot reach the store list at the moment. ⚠️\n\nNo order was placed. Give it a minute and send /hey with your location again.`,
    `The store directory is briefly unavailable, so I am holding off rather than guess a store.\n\nNothing was ordered. Try again in a minute with /hey and your location.`,
    `I am having trouble loading the nearby stores right now.\n\nNothing has been ordered. Please try again shortly: send /hey and share your location.`,
    `The store lookup failed just now, so I cannot take your order.\n\nNothing was placed. A short wait and another /hey with your location should fix it. ⚠️`,
    `Our store list is temporarily down, and I would rather wait than send your order somewhere wrong.\n\nNothing was ordered. Please try again in a minute with /hey and your location.`,
    `I cannot see the store directory at this moment.\n\nNo order has been placed. Try /hey with your location again in a little while.`,
    `The store directory did not answer, so I stopped before placing anything. ⚠️\n\nNothing was ordered. Please try again shortly with /hey and your location.`,
    `Something is off with the store list right now, so I cannot route an order.\n\nNothing was ordered. Send /hey with your location again in a minute.`,
    `I am unable to reach any store this moment.\n\nNothing has been ordered. Please try again soon with /hey and your location.`,
    `The store lookup is not working at the moment.\n\nNothing was ordered. Please try again in a minute and send /hey with your location. ⚠️`,
    `Our store directory is taking a short break.\n\nNothing has been ordered. Send /hey with your location in a minute and I will try again.`,
  ],

  // --- Matched store has listed nothing yet ---------------------------------
  noItemsListed: [
    `That store has not listed any items yet, so there is nothing to order from it.\n\nSend /hey with your location and I will look for another store nearby.`,
    `This store's shelf is empty for now. 📦\n\nNothing to order here yet. Send /hey with your location and I will try a nearby store.`,
    `The store you reached has no items listed, so I cannot take an order.\n\nSend /hey with your location to try another store close by.`,
    `That shop has not added its products yet.\n\nSend /hey with your location and I will find you a store that is ready to take orders. 📦`,
    `No items are listed at this store just yet.\n\nSend /hey with your location and I will check the stores around you.`,
    `This store is not set up for orders yet, so there is nothing to pick from.\n\nSend /hey with your location for a nearby store instead. 📦`,
    `The matched store has an empty catalogue right now.\n\nSend /hey with your location and I will look for one that is stocked.`,
    `Nothing is listed at that store yet, so I cannot build an order.\n\nSend /hey with your location to try a different nearby store. 📦`,
    `That store has not published any products so far.\n\nSend /hey with your location and I will route you to another one.`,
    `This shop has no items on sale yet.\n\nSend /hey with your location and I will find a store that does.`,
    `The store came back empty, so there is nothing to order from it.\n\nSend /hey with your location and I will try the next nearest store. 📦`,
    `That store is not taking orders yet because it has no items.\n\nSend /hey with your location and I will try one nearby.`,
  ],

  // --- Trying to confirm with no store connected to this chat ----------------
  noStoreConnected: [
    `I cannot place that order yet because no store is connected to your location.\n\nSend /hey and share your location pin, and I will route your order to the nearest store.`,
    `There is no store linked to your address yet, so I cannot confirm the order.\n\nSend /hey with your location and I will connect one. 📍`,
    `Before I can place this I need a store for your area.\n\nSend /hey with your location pin and I will find your nearest store.`,
    `No store is attached to this chat yet.\n\nSend /hey and share your location, then I can confirm the order properly. 📍`,
    `I do not have a store connected for you, so the order cannot go through.\n\nSend /hey with your location and I will set that up first.`,
    `This order needs a store first, and none is connected to your location yet.\n\nSend /hey with your location pin to link one. 📍`,
    `I cannot confirm without a store for your delivery area.\n\nSend /hey and share your location, and I will match you in a moment.`,
    `Your location is not linked to a store yet, so I cannot place this.\n\nSend /hey with your location and I will fix that first. 📍`,
    `There is no store to send this order to right now.\n\nSend /hey with your location pin and I will connect your nearest store.`,
    `I need a store on file before placing your order.\n\nSend /hey with your location and I will find one close to you. 📍`,
    `No store is connected to this chat, so the order cannot be placed.\n\nSend /hey with your location and I will link the nearest one.`,
    `Let us connect a store first.\n\nSend /hey with your location pin and then I can place this order. 📍`,
  ],

  // --- No store anywhere near the customer; distance known -------------------
  outOfRange: [
    `Sorry, no store in our network delivers to your area yet. The closest one is about {km} km away.\n\nNothing has been ordered. Send /hey with a different location and I will check again. 📍`,
    `Your area is a little outside our delivery range right now. The nearest store is roughly {km} km away.\n\nNothing was ordered. Try /hey with a location closer to the store.`,
    `I could not find a store that delivers to you. The closest is around {km} km away.\n\nNothing has been ordered. Send /hey with another location to try again. 📍`,
    `No store covers your location yet, the nearest being about {km} km away.\n\nNothing was ordered. A closer location may work, so send /hey with a new pin.`,
    `That address is outside our service area at the moment. The nearest store is about {km} km away.\n\nNothing has been ordered. Send /hey with a different location. 📍`,
    `We do not have a store delivering to your area yet. The nearest one sits about {km} km away.\n\nNothing was ordered. Try again with a location nearer the store.`,
    `Your location is beyond what our stores cover right now. The closest store is about {km} km away.\n\nNothing has been placed. Send /hey with another location to retry. 📍`,
    `I found no store serving your area. The closest one is about {km} km away.\n\nNothing was ordered. Send /hey with a location closer to the store and I will try again.`,
    `That spot falls outside every store we have. The nearest is around {km} km away.\n\nNothing has been ordered. Please try /hey with a different location. 📍`,
    `No nearby store delivers to your address yet. The closest is roughly {km} km away.\n\nNothing was ordered. Send /hey with a location nearer a store.`,
    `Your location is just outside our delivery network. The nearest store is about {km} km away.\n\nNothing has been ordered. Send /hey with another location to try again. 📍`,
    `The nearest store to you is about {km} km away, which is outside our range.\n\nNothing was ordered. Send /hey with a closer location and I will recheck. 📍`,
  ],

  // --- No store for this location, distance unknown --------------------------
  noStoreServing: [
    `Sorry, there is no Dukaan store serving your area right now, so I cannot take an order.\n\nNothing has been ordered. Send /hey with your location to try again later.`,
    `I could not find a store for your location, so no order was placed.\n\nSend /hey with your location whenever you want to try again. 📍`,
    `No store is available for your area at the moment.\n\nNothing was ordered. Send /hey with your location to retry.`,
    `There is no store covering your location just now.\n\nNothing has been ordered. Please try /hey with your location again later. 📍`,
    `I have no store that can serve your address right now.\n\nNothing was ordered. Send /hey with your location and I will check again later.`,
    `Your area is not covered by a Dukaan store yet.\n\nNothing has been ordered. Send /hey with your location to try again. 📍`,
    `I could not match a store to your location, so I stopped short of ordering.\n\nNothing was placed. Send /hey with your location to retry later.`,
    `No store could take this location, so no order was created.\n\nPlease send /hey with your location again in a while. 📍`,
    `There is nothing serving your address right now.\n\nNothing was ordered. Send /hey with your location whenever you would like to try again.`,
    `No store in our network covers your area today.\n\nNothing has been ordered. Send /hey with your location to check again later. 📍`,
  ],

  // --- Location pin accepted, a store is now connected -----------------------
  storeMatched: [
    `Got it, {area}. 🏪\n\nYou are connected to {store}{distance}. Tell me what you need and I will get it packed.`,
    `Thanks, {area}.\n\nYou are connected to {store}{distance}. What would you like to order?`,
    `Location saved, {area}. 🏪\n\nYou are connected to {store}{distance}. Just tell me what you need.`,
    `Perfect, {area}. 🏪\n\nYou are now connected to {store}{distance}. What can I get for you?`,
    `Thanks for the pin, {area}.\n\nYou are connected to {store}{distance}. Send me your list whenever you are ready.`,
    `Got your location, {area}. 🏪\n\nYou are connected to {store}{distance}. What would you like today?`,
    `Nice, {area}. 🏪\n\nYou are connected to {store}{distance}, so I can order from them directly. What do you need?`,
    `Location received, {area}.\n\nYou are connected to {store}{distance}. Tell me the items and I will take it from there.`,
    `All set, {area}. 🏪\n\nYou are connected to {store}{distance}. What shall I add for you?`,
    `Thanks, {area}.\n\nYou are connected to {store}{distance}. Go ahead and tell me what you would like. 🏪`,
    `Pin received, {area}. 🏪\n\nYou are connected to {store}{distance}. What can I pack for you today?`,
    `Got it, {area}. 🏪\n\nYou are connected to {store}{distance}. Send your order whenever you are ready.`,
  ],

  // --- A requested item is not in this store's catalog ----------------------
  itemUnavailable: [
    `Sorry, this store does not have: {items}. Anything else?`,
    `We are out of {items} at this store. Want something else? 🙏`,
    `This store does not stock {items}. Happy to help with anything else.`,
    `I cannot add {items}, that one is not on this store's list. Anything else?`,
    `Not available here: {items}. Let me know if you would like something different.`,
    `Sorry, {items} is not something this store carries. Anything else I can get you? 🙏`,
    `That one is not stocked at this store: {items}. Want to try something else?`,
    `I do not have {items} here. Tell me another item and I will add it.`,
    `{items} is not on this store's list, so I have left it out. Anything else?`,
    `Sorry, we do not carry {items} at this store. What else can I get you? 🙏`,
    `This store is out of {items} for now. Anything else on your list?`,
    `{items} is not available at this store. Anything else I can add?`,
  ],

  // --- The request matches more than one listing; never guess ---------------
  itemAmbiguous: [
    `Which one did you mean: {options}? Reply with the exact item and I will add it.`,
    `A couple of matches there: {options}. Which one should I add?`,
    `I want to get this right. Did you mean {options}? Tell me which one.`,
    `There is more than one match: {options}. Which would you like?`,
    `Quick check, did you mean {options}? Reply with the one you want.`,
    `Two options here: {options}. Which one shall I add?`,
    `Please confirm which item you meant: {options}?`,
    `I found a few: {options}. Which one is it?`,
    `Not sure which you meant, {options}. Tell me the exact name.`,
    `Could you pick one: {options}? I will add it right away.`,
    `Which of these did you want: {options}?`,
  ],

  // --- Order placed ----------------------------------------------------------
  orderConfirmation: [
    `Order placed, #{id} 🧾\n\n{items}\n\nTotal: ₹{total} (cash or UPI on delivery)\nAddress: {address}\n\nThe shopkeeper is checking it now. I will message you the moment it is accepted.`,
    `Your order is in, #{id} ✅\n\n{items}\n\nTotal: ₹{total}, payable by cash or UPI on delivery.\nAddress: {address}\n\nThe shopkeeper will confirm shortly, and I will let you know as soon as it is accepted.`,
    `Order confirmed, #{id} 🧾\n\n{items}\n\nTotal: ₹{total} (cash or UPI on delivery)\nAddress: {address}\n\nSending it to the shopkeeper now. I will update you the moment it is accepted.`,
    `Thanks, your order is placed as #{id} ✅\n\n{items}\n\nTotal: ₹{total}, cash or UPI on delivery.\nAddress: {address}\n\nThe shopkeeper is reviewing it, and I will message you once it is accepted.`,
    `Order #{id} is placed 🧾\n\n{items}\n\nTotal: ₹{total} (cash or UPI on delivery)\nAddress: {address}\n\nI will tell the shopkeeper right away and update you once it is accepted.`,
    `Done, order #{id} ✅\n\n{items}\n\nTotal: ₹{total}\nAddress: {address}\n\nPayment is cash or UPI on delivery. I will confirm as soon as the shopkeeper accepts it.`,
    `Your order #{id} is placed ✅\n\n{items}\n\nTotal: ₹{total} (cash or UPI on delivery)\nAddress: {address}\n\nThe shopkeeper will check it now. Expect my message the moment it is accepted.`,
    `Order received, #{id} 🧾\n\n{items}\n\nTotal: ₹{total}\nAddress: {address}\n\nPayable by cash or UPI on delivery. I will let you know once the shopkeeper accepts it.`,
    `All set, #{id} ✅\n\n{items}\n\nTotal: ₹{total} (cash or UPI on delivery)\nAddress: {address}\n\nI have sent it to the shopkeeper and will update you when it is accepted.`,
    `Order #{id} placed ✅\n\n{items}\n\nTotal: ₹{total}\nAddress: {address}\n\nCash or UPI on delivery. The shopkeeper is checking it now and I will message you as soon as it is accepted.`,
    `Placed, #{id} 🧾\n\n{items}\n\nTotal: ₹{total} (cash or UPI on delivery)\nAddress: {address}\n\nI will update you the moment the shopkeeper accepts the order.`,
    `That is confirmed, #{id} ✅\n\n{items}\n\nTotal: ₹{total}\nAddress: {address}\n\nCash or UPI on delivery. I will message you as soon as the shopkeeper accepts it.`,
  ],

  // --- Shopkeeper accepted the order ----------------------------------------
  accepted: [
    `Good news, order #{id} has been accepted. 👍\n\nThe shopkeeper is packing it now, usually within 15 to 20 minutes.\nAmount: ₹{total}, cash or UPI on delivery.`,
    `Order #{id} is accepted. 👍\n\nIt is being packed now, which usually takes about 15 to 20 minutes.\nAmount: ₹{total}, payable by cash or UPI on delivery.`,
    `Your order #{id} has been accepted. 🧺\n\nThe shopkeeper is getting it ready, typically 15 to 20 minutes.\nAmount: ₹{total} (cash or UPI on delivery).`,
    `Accepted, order #{id}. 👍\n\nPacking is under way and usually finishes in 15 to 20 minutes.\nAmount: ₹{total}, cash or UPI on delivery.`,
    `Great, the shopkeeper accepted order #{id}. 🧺\n\nExpect it to be ready in about 15 to 20 minutes.\nAmount: ₹{total} (cash or UPI on delivery).`,
    `Order #{id} confirmed by the shopkeeper. 👍\n\nIt is being packed now, usually 15 to 20 minutes.\nAmount: ₹{total}, cash or UPI on delivery.`,
    `The shopkeeper has taken order #{id}. 🧺\n\nPacking now, and it usually takes 15 to 20 minutes.\nAmount: ₹{total}, payable by cash or UPI on delivery.`,
    `Order #{id} is in the shopkeeper's hands. 👍\n\nIt is being packed and should be ready in 15 to 20 minutes.\nAmount: ₹{total} (cash or UPI on delivery).`,
    `Good news, #{id} is accepted. 🧺\n\nThe shopkeeper is packing it now, usually within 15 to 20 minutes.\nAmount: ₹{total}, cash or UPI on delivery.`,
    `Order #{id} has moved to packing. 👍\n\nUsually about 15 to 20 minutes.\nAmount: ₹{total}, cash or UPI on delivery.`,
    `Accepted, #{id}. 🧺\n\nThe shopkeeper is preparing it now, typically 15 to 20 minutes.\nAmount: ₹{total} (cash or UPI on delivery).`,
    `Your order #{id} was accepted. 👍\n\nPacking now, usually 15 to 20 minutes.\nAmount: ₹{total}, cash or UPI on delivery.`,
  ],

  // --- Order ready for collection -------------------------------------------
  atPickup: [
    `Order #{id} is ready. 🛍️\n\nPlease collect it. Amount: ₹{total}, cash or UPI.`,
    `Your order #{id} is packed and waiting. 🛍️\n\nCollect it whenever you are ready. Amount: ₹{total} (cash or UPI).`,
    `Order #{id} is all set for you. 🛍️\n\nPlease collect it. Amount: ₹{total}, cash or UPI.`,
    `Ready for pickup, order #{id}. 🛍️\n\nCome by whenever suits you. Amount: ₹{total} (cash or UPI).`,
    `Order #{id} is waiting for you. 🛍️\n\nPlease collect it at your convenience. Amount: ₹{total}, cash or UPI.`,
    `Good news, order #{id} is ready. 🛍️\n\nAmount: ₹{total}, cash or UPI when you collect it.`,
    `Order #{id} has been packed. 🛍️\n\nPlease collect it. Amount: ₹{total} (cash or UPI).`,
    `Your order #{id} is ready to collect. 🛍️\n\nAmount: ₹{total}, payable by cash or UPI.`,
    `Order #{id} is set aside for you. 🛍️\n\nPlease collect it. Amount: ₹{total}, cash or UPI.`,
    `All packed, order #{id}. 🛍️\n\nCollect it whenever you like. Amount: ₹{total} (cash or UPI).`,
    `Order #{id} is ready when you are. 🛍️\n\nAmount: ₹{total}, cash or UPI on collection.`,
    `Your order #{id} is ready. 🛍️\n\nPlease pick it up. Amount: ₹{total}, cash or UPI.`,
  ],

  // --- Order delivered / completed ------------------------------------------
  delivered: [
    `Order #{id} delivered. 🚚\n\nAmount paid: ₹{total}. Thanks for ordering with Dukaan.`,
    `Order #{id} is complete. 🚚\n\n₹{total} settled. Thank you for choosing Dukaan.`,
    `Delivered, order #{id}. 🚚\n\nAmount paid: ₹{total}. Hope to see you again soon.`,
    `Order #{id} has been delivered. 🚚\n\n₹{total} paid. Thanks for shopping with Dukaan.`,
    `All done, order #{id}. 🚚\n\nAmount paid: ₹{total}. Thank you.`,
    `Order #{id} delivered. 🚚\n\n₹{total} received. Thanks for ordering with us.`,
    `That is order #{id} delivered. 🚚\n\nAmount paid: ₹{total}. Thank you for choosing Dukaan.`,
    `Order #{id} completed. 🚚\n\n₹{total} settled. Thanks again for your order.`,
    `Delivered, #{id}. 🚚\n\nAmount paid: ₹{total}. Hope you enjoy your order.`,
    `Order #{id} delivered successfully. 🚚\n\n₹{total} paid. Thanks for shopping with Dukaan.`,
    `Done, order #{id} delivered. 🚚\n\nAmount paid: ₹{total}. Thank you for your order.`,
    `Order #{id} is delivered. 🚚\n\n₹{total} received. Thanks for choosing Dukaan.`,
  ],

  // --- Shopkeeper could not accept the order --------------------------------
  rejected: [
    `Sorry, order #{id} could not be accepted. 😔\n\nReason: {reason}.\n\nNothing was charged. Message us again if you would like to retry.`,
    `Unfortunately order #{id} was declined. 😔\n\nReason: {reason}.\n\nNo payment was taken. Send /hey if you want to try again.`,
    `Order #{id} could not go through. 😔\n\nReason: {reason}.\n\nNothing was charged. You are welcome to order again.`,
    `The shopkeeper could not take order #{id}. 😔\n\nReason: {reason}.\n\nNo payment was taken. Message us again whenever you like.`,
    `Sorry, #{id} was not accepted at this store. 😔\n\nReason: {reason}.\n\nNothing was charged. Send /hey to start a new order.`,
    `Order #{id} was declined. 😔\n\nReason: {reason}.\n\nNo money was charged. Feel free to try again.`,
    `Unfortunately we could not accept order #{id}. 😔\n\nReason: {reason}.\n\nNothing was charged. Message us again if you would like to retry.`,
    `Order #{id} did not go through. 😔\n\nReason: {reason}.\n\nNo payment was taken. You can place a fresh order anytime.`,
    `Sorry, this order could not be accepted, #{id}. 😔\n\nReason: {reason}.\n\nNothing was charged. Send /hey to try again.`,
    `Order #{id} was not accepted. 😔\n\nReason: {reason}.\n\nNothing was charged. Message us again when convenient.`,
    `I am sorry, order #{id} could not be taken. 😔\n\nReason: {reason}.\n\nNo payment was taken. Send /hey if you want to retry.`,
    `That order was declined, #{id}. 😔\n\nReason: {reason}.\n\nNothing was charged. Happy to try again whenever you are ready.`,
  ],
};

/** Family names, for tests and tooling. */
export const MESSAGE_FAMILIES = Object.keys(MESSAGE_TEMPLATES);

// Injectable source of randomness so tests can pin the pick.
let randomFn = Math.random;

/** Pin (or restore) the random source. Pass null to restore Math.random. */
export function setMessageRandom(fn) {
  randomFn = typeof fn === 'function' ? fn : Math.random;
}

export function resetMessageRandom() {
  randomFn = Math.random;
}

/** Fills {placeholders}; an unknown placeholder is removed rather than shown. */
export function fillTemplate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_m, key) =>
    vars[key] == null ? '' : String(vars[key])
  );
}

/** Picks one variant of a family and fills it. Unknown family returns ''. */
export function pickTemplate(family, vars = {}) {
  const list = MESSAGE_TEMPLATES[family];
  if (!Array.isArray(list) || list.length === 0) return '';
  const i = Math.min(list.length - 1, Math.floor(randomFn() * list.length));
  return fillTemplate(list[i], vars);
}

/**
 * True when the reply is one of this family's phrasings, with the {placeholders}
 * treated as wildcards so a filled-in message still matches its family.
 */
export function isFromFamily(family, text) {
  const list = MESSAGE_TEMPLATES[family];
  if (!Array.isArray(list)) return false;
  const needle = String(text || '').trim();
  return list.some((template) => {
    const pattern = String(template)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{[A-Za-z0-9_]+\\\}/g, '[\\s\\S]+?');
    return new RegExp(`^${pattern}$`).test(needle);
  });
}

// --- Named builders: the only way callers should ask for a message ----------

export const welcomeMessage = () => pickTemplate('welcome');
export const locationHowtoMessage = () => pickTemplate('locationHowto');
export const storeUnreachableMessage = () => pickTemplate('storeUnreachable');
export const noItemsListedMessage = () => pickTemplate('noItemsListed');
export const noStoreConnectedMessage = () => pickTemplate('noStoreConnected');

export const outOfRangeMessage = (km) =>
  pickTemplate('outOfRange', { km: Number(km).toFixed(1) });

export const noStoreServingMessage = () => pickTemplate('noStoreServing');

export const storeMatchedMessage = (area, store, distance) =>
  pickTemplate('storeMatched', { area, store, distance: distance || '' });

export const itemUnavailableMessage = (items) =>
  pickTemplate('itemUnavailable', { items: Array.isArray(items) ? items.join(', ') : items });

export const itemAmbiguousMessage = (options) =>
  pickTemplate('itemAmbiguous', { options });

export const orderConfirmationMessage = (order) => {
  if (!order) return '';
  const items = (order.items || [])
    .map((it) => `• ${it.quantity}x ${it.name} @ ₹${it.price} = ₹${it.total}`)
    .join('\n');
  return pickTemplate('orderConfirmation', {
    id: order.id,
    items,
    total: order.totalAmount,
    address: order.deliveryAddress,
  });
};

export const acceptedMessage = (order) =>
  pickTemplate('accepted', { id: order.id, total: order.totalAmount });

export const atPickupMessage = (order) =>
  pickTemplate('atPickup', { id: order.id, total: order.totalAmount });

export const deliveredMessage = (order) =>
  pickTemplate('delivered', { id: order.id, total: order.totalAmount });

export const rejectedMessage = (order, reason) =>
  pickTemplate('rejected', { id: order.id, reason: reason || 'item temporarily unavailable' });
