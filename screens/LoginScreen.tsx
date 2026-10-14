
import React from 'react';
import { WhatsAppIcon } from '../components/Icons.tsx';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div className="p-8 text-center">
        <h1 className="text-4xl font-bold text-[#3A3E98]">Dukan.AI</h1>
      </div>
      <div className="flex-grow flex flex-col justify-center items-center p-8 text-center">
        <div className="w-64 h-48 bg-gray-100 rounded-xl flex items-center justify-center mb-8 shadow-inner">
          <div className="w-32 h-40 bg-white rounded-lg shadow-md p-2 flex flex-col space-y-2">
            <div className="w-full h-4 bg-green-300 rounded-sm"></div>
            <div className="w-full h-4 bg-yellow-300 rounded-sm"></div>
            <div className="w-3/4 h-4 bg-blue-300 rounded-sm"></div>
            <div className="flex-grow"></div>
            <div className="w-1/2 h-2 bg-gray-200 rounded-sm"></div>
             <div className="w-full h-2 bg-gray-200 rounded-sm"></div>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-800">अपने दुकान को दो AI की शक्ति।</h2>
        <p className="text-md text-gray-600 mt-1">Give your business AI Superpowers.</p>
      </div>
      <div className="p-6 bg-white">
        <button
          onClick={onLogin}
          className="w-full bg-[#FFC857] text-[#3A3E98] font-bold py-4 px-4 rounded-lg flex items-center justify-center text-lg shadow-md hover:opacity-90 transition-opacity active:scale-95 transform"
        >
          <WhatsAppIcon className="w-6 h-6 mr-3" />
          Get Started with WhatsApp
        </button>
        <button className="w-full mt-4 text-sm font-semibold text-gray-500 hover:text-gray-700">
          Login with Mobile Number
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;