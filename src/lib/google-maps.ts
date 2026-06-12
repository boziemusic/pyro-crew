const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export const isGoogleMapsConfigured = Boolean(googleMapsApiKey?.trim());

export function getGoogleMapsApiKey() {
  return googleMapsApiKey?.trim() ?? "";
}
