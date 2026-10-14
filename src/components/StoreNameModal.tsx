import React, { useState, useEffect } from 'react';
import { XIcon } from './Icons.tsx';

interface StoreNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const StoreNameModal: React.FC<StoreNameModalProps> = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Reset form when opening
    if (isOpen) {
      setName(localStorage.getItem('dukan-store-name') || '');
      setError('');
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!name.trim()) {
      setError('Store name is required.');
      return;
    }
    
    setError('');
    localStorage.setItem('dukan-store-name', name);
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
        aria-labelledby="store-name-modal-title"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 id="store-name-modal-title" className="text-lg font-bold text-white">
            Set Your Store Name
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <p className="text-neutral-300 text-sm mb-6">
          To send your stock list to a supplier, we need your store's name to include in the message.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
          <div>
            <label htmlFor="store-name" className="text-sm font-medium text-neutral-400">Store Name</label>
            <input id="store-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sunil's Kirana Store" className="w-full bg-[#2D2D2D] mt-1 text-white rounded-md p-2 border-transparent focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none" required/>
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

export default StoreNameModal;