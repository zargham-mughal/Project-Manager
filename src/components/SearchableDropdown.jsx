import { useState, useEffect, useRef } from 'react';

const SearchableDropdown = ({ items, selectedId, onSelect, placeholder, renderItem, renderSelected, allOption }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        const handleClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const filtered = items.filter(item => {
        const term = searchTerm.toLowerCase();
        const label = (renderItem ? renderItem(item).searchText : item.name || item.label || '').toLowerCase();
        return label.includes(term);
    });

    const selectedItem = items.find(i => i.id === selectedId);

    return (
        <div className="searchable-select" ref={wrapRef} style={{ maxWidth: '100%' }}>
            <div className="searchable-select-input-wrap">
                <span className="searchable-select-icon">🔍</span>
                <input
                    className="input searchable-select-input"
                    type="text"
                    placeholder={placeholder || 'Search…'}
                    value={searchTerm}
                    onKeyDown={e => { if (/[0-9]/.test(e.key)) e.preventDefault(); }}
                    onChange={e => { setSearchTerm(e.target.value.replace(/[0-9]/g, '')); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                />
                {(selectedId === 'all' || selectedItem) && !isOpen && (
                    <div className="searchable-select-selected" onClick={() => { setSearchTerm(''); setIsOpen(true); }}>
                        <span style={{ fontWeight: 600 }}>
                            {selectedId === 'all' ? (allOption || 'All') : (renderSelected ? renderSelected(selectedItem) : selectedItem?.name || selectedItem?.label)}
                        </span>
                        <button className="searchable-select-clear" onClick={e => { e.stopPropagation(); onSelect(''); setSearchTerm(''); }}>✕</button>
                    </div>
                )}
            </div>
            {isOpen && (
                <div className="searchable-select-dropdown">
                    {allOption && (
                        <button
                            className={`searchable-select-option ${selectedId === 'all' ? 'active' : ''}`}
                            onClick={() => { onSelect('all'); setIsOpen(false); setSearchTerm(''); }}
                        >
                            <div><div style={{ fontWeight: 600 }}>{allOption}</div></div>
                        </button>
                    )}
                    {filtered.length === 0 ? (
                        <div className="searchable-select-empty">No results found</div>
                    ) : (
                        filtered.map(item => (
                            <button
                                key={item.id}
                                className={`searchable-select-option ${selectedId === item.id ? 'active' : ''}`}
                                onClick={() => { onSelect(item.id); setIsOpen(false); setSearchTerm(''); }}
                            >
                                {renderItem ? renderItem(item).node : (
                                    <div><div style={{ fontWeight: 600 }}>{item.name || item.label}</div></div>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown;
