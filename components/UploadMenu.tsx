import React, { useState, useRef, useEffect } from 'react';
import { CameraIcon, DocumentIcon, WhatsAppIcon, XIcon } from './Icons.tsx';
import { useLanguage } from '../contexts/LanguageContext.tsx';
import { processPhotoBill, processCsvFile, processWhatsAppMessage } from '../services/uploadService.ts';
import { Order } from '../types.ts';

interface UploadMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAddOrders: (orders: Order[]) => void;
}

const UploadMenu: React.FC<UploadMenuProps> = ({ isOpen, onClose, onAddOrders }) => {
  const [showWhatsAppInstructions, setShowWhatsAppInstructions] = useState(false);
  const [waText, setWaText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const mainElement = document.querySelector('main');
    if (isOpen) {
      mainElement?.classList.add('overflow-hidden');
    } else {
      mainElement?.classList.remove('overflow-hidden');
    }
    return () => {
      mainElement?.classList.remove('overflow-hidden');
    };
  }, [isOpen]);

  const handleWhatsAppClick = () => {
    setShowWhatsAppInstructions(true);
    setErrorMsg('');
    setWaText('');
  };

  const handleBack = () => {
    setShowWhatsAppInstructions(false);
    setErrorMsg('');
  };
  
  const handleClose = () => {
    setShowWhatsAppInstructions(false);
    setErrorMsg('');
    setWaText('');
    onClose();
  };

  const handleUploadCsvClick = () => {
    csvInputRef.current?.click();
  };

  const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        const parsedOrders = await processCsvFile(file);
        if (parsedOrders && parsedOrders.length > 0) {
            onAddOrders(parsedOrders);
            alert(`Successfully processed CSV and added sales records.`);
            handleClose();
        } else {
            alert('No sales records found in CSV.');
        }
      } catch (e: any) {
        alert('Failed to parse CSV: ' + e.message);
      } finally {
        setIsProcessing(false);
      }
    }
    if(event.target) {
        event.target.value = '';
    }
  };
  
  const handleUploadPhotoClick = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        const parsedOrders = await processPhotoBill(file);
        if (parsedOrders && parsedOrders.length > 0) {
            onAddOrders(parsedOrders);
            alert('Successfully processed Photo Bill and added sales records.');
            handleClose();
        } else {
            alert('Could not extract sales records from photo.');
        }
      } catch (e: any) {
         if (e.message.includes('timeout')) {
             alert('Gemini Vision processing timed out. Please try a clearer image or manually input the order.');
         } else {
             alert('Failed to process photo bill. Please ensure it is a valid receipt image.');
         }
      } finally {
         setIsProcessing(false);
      }
    }
    if(event.target) {
        event.target.value = '';
    }
  };

  const handleProcessWhatsApp = async () => {
    if (!waText.trim()) return;
    setIsProcessing(true);
    setErrorMsg('');
    try {
        const parsedOrders = await processWhatsAppMessage(waText);
        if (parsedOrders && parsedOrders.length > 0) {
            onAddOrders(parsedOrders);
            alert('Successfully processed WhatsApp message and added sales records.');
            handleClose();
        } else {
            setErrorMsg('Could not find structured items in message.');
        }
    } catch (e: any) {
        setErrorMsg('Error processing message.');
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-70 z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 max-w-sm mx-auto bg-[#1A1A1A] text-white rounded-t-2xl p-6 z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {!showWhatsAppInstructions ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">{t('upload_data')}</h3>
              <button onClick={handleClose} className="text-neutral-400 hover:text-white">
                <XIcon className="w-6 h-6" />
              </button>
            </div>
            <ul className="space-y-3">
              <li>
                <button onClick={handleUploadPhotoClick} className="w-full flex items-center p-4 bg-[#2D2D2D] rounded-lg text-left hover:bg-opacity-80 transition-colors">
                  <CameraIcon className="w-6 h-6 mr-4 text-[#E6E6FA]" />
                  <span className="font-semibold text-neutral-200">{t('upload_photo_bill')}</span>
                </button>
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={handlePhotoFileChange}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
              </li>
              <li>
                <button onClick={handleUploadCsvClick} className="w-full flex items-center p-4 bg-[#2D2D2D] rounded-lg text-left hover:bg-opacity-80 transition-colors">
                  <DocumentIcon className="w-6 h-6 mr-4 text-[#E6E6FA]" />
                  <span className="font-semibold text-neutral-200">{t('upload_csv')}</span>
                </button>
                <input
                  type="file"
                  ref={csvInputRef}
                  onChange={handleCsvFileChange}
                  accept=".csv,text/csv"
                  className="hidden"
                />
              </li>
              <li>
                <button onClick={handleWhatsAppClick} className="w-full flex items-center p-4 bg-[#2D2D2D] rounded-lg text-left hover:bg-opacity-80 transition-colors">
                  <WhatsAppIcon className="w-6 h-6 mr-4 text-[#25D366]" />
                  <span className="font-semibold text-neutral-200">{t('record_on_whatsapp')}</span>
                </button>
              </li>
            </ul>
          </>
        ) : (
          <div className="text-center">
            <WhatsAppIcon className="w-12 h-12 text-[#25D366] mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">{t('whatsapp_ready_title') || 'Record via WhatsApp'}</h3>
            <p className="text-neutral-300 mb-4">{t('whatsapp_ready_desc') || 'Paste your WhatsApp order text below.'}</p>
            
            <textarea
              className="w-full h-32 p-3 rounded-lg bg-[#2D2D2D] text-white border-none outline-none resize-none mb-3 placeholder-neutral-500"
              placeholder="e.g. 1x Milk 50rs, 2x Bread 40rs"
              value={waText}
              onChange={(e) => setWaText(e.target.value)}
              disabled={isProcessing}
            />
            {errorMsg && <p className="text-red-400 text-sm mb-3 font-semibold">{errorMsg}</p>}
            
            <button 
              onClick={handleProcessWhatsApp} 
              disabled={isProcessing || !waText.trim()}
              className="block w-full text-center bg-[#25D366] text-white font-bold py-3 px-4 rounded-lg hover:bg-[#1EBE57] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : 'Process Message'}
            </button>
            <button onClick={handleBack} disabled={isProcessing} className="mt-4 text-sm font-semibold text-neutral-400 hover:text-white disabled:opacity-50">
              {t('back')}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default UploadMenu;