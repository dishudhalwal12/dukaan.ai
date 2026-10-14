
import React, { useState } from 'react';
import Card from '../components/Card.tsx';
import { WhatsAppIcon } from '../components/Icons.tsx';

const OnlineStoreScreen: React.FC = () => {
  const [isStoreCreated, setIsStoreCreated] = useState(false);

  const InitialState: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
    <div className="flex flex-col items-center justify-center text-center p-8 h-full">
      <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-6">
        <span className="text-5xl">🛍️</span>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">You are invisible to online customers.</h2>
      <p className="text-gray-600 mb-8">Let's fix that!</p>
      <button 
        onClick={onCreate}
        className="w-full max-w-xs bg-[#FFC857] text-[#3A3E98] font-bold py-3 px-4 rounded-lg text-md shadow-md hover:opacity-90 transition-opacity active:scale-95 transform"
      >
        Create My Free Online Store in 2 Minutes
      </button>
    </div>
  );

  const ActiveState: React.FC = () => (
    <div className="p-4 space-y-5">
      <Card>
        <p className="text-sm text-gray-500 mb-1">Your store is live at:</p>
        <a href="#" className="font-semibold text-lg text-[#3A3E98] break-all">
          sunil-kirana.dukan.ai
        </a>
      </Card>

      <button className="w-full bg-[#27AE60] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center text-lg shadow-md hover:opacity-90 transition-opacity active:scale-95 transform">
        <WhatsAppIcon className="w-6 h-6 mr-3" />
        Share Store with Customers
      </button>

      <div>
        <h3 className="font-bold text-gray-700 mb-2 px-1">Store Preview</h3>
        <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="w-full h-20 bg-gray-200 rounded-md flex items-center justify-center mb-3">
                <p className="text-gray-400 text-sm">Your Store Banner</p>
            </div>
            <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gray-200 rounded-md"></div>
                <div className="flex-1">
                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <button className="w-full bg-white text-gray-700 font-semibold py-3 px-2 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50">
          Add New Product
        </button>
        <button className="w-full bg-white text-gray-700 font-semibold py-3 px-2 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50">
          View Orders
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full">
      <header className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-center text-gray-800">Your Online Store</h1>
      </header>
      {isStoreCreated ? <ActiveState /> : <InitialState onCreate={() => setIsStoreCreated(true)} />}
    </div>
  );
};

export default OnlineStoreScreen;