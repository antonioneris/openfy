import React, { createContext, useContext, useState } from 'react';

interface SearchContextType {
  ytSearchQuery: string;
  setYtSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  ytSearchMode: 'local' | 'youtube';
  setYtSearchMode: React.Dispatch<React.SetStateAction<'local' | 'youtube'>>;
  ytSearchResults: any | null;
  setYtSearchResults: React.Dispatch<React.SetStateAction<any | null>>;
  ytSearchCategory: string;
  setYtSearchCategory: React.Dispatch<React.SetStateAction<string>>;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ytSearchQuery, setYtSearchQuery] = useState('');
  const [ytSearchMode, setYtSearchMode] = useState<'local' | 'youtube'>('local');
  const [ytSearchResults, setYtSearchResults] = useState<any | null>(null);
  const [ytSearchCategory, setYtSearchCategory] = useState<string>('all');

  return (
    <SearchContext.Provider
      value={{
        ytSearchQuery,
        setYtSearchQuery,
        ytSearchMode,
        setYtSearchMode,
        ytSearchResults,
        setYtSearchResults,
        ytSearchCategory,
        setYtSearchCategory,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};
