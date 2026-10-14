export const generateRandomPhoneNumber = (): string => {
  const countryCode = '+91';
  const randomNumber = Math.floor(Math.random() * 9000000000) + 1000000000;
  return `${countryCode}${randomNumber}`;
};