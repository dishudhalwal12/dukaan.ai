
import Papa from 'papaparse';
import { Order, OrderItem, OrderStatus } from '../types.ts';
import { ruleBasedWhatsAppParser } from '../utils/parsers.ts';
import { generateRandomPhoneNumber } from '../utils/phone.ts';
import { withGeminiFailover } from '../utils/geminiClient.ts';
import { sanitizeCsvField } from '../utils/sanitize.ts';

// Helper to convert an uploaded File to base64
// This is required for inlineData parameter in @google/genai API
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Extracts the base64 part after the comma 'data:image/jpeg;base64,...'
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to read file as base64'));
      }
    };
    reader.onerror = error => reject(error);
  });
};

// Shared helper to build order from items
const createOrderFromItems = (items: OrderItem[], orderIdSuffix?: string): Order => {
  const total = items.reduce((sum, item) => {
    const p = parseFloat(String(item.price).replace(/[^0-9.]/g, '')) || 0;
    const q = Number(item.quantity) || 1;
    return sum + (Number(p) * Number(q));
  }, 0);

  return {
    id: `B2C-${orderIdSuffix || Math.floor(1000 + Math.random() * 9000)}`,
    customer: {
        name: "Walk-in Customer",
        whatsappNumber: generateRandomPhoneNumber(),
        address: "Local Store",
    },
    items,
    total,
    paymentMethod: 'COD',
    status: OrderStatus.COMPLETED,
    timestamp: new Date().toISOString(),
  };
};

const callGeminiWithTimeout = async (prompt: string, timeoutMs: number = 3000): Promise<OrderItem[]> => {
  const systemInstruction = `You are a data extraction assistant. Extract shopping receipt items from the provided text.
Return ONLY a valid JSON array of objects. No markdown. Each object must have "name" (string), "quantity" (number), and "price" (string).`;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Gemini API timeout')), timeoutMs)
  );

  const fetchPromise = withGeminiFailover((client) =>
    client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    })
  );

  const response = await Promise.race([fetchPromise, timeoutPromise]);
  const text = (response as any).text.trim();
  
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Not an array');

  return parsed.map((item: any) => ({
    productId: `ai-id-${Math.random().toString(36).substr(2, 9)}`,
    name: item.name || 'Unknown Item',
    quantity: Number(item.quantity) || 1,
    price: String(item.price || '0'),
  }));
};

const callGeminiVisionWithTimeout = async (file: File, timeoutMs: number = 3000): Promise<OrderItem[]> => {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type || "image/jpeg";

    const systemInstruction = `You are a data extraction assistant processing shopping receipts.
Extract all the purchased items found in this image.
Return ONLY a valid JSON array of objects. Do not include markdown or \`\`\`json wrappers.
Each object in the array must have ONLY these three keys:
"name" (string name of product), "quantity" (numeric quantity), and "price" (string price).`;

    const fetchPromise = withGeminiFailover((client) =>
      client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          "Extract structured JSON items from this receipt."
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        }
      })
    );
  
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini Vision API timeout')), timeoutMs)
    );
  
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    const text = (response as any).text.trim();
    
    // Parse the JSON strictly
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('Vision returned invalid JSON format');
  
    return parsed.map((item: any) => ({
      productId: `ai-vis-id-${Math.random().toString(36).substr(2, 9)}`,
      name: String(item.name || 'Unknown Item').substring(0, 30),
      quantity: Number(item.quantity) || 1,
      price: String(item.price || '0').replace(/[^0-9.]/g, ''),
    })).filter((item: any) => Number(item.price) > 0);
};

export const processPhotoBill = async (file: File): Promise<Order[]> => {
  try {
    const parsedItems = await callGeminiVisionWithTimeout(file, 3000);
    
    if (parsedItems.length > 0) {
        return [createOrderFromItems(parsedItems)];
    }
    
    throw new Error('No items identified in the receipt.');
  } catch (error) {
    console.error('Error processing photo bill with Vision:', error);
    throw error;
  }
};

export const processWhatsAppMessage = async (text: string): Promise<Order[]> => {
  try {
    if (!text || text.trim().length === 0) return [];

    const structuredOrders = ruleBasedWhatsAppParser(text);
    if (structuredOrders && structuredOrders.length > 0) {
      return structuredOrders;
    }

    const parsedItems = await callGeminiWithTimeout(`Extract items from this whatsapp message:\n${text}`, 3000);
    if (parsedItems.length > 0) {
      return [createOrderFromItems(parsedItems)];
    }

    return structuredOrders || [];
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
    // Silent fallback to rule-based if threw error
    return ruleBasedWhatsAppParser(text) || [];
  }
};

export const processCsvFile = async (file: File): Promise<Order[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        // We will group the raw CSV data by order_id
        const orderGroups: { [orderId: string]: OrderItem[] } = {};
        let generatedOrderCount = 0;

        results.data.forEach((row: any) => {
            // Flexible key matching for robust CSV extraction
            const getVal = (keys: string[]) => {
                const foundKey = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim().replace(/_/g, ' ')));
                return foundKey ? row[foundKey] : undefined;
            };

            const name = sanitizeCsvField(getVal(['product', 'name', 'item', 'product name']) || 'Uploaded Item');
            const quantityRaw = getVal(['quantity', 'qty']) || 1;
            const quantity = parseInt(String(quantityRaw).trim(), 10) || 1;
            
            const priceRaw = getVal(['price', 'unit price', 'amount', 'rate']) || '0';
            const price = String(priceRaw).replace(/[^0-9.]/g, '');
            
            const orderIdRaw = getVal(['order id', 'orderid', 'id']);
            
            // If no order ID, we generate a random distinct one so we don't accidentally merge unrelated CSV rows
            // unless the user truly provided no IDs, in which case we make them distinct single-item orders by default.
            const orderId = orderIdRaw ? String(orderIdRaw) : `generated-${++generatedOrderCount}`;

            if (!orderGroups[orderId]) {
                orderGroups[orderId] = [];
            }

            orderGroups[orderId].push({
                productId: `csv-raw-${Math.random().toString(36).substr(2, 9)}`,
                name,
                quantity: Number(quantity),
                price: String(price).replace(/[^0-9.]/g, '')
            });
        });

        const distinctOrders = Object.keys(orderGroups).map(id => createOrderFromItems(orderGroups[id], id));

        if (distinctOrders.length === 0) {
            resolve([]);
            return;
        }

        // Optional Normalization step via Gemini Text API
        try {
            const rawJsonString = JSON.stringify(distinctOrders);
            const systemInstruction = `You are a data normalization assistant processing CSV orders.
Normalize this raw JSON array of orders. Fix typos in product names and ensure standard numeric pricing formats.
Return EXACTLY a JSON array of order objects. 
Each order object MUST have "id", "customer" (object), "items" (array), "total" (number), "paymentMethod" (string), "status" (string), "timestamp" (string).
Each item within "items" MUST have "productId", "name" (string), "quantity" (number), "price" (string). Ensure order IDs and structures are perfectly preserved.`;

            const timeoutPromise = new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('Gemini API timeout')), 3000)
            );

            const fetchPromise = withGeminiFailover((client) =>
              client.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Normalize these orders: ${rawJsonString}`,
                config: {
                  systemInstruction,
                  responseMimeType: "application/json"
                }
              })
            );

            const response = await Promise.race([fetchPromise, timeoutPromise]);
            const text = (response as any).text.trim();
            const normalizedOrders = JSON.parse(text);

            if (Array.isArray(normalizedOrders) && normalizedOrders.length > 0) {
                 // Double check total calculation on return just to be safe
                 const verifiedOrders = normalizedOrders.map(o => createOrderFromItems(o.items, o.id.replace('B2C-', '')));
                 resolve(verifiedOrders);
                 return;
            }
        } catch (geminiError) {
             console.warn("CSV Normalization via Gemini failed/timed out, falling back to raw PapaParse parsed grouped orders", geminiError);
        }

        // Fallback: Use Raw PapaParse output
        resolve(distinctOrders);
      },
      error: (error: any) => {
        console.error('PapaParse error:', error);
        reject(error);
      }
    });
  });
};
