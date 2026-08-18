import React, { useState, useEffect, useRef } from 'react';
import { Surah } from '../../types';
import { searchSurahs, getSurahByNo } from '../../utils/quran';
import { Search, BookOpen, Check } from 'lucide-react';

interface SurahAutocompleteProps {
  valueSurahNo?: number;
  value?: number;
  onSelectSurah?: (surah?: Surah) => void;
  onChange?: (surahNo: number) => void;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
}

export const SurahAutocomplete: React.FC<SurahAutocompleteProps> = ({
  valueSurahNo,
  value,
  onSelectSurah,
  onChange,
  label,
  disabled = false,
  placeholder = "Ketik no/nama surah (mis: 67 / mulk / baqarah)..."
}) => {
  const currentSurahNo = valueSurahNo ?? value;
  const selectedSurah = currentSurahNo ? getSurahByNo(currentSurahNo) : undefined;

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [filteredSurahs, setFilteredSurahs] = useState<Surah[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync displayed search term with external value
  useEffect(() => {
    if (selectedSurah) {
      setSearchTerm(`${selectedSurah.surah_no}. ${selectedSurah.surah_name}`);
    } else if (!currentSurahNo) {
      setSearchTerm('');
    } else {
      setSearchTerm(`Surah #${currentSurahNo}`);
    }
  }, [currentSurahNo, selectedSurah]);

  // Update dropdown options based on search query
  useEffect(() => {
    // If search term matches currently selected surah format exactly, show all or top surahs
    if (selectedSurah && searchTerm === `${selectedSurah.surah_no}. ${selectedSurah.surah_name}`) {
      setFilteredSurahs(searchSurahs(''));
    } else {
      const results = searchSurahs(searchTerm);
      setFilteredSurahs(results.slice(0, 114));
    }
  }, [searchTerm, selectedSurah]);

  // Handle click/tap outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset display to current selected surah if closed without picking
        if (selectedSurah) {
          setSearchTerm(`${selectedSurah.surah_no}. ${selectedSurah.surah_name}`);
        } else {
          setSearchTerm('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [selectedSurah]);

  const handleSelect = (surah: Surah) => {
    if (typeof onSelectSurah === 'function') {
      onSelectSurah(surah);
    }
    if (typeof onChange === 'function') {
      onChange(surah.surah_no);
    }
    setSearchTerm(`${surah.surah_no}. ${surah.surah_name}`);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearchTerm('');
    if (typeof onChange === 'function') {
      onChange(0);
    }
    if (typeof onSelectSurah === 'function') {
      onSelectSurah(undefined);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={searchTerm}
          onChange={(e) => {
            const val = e.target.value;
            setSearchTerm(val);
            if (!val) {
              handleClear();
            }
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-20 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:bg-slate-100"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        {selectedSurah && (
          <span className="absolute right-3 top-2 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 pointer-events-none">
            {selectedSurah.total_ayah} Ayat
          </span>
        )}
      </div>

      {/* Search results dropdown */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 divide-y divide-slate-100">
          {filteredSurahs.length > 0 ? (
            filteredSurahs.map((surah) => {
              const isSelected = currentSurahNo === surah.surah_no;
              return (
                <button
                  key={surah.surah_no}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleSelect(surah);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(surah);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between transition ${
                    isSelected ? 'bg-blue-50/80 font-bold text-blue-900' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {surah.surah_no}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-900">{surah.surah_name}</span>
                        {surah.surah_alias && (
                          <span className="text-[10px] text-slate-400">({surah.surah_alias})</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">Total: {surah.total_ayah} Ayat</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="font-serif text-sm text-blue-900">{surah.surah_name_arabic}</span>
                    {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-3 text-xs text-slate-500 text-center flex items-center justify-center space-x-1.5">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span>Surah &apos;{searchTerm}&apos; tidak ditemukan.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
