import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';

export interface TableColumn<T = any> {
  key: keyof T;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, row: T) => React.ReactNode;
  ariaLabel?: string;
}

export interface AccessibleDataTableProps<T = any> {
  data: T[];
  columns: TableColumn<T>[];
  caption: string;
  captionId?: string;
  sortable?: boolean;
  selectable?: boolean;
  onRowSelect?: (selectedRows: T[]) => void;
  onSort?: (column: keyof T, direction: 'asc' | 'desc') => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  rowKeyField?: keyof T;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

type SortDirection = 'asc' | 'desc' | null;

export function AccessibleDataTable<T extends Record<string, any>>({
  data,
  columns,
  caption,
  captionId,
  sortable = false,
  selectable = false,
  onRowSelect,
  onSort,
  loading = false,
  emptyMessage = 'Aucune donnée disponible',
  className = '',
  rowKeyField = 'id' as keyof T,
  ariaLabel,
  ariaDescribedBy
}: AccessibleDataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedRows, setSelectedRows] = useState<Set<any>>(new Set());
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
  
  const tableRef = useRef<HTMLTableElement>(null);
  const announcementRef = useRef<HTMLDivElement>(null);

  // Generate unique IDs for accessibility
  const tableId = `table-${Math.random().toString(36).substr(2, 9)}`;
  const finalCaptionId = captionId || `${tableId}-caption`;

  // Announce changes to screen readers
  const announce = (message: string) => {
    if (announcementRef.current) {
      announcementRef.current.textContent = message;
    }
  };

  // Handle sorting
  const handleSort = (column: keyof T) => {
    if (!sortable || !columns.find(col => col.key === column)?.sortable) return;

    let newDirection: SortDirection = 'asc';
    
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
        setSortColumn(null);
      }
    }

    setSortColumn(newDirection ? column : null);
    setSortDirection(newDirection);

    if (onSort && newDirection) {
      onSort(column, newDirection);
    }

    // Announce sort change
    const columnHeader = columns.find(col => col.key === column)?.header;
    if (newDirection) {
      announce(`Tableau trié par ${columnHeader} en ordre ${newDirection === 'asc' ? 'croissant' : 'décroissant'}`);
    } else {
      announce(`Tri supprimé pour ${columnHeader}`);
    }
  };

  // Handle row selection
  const handleRowSelect = (rowKey: any, selected: boolean) => {
    const newSelectedRows = new Set(selectedRows);
    
    if (selected) {
      newSelectedRows.add(rowKey);
    } else {
      newSelectedRows.delete(rowKey);
    }
    
    setSelectedRows(newSelectedRows);
    
    if (onRowSelect) {
      const selectedData = data.filter(row => newSelectedRows.has(row[rowKeyField]));
      onRowSelect(selectedData);
    }

    announce(`${selected ? 'Sélectionné' : 'Désélectionné'} ligne ${rowKey}. ${newSelectedRows.size} ligne(s) sélectionnée(s)`);
  };

  // Handle select all
  const handleSelectAll = (selected: boolean) => {
    const newSelectedRows = selected ? new Set(data.map(row => row[rowKeyField])) : new Set();
    setSelectedRows(newSelectedRows);
    
    if (onRowSelect) {
      const selectedData = selected ? data : [];
      onRowSelect(selectedData);
    }

    announce(`${selected ? 'Toutes les lignes sélectionnées' : 'Toutes les lignes désélectionnées'}. ${newSelectedRows.size} ligne(s) sélectionnée(s)`);
  };

  // Keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    const { key } = event;
    let newFocus = { row: rowIndex, col: colIndex };

    switch (key) {
      case 'ArrowUp':
        event.preventDefault();
        newFocus.row = Math.max(0, rowIndex - 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        newFocus.row = Math.min(data.length - 1, rowIndex + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        newFocus.col = Math.max(0, colIndex - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        newFocus.col = Math.min(columns.length - 1, colIndex + 1);
        break;
      case 'Home':
        event.preventDefault();
        newFocus.col = 0;
        break;
      case 'End':
        event.preventDefault();
        newFocus.col = columns.length - 1;
        break;
      case 'PageUp':
        event.preventDefault();
        newFocus.row = Math.max(0, rowIndex - 10);
        break;
      case 'PageDown':
        event.preventDefault();
        newFocus.row = Math.min(data.length - 1, rowIndex + 10);
        break;
      case ' ':
        if (selectable && colIndex === 0) {
          event.preventDefault();
          const rowKey = data[rowIndex][rowKeyField];
          handleRowSelect(rowKey, !selectedRows.has(rowKey));
        }
        break;
      default:
        return;
    }

    setFocusedCell(newFocus);
  };

  // Focus management
  useEffect(() => {
    if (focusedCell && tableRef.current) {
      const cell = tableRef.current.querySelector(
        `tbody tr:nth-child(${focusedCell.row + 1}) td:nth-child(${focusedCell.col + 1})`
      ) as HTMLElement;
      
      if (cell) {
        cell.focus();
      }
    }
  }, [focusedCell]);

  // Sort icon component
  const SortIcon = ({ column }: { column: keyof T }) => {
    if (!sortable || !columns.find(col => col.key === column)?.sortable) return null;

    if (sortColumn === column) {
      return sortDirection === 'asc' ? 
        <ChevronUp className="w-4 h-4 ml-1" aria-hidden="true" /> : 
        <ChevronDown className="w-4 h-4 ml-1" aria-hidden="true" />;
    }

    return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" aria-hidden="true" />;
  };

  // Get sort status for screen readers
  const getSortAriaSort = (column: keyof T) => {
    if (!sortable || !columns.find(col => col.key === column)?.sortable) return undefined;
    
    if (sortColumn === column) {
      return sortDirection === 'asc' ? 'ascending' : 'descending';
    }
    
    return 'none';
  };

  const allSelected = data.length > 0 && selectedRows.size === data.length;
  const someSelected = selectedRows.size > 0 && selectedRows.size < data.length;

  return (
    <div className={`overflow-x-auto ${className}`}>
      {/* Screen reader announcements */}
      <div
        ref={announcementRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />

      <table
        ref={tableRef}
        id={tableId}
        className="min-w-full divide-y divide-gray-200 border border-gray-300"
        role="table"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy ? `${finalCaptionId} ${ariaDescribedBy}` : finalCaptionId}
      >
        <caption
          id={finalCaptionId}
          className="sr-only"
        >
          {caption}
          {sortColumn && sortDirection && (
            <span>
              {' '}Trié par {columns.find(col => col.key === sortColumn)?.header} en ordre {sortDirection === 'asc' ? 'croissant' : 'décroissant'}.
            </span>
          )}
          {selectable && (
            <span>
              {' '}{selectedRows.size} ligne(s) sélectionnée(s) sur {data.length}.
            </span>
          )}
        </caption>

        <thead className="bg-gray-50">
          <tr role="row">
            {selectable && (
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                style={{ width: '50px' }}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={input => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  aria-label="Sélectionner toutes les lignes"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </th>
            )}
            
            {columns.map((column, index) => (
              <th
                key={String(column.key)}
                scope="col"
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  sortable && column.sortable ? 'cursor-pointer hover:bg-gray-100 focus:bg-gray-100' : ''
                }`}
                style={{ width: column.width }}
                onClick={() => handleSort(column.key)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && sortable && column.sortable) {
                    e.preventDefault();
                    handleSort(column.key);
                  }
                }}
                tabIndex={sortable && column.sortable ? 0 : -1}
                aria-sort={getSortAriaSort(column.key)}
                aria-label={column.ariaLabel || (sortable && column.sortable ? 
                  `${column.header}, triable` : column.header)}
              >
                <div className="flex items-center">
                  {column.header}
                  <SortIcon column={column.key} />
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="bg-white divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-6 py-4 text-center text-gray-500"
              >
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span>Chargement...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-6 py-4 text-center text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => {
              const rowKey = row[rowKeyField];
              const isSelected = selectedRows.has(rowKey);
              
              return (
                <tr
                  key={String(rowKey)}
                  role="row"
                  className={`${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'} focus-within:bg-gray-50`}
                  aria-selected={selectable ? isSelected : undefined}
                >
                  {selectable && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleRowSelect(rowKey, e.target.checked)}
                        aria-label={`Sélectionner ligne ${rowKey}`}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        tabIndex={0}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 0)}
                      />
                    </td>
                  )}
                  
                  {columns.map((column, colIndex) => (
                    <td
                      key={String(column.key)}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                      tabIndex={0}
                      onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex + (selectable ? 1 : 0))}
                      role="gridcell"
                    >
                      {column.render ? column.render(row[column.key], row) : String(row[column.key] || '')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Table summary for screen readers */}
      <div className="sr-only" aria-live="polite">
        Tableau avec {data.length} ligne(s) et {columns.length} colonne(s).
        {selectable && ` ${selectedRows.size} ligne(s) sélectionnée(s).`}
      </div>
    </div>
  );
}

// Example usage component
export const DataTableExample: React.FC = () => {
  const [users] = useState([
    { id: 1, name: 'Alice Dupont', email: 'alice@example.com', role: 'Admin', status: 'Actif' },
    { id: 2, name: 'Bob Martin', email: 'bob@example.com', role: 'Utilisateur', status: 'Inactif' },
    { id: 3, name: 'Claire Dubois', email: 'claire@example.com', role: 'Modérateur', status: 'Actif' },
  ]);

  const columns: TableColumn[] = [
    {
      key: 'name',
      header: 'Nom',
      sortable: true,
      ariaLabel: 'Nom de l\'utilisateur, triable'
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      ariaLabel: 'Adresse email, triable'
    },
    {
      key: 'role',
      header: 'Rôle',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          value === 'Admin' ? 'bg-red-100 text-red-800' :
          value === 'Modérateur' ? 'bg-yellow-100 text-yellow-800' :
          'bg-green-100 text-green-800'
        }`}>
          {value}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Statut',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          value === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      )
    }
  ];

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Exemple de tableau accessible</h2>
      <AccessibleDataTable
        data={users}
        columns={columns}
        caption="Liste des utilisateurs avec leurs informations et statuts"
        sortable={true}
        selectable={true}
        onRowSelect={(selected) => console.log('Lignes sélectionnées:', selected)}
        onSort={(column, direction) => console.log('Tri:', column, direction)}
        ariaLabel="Tableau des utilisateurs"
      />
    </div>
  );
};