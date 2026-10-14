import { Order, OrderStatus, OrderItem, Customer } from '../types.ts';
import { generateRandomPhoneNumber } from './phone.ts';

const createDummyCustomer = (): Customer => ({
    name: "Walk-in Customer",
    whatsappNumber: generateRandomPhoneNumber(),
    address: "Local Store",
});

export const createDummyOrder = (items: OrderItem[]): Order => {
    const total = items.reduce((acc, item) => {
        const itemPrice = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
        return acc + (itemPrice * item.quantity);
    }, 0);

    return {
        id: `B2C-${Math.floor(1000 + Math.random() * 9000)}`,
        customer: createDummyCustomer(),
        items,
        total,
        paymentMethod: 'COD',
        status: OrderStatus.COMPLETED, // Automatically mark completed for historical generic uploads
        timestamp: new Date().toISOString(),
    };
};

export const fallbackReceiptParser = (text: string): Order[] => {
    // A very simple regex parser to extract items from typical receipt text
    // Matches something like "1x Milk 50" or "Milk 2 100" or just lines with prices
    const lines = text.split('\n');
    const items: OrderItem[] = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // E.g., "1 x Milk - 50" or "Milk 50.00"
        // Let's try to find numbers and assume the rest is product name
        const matchQuantityPattern = trimmed.match(/^(\d+)\s*(?:x|\*|-)\s*(.+)/i);
        let quantity = 1;
        let nameAndPrice = trimmed;

        if (matchQuantityPattern) {
            quantity = parseInt(matchQuantityPattern[1], 10) || 1;
            nameAndPrice = matchQuantityPattern[2];
        }

        const priceMatch = nameAndPrice.match(/(?:rs\.?|₹|\$)?\s*(\d+(?:\.\d{1,2})?)$/i);
        let price = '0';
        let name = nameAndPrice;

        if (priceMatch) {
            price = priceMatch[1];
            name = nameAndPrice.replace(priceMatch[0], '').trim();
        }

        // If we found a valid name and price > 0, consider it an item
        if (name.length > 2 && parseFloat(price) > 0) {
            items.push({
                productId: `dumb-id-${Math.random().toString(36).substr(2, 9)}`,
                name: name.substring(0, 30),
                quantity,
                price: price
            });
        }
    });

    if (items.length > 0) {
        return [createDummyOrder(items)];
    }

    return [];
};

export const ruleBasedWhatsAppParser = (text: string): Order[] | null => {
    // Simple rule: each line is an item
    // "2x bread 40 \n 1x milk 30"
    const lines = text.split('\n');
    const items: OrderItem[] = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Simple match: Number x Item Price
        // Example: 2x bread 40rs
        const match = trimmed.match(/^(\d+)[xX*]?\s+([A-Za-z\s]+)\s+(\d+(?:\.\d+)?)/);
        if (match) {
            const quantity = parseInt(match[1], 10) || 1;
            const name = match[2].trim();
            const price = match[3];

            items.push({
                productId: `wa-id-${Math.random().toString(36).substr(2, 9)}`,
                name,
                quantity,
                price
            });
        }
    });

    if (items.length > 0 && items.length === lines.filter(l => l.trim().length > 0).length) {
        // High confidence structured parsing
        return [createDummyOrder(items)];
    }

    // fallback to regex if partial, or null to trigger Gemini
    if (items.length > 0) {
        return [createDummyOrder(items)];
    }

    return null;
};
