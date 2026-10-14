import React, { useMemo, useState } from 'react';
import { Order } from '../types.ts';
import { XIcon } from './Icons.tsx';
import CelebrationEffect from './CelebrationEffect.tsx';

interface UpiQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  order: Order | null;
}

const UpiQrCodeModal: React.FC<UpiQrCodeModalProps> = ({ isOpen, onClose, onDone, order }) => {
  const [isCelebrating, setIsCelebrating] = useState(false);

  const qrCodeUrl = useMemo(() => {
    if (!order) return '';

    const payeeName = "Dukan.AI Store"; // A generic name for the payee
    const upiId = "divyarth12@ybl";
    const amount = Number(order.total ?? 0).toFixed(2);
    const transactionId = order.id.replace(/[^a-zA-Z0-9]/g, ''); // Alphanumeric TID is safer
    const transactionNote = `Payment for Order ${order.id}`;

    const upiParams = new URLSearchParams({
      pa: upiId,
      pn: payeeName,
      am: amount,
      tid: transactionId,
      tn: transactionNote,
      cu: 'INR',
    });

    const upiUrl = `upi://pay?${upiParams.toString()}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;
  }, [order]);

  const handleDoneClick = () => {
    setIsCelebrating(true);
    setTimeout(() => {
      onDone();
      // Reset state for the next time the modal opens
      setIsCelebrating(false);
    }, 2500); // Wait for the confetti animation to play
  };

  if (!isOpen || !order) return null;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-80 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed bottom-0 left-0 right-0 max-w-sm mx-auto bg-[#1A1A1A] text-white rounded-t-2xl p-6 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-modal-title"
      >
        {isCelebrating && <CelebrationEffect />}
        <div className="flex justify-between items-center mb-4">
          <h3 id="qr-modal-title" className="text-lg font-bold text-white">
            {isCelebrating ? "Payment Successful!" : "Scan to Pay"}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close" disabled={isCelebrating}>
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-white rounded-lg">
                {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="UPI QR Code" width="200" height="200" />
                ) : (
                    <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-200 rounded-lg">
                        <p className="text-black">Loading QR...</p>
                    </div>
                )}
            </div>
            
            <div className="text-center">
                <p className="text-sm text-neutral-400">Amount to be paid</p>
                <p className="text-3xl font-bold text-[#E6E6FA] tracking-tight">₹{Number(order.total ?? 0).toFixed(2)}</p>
                <p className="text-xs text-neutral-500 mt-1">UPI ID: divyarth12@ybl</p>
            </div>
        </div>

        <div className="pt-6">
            <button
              onClick={handleDoneClick}
              disabled={isCelebrating}
              className="w-full bg-[#E6E6FA] text-black font-bold py-3 rounded-lg hover:opacity-90 transition-opacity active:scale-95 transform disabled:opacity-50 disabled:cursor-wait"
            >
              {isCelebrating ? "Completing..." : "Done"}
            </button>
        </div>
      </div>
    </>
  );
};

export default UpiQrCodeModal;