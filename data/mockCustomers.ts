import { Customer } from '../types';

export const mockCustomers: Omit<Customer, 'whatsappNumber'>[] = [
    { name: 'Rohan Gupta', address: '15/2, Geeta Colony, Near Jheel Chowk, Delhi' },
    { name: 'Sneha Verma', address: 'House No. 24, Block D, Krishna Nagar, Delhi' },
    { name: 'Amit Singh', address: 'C-112, Laxmi Nagar, Vikas Marg, New Delhi' },
    { name: 'Priya Sharma', address: 'F-7, Main Market, Shahdara, Delhi' },
    { name: 'Vikram Choudhary', address: '48, Radhepuri, Near Gandhi Nagar, Delhi' },
    { name: 'Neha Patel', address: '8/B, Shastri Nagar, Near Geeta Colony, Delhi' },
    { name: 'Manish Kumar', address: '201, Ram Nagar, Shahdara, New Delhi' },
];
