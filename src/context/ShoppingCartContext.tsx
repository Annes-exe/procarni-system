import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ShoppingCartItem {
  material_name: string;
  supplier_code?: string; // Nuevo campo opcional para el código del proveedor
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
}

interface ShoppingCartContextType {
  items: ShoppingCartItem[];
  addItem: (item: ShoppingCartItem) => void;
  updateItem: (index: number, newItem: Partial<ShoppingCartItem>) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
}

const ShoppingCartContext = createContext<ShoppingCartContextType | undefined>(undefined);

export const ShoppingCartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ShoppingCartItem[]>([]);

  const addItem = (item: ShoppingCartItem) => {
    setItems((prevItems) => [...prevItems, item]);
  };

  const updateItem = (index: number, newItem: Partial<ShoppingCartItem>) => {
    setItems((prevItems) =>
      prevItems.map((item, i) => (i === index ? { ...item, ...newItem } : item))
    );
  };

  const removeItem = (index: number) => {
    setItems((prevItems) => prevItems.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setItems([]);
  };

  return (
    <ShoppingCartContext.Provider value={{ items, addItem, updateItem, removeItem, clearCart }}>
      {children}
    </ShoppingCartContext.Provider>
  );
};

export const useShoppingCart = () => {
  const context = useContext(ShoppingCartContext);
  if (context === undefined) {
    throw new Error('useShoppingCart must be used within a ShoppingCartProvider');
  }
  return context;
};