/**
 * WhatsApp Location Pin Resolver
 * Parses locationMessage / liveLocationMessage and reverse-geocodes to a human-readable street address
 */
export async function resolveLocation(locMsg) {
  if (!locMsg) return null;

  const lat = locMsg.degreesLatitude;
  const lng = locMsg.degreesLongitude;

  if (lat === undefined || lng === undefined) return null;

  const locName = locMsg.name || '';
  const locAddress = locMsg.address || '';
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

  let readableAddress = locAddress;

  // If WhatsApp didn't include a street address string, reverse-geocode via OpenStreetMap Nominatim
  if (!readableAddress) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'DukanStoreWhatsAppBot/1.0',
            'Accept-Language': 'en'
          }
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) {
          readableAddress = data.display_name;
        }
      }
    } catch (e) {
      console.warn('[Location] Reverse geocoding fallback failed:', e.message);
    }
  }

  const finalAddress = readableAddress || `Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  const fullDescription = locName ? `${locName}, ${finalAddress}` : finalAddress;

  return {
    latitude: lat,
    longitude: lng,
    name: locName,
    address: finalAddress,
    fullDescription,
    mapsUrl,
    displayText: `[📍 Location Pin Shared: ${fullDescription} | Maps: ${mapsUrl}]`
  };
}
