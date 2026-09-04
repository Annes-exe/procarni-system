import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ShoppingCartItem {
  material_id?: string;
  material_name: string;
  supplier_code?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  unit?: string;
  unit_id?: string | null;
  description?: string;
  sales_percentage?: number;
  discount_percentage?: number;
  was_recalculated?: boolean;
  category?: string | null;
}

interface ShoppingCartContextType {
  items: ShoppingCartItem[];
  addItem: (item: ShoppingCartItem) => void;
  addItems: (items: ShoppingCartItem[]) => void;
  duplicateItem: (index: number) => void;
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

  const addItems = (newItems: ShoppingCartItem[]) => {
    setItems((prevItems) => {
      // If there is only one empty item, replace it
      if (prevItems.length === 1 && !prevItems[0].material_name && (prevItems[0].quantity === 0 || !prevItems[0].quantity)) {
        return [...newItems];
      }
      return [...prevItems, ...newItems];
    });
  };

  const duplicateItem = (index: number) => {
    setItems((prevItems) => {
      if (index < 0 || index >= prevItems.length) return prevItems;
      const itemToClone = { ...prevItems[index] };
      const next = [...prevItems];
      next.splice(index + 1, 0, itemToClone);
      return next;
    });
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
    <ShoppingCartContext.Provider value={{ items, addItem, addItems, duplicateItem, updateItem, removeItem, clearCart }}>
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