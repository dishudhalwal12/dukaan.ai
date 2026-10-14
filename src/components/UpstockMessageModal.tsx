import React from 'react';
import { XIcon, WhatsAppIcon } from './Icons.tsx';

interface UpstockMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  whatsappUrl: string;
}

const UpstockMessageModal: React.FC<UpstockMessageModalProps> = ({ isOpen, onClose, message, whatsappUrl }) => {
  
  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
        alert('Message copied to clipboard!');
        onClose();
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy message. Please try again.');
    });
  };

  const handleOpenWhatsApp = () => {
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    onClose();
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
        aria-labelledby="upstock-message-modal-title"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 id="upstock-message-modal-title" className="text-lg font-bold text-white">
            Ready to Upstock
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <p className="text-neutral-300 text-sm mb-4">
            We've prepared the following message for your supplier.
        </p>

        <div className="bg-[#2D2D2D] rounded-lg p-3 max-h-48 overflow-y-auto mb-6">
            <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-sans">{message}</pre>
        </div>
        
        <div className="space-y-3">
             <button onClick={handleOpenWhatsApp} className="w-full bg-[#25D366] text-white font-bold py-3 rounded-lg hover:bg-opacity-90 transition-opacity active:scale-95 transform flex items-center justify-center gap-2">
                <WhatsAppIcon className="w-5 h-5" />
                Open in WhatsApp
            </button>
            <button onClick={handleCopy} className="w-full bg-[#2D2D2D] text-neutral-200 font-bold py-3 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95 transform flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-xl">content_copy</span>
                Copy Message & Close
            </button>
        </div>

      </div>
    </>
  );
};

export default UpstockMessageModal;