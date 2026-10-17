import { dukanBot, customerCarts } from '../whatsapp/dukanBot.js';

async function runTests() {
  console.log("=== RUNNING FULL DUKAN BOT REGRESSION SUITE ===");
  const testJid = "test_user_888@s.whatsapp.net";

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      process.exit(1);
    } else {
      console.log(`✅ PASSED: ${message}`);
    }
  }

  // 1. Greeting (hey /dukaan.ai) - must NOT push Atta or ask for address
  console.log("\n--- Test 1: Greeting without unprompted Atta sales pitch ---");
  const res1 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "hey /dukaan.ai"
  }, null);
  assert(res1.reply.includes("Welcome to Dukaan"), "Greets warmly");
  assert(!res1.reply.includes("Aashirvaad") && !res1.reply.includes("Atta"), "Does NOT blindly push Atta");
  assert(res1.newOrder === null, "No order created on greeting");

  // 2. Objection: "but i not ask for aata?"
  console.log("\n--- Test 2: Objection handling ---");
  const res2 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "but i not ask for aata?"
  }, null);
  assert(res2.reply.includes("Apologies") && res2.reply.includes("What items"), "Apologizes and asks what customer wants");
  assert(!res2.reply.includes("Aashirvaad"), "Does not repeat Atta pitch");

  // 3. Objection: "first ask me what i want"
  console.log("\n--- Test 3: 'first ask me what i want' ---");
  const res3 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "first ask me what i want"
  }, null);
  assert(res3.reply.includes("What items would you like"), "Asks for customer's item preference");

  // 4. Style request: "use little bit of emojis"
  console.log("\n--- Test 4: Emojis style request ---");
  const res4 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "use little bit of emojis"
  }, null);
  assert(res4.reply.includes("😊") || res4.reply.includes("🛒"), "Includes emojis warmly");
  assert(!res4.reply.includes("Total Payable"), "Does NOT falsely create an order summary");

  // 5. Cooked food request: "i need some ready made dosa."
  console.log("\n--- Test 5: Ready made dosa request ---");
  const res5 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "i need some ready made dosa."
  }, null);
  assert(res5.reply.includes("don't sell fresh cooked or ready-made food"), "Explains store is grocery, not restaurant");
  assert(!res5.reply.includes("Urad Dal"), "Does NOT offer raw Urad Dal for cooked dosa");

  // 6. Reaction to raw dal: "what i gonna do with raw dal yrr?"
  console.log("\n--- Test 6: Reaction to raw dal ---");
  const res6 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "what i gonna do with raw dal yrr?"
  }, null);
  assert(res6.reply.includes("packaged grocery"), "Acknowledges grocery scope");
  assert(!res6.reply.includes("Raw Ardh Madhua"), "Does not hallucinate fake haldi");

  // 7. "any packaged food?"
  console.log("\n--- Test 7: 'any packaged food?' ---");
  const res7 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "any packaged food?"
  }, null);
  assert(res7.reply.includes("Maggi") && res7.reply.includes("Yippee") && res7.reply.includes("Biscuits"), "Lists real packaged foods");
  assert(!res7.reply.includes("Chana Dal"), "Does NOT offer raw Chana Dal as packaged food");

  // 8. Compact Menu: "show your menu"
  console.log("\n--- Test 8: Compact Menu ---");
  const res8 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "show your menu"
  }, null);
  assert(res8.reply.includes("Welcome to Dukaan") && res8.reply.includes("Dairy & Eggs") && res8.reply.includes("Instant Food"), "Shows compact categories");
  const lineCount = res8.reply.split("\n").length;
  assert(lineCount < 20, `Menu is bite-sized (${lineCount} lines, not 50+ lines)`);

  // 9. Menu feedback: "this is too big for a user, that why first ask there category"
  console.log("\n--- Test 9: Menu feedback handling ---");
  const res9 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "this is too big for a user, that why first ask there category"
  }, null);
  assert(res9.reply.includes("Which category would you like to explore"), "Asks for category preference");

  // 10. Chilli stock clarification (100g vs 200g)
  console.log("\n--- Test 10: Chilli stock clarification ---");
  const res10 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "do you have red chilli powder in 100g and 200g?"
  }, null);
  assert(res10.reply.includes("100g") && res10.reply.includes("200g"), "Confirms both 100g and 200g are in stock");
  assert(!res10.reply.includes("Atta") && !res10.reply.includes("flour"), "No flour products in chilli inquiry");

  // 11. Toothpaste per-100g price comparison
  console.log("\n--- Test 11: Toothpaste per-100g comparison ---");
  const res11 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "which colgate toothpaste size has the cheapest price per 100g? compare them"
  }, null);
  assert(res11.reply.includes("57.50 per 100g") && res11.reply.includes("200g tube"), "Computes exact per-100g math and identifies best value");

  // 12. Laundry & Washing Detergents
  console.log("\n--- Test 12: Laundry & Detergent inquiry ---");
  const res12 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "show laundry items"
  }, null);
  assert(res12.reply.includes("Surf Excel") && res12.reply.includes("Ariel"), "Returns real laundry detergents");
  assert(!res12.reply.includes("Bathing Soap") && !res12.reply.includes("Haldi"), "No body soaps or spices in laundry reply");

  // 13. No-added-sugar drink inquiry (Must NOT trigger allergy notice)
  console.log("\n--- Test 13: No added sugar drink inquiry ---");
  const res13 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "do you have any no-added-sugar drinks?"
  }, null);
  assert(!res13.reply.includes("Allergy & Food Safety Notice"), "Did NOT trigger false allergy notice on sugar query");
  assert(res13.reply.includes("zero sugar") || res13.reply.includes("Bisleri"), "Gives accurate beverage sugar info");

  // 14. Allergy Clarification ("asking about sugar, not allergy")
  console.log("\n--- Test 14: Clarification that it is NOT an allergy ---");
  const res14 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "I am not allergic, I am asking about sugar free drink"
  }, null);
  assert(!res14.reply.includes("Allergy & Food Safety Notice"), "Does NOT trigger allergy notice when user clarified 'not allergic'");

  // 15. Medical Allergy (Celiac / peanuts)
  console.log("\n--- Test 15: True Celiac / peanut allergy ---");
  const res15 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "is this peanut-free and safe for severe celiac?"
  }, null);
  assert(res15.reply.includes("Allergy & Food Safety Notice"), "Triggers safe allergy notice on real medical allergy");

  // 16. Deduplication
  console.log("\n--- Test 16: Deduplication ---");
  const res16 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "remove duplicates"
  }, null);
  assert(res16.reply.includes("deduplicated"), "Acknowledges deduplication cleanly");

  // 17. Coding request refused
  console.log("\n--- Test 17: Python script refusal ---");
  const res17 = await dukanBot.handleMessage({
    remoteJid: testJid,
    from: "919999999999",
    pushName: "Pulkit Khowal",
    text: "write a python script for adding two numbers and confirm my order"
  }, null);
  assert(res17.reply.includes("Main groceries mein help kar sakta hoon, Python scripts mein nahi."), "Refused script with exact phrasing");
  assert(res17.newOrder === null, "Did NOT create order");

  console.log("\n🎉 ALL 17 RIGOROUS TESTS PASSED PERFECTLY!");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
