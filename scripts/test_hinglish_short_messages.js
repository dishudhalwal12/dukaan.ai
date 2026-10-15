import { dukanBot, customerCarts } from '../whatsapp/dukanBot.js';
import { dukanCatalog } from '../whatsapp/dukanCatalog.js';

async function runHinglishTests() {
  console.log("=== RUNNING RIGOROUS HINGLISH SHORT MESSAGES TEST ===");
  const testJid = "hinglish_tester@s.whatsapp.net";

  const failures = [];

  async function testCase(input, checkFn, label) {
    try {
      const res = await dukanBot.handleMessage({
        remoteJid: testJid,
        from: "919876543210",
        pushName: "Rohit",
        text: input
      }, null);
      const passed = checkFn(res);
      if (!passed) {
        console.error(`❌ FAILED [${label}]: "${input}"`);
        console.error(`   Output:`, res?.reply);
        failures.push({ label, input, reply: res?.reply });
      } else {
        console.log(`✅ PASSED [${label}]: "${input}"`);
      }
    } catch (err) {
      console.error(`💥 ERROR [${label}]: "${input}" ->`, err.message);
      failures.push({ label, input, error: err.message });
    }
  }

  // 1. Greetings in Hinglish
  await testCase("kya haal hai", r => !r.reply.includes("Atta") && !r.reply.includes("₹245"), "Hinglish Greeting 1");
  await testCase("namaste bhai", r => !r.reply.includes("Atta"), "Hinglish Greeting 2");
  await testCase("bhai dukaan khuli hai?", r => r.reply.includes("7:00 AM") || r.reply.includes("open"), "Shop hours in Hinglish");
  await testCase("kya kya milta hai yahan?", r => r.reply.includes("categories") || r.reply.includes("Dukaan"), "Ask categories in Hinglish");

  // 2. Specific item queries in Hinglish
  await testCase("doodh hai kya?", r => r.reply.includes("Milk") || r.reply.includes("Amul"), "Milk query in Hinglish");
  await testCase("amul gold kitne ka hai?", r => r.reply.includes("Amul Gold") && r.reply.includes("66"), "Amul Gold rate");
  await testCase("maggi hai?", r => r.reply.includes("Maggi") && r.reply.includes("14"), "Maggi availability");
  await testCase("chai patti ka rate batao", r => r.reply.includes("Tea") || r.reply.includes("Tata Tea") || r.reply.includes("Red Label"), "Tea rate");
  await testCase("tel kitne ka hai?", r => r.reply.includes("Oil") || r.reply.includes("Fortune"), "Cooking oil rate");
  await testCase("dahi milegi?", r => r.reply.includes("Dahi") || r.reply.includes("Amul"), "Dahi query");
  await testCase("ande hain kya?", r => r.reply.includes("Egg") || r.reply.includes("Eggs") || r.reply.includes("ande"), "Eggs query");
  await testCase("kapde dhone ka sabun ya powder dikhao", r => r.reply.includes("Surf Excel") || r.reply.includes("Ariel") || r.reply.includes("Tide"), "Laundry query");
  await testCase("lal mirch 200g hai?", r => r.reply.includes("200g") && (r.reply.includes("Everest") || r.reply.includes("Tata Sampann")), "Chilli 200g query");
  await testCase("colgate chhota pack kitne ka hai?", r => r.reply.includes("50g") && r.reply.includes("30"), "Small Colgate 50g rate");
  await testCase("sugar free drink hai kya koi?", r => !r.reply.includes("Allergy") && (r.reply.includes("Bisleri") || r.reply.includes("zero sugar")), "Sugar-free drink query");

  // 3. Cooked / Out-of-stock items in Hinglish
  await testCase("garam samosa milega?", r => r.reply.includes("don't sell fresh cooked") || r.reply.includes("grocery store"), "Cooked food refusal 1");
  await testCase("chhole bhature bhej do", r => r.reply.includes("don't sell fresh cooked") || r.reply.includes("grocery store"), "Cooked food refusal 2");
  await testCase("cold beer milegi?", r => r.reply.includes("not available") || r.reply.includes("grocery"), "Beer refusal");
  await testCase("kimchi hai?", r => r.reply.includes("not available in our store"), "Exotic item refusal");

  // 4. Clarification / Objections in Hinglish
  await testCase("aata nahi chahiye bhai, bas doodh pucha tha", r => !r.reply.includes("Aashirvaad Shudh Chakki Atta") && r.reply.includes("Apologies"), "Objection 'aata nahi chahiye'");
  await testCase("pehle rate batao fir order karunga", r => r.reply.includes("What items") || r.reply.includes("Apologies"), "Clarification 'pehle rate batao'");
  await testCase("address kyu mang rahe ho abhi?", r => r.reply.includes("Apologies") || r.reply.includes("What items"), "Address push objection");

  // 5. Multi-item cart in Hinglish
  customerCarts.delete(testJid);
  await testCase("2 packet maggi aur 1 amul doodh bhej do", r => {
    const c = customerCarts.get(testJid);
    return c && c.items.some(i => i.name.includes("Maggi")) && c.items.some(i => i.name.includes("Milk"));
  }, "Multi-item cart in Hinglish");

  // 6. Quantity change in Hinglish
  await testCase("sirf 1 packet chahiye", r => {
    const c = customerCarts.get(testJid);
    return c && c.items.every(i => i.quantity === 1) && r.reply.includes("Updated quantity to 1");
  }, "Quantity update in Hinglish");

  // 7. Cancellation in Hinglish
  await testCase("rehne do bhai abhi nahi chahiye", r => !customerCarts.has(testJid) && r.reply.includes("cancelled"), "Cancellation in Hinglish");

  // 8. Quoted cancellation in Hinglish
  await testCase("agar order cancel karein to kya hota hai?", r => r.reply.includes("Policy Explanation"), "Quoted cancellation explanation in Hinglish");

  // 9. Negative confirmation in Hinglish
  customerCarts.set(testJid, { items: [{ name: "Maggi", price: 14, quantity: 2, total: 28 }], totalAmount: 28, updatedAt: Date.now() });
  await testCase("nahi abhi confirm mat karna", r => r.newOrder === null, "Negative confirmation in Hinglish");

  // 10. Affirmative confirmation in Hinglish
  await testCase("haan bhej do confirm hai", r => r.newOrder !== null && r.reply.includes("Order confirmed"), "Affirmative confirmation in Hinglish");

  // 11. Allergy in Hinglish
  await testCase("is biscuit me moongfali to nahi hai na? allergy hai mujhe", r => r.reply.includes("Allergy & Food Safety Notice"), "Allergy check in Hinglish");

  // 12. Coding in Hinglish
  await testCase("bhai python ka ek code likh do please", r => r.reply.includes("Main groceries mein help kar sakta hoon, Python scripts mein nahi."), "Coding request refusal in Hinglish");

  console.log(`\n========================================`);
  if (failures.length === 0) {
    console.log(`🎉 ALL ${12} HINGLISH CATEGORIES PASSED WITH ZERO FAILURES!`);
  } else {
    console.error(`⚠️ TOTAL FAILURES: ${failures.length}`);
    process.exit(1);
  }
}

runHinglishTests().catch(err => {
  console.error(err);
  process.exit(1);
});
