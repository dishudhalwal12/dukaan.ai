import React, { useState, useEffect } from 'react';
import { XIcon } from './Icons.tsx';

interface SupplierDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const SupplierDetailsModal: React.FC<SupplierDetailsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Reset form when opening
    if (isOpen) {
      setName(localStorage.getItem('dukan-supplier-name') || '');
      setWhatsapp(localStorage.getItem('dukan-supplier-whatsapp-display') || '');
      setError('');
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!name.trim()) {
      setError('Supplier name is required.');
      return;
    }
    const whatsappDigits = whatsapp.replace(/[^0-9]/g, '');
    if (whatsappDigits.length < 10) { // Basic validation for length
      setError('Please enter a valid WhatsApp number with country code.');
      return;
    }
    
    setError('');
    localStorage.setItem('dukan-supplier-name', name);
    localStorage.setItem('dukan-supplier-whatsapp', whatsappDigits);
    localStorage.setItem('dukan-supplier-whatsapp-display', whatsapp);
    onSave();
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-70 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed bottom-0 left-0 right-0 max-w-sm mx-auto bg-[#1A1A1A] text-white rounded-t-2xl p-6 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-modal-title"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 id="supplier-modal-title" className="text-lg font-bold text-white">
            Add Supplier Details
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <p className="text-neutral-300 text-sm mb-6">
          To send your stock list, please enter your supplier's details. This will be saved for future use.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
          <div>
            <label htmlFor="supplier-name" className="text-sm font-medium text-neutral-400">Supplier / Distributor Name</label>
            <input id="supplier-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rajesh Kumar" className="w-full bg-[#2D2D2D] mt-1 text-white rounded-md p-2 border-transparent focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none" required/>
          </div>
          <div>
            <label htmlFor="supplier-whatsapp" className="text-sm font-medium text-neutral-400">Supplier WhatsApp Number</label>
            <input id="supplier-whatsapp" type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+91 98765 43210" className="w-full bg-[#2D2D2D] mt-1 text-white rounded-md p-2 border-transparent focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none" required/>
            <p className="text-xs text-neutral-500 mt-1.5 px-1">Use country code (e.g., +91).</p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          
          <div className="pt-2">
            <button type="submit" className="w-full bg-[#E6E6FA] text-black font-bold py-3 rounded-lg hover:opacity-90 transition-opacity active:scale-95 transform">
              Save & Continue
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default SupplierDetailsModal;