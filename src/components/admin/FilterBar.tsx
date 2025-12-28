// src/components/admin/FilterBar.tsx

import { Search } from 'lucide-react';
import './FilterBar.css';

interface FilterOption {
  value: string;
  label: string;
}

interface Filter {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterBarProps {
  searchPlaceholder?: string;
  filters?: Filter[];
  searchValue?: string;
  filterValues?: Record<string, string>;
  onSearch?: (value: string) => void;
  onFilterChange?: (key: string, value: string) => void;
  className?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = '검색...',
  filters = [],
  searchValue = '',
  filterValues = {},
  onSearch,
  onFilterChange,
  className = ''
}) => {
  return (
    <div className={`filter-bar ${className}`}>
      <div className="filter-search">
        <Search size={20} className="search-icon" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearch?.(e.target.value)}
          className="search-input"
        />
      </div>
      {filters.length > 0 && (
        <div className="filter-selects">
          {filters.map(filter => (
            <select
              key={filter.key}
              value={filterValues[filter.key] || ''}
              onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
              className="filter-select"
            >
              <option value="">{filter.label}</option>
              {filter.options.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilterBar;

